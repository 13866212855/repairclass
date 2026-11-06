---
name: "mymultenant"
description: >
  多租户 SaaS 与企业级应用中子租户专属运维/作业角色（如门店接单员、分校运维工程师、调度员）
  的架构设计模式与端到端实现规范。涵盖行级租户数据隔离、单表单智能免选登录（智能识别管理员与员工、
  防后台穿帮）、跨租户凭据自愈、登录时身份作用域 Cookie 权限防篡改（Fail-Closed）、原子级抢单排他控制、
  双 Session 隔离清理以及面向订餐/工单等业务的完整实施蓝图。
---

# MyMultiTenant：多租户专属角色与业务协同架构规范

## 一、核心定位与解决的问题

在多租户（如多门店餐饮、多学校报修、多企业协作）系统中，租户管理员（店长/校长）需要能独立为本店/本校创建一线作业账号（如：接单员张强、维修工李师傅）。

一线员工应实现：
1. **单一登录入口（智能盲盒登录）**：不需要在登录页手动选择“我是管理员”还是“我是员工”，输入手机号自动识别为员工通道，输入管理员用户名自动识别为管理员通道；员工界面完全屏蔽任何涉及平台管理、其它租户的字段与痕迹。
2. **凭据优先与租户自愈（Tenant Self-Healing）**：即使员工打开了带有错误租户参数的链接（例如 `?tenant=branch_b`），凭手机号和密码登录后，系统自动矫正并跳转到该员工所属的真实租户（如 `branch_a`）。
3. **行级数据硬隔离（Fail-Closed Scoping）**：任何查询与修改必须严格附带 `WHERE tenant_id = $1`，杜绝越权。
4. **并发抢单排他校验（Atomic Claim）**：一线员工认领或流转订单/工单时，在 SQL 层执行条件排他，防止多个接单员同时抢单造成冲突。
5. **RBAC 物理级裁剪（UI Clipping）**：为一线角色彻底隐藏总店切换器、收款配置、营业额统计、员工管理等管理模块，仅展示其职责看板。

---

## 二、4 级用户权限模型（4-Tier Hierarchy）

| 层级 | 角色代码 | 餐饮系统示例 | 校园报修系统示例 | 核心权限与职责 |
|---|---|---|---|---|
| **Tier 1: 平台超管** | `superadmin` | 平台运营总部 | 教育局/全校总超管 | 全局租户入驻审核、支付网关分配、跨租户全局数据大盘 |
| **Tier 2: 租户主管** | `admin` / `store_admin` | 门店店长 / 经理 | 分校区主管 | 管理本店菜单/资产、配置本店员工账号与启用状态、查看本店财务 |
| **Tier 3: 租户操作员** | `operator` / `order_handler` / `technician` | **本店接单员 / 厨师** | **运维工程师 / 维修工** | **本技能核心**：登录直达作业看板，处理本店订单/工单，原子抢单，无配置权 |
| **Tier 4: 终端客户** | `customer` / `teacher` | 扫码点餐顾客 | 报修师生 | 免密/极简提交需求，按手机号或设备标识查询本人历史记录 |

---

## 三、核心架构七大支柱（The 7 Pillars）

### 支柱 1：数据库行级隔离设计（Single DB, Row-Level Isolation）

所有业务单据、员工账号表均必须硬性包含 `tenant_id`，禁止通过业务逻辑或前端参数软拼接。

```sql
-- 1. 租户注册表
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,               -- 租户唯一标识，如 'default', 'branch_wudaokou'
    name TEXT NOT NULL,                -- 租户名称，如 '川味人家(五道口店)'
    subtitle TEXT,                     -- 标语/简介
    logo_url TEXT,                     -- 门店 Logo / 校徽
    enabled INTEGER NOT NULL DEFAULT 1 -- 状态：1=启用, 0=停用
);

-- 2. 租户专属操作员表 (staff_users)
CREATE TABLE IF NOT EXISTS staff_users (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                -- 员工姓名，如 '张强'
    phone TEXT NOT NULL,               -- 手机号（作为登录凭据）
    password TEXT NOT NULL,            -- 独立密码（哈希或密文）
    role TEXT NOT NULL DEFAULT 'order_handler', -- 角色：order_handler, technician 等
    device_id TEXT,                    -- 绑定的硬件/浏览器识别码（支持免输直达）
    enabled INTEGER NOT NULL DEFAULT 1,-- 1=启用, 0=停用
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uniq_tenant_phone UNIQUE(tenant_id, phone)
);

-- 3. 业务单据表 (orders / tickets)
CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT '待处理', -- 待处理 -> 制作中/处理中 -> 已出餐/已解决
    title TEXT,                           -- 摘要 / 桌号 / 报修位置
    content TEXT,                         -- 详细内容 / 菜品明细 JSON / 故障描述
    customer_name TEXT,                   -- 客户姓名
    customer_phone TEXT,                  -- 客户电话
    handler_id INTEGER,                   -- 处理人 ID (关联 staff_users.id)
    handler_name TEXT,                    -- 处理人姓名
    handler_phone TEXT,                   -- 处理人手机号
    handler_reply TEXT,                   -- 处理回执 / 出餐备注
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,                -- 接单时间
    resolved_at TIMESTAMP                 -- 办结时间
);
CREATE INDEX IF NOT EXISTS idx_records_tenant ON records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
```

---

### 支柱 2：智能单表单登录（Identity-Blind Smart Login）

#### 设计理念
用户打开管理登录入口时，**只有一个账号输入框和一个密码输入框**。
界面绝不提供「我是管理员」「我是接单员」的切换 Tab，防止一线员工因选错入口迷失，同时彻底隐藏后台管理员账号规则。

```tsx
// 登录表单前端判定示例
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const account = loginAccount.trim();
  const password = loginPass.trim();

  // 正则判断：若账号输入全数字（5位~20位，标准手机号或工号格式），判定走员工通道
  const isNumericPhone = /^[0-9]{5,20}$/.test(account);

  const endpoint = isNumericPhone ? '/api/staff/login' : '/api/admin/login';
  const payload = isNumericPhone
    ? { phone: account, password, currentTenant: requestedTenant }
    : { username: account, password, tenant: requestedTenant };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '账号或密码错误，请联系管理员');

    // 登录成功后续处理...
  } catch (err: any) {
    // 报错信息脱敏：中立提示，绝不泄露超管账号格式
    setLoginError(err.message || '账号或密码错误，请联系管理员');
  }
};
```

---

### 支柱 3：凭据优先与租户自愈（Tenant Self-Healing）

#### 痛点场景
员工微信收藏了旧链接，或者管理员在总店控制台错发了 `?tenant=branch_b` 的链接给 `branch_a` 的员工张强。

#### 自愈机制
1. 后端校验张强的手机号与密码，匹配到其真正所属租户为 `branch_a`；
2. 即使请求携带了 `currentTenant = 'branch_b'`，后端也**以员工实际数据库绑定为准**，在响应中返回正确的 `tenantId: 'branch_a'`；
3. 前端接收后，利用 `window.history.replaceState` 自动校正 URL 为 `?tenant=branch_a`（或 `/s/branch_a/admin`），并将当前应用的上下文租户立即切换为 `branch_a`，实现无感自愈纠偏。

```typescript
// 后端登录接口自愈返回
app.post('/api/staff/login', async (req, res) => {
  const { phone, password } = req.body;
  const user = await findStaffByPhoneAndPass(phone, password);
  if (!user || !user.enabled) {
    return res.status(401).json({ error: '账号或密码错误，请联系管理员' });
  }

  // 固化签发属于其真实所属租户的凭据
  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      tenantId: user.tenant_id, // 核心：返回自愈后的正确租户代码
    },
    redirectUrl: `/s/${user.tenant_id}/admin`,
  });
});
```

---

### 支柱 4：登录态双 Cookie / 双 Session 隔离（Dual-Session Hygiene）

1. **管理员登录**：签发 `admin_auth` Cookie（或 Session），并带有登录时刻固化的 `admin_scope`（固化其可管理的租户范围，超管为 `*`，分店店长为特定 `tenant_id`）。
2. **员工登录**：签发 `staff_auth` Cookie（或存入客户端持久化 `bbt_auth_token`），载荷严格包含 `{ id, tenantId, phone, role }`。
3. **互斥清理**：
   - 员工登录成功时，前端与后端同步清理任何遗留的管理员会话，确保不会带着超管凭据以员工身份越权。
   - 登出时（`handleLogout`），统一清除 `staff_auth` 与 `admin_auth`，清空 `localStorage` 对应的认证缓存。

---

### 支柱 5：破坏性接口 Fail-Closed 校验

任何涉及删除数据、修改租户配置、修改收款方式的高危 API，必须强制接入权限拦截中间件：

```typescript
function requireAdminScope(req: Request, res: Response, next: NextFunction) {
  const adminAuth = req.cookies?.admin_auth;
  const targetTenant = req.body?.tenant || req.query?.tenant;

  if (!adminAuth) {
    // 员工的 staff_auth 访问此类接口一律硬拒绝 403
    return res.status(403).json({ error: '权限不足：该操作仅限管理员执行' });
  }

  // 校验 admin_scope 是否包含 targetTenant
  if (adminAuth.scope !== '*' && adminAuth.scope !== targetTenant) {
    return res.status(403).json({ error: '越权拦截：无权修改其他租户配置' });
  }

  next();
}
```

---

### 支柱 6：原子并发流转与抢单（Atomic Race-Condition Protection）

在一线多员工协同场景（如多个接单员同时点击“接单”，或多个维修师傅认领工单）下，必须杜绝前端判断状态后提交的并发竞争。

**必须在数据库 UPDATE 语句中使用原子条件判断与 RETURNING 语句**：

```sql
-- 原子接单 / 认领 SQL
UPDATE records
SET status = '制作中', 
    handler_id = $1, 
    handler_name = $2, 
    handler_phone = $3, 
    accepted_at = NOW()
WHERE id = $4 
  AND tenant_id = $5
  AND (status = '待处理' OR handler_phone = $3)
RETURNING id;
```

```typescript
// 后端接口响应处理
const updateRes = await pool.query(atomicSql, [handlerId, handlerName, handlerPhone, recordId, tenantId]);

if (updateRes.rowCount === 0) {
  // 受影响行数为 0，说明刚刚已被其他接单员抢先认领或订单已被取消
  return res.status(409).json({
    success: false,
    error: '手慢了，该订单刚刚已被其他同事接单或已处理完毕！',
  });
}

return res.json({ success: true, message: '接单成功！' });
```

---

### 支柱 7：操作员端 UI 物理级裁剪（UI Clipping）

当当前会话判定为一线作业人员（`staffInfo !== null`）时：

1. **彻底移除管理组件**：
   - 不渲染租户切换器（Tenant Switcher）下拉菜单。
   - 不渲染营业额与财务统计图表。
   - 不渲染收款配置、大模型配置、数据库备份模块。
   - 不渲染员工账号与角色配置入口。
2. **仅保留作业看板**：
   - 待接单/处理中/已完成的流水列表。
   - 新订单声音提示（Audio Beep）开关。
   - 快速操作动作（接单、出餐、打印小票、标记解决）。
   - 顶部员工工作台标识（`🛠️ 接单员: 张强`）与安全登出按钮。

---

## 四、核心业务流程与交互时序

```
[前端/顾客]                      [服务端 / 数据库]                  [一线接单员/张强]
    |                                   |                                  |
    |-- 1. 提交订单 (带 tenant_id) ---->|                                  |
    |                                   |-- 2. 插入 orders 表 (status=待处理) |
    |                                   |                                  |
    |                                   |   (智能登录/自愈直达本店看板)       |
    |                                   |<-- 3. 输入手机号盲盒登录 ----------|
    |                                   |-- 4. 纠偏并返回 tenant_a 看板 ---->|
    |                                   |                                  |
    |                                   |   (新单实时轮询/推送到张强屏幕)    |
    |                                   |--- 5. 发现新单 (发出蜂鸣提示) ----->|
    |                                   |                                  |
    |                                   |<-- 6. 点击接单 (原子 UPDATE) ------|
    |                                   |    WHERE status='待处理'         |
    |                                   |-- 7. 成功锁定，返回接单成功 -------->|
    |                                   |                                  |
    |<-- 8. 顾客前台时间轴显示「已接单」---|                                  |
```

---

## 五、实施检查清单（Implementation Checklist）

- [ ] **行级隔离**：全系统所有 SELECT / UPDATE / DELETE 均绑定当前请求租户 ID。
- [ ] **盲盒单表单**：登录页仅有账号+密码，纯数字自动走员工通道，非纯数字走管理员通道。
- [ ] **租户自愈**：员工无论从哪个 URL 接入，登录后均被无缝重定向至自身归属租户。
- [ ] **双 Session 隔离**：员工登录清空管理员缓存，管理员接口加注 `requireAdminScope`。
- [ ] **并发排他**：接单、认领使用 `WHERE status = '待处理'` 条件更新，阻断并发抢单。
- [ ] **UI 物理裁剪**：员工看板中彻底隐藏分店选择、财务统计、员工配置与平台系统菜单。
- [ ] **无感互通**：操作员临时返回前台浏览时设置会话预览标记，杜绝重定向死循环。
