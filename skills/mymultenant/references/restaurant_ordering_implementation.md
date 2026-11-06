# Multi-Restaurant Food Ordering Implementation Blueprint (基于 mymultenant 技能)

本参考文档专门为「多租户多门店在线订餐系统」提供完整的代码骨架与核心逻辑，完整实现 `mymultenant` 的核心七大支柱规范。

---

## 一、系统角色与业务流程映射

- **平台超管 (`superadmin`)**：平台运营总部，负责审核各饭店入驻（创建子租户）、查看全平台流水大盘。
- **饭店主管/店长 (`admin` / `store_admin`)**：单个饭店后台管理员，维护本店菜单、桌位、配置并管理本店专属接单员。
- **饭店接单员 / 厨师 (`order_handler` / `operator`)**：**核心执行角色**。打开统一后台后自动自愈直达本店接单看板，实时接收顾客提交的点餐，原子级抢单、接单并出餐。
- **点餐顾客 (`customer`)**：扫描桌贴二维码（如 `/?tenant=branch_wudaokou&table=B02`），直接进入本店点餐前台。

---

## 二、数据表结构完整 DDL (PostgreSQL)

```sql
-- 1. 饭店租户表 (tenants)
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,                   -- 租户标识，如 'default', 'branch_wudaokou'
    name TEXT NOT NULL,                    -- 门店名称，如 '川味人家 (五道口店)'
    subtitle TEXT,                         -- 门店标语，如 '正宗川味，现点现炒'
    logo_url TEXT,                         -- 门店头像/招牌
    notice TEXT,                           -- 门店滚动公告
    business_hours TEXT DEFAULT '10:00-22:00',
    enabled INTEGER NOT NULL DEFAULT 1,    -- 1=营业中, 0=歇业
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 菜品分类与菜单表 (dishes - 严格绑定 tenant_id)
CREATE TABLE IF NOT EXISTS dishes (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category TEXT NOT NULL,                -- '热销招牌', '川味经典', '主食米饭', '酒水饮料'
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    description TEXT,
    image_url TEXT,
    is_available INTEGER DEFAULT 1,        -- 1=在售, 0=售罄下架
    sales_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dishes_tenant ON dishes(tenant_id);

-- 3. 用户与员工角色表 (staff_users - 员工凭据与租户绑定)
CREATE TABLE IF NOT EXISTS staff_users (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                    -- 员工姓名（如：张强）
    phone TEXT NOT NULL,                   -- 手机号（作为登录凭据）
    password TEXT NOT NULL,                -- 登录密码
    role TEXT NOT NULL DEFAULT 'order_handler', -- 'order_handler' | 'store_admin'
    device_id TEXT,                        -- 浏览器/手持机硬件识别码
    enabled INTEGER NOT NULL DEFAULT 1,    -- 1=启用, 0=停用
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uniq_tenant_phone UNIQUE(tenant_id, phone)
);

-- 4. 订餐主记录表 (orders - 支柱 1 & 支柱 6: 行级隔离与原子状态)
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,                   -- 订单编号，如 'ORD-20261104-0008'
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    table_no TEXT NOT NULL,                -- 桌号 / 取餐号 (如 'A06' 或 '外带01')
    customer_name TEXT,                    -- 顾客称呼
    customer_phone TEXT,                   -- 顾客手机号
    items JSONB NOT NULL,                  -- [{"dish_id":1, "name":"宫保鸡丁", "price":38, "qty":1}]
    total_amount NUMERIC(10, 2) NOT NULL,  -- 总金额
    notes TEXT,                            -- 顾客口味备注 (如 '少辣，免香菜')
    status TEXT NOT NULL DEFAULT '待接单',  -- '待接单' -> '制作中' -> '已出餐' -> '已完成' -> '已退单'
    handler_id INT REFERENCES staff_users(id), -- 认领接单员 ID
    handler_name TEXT,                     -- 认领接单员姓名
    handler_phone TEXT,                    -- 认领接单员手机号
    handler_reply TEXT,                    -- 接单员回执（如 '已通知后厨加急出餐'）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,                 -- 接单时间
    resolved_at TIMESTAMP                  -- 结案/出餐时间
);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
```

---

## 三、核心服务端接口实现示例 (Node.js / Express)

### 1. 支柱 2 & 支柱 3：智能单表单登录与租户自愈

```typescript
// /api/staff/login - 员工通道（由前端根据纯数字账号自动分流调用）
app.post('/api/staff/login', async (req, res) => {
  try {
    const { phone, password, currentTenant } = req.body;
    const cleanPhone = String(phone || '').trim();
    const cleanPass = String(password || '').trim();

    if (!cleanPhone || !cleanPass) {
      return res.status(400).json({ error: '请输入手机号与密码' });
    }

    // 查找员工（手机号匹配且状态正常）
    const userRes = await pool.query(`
      SELECT s.*, t.name as tenant_name, t.enabled as tenant_enabled
      FROM staff_users s
      JOIN tenants t ON s.tenant_id = t.id
      WHERE s.phone = $1 AND s.enabled = 1
    `, [cleanPhone]);

    if (userRes.rows.length === 0) {
      // 错误信息脱敏：中立提示，绝不泄露超管账号规范
      return res.status(401).json({ error: '账号或密码错误，请联系店长' });
    }

    const staff = userRes.rows[0];

    // 校验密码（生产环境应使用 bcrypt.compare）
    if (staff.password !== cleanPass) {
      return res.status(401).json({ error: '账号或密码错误，请联系店长' });
    }

    if (staff.tenant_enabled === 0) {
      return res.status(403).json({ error: '所属门店已歇业或暂停运营，请联系店长' });
    }

    // 支柱 4: 登录态双 Session/Cookie 清理与固化
    res.clearCookie('admin_auth'); // 清理可能残留的管理员 Cookie

    const staffToken = `staff-${staff.id}-${Date.now()}`;
    res.cookie('staff_auth', staffToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600 * 1000,
    });

    // 支柱 3: 凭据优先与租户自愈（Tenant Self-Healing）
    // 即使当前页面 URL 是 ?tenant=branch_b，系统以员工实际绑定的 tenant_id 为准进行自愈
    const actualTenant = staff.tenant_id;
    const isMismatched = currentTenant && currentTenant !== actualTenant;

    res.json({
      success: true,
      token: staffToken,
      user: {
        id: staff.id,
        name: staff.name,
        phone: staff.phone,
        role: staff.role, // 'order_handler'
        tenantId: actualTenant,
        tenantName: staff.tenant_name,
      },
      healed: isMismatched,
      redirectUrl: `/s/${actualTenant}/admin`,
      message: `欢迎接单，${staff.name}！`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

### 2. 支柱 5：破坏性接口 Fail-Closed 鉴权中间件

```typescript
// 校验破坏性管理权限：员工 staff_auth 访问此类接口一律返回 403
export function requireAdminScope(req: Request, res: Response, next: NextFunction) {
  const adminCookie = req.cookies?.admin_auth;
  const staffCookie = req.cookies?.staff_auth;
  const targetTenant = req.body?.tenant_id || req.query?.tenant;

  // 若仅携带员工凭据，硬性拒绝访问管理级配置接口
  if (staffCookie && !adminCookie) {
    return res.status(403).json({ error: '权限不足：一线接单员不可修改门店或财务配置' });
  }

  if (!adminCookie) {
    return res.status(401).json({ error: '请以管理员身份登录后操作' });
  }

  // 校验管理员 Scope 是否允许操作该租户
  if (adminCookie.scope !== '*' && adminCookie.scope !== targetTenant) {
    return res.status(403).json({ error: '越权拦截：无权操作其他租户' });
  }

  next();
}
```

### 3. 支柱 6：原子并发排他抢单实现

```typescript
// POST /api/orders/:id/claim - 一线员工并发抢单
app.post('/api/orders/:id/claim', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { tenant_id, handler_id, handler_name, handler_phone } = req.body;

    // 支柱 6 核心：通过 SQL 条件锁定避免脏写与重复抢单
    const atomicClaimSql = `
      UPDATE orders
      SET status = '制作中',
          handler_id = $1,
          handler_name = $2,
          handler_phone = $3,
          accepted_at = NOW()
      WHERE id = $4 
        AND tenant_id = $5
        AND (status = '待接单' OR handler_phone = $3)
      RETURNING id, table_no;
    `;

    const updateRes = await pool.query(atomicClaimSql, [
      handler_id,
      handler_name,
      handler_phone,
      orderId,
      tenant_id,
    ]);

    if (updateRes.rowCount === 0) {
      // 受影响行数为 0，说明刚刚已被其他接单员抢先认领或订单已被顾客取消
      return res.status(409).json({
        success: false,
        error: '手慢了，该订单刚刚已被其他同事接单或已取消！',
      });
    }

    res.json({
      success: true,
      message: `接单成功！已锁定桌号 ${updateRes.rows[0].table_no} 的订单并通知后厨制作`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## 四、前端核心实现示例 (React / TypeScript)

### 1. 支柱 2：智能单表单登录组件 (`SmartLoginForm.tsx`)

```tsx
import React, { useState } from 'react';

interface SmartLoginProps {
  currentTenant: string;
  onLoginSuccess: (user: any, redirectUrl: string) => void;
}

export const SmartLoginForm: React.FC<SmartLoginProps> = ({ currentTenant, onLoginSuccess }) => {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    // 支柱 2 核心：纯数字账号（5-20位）自动判定为一线员工通道，否则走管理员通道
    const isStaff = /^[0-9]{5,20}$/.test(account.trim());
    const endpoint = isStaff ? '/api/staff/login' : '/api/admin/login';
    const payload = isStaff
      ? { phone: account.trim(), password: password.trim(), currentTenant }
      : { username: account.trim(), password: password.trim(), tenant: currentTenant };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '账号或密码错误，请联系管理员');

      // 支柱 3: 租户自愈纠偏
      if (data.healed && data.redirectUrl) {
        window.history.replaceState({}, '', data.redirectUrl);
      }

      onLoginSuccess(data.user, data.redirectUrl);
    } catch (err: any) {
      setErrorMsg(err.message || '登录失败，请核对信息');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 bg-white rounded-2xl border max-w-sm mx-auto space-y-4">
      <div className="text-center">
        <h2 className="text-base font-bold text-slate-900">门店运营与管理登录</h2>
        <p className="text-xs text-slate-500 mt-1">请输入分配的工号/手机号或管理账号</p>
      </div>

      {errorMsg && (
        <div className="p-2.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
          {errorMsg}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">登录账号 / 手机号</label>
        <input
          type="text"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          placeholder="请输入手机号或账号"
          required
          className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">登录密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入密码"
          required
          className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold cursor-pointer"
      >
        {loading ? '正在验证身份...' : '立即登录'}
      </button>
    </form>
  );
};
```

### 2. 支柱 7：一线接单员看板 UI 物理级裁剪 (`OrderHandlerWorkbench.tsx`)

```tsx
import React, { useState, useEffect } from 'react';

export const OrderHandlerWorkbench: React.FC<{
  tenantCode: string;
  currentUser: { id: number; name: string; phone: string; role: string; tenantName: string };
  onLogout: () => void;
}> = ({ tenantCode, currentUser, onLogout }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState('待接单');
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // 轮询拉取当前门店订单 (严格隔离当前 tenantCode)
  const fetchOrders = async () => {
    try {
      const res = await fetch(`/api/orders?restaurant=${tenantCode}&status=${filterStatus}`);
      const data = await res.json();
      if (Array.isArray(data)) setOrders(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchOrders();
    const timer = setInterval(fetchOrders, 5000);
    return () => clearInterval(timer);
  }, [tenantCode, filterStatus]);

  // 原子抢单动作
  const handleClaimOrder = async (orderId: string) => {
    setClaimingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantCode,
          handler_id: currentUser.id,
          handler_name: currentUser.name,
          handler_phone: currentUser.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '抢单失败');
      } else {
        fetchOrders();
      }
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* 支柱 7：彻底隐藏分店下拉选择、财务报表、收款设置，仅保留作业头栏 */}
      <header className="bg-white p-4 rounded-xl border flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-slate-900">
            {currentUser.tenantName} · 实时接单流水
          </h1>
          <p className="text-xs text-slate-500">
            当班接单员：<span className="font-semibold text-slate-700">{currentUser.name}</span> ({currentUser.phone})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {['待接单', '制作中', '已出餐'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 text-xs font-semibold rounded-md ${
                  filterStatus === s ? 'bg-white text-orange-600 shadow-xs' : 'text-slate-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={onLogout}
            className="px-3 py-1 text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg"
          >
            退出
          </button>
        </div>
      </header>

      {/* 订单流列表 */}
      <div className="space-y-3">
        {orders.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-xl border">
            当前暂无「{filterStatus}」的订单
          </div>
        ) : (
          orders.map((o) => (
            <div key={o.id} className="p-4 bg-white rounded-xl border space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm text-orange-700">桌号：{o.table_no}</span>
                <span className="text-xs font-mono text-slate-400">{o.id}</span>
              </div>
              <div className="text-xs text-slate-700 space-y-1">
                {(o.items || []).map((it: any, idx: number) => (
                  <div key={idx} className="flex justify-between">
                    <span>{it.name} × {it.qty}</span>
                    <span>¥{(it.price * it.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {o.notes && (
                <div className="text-[11px] p-2 bg-amber-50 text-amber-800 rounded">
                  备注：{o.notes}
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-xs font-bold text-slate-900">
                  总计：¥{Number(o.total_amount).toFixed(2)}
                </span>
                {o.status === '待接单' && (
                  <button
                    onClick={() => handleClaimOrder(o.id)}
                    disabled={claimingId === o.id}
                    className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    {claimingId === o.id ? '抢单中...' : '接单制作'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
```
