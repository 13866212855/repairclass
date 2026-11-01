# Multi-Restaurant Food Ordering Implementation Reference (基于 mymultenant 技能)

本参考文档专门为「多租户多门店在线订餐系统」提供完整的代码骨架与核心逻辑，直接对应 `mymultenant` 架构模式。

---

## 一、系统角色与业务流程映射

- **平台超管 (`superadmin`)**：运营总部，负责审核各饭店入驻（创建子租户）、查看全平台交易总额。
- **饭店店长 (`store_admin`)**：单个饭店后台管理员，维护本店菜单、桌位、以及配置本店的接单员（如张强、李娜）。
- **饭店接单员 / 厨师 (`order_handler`)**：**核心执行角色**。打开系统后自动免密直达本店接单看板，实时接收顾客提交的订餐、改单、接单并出餐。
- **点餐顾客 (`customer`)**：扫描桌贴二维码（如 `/?tenant=kfc-wudaokou&table=B02`），直接进入本店点餐前台。

---

## 二、数据表结构完整 DDL (PostgreSQL)

```sql
-- 1. 饭店租户表
CREATE TABLE IF NOT EXISTS restaurants (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,      -- 租户标识，如 'chuancai-wudaokou'
    name VARCHAR(100) NOT NULL,            -- 门店名称，如 '川味人家 (五道口店)'
    subtitle VARCHAR(200),                 -- 门店标语，如 '正宗川味，现点现炒'
    logo_url VARCHAR(500),                 -- 门店头像/招牌
    notice TEXT,                           -- 门店滚动公告
    business_hours VARCHAR(100) DEFAULT '10:00-22:00',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 菜品分类与菜单表
CREATE TABLE IF NOT EXISTS dishes (
    id SERIAL PRIMARY KEY,
    restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,         -- '热销招牌', '川味经典', '主食米饭', '酒水饮料'
    name VARCHAR(100) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    is_available BOOLEAN DEFAULT true,     -- 是否售罄/下架
    sales_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 用户与员工角色表 (app_users)
CREATE TABLE IF NOT EXISTS app_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL, -- 手机号作为唯一标识
    name VARCHAR(100) NOT NULL,            -- 姓名（如：张强）
    phone VARCHAR(50) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'customer',
    -- 角色枚举：'superadmin' | 'store_admin' | 'order_handler' | 'customer'
    restaurant_id INT REFERENCES restaurants(id) ON DELETE SET NULL,
    device_id VARCHAR(100),                -- 浏览器/手持机硬件识别码
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. 订餐主记录表 (orders)
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_no VARCHAR(64) UNIQUE NOT NULL,  -- 订单编号，如 'ORD-20261101-0008'
    restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_no VARCHAR(50) NOT NULL,         -- 桌号 / 包厢号 (如 'A06' 或 '外带01')
    customer_name VARCHAR(100),            -- 顾客称呼
    phone VARCHAR(50),                     -- 顾客手机号
    device_id VARCHAR(100),                -- 下单设备
    items JSONB NOT NULL,                  -- [{"dish_id":1, "name":"宫保鸡丁", "price":38, "qty":1}]
    total_amount NUMERIC(10, 2) NOT NULL,  -- 总金额
    notes TEXT,                            -- 顾客口味备注 (如 '少辣，免香菜')
    status VARCHAR(50) DEFAULT '待接单',    -- '待接单' | '制作中' | '已出餐' | '已结账' | '已取消'
    handler_id INT REFERENCES app_users(id),-- 经办接单员 (如：张强)
    handler_reply TEXT,                    -- 接单员回执（如 '已通知后厨加急出餐'）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,                 -- 接单时间
    resolved_at TIMESTAMP                  -- 结案/出餐时间
);

-- 5. 订单互动与流转记录 (order_timeline)
CREATE TABLE IF NOT EXISTS order_timeline (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL,      -- 'staff' (接单员) | 'customer' (顾客)
    sender_name VARCHAR(100),
    content TEXT NOT NULL,
    status_at_time VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 三、核心服务端接口实现示例 (Node/Express)

```typescript
// 1. 餐厅接单员手机号快捷登录与设备绑定
app.post('/api/auth/staff-login', async (req, res) => {
  const { phone, device_id } = req.body;
  const cleanPhone = String(phone).trim();
  
  const userRes = await pool.query(`
    SELECT u.*, r.name as restaurant_name, r.code as restaurant_code 
    FROM app_users u 
    LEFT JOIN restaurants r ON u.restaurant_id = r.id 
    WHERE u.phone = $1 AND u.enabled = true
  `, [cleanPhone]);

  if (userRes.rows.length === 0) {
    return res.status(404).json({ error: '未找到该员工账号，请联系店长在后台添加' });
  }

  const user = userRes.rows[0];
  // 自动绑定当前手持机/电脑识别码
  if (device_id) {
    await pool.query('UPDATE app_users SET device_id = $1 WHERE id = $2', [device_id.trim(), user.id]);
    user.device_id = device_id.trim();
  }

  const token = `staff-token-${user.id}-${Date.now()}`;
  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role, // 'order_handler'
      restaurant_id: user.restaurant_id,
      restaurant_name: user.restaurant_name,
      restaurant_code: user.restaurant_code,
    },
    message: `欢迎回来，接单员 ${user.name}！`
  });
});

// 2. 接单员拉取本店订单列表 (严格租户隔离)
app.get('/api/orders', async (req, res) => {
  const { restaurant, status, search } = req.query;
  const restRes = await pool.query('SELECT id FROM restaurants WHERE code = $1 AND enabled = true', [restaurant]);
  if (restRes.rows.length === 0) return res.status(400).json({ error: '无效餐厅租户' });

  const restaurantId = restRes.rows[0].id;
  let sql = 'SELECT * FROM orders WHERE restaurant_id = $1';
  const params: any[] = [restaurantId];

  if (status && status !== '全部') {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (order_no ILIKE $${params.length} OR table_no ILIKE $${params.length} OR customer_name ILIKE $${params.length})`;
  }
  sql += ' ORDER BY created_at DESC';

  const result = await pool.query(sql, params);
  res.json(result.rows);
});

// 3. 接单与流转操作 (修改状态 + 记录日志)
app.post('/api/orders/:id/update-status', async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const { status, handler_id, handler_name, reply_content } = req.body;

  await pool.query(`
    UPDATE orders 
    SET status = $1, handler_id = $2, handler_reply = $3,
        accepted_at = CASE WHEN $1 = '制作中' AND accepted_at IS NULL THEN CURRENT_TIMESTAMP ELSE accepted_at END,
        resolved_at = CASE WHEN $1 IN ('已出餐', '已结账') THEN CURRENT_TIMESTAMP ELSE resolved_at END
    WHERE id = $4
  `, [status, handler_id, reply_content || '', orderId]);

  if (reply_content) {
    await pool.query(`
      INSERT INTO order_timeline (order_id, sender_type, sender_name, content, status_at_time)
      VALUES ($1, 'staff', $2, $3, $4)
    `, [orderId, handler_name || '接单员', reply_content, status]);
  }

  res.json({ success: true, message: `订单状态已成功变更为「${status}」` });
});
```

---

## 四、前端接单看板 React 核心结构

```tsx
// OrderHandlerWorkbench.tsx (餐厅接单看板)
export const OrderHandlerWorkbench: React.FC<{ restaurantCode: string; operator: any }> = ({
  restaurantCode,
  operator,
}) => {
  const [orders, setOrders] = useState([]);
  const [filterStatus, setFilterStatus] = useState('待接单');

  // 新订单声音提醒 (Audio Ding)
  const playNewOrderBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  // 轮询或 WebSocket 实时推送
  useEffect(() => {
    const fetchOrders = async () => {
      const res = await fetch(`/api/orders?restaurant=${restaurantCode}&status=${filterStatus}`);
      const data = await res.json();
      setOrders(data);
    };
    fetchOrders();
    const interval = setInterval(fetchOrders, 6000); // 6秒心跳刷新
    return () => clearInterval(interval);
  }, [restaurantCode, filterStatus]);

  const handleUpdateStatus = async (orderId: number, nextStatus: string) => {
    await fetch(`/api/orders/${orderId}/update-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: nextStatus,
        handler_id: operator.id,
        handler_name: operator.name,
      }),
    });
    // 重新刷新列表
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      {/* 顶部状态条：仅呈现接单员工作量与所属餐厅 */}
      <div className="bg-white p-4 rounded-xl border flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">{operator.restaurant_name} · 实时接单中心</h2>
          <p className="text-xs text-slate-500">当班接单员：{operator.name} ({operator.phone})</p>
        </div>
        <div className="flex gap-2">
          {['全部', '待接单', '制作中', '已出餐'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                filterStatus === s ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 订单卡片流 */}
      <div className="grid gap-3">
        {orders.map((order: any) => (
          <div key={order.id} className="bg-white p-4 rounded-xl border shadow-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-base text-orange-600">桌号：{order.table_no}</span>
              <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded font-bold">
                {order.status}
              </span>
            </div>
            <div className="text-xs text-slate-600">
              {order.items.map((it: any) => (
                <div key={it.name} className="flex justify-between py-0.5">
                  <span>{it.name} × {it.qty}</span>
                  <span>¥{(it.price * it.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
            {order.notes && (
              <div className="text-xs bg-amber-50 text-amber-800 p-2 rounded">
                备注：{order.notes}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t">
              {order.status === '待接单' && (
                <button
                  onClick={() => handleUpdateStatus(order.id, '制作中')}
                  className="px-4 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-semibold"
                >
                  确认接单并通知后厨
                </button>
              )}
              {order.status === '制作中' && (
                <button
                  onClick={() => handleUpdateStatus(order.id, '已出餐')}
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold"
                >
                  已出餐 (呼叫顾客取餐)
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```
