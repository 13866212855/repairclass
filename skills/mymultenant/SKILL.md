---
name: "mymultenant"
description: >
  Architectural design pattern and end-to-end implementation guide for multi-tenant applications
  to configure, isolate, and empower sub-tenant operational staff roles (e.g., maintenance technicians,
  store order processors, branch dispatchers). Covers multi-tenant schema isolation, device & phone
  binding, persistent token caching, automatic workbench deep-linking, anti-loop frontend previewing,
  RBAC permission clipping, and full migration blueprints for scenarios like multi-restaurant food ordering.
---

# MyMultiTenant: Sub-Tenant Dedicated Role & Record Processing Skill

## 1. Skill Purpose & Core Philosophy

In multi-tenant SaaS and enterprise web applications, data and workflows are divided into multiple distinct sub-tenants (such as different schools in an educational system, or different restaurants/branches in a food ordering platform).

A frequent and critical requirement in this architecture is:
> **Each sub-tenant's administrator needs the ability to configure dedicated staff roles (e.g., "运维工程师/张强" in a school equipment repair app, or "接单员/后厨调度" in a restaurant ordering app) inside that sub-tenant's admin console, allowing those staff members to seamlessly log into their own dedicated workspace, receiving and processing all customer/end-user submissions strictly within their own tenant.**

### The 4-Tier User Hierarchy in MyMultiTenant

Role Level | Example (School App) | Example (Multi-Restaurant App) | Scope & Permissions
---|---|---|---
**Tier 1: Platform Superadmin** (`superadmin`) | 全局系统超级管理员 | 平台总运营 / 总部超管 | 全局租户网关管理、入驻审核、全局大模型/支付配置、跨租户全量工单/订单监管。
**Tier 2: Tenant Admin** (`admin`) | 分校管理员 (如耿棚中学管理员) | 门店店长 / 餐厅经理 | 管理本店菜单与桌台、配置本店员工账号与角色、查看本店全部财务与报表。
**Tier 3: Tenant Operator / Handler** (`technician` / `order_handler`) | 运维工程师 (如张强) | 门店接单员 / 传菜调度员 / 厨师 | **本技能核心**：仅接收和处置所属租户下提交的工单/订单，自动免密直达，超管配置功能对其实施物理级隐藏。
**Tier 4: Frontend End-User** (`teacher` / `customer`) | 报修教师 | 扫码点餐顾客 | 极简提交工单/点餐，通过设备ID或手机号自动关联本人历史记录与进度。

---

## 2. Core Architectural Pillars

```
+-----------------------------------------------------------------------------------------+
|                                  Multi-Tenant Application                               |
+-----------------------------------------------------------------------------------------+
       |                                                                      |
  [Customer / End User]                                              [Tenant Operator]
  - Submits Ticket / Order                                           - Dedicated Sub-tenant Admin
  - URL: /s/{tenantCode}/                                            - URL: /s/{tenantCode}/admin
  - Auto-registered on submit                                        - Auto-redirected via localStorage
       |                                                                      |
       +----------------------------------+-----------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------------+
|                               Server-Side Tenant Isolation                              |
|  - resolveTenantId(req.query.tenant || req.params.tenantCode)                           |
|  - Queries strictly contain: `WHERE t.tenant_id = $tenantId`                            |
|  - Mutations verify operator.tenant_id === target_record.tenant_id                      |
+-----------------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------------+
|                               PostgreSQL / SQLite Database                              |
|  - `tenants` (id, code, name, logo, settings, enabled)                                  |
|  - `app_users` (id, tenant_id, role, name, phone, device_id, enabled)                   |
|  - `records` (id, tenant_id, status, customer_name, phone, handler_id, interactions)    |
+-----------------------------------------------------------------------------------------+
```

### Pillar 1: Multi-Tenant Data Schema & Isolation (Single DB, Row-Level Isolation)

1. **Tenant Registry (`tenants` / `schools` / `restaurants`)**:
   - `id`: Unique primary key.
   - `code`: URL slug (e.g., `gpzx`, `kfc-wudaokou`, `subway-haidian`).
   - `name`: Human-readable name.
   - `enabled`: Global toggle.

2. **User & Operator Table (`app_users`)**:
   - `tenant_id`: Foreign key linking to the tenant.
   - `role`: Standard enum: `['superadmin', 'admin', 'technician', 'teacher']` (or `['superadmin', 'store_admin', 'order_handler', 'customer']`).
   - `username` & `phone`: User's primary mobile number (also acts as login credential).
   - `device_id`: Client browser/device fingerprint (enables 1-click frictionless fast login).
   - `enabled`: Security toggle allowing instant deactivation of staff.

3. **Transaction Record Table (`tickets` / `orders`)**:
   - `tenant_id`: **CRITICAL** — Every record must store its owning tenant ID.
   - `handler_id`: The assigned operator ID.
   - `status`: Lifecycle states (e.g., `待处理` -> `处理中` -> `已解决` or `待接单` -> `制作中` -> `已出餐` -> `已完成`).
   - `device_id` & `phone`: Originator's identity.

4. **Fail-Closed Server Query Rule**:
   ```sql
   -- NEVER write queries without tenant scoping for non-superadmins:
   SELECT r.*, t.name as tenant_name 
   FROM records r 
   JOIN tenants t ON r.tenant_id = t.id 
   WHERE r.tenant_id = $1  -- $1 MUST be resolved from server-side tenant lookup
   ORDER BY r.created_at DESC;
   ```

---

### Pillar 2: Sub-Tenant Staff Role Management in Admin Console

In the sub-tenant or superadmin backend, administrators can configure staff accounts:

1. **Role Assignment UI**:
   - Input: Name, Phone Number, Assigned Tenant, Role selection (`运维工程师` / `接单员`).
   - When adding: insert into `app_users` with `tenant_id`. Phone number automatically serves as both `username` and `phone`.

2. **Automatic Self-Registration Linkage**:
   - If an operator previously submitted a ticket/order from the frontend as a normal customer, their record already exists in `app_users`.
   - Modifying role to `technician` / `order_handler` immediately elevates their permissions without requiring them to re-register.

3. **Device Binding & Unbinding**:
   - Store device fingerprint `device_id` (e.g., `dev_xxxxxxxx_xxxxxxxx`).
   - **Binding**: When operator logs in with phone on mobile/desktop, auto-bind the device to their user record.
   - **Unbinding**: Provide an "解除设备绑定" button in the admin users list. If an operator changes their phone, the admin unbinds the old device, allowing the new device to bind smoothly on next login.

---

### Pillar 3: Frictionless Operator Login & Persistent Session ("Zhang Qiang" Pattern)

This is the signature capability distilled from the project:

#### 1. Dual-Mode Authentication
Operators should not have to memorize complex passwords. Provide:
- **Phone Number Login**: Enter registered mobile number -> server verifies role -> returns user info & auth token.
- **Device Fast-Login**: If `localStorage.getItem('bbt_device_id')` matches an active user in `app_users`, show a one-click "已识别本机运维人员: 张强 [免输直达]" card.

#### 2. Persistent Client Storage (`localStorage` vs `sessionStorage`)
When an operator logs in:
```typescript
// Save to localStorage for persistent cross-session auto-login:
localStorage.setItem('bbt_auth_token', data.token);
localStorage.setItem('bbt_auth_user', JSON.stringify(data.user));

// Save to sessionStorage for current tab state:
sessionStorage.setItem('bbt_admin_auth', 'true');
sessionStorage.setItem('bbt_current_user', JSON.stringify(data.user));
sessionStorage.removeItem('bbt_view_teacher_home'); // Clear any preview suppression flag
```

#### 3. Automatic Deep-Linking on Application Mount (`App.tsx`)
When any user opens the application root `/`:
1. Check `localStorage` for cached credentials.
2. If the user is an operator (`role === 'technician'` or `role === 'order_handler'`) and has NOT explicitly opted to preview the customer frontend in this session:
   - Automatically rewrite the URL to `/s/${operator.tenant_code}/admin`.
   - Set active tenant code to `operator.tenant_code`.
   - Set `isAdmin(true)`.
3. Perform a silent background token validation (`POST /api/auth/verify-token`):
   - If user was deactivated or role revoked by admin, wipe `localStorage` and gracefully revert to visitor mode.

```typescript
// App.tsx Initialization Pattern
useEffect(() => {
  const token = localStorage.getItem('bbt_auth_token');
  const userStr = localStorage.getItem('bbt_auth_user');
  if (!token || !userStr) return;

  try {
    const user = JSON.parse(userStr);
    const isTeacherView = sessionStorage.getItem('bbt_view_teacher_home') === 'true';

    if (!isTeacherView && (user.role === 'technician' || user.role === 'order_handler')) {
      const targetCode = user.school_code || user.tenant_code || '';
      const targetUrl = targetCode ? `/s/${targetCode}/admin` : '/admin';
      
      if (!window.location.pathname.endsWith('/admin')) {
        window.history.replaceState({}, '', targetUrl);
      }
      setRequestedCode(targetCode);
      setIsAdmin(true);
    }

    // Silent backend verification
    fetch('/api/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, user_id: user.id }),
    }).then(res => res.json()).then(data => {
      if (!data.valid) {
        localStorage.removeItem('bbt_auth_token');
        localStorage.removeItem('bbt_auth_user');
        setIsAdmin(false);
      }
    });
  } catch (e) {
    console.error(e);
  }
}, []);
```

#### 4. Anti-Loop Frontend Previewing
Operators frequently need to view their frontend customer interface (e.g., testing how dishes or forms look).
Without special handling, the auto-redirect logic would immediately bounce them back to the admin view!

**The Solution**:
- When clicking "← 返回教师报修前台" (or "← 查看点餐前台"):
  ```typescript
  sessionStorage.setItem('bbt_view_teacher_home', 'true');
  setIsAdmin(false);
  window.history.pushState({}, '', `/s/${tenantCode}/`);
  ```
- In the top header bar, render an unobtrusive quick-return button:
  ```tsx
  {cachedUser && !isAdmin && (
    <button
      onClick={() => {
        sessionStorage.removeItem('bbt_view_teacher_home');
        window.history.pushState({}, '', `/s/${cachedUser.tenant_code}/admin`);
        setIsAdmin(true);
      }}
      className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg"
    >
      🛠️ {cachedUser.name} · 工作台
    </button>
  )}
  ```

#### 5. Strict Permission Clipping in Admin Console
In `AdminView.tsx`:
```tsx
const isTechnician = currentUser?.role === 'technician' || currentUser?.role === 'order_handler';

// If user is operator, lock tab to tickets/orders:
useEffect(() => {
  if (isTechnician && adminTab !== 'tickets') {
    setAdminTab('tickets');
  }
}, [isTechnician, adminTab]);

// UI: Hide platform configuration tabs
{!isTechnician && (
  <>
    <button onClick={() => setAdminTab('system_config')}>系统配置</button>
    <button onClick={() => setAdminTab('ai_config')}>大模型配置</button>
    <button onClick={() => setAdminTab('tenants')}>子租户管理</button>
    <button onClick={() => setAdminTab('users')}>人员与角色管理</button>
  </>
)}
```

---

## 3. Concrete Blueprint: Multi-Restaurant Food Ordering System

Here is the exact, drop-in architecture for migrating this skill to a **Multi-Restaurant Ordering System** (多个饭店，每个饭店是一个子租户，子租户后台配置接单员角色):

### 3.1 Database Schema (PostgreSQL DDL)

```sql
-- 1. 餐厅租户表 (Each restaurant is a sub-tenant)
CREATE TABLE IF NOT EXISTS restaurants (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL, -- e.g. 'canteen-east', 'subway-wudaokou'
    name VARCHAR(100) NOT NULL,       -- e.g. '五道口赛百味旗舰店'
    subtitle VARCHAR(200),            -- e.g. '新鲜现烤 · 准时出餐'
    logo_url VARCHAR(500),
    notice TEXT,                      -- 门店公告
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 菜品与分类表 (Scoped to Restaurant)
CREATE TABLE IF NOT EXISTS dishes (
    id SERIAL PRIMARY KEY,
    restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,    -- '热销招牌', '主食汉堡', '饮品甜点'
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    image_url VARCHAR(500),
    stock INT DEFAULT 999,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 用户与员工角色表 (Users & Staff)
CREATE TABLE IF NOT EXISTS app_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL, -- Phone number
    name VARCHAR(100) NOT NULL,           -- Staff/Customer name
    phone VARCHAR(50) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'customer', 
    -- Roles: 
    -- 'superadmin': 平台超管 (全部门店与结算)
    -- 'store_admin': 餐厅店长 (修改菜单与人员)
    -- 'order_handler': 餐厅接单员/后厨 (本技能核心：接收与处理本店订单)
    -- 'customer': 点餐顾客
    restaurant_id INT REFERENCES restaurants(id) ON DELETE SET NULL,
    device_id VARCHAR(100),               -- Client device ID for fast login
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. 订餐记录表 (Orders)
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_no VARCHAR(64) UNIQUE NOT NULL, -- e.g. 'ORD-20261101-0001'
    restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_no VARCHAR(50),                 -- 桌号/取餐号 (如 'B08' 或 '堂食12号')
    customer_name VARCHAR(100),
    phone VARCHAR(50),
    device_id VARCHAR(100),
    total_amount DECIMAL(10, 2) NOT NULL,
    items JSONB NOT NULL,                 -- [{"dish_id":1, "name":"全肉三明治", "qty":2, "price":28}]
    notes TEXT,                           -- 顾客备注 (如 '不放洋葱，少冰')
    status VARCHAR(50) DEFAULT '待接单',   -- '待接单' | '制作中' | '已出餐' | '已完成' | '已退单'
    handler_id INT REFERENCES app_users(id), -- 接单员工ID (如接单员张强)
    handler_note TEXT,                    -- 门店回执/出餐说明
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- 5. 订单流转追踪表 (Timeline Events)
CREATE TABLE IF NOT EXISTS order_timeline (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,          -- '下单成功' | '商家接单' | '后厨制作中' | '已呼叫取餐'
    operator_name VARCHAR(100),
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 Backend API Implementation (`server.ts`)

```typescript
// 1. Resolve Restaurant Sub-Tenant from Query or Path
async function resolveRestaurantId(codeOrId: string | number): Promise<number | null> {
  if (!codeOrId) return null;
  const res = await pool.query(
    'SELECT id FROM restaurants WHERE (code = $1 OR id::text = $1) AND enabled = true',
    [String(codeOrId).trim().toLowerCase()]
  );
  return res.rows[0]?.id || null;
}

// 2. Fetch Orders (Strict Tenant Scoping)
app.get('/api/orders', async (req, res) => {
  try {
    const { restaurant, status, search } = req.query;
    const restId = await resolveRestaurantId(restaurant as string);
    if (!restId) {
      return res.status(400).json({ error: '无效的餐厅租户标识' });
    }

    let query = `
      SELECT o.*, u.name as handler_name 
      FROM orders o 
      LEFT JOIN app_users u ON o.handler_id = u.id 
      WHERE o.restaurant_id = $1
    `;
    const params: any[] = [restId];

    if (status && status !== '全部') {
      params.push(status);
      query += ` AND o.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (o.order_no ILIKE $${params.length} OR o.table_no ILIKE $${params.length} OR o.customer_name ILIKE $${params.length})`;
    }

    query += ' ORDER BY o.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Staff Role Configuration (Adding Order Handler to Restaurant)
app.post('/api/admin/staff', async (req, res) => {
  try {
    const { name, phone, restaurant_id, role } = req.body;
    const cleanPhone = String(phone).trim();
    const cleanName = String(name).trim();

    // Insert or update staff user
    const result = await pool.query(
      `INSERT INTO app_users (username, name, phone, role, restaurant_id, created_at, updated_at)
       VALUES ($1, $2, $1, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (username) DO UPDATE 
       SET name = EXCLUDED.name, role = EXCLUDED.role, restaurant_id = EXCLUDED.restaurant_id, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [cleanPhone, cleanName, role || 'order_handler', restaurant_id]
    );

    res.json({ success: true, user: result.rows[0], message: `员工「${cleanName}」已配置为本店接单员` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Operator Quick Login with Device Binding
app.post('/api/auth/operator-login', async (req, res) => {
  try {
    const { phone, device_id } = req.body;
    const cleanPhone = String(phone).trim();

    const userRes = await pool.query(
      `SELECT u.*, r.name as restaurant_name, r.code as restaurant_code 
       FROM app_users u 
       LEFT JOIN restaurants r ON u.restaurant_id = r.id 
       WHERE u.phone = $1 AND u.enabled = true`,
      [cleanPhone]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: '未找到该员工账号，请联系店长添加' });
    }

    const user = userRes.rows[0];
    if (device_id) {
      await pool.query('UPDATE app_users SET device_id = $1 WHERE id = $2', [device_id.trim(), user.id]);
      user.device_id = device_id.trim();
    }

    const token = `operator-token-${user.id}-${Date.now()}`;
    res.json({
      success: true,
      token,
      user,
      message: `欢迎接单，${user.name}（${user.restaurant_name}）！`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Order State Transition by Operator
app.post('/api/orders/:id/status', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { status, handler_id, handler_name, note } = req.body;
    // Status flow: '已接单' -> '制作中' -> '已出餐' -> '已完成'

    await pool.query(
      `UPDATE orders 
       SET status = $1, handler_id = $2, handler_note = $3, 
           accepted_at = CASE WHEN $1 = '已接单' AND accepted_at IS NULL THEN CURRENT_TIMESTAMP ELSE accepted_at END,
           completed_at = CASE WHEN $1 IN ('已出餐', '已完成') THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE id = $4`,
      [status, handler_id, note || '', orderId]
    );

    await pool.query(
      `INSERT INTO order_timeline (order_id, action, operator_name, content) 
       VALUES ($1, $2, $3, $4)`,
      [orderId, `订单状态变更为「${status}」`, handler_name || '接单员', note || '']
    );

    res.json({ success: true, message: `订单 #${orderId} 状态已更新为「${status}」` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## 4. Reusable Frontend Checklist

When building or reviewing an application implementing the `mymultenant` skill, ensure the following checklist is completed:

- [ ] **URL Structure**: Sub-tenant entry paths follow clear routing:
  - Customer front-end: `/?tenant=xxx` or `/s/{tenantCode}/` or `/{tenantCode}/`
  - Sub-tenant operator dashboard: `/s/{tenantCode}/admin`
  - Platform superadmin console: `/admin` (no tenant in URL)
- [ ] **Data Isolation**: API requests strictly send `?tenant={tenantCode}` or pass Bearer token with server-side tenant validation. Sub-tenant operators can **never** see records belonging to other tenants.
- [ ] **Device Binding**: Generates client device ID `bbt_device_id` on first visit and persists in `localStorage`. Admin can unbind old devices.
- [ ] **Token Persistence**: Operator login writes `bbt_auth_token` and `bbt_auth_user` into `localStorage`.
- [ ] **Auto-Deep Linking**: App mount hook reads `localStorage` and smoothly rewrites URL to `/s/{tenantCode}/admin` for authenticated operators.
- [ ] **Anti-Looping Flag**: Operator clicking "Preview Frontend" sets `sessionStorage.setItem('view_frontend_home', 'true')` to prevent auto-redirect loop.
- [ ] **Header Quick Switch**: When an operator is on the customer view, header shows a badge button (e.g. `🛠️ 张强 · 工作台`) that clears the preview flag and returns to admin on click.
- [ ] **RBAC Clipping**: Operators (`role === 'technician'` / `order_handler`) only see their records list. Superadmin tabs (tenants list, database settings, global configs) are unmounted.
- [ ] **Excel Export**: Operators can export their tenant's records (with filter and monthly KPI summary sheets) without leaking other tenant records.

---

## 5. Summary

The `mymultenant` pattern bridges the gap between pure multi-tenancy and day-to-day on-the-ground operational usability:
1. Administrators get **full tenant control** without code deployments.
2. Front-line operators (technicians, store workers, order handlers) get **instant zero-friction access** directly to what matters to them without dealing with global platform complexity.
3. End-users get a **fast, clean tenant-branded experience**.
