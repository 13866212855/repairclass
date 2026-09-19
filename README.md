# 班班通智慧报修管理系统 (Smart Multimedia Classroom Repair System)

面向中小学“班班通”（多媒体教学设备、触控一体机、投影仪、电子白板、网络与音响系统）的轻量化日常报修与运维管理平台。

## 🌟 技术栈与服务架构

- **前端/应用框架**：Python + Streamlit（针对移动端手机浏览器进行了样式与表单优化）
- **云端数据库**：Neon PostgreSQL Serverless (支持连接池、高可用)
- **云端图床**：Cloudinary (用于安全存储教师上传的现场故障照片)
- **部署平台**：Render.com (Free Web Service)

---

## 🚀 部署到 Render.com 详细步骤

本项目已完全适配 Render.com 免费 Web Service 部署规范：

### 方法一：通过 GitHub 仓库直接创建 Web Service

1. 将本项目代码推送到您的 **GitHub** 仓库。
2. 登录 [Render.com Dashboard](https://dashboard.render.com/)，点击 **New +** -> **Web Service**。
3. 连接您的 GitHub 仓库并选择该项目。
4. 填写部署配置信息：
   - **Name**: `banbantong-repair-system` (或自定义)
   - **Region**: 建议选择 `Ohio (US East)` (靠近 Neon 数据库区域，访问更迅速)
   - **Branch**: `main`
   - **Runtime**: `Python 3`
   - **Build Command**:
     ```bash
     pip install -r requirements.txt
     ```
   - **Start Command**:
     ```bash
     streamlit run app.py --server.port $PORT --server.address 0.0.0.0 --server.headless true --server.enableCORS false --server.enableXsrfProtection false
     ```
   - **Plan**: `Free`
5. 在 **Environment Variables (环境变量)** 中添加（若已在 app.py 默认设置中内置也可选填）：
   - `DATABASE_URL`: `postgresql://neondb_owner:npg_1OtSjlk4iJde@ep-restless-hill-b4snp56k-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require`
   - `CLOUDINARY_CLOUD_NAME`: `jcgfauar`
   - `CLOUDINARY_API_KEY`: `334846743197461`
   - `CLOUDINARY_API_SECRET`: `08QPJV_jQenHGREGo2dBRpO_834`
   - `PYTHON_VERSION`: `3.10.12`
6. 点击 **Create Web Service**，等待 1-2 分钟构建完成，即可获得专属的 https 访问链接（如 `https://banbantong-repair-system.onrender.com`）。

### 方法二：使用 render.yaml 蓝图部署
直接在 Render 中选择 **New +** -> **Blueprint**，Render 会自动识别根目录下的 `render.yaml` 自动完成部署！

---

## 💻 本地运行与测试指南

如果您需要在本地测试或开发：

```bash
# 1. 克隆或进入项目目录
cd banbantong-repair-system

# 2. 创建并激活 Python 虚拟环境 (可选)
python3 -m venv venv
source venv/bin/activate  # Windows 用户运行 venv\Scripts\activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 运行 Streamlit
streamlit run app.py
```
启动后在浏览器访问 `http://localhost:8501` 即可体验。

---

## 🗄️ 数据库表结构 (自动创建)

系统启动时会自动在 Neon 数据库中执行建表语句：

```sql
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    location VARCHAR(255) NOT NULL,
    issue_type VARCHAR(100) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    status VARCHAR(50) DEFAULT '待处理',
    admin_reply TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);
```

---

## 📱 功能特性

1. **教师报修端**：
   - 手机浏览器适配：自适应宽度与大触控按钮。
   - 现场拍照上传：利用 Cloudinary 云端无损存储，直连免服务器磁盘。
   - 报修进度查询：教师输入自己班级号，即可查看处理进度及管理员答复。
2. **管理员运维端**：
   - 数据看板：统计总报修数、待办数、排查中及已解决工单。
   - 列表折叠卡片：直观查看报修时间（自动转换为东八区北京时间）、现场大图。
   - 在线运维反馈：管理员可直接修改工单状态并填写维修说明，实时回显给报修老师。
