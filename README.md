# 班班通智慧报修管理系统 (Smart Multimedia Classroom Repair System)

面向中小学"班班通"（多媒体教学设备、触控一体机、投影仪、电子白板、网络与音响系统）的轻量化日常报修与运维管理平台。系统包含**双实现**：

- **主应用（React + Express）**：教师报修端 + 管理员运维后台，生产形态
- **Streamlit 孪生版（pyapp）**：同一套数据库逻辑的 Python 实现，作为多租户架构中的第一个子租户运行

## 🏗️ 多租户架构（单域名多服务）

所有容器接入同一个 Docker 桥接网络 `mynet`，由 nginx 网关容器**独占唯一入口端口 7859**，按子路径将流量分发给各租户服务：

```
公网隧道 (ngrok/cpolar) ─┐
内网浏览器 ──────────────┴→ :7859  repairclass-nginx（网关，唯一对外端口）
                               ├── /          → repairclass:3000   主应用（React + Express）
                               ├── /pyapp/    → pyapp:8501        Streamlit 孪生版
                               └── /<其他>/   → 动态注册的子租户…
```

### 动态租户路由原理

子租户**不写死**在 nginx 配置里，而是保存在主应用的 PostgreSQL `tenants` 表中（在 `/admin` 面板可视化维护）：

1. 主应用提供 `/api/gateway/render` 接口，把启用中的租户**实时渲染成 nginx location 配置块**（渲染逻辑在主应用侧，网关保持零解析依赖）；
2. 网关容器内的同步脚本（`gateway_sync.sh`）每 10 秒拉取一次渲染结果；
3. 配置有变化时：备份旧配置 → 原子替换 → `nginx -t` 语法校验 → 校验通过则热重载（`nginx -s reload`），**校验失败自动回滚**，不影响现有访问；
4. 全程无需重启任何容器，新增/停用/删除租户约 10 秒内生效。

安全设计：子路径与容器主机名均走严格白名单正则校验（仅小写字母/数字/`-`/`_`），`/api`、`/admin`、`/assets`、`/static` 为系统保留路径不可占用，杜绝配置注入。

## 🚀 一键部署

| 脚本 | 用途 | 部署后访问 |
|---|---|---|
| `redeploy.bat` | 本地一键构建并启动全部 3 个容器（compose） | http://localhost:7859 |
| `upload2remote.bat` | 本地构建 3 个镜像打包（单 tar）→ scp 到远程 → 按序拉起 | http://172.29.173.42:7859 |

双击 bat 即可（2 行引导器 + PowerShell 引擎，对行尾/代理/TLS 故障均有抗性）。构建失败最常见原因是 Docker Desktop 配置了宿主死代理（如 127.0.0.1:7890），请在 Settings → Resources → Proxies 中清除。

### 端口与容器清单

| 容器 | 镜像 | 宿主端口 | 内部端口 | 说明 |
|---|---|---|---|---|
| `repairclass-nginx` | repairclass-nginx | **7859** | 80 | 唯一入口网关，含动态租户同步 |
| `repairclass` | repairclass | 无（仅内网） | 3000 | 主应用 |
| `pyapp` | repairclass-pyapp | 8518（内网直连用） | 8501 | Streamlit 孪生版 |

前端已内置**双轨自适应导航**：「在线体验 Streamlit 版」按钮在内网自动走 `:8518` 直连，在公网隧道自动走同源 `/pyapp/` 子路径。

## 🖥️ 管理后台（/admin）

访问 `http://<域名>:7859/admin`，默认账号 `admin` / `admin123`。除工单处理、位置与分类配置、大模型参数配置外，新增：

### 子租户管理（多租户核心，仅主租户可见）

「多租户管理」标签页只在主租户后台 `/admin` 出现；子校后台（`/s/<代码>/admin`）不包含该模块，子租户不能再创建子子租户。注意两类租户的分工：**入驻学校**（下方卡片）是应用内多校，自动生效、无需网关；**网关子服务**（上方卡片）仅用于挂载外部容器（如 pyapp），若子路径与已入驻学校代码重名会被拒绝或标黄提示清理。

- **添加子租户**：填写 名称 / 子路径（如 `/zhpj/`）/ 上游容器主机名（mynet 内的容器名）/ 容器内部端口；
- **启停切换**：临时摘除或恢复某个租户的路由（容器本身不受影响）；
- **删除**：从注册表中移除，网关 10 秒内自动摘除路由；
- 列表实时显示每个租户的访问地址与上游指向。

### 如何接入一个新的子租户服务（例：综合素质评价系统）

1. 将新服务容器化，并加入 `mynet` 网络：
   ```bash
   docker network create mynet   # 已存在则跳过
   docker run -d --name zhpj --network mynet --restart unless-stopped <镜像>
   ```
2. 登录 `/admin` → 子租户管理 → 填入：名称 `综合素质评价系统`、子路径 `/zhpj/`、容器名 `zhpj`、端口 `3000` → 保存；
3. 约 10 秒后即可通过 `http://<域名>:7859/zhpj/` 访问。

**接入要求**：建议服务以子路径为根运行（如 Streamlit 加 `--server.baseUrlPath=zhpj`；Vite 在 `vite.config.ts` 设 `base: '/zhpj/'` 重新构建），否则页面内的绝对路径静态资源会逃逸到主应用。若服务无法改造，需在 `nginx/nginx.conf` 中为其补充静态资源的精确转发块（参考 mysingledomain2mul 模板）。

## 🏫 多校入驻（SaaS 式校级隔离）

除服务级多租户外，系统内置**单数据库多校入驻**能力，支撑区域兄弟学校共享一套平台：

- **入驻方式**：管理员后台 → 多租户管理 → 填写学校名称与代码（如 `gengpeng`）即完成入驻，生成专属入口 `/s/<代码>/`；
- **数据隔离**：工单、统计、设备档案全部按校隔离；首页顶栏学校切换器一键切换（URL 同步 `/s/<代码>/`，可收藏转发）；
- **扫码即用**：教师端「扫码即用」按钮生成当前入口二维码，兄弟学校师生手机扫码直接使用，零安装零注册；
- **数据闭环**：后台看板实时呈现故障类型分布、高发位置 TOP6 与在管设备数，点击条目即筛选工单；工单卡片的「设备档案」标签可一键查看该设备全部历史报修，逐步沉淀设备电子档案。

## 💻 本地开发

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（Vite 中间件 + tsx 热重载，端口 3000）
npm run build        # 构建生产包（vite build + esbuild 打包 server）
npm run start        # 运行生产包 dist/server.cjs
```

Streamlit 孪生版本地调试：`pip install -r requirements.txt && streamlit run app.py`。

## 🗄️ 数据库

云端 Neon PostgreSQL Serverless（连接串内置，可用环境变量 `DATABASE_URL` 覆盖）。启动时自动建表：

- `tickets` — 报修工单（含 `teacher_name`/`phone`/`device_id` 扩展列）
- `ticket_interactions` — 多轮交互时间线（管理员答复、维修照片、用户追问）
- `ai_settings` — 大模型连接参数（apihub 中转）
- `system_config` — 位置/故障分类/标题等键值配置
- `tenants` — **子租户注册表**（name / subpath / upstream_host / upstream_port / enabled，`subpath` 唯一约束，首启自动种子 `/pyapp/` 租户）

## 📱 功能特性

1. **教师报修端**：手机自适应、现场拍照上传（Cloudinary 直传免服务器磁盘）、按班级号查询进度、AI 运维助手在线咨询。
2. **管理员运维端**：数据看板、多轮交互时间线、状态流转与维修反馈、大模型参数配置与连通性测试、子租户可视化治理。
3. **多租户网关**：单域名承载任意多个容器服务，动态注册、热加载、失败回滚，公网隧道零额外端口。
