import express from 'express';
import path from 'path';
import fs from 'fs';
import compression from 'compression';
import { Pool } from 'pg';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

// Enable Gzip/Brotli response compression for ultra-fast load
app.use(compression());

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Fast health ping endpoints for UptimeRobot keep-alive
app.get(['/api/health', '/ping', '/api/ping'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// Cloudinary Configuration
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'jcgfauar';
const API_KEY = process.env.CLOUDINARY_API_KEY || '334846743197461';
const API_SECRET = process.env.CLOUDINARY_API_SECRET || '08QPJV_jQenHGREGo2dBRpO_834';

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
  secure: true,
});

// Database Configuration (Neon PostgreSQL)
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_1OtSjlk4iJde@ep-restless-hill-b4snp56k-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
});

// Auto-initialize DB Table
async function initDb() {
  try {
    const client = await pool.connect();
    await client.query(`
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

      CREATE TABLE IF NOT EXISTS ai_settings (
          id SERIAL PRIMARY KEY,
          base_url VARCHAR(500) DEFAULT 'https://apihub.agnes-ai.com/v1',
          api_key VARCHAR(500) DEFAULT 'sk-vWM7RHG5n7bljBNi3GgHfygxqiKlUYrPWZLLSUByIGm4BiM9',
          text_model VARCHAR(100) DEFAULT 'Agnes-2.5-flash',
          image_model VARCHAR(100) DEFAULT 'Agnes-Image-2.1-flash',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO ai_settings (id, base_url, api_key, text_model, image_model)
      VALUES (1, 'https://apihub.agnes-ai.com/v1', 'sk-vWM7RHG5n7bljBNi3GgHfygxqiKlUYrPWZLLSUByIGm4BiM9', 'Agnes-2.5-flash', 'Agnes-Image-2.1-flash')
      ON CONFLICT (id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS system_config (
          key VARCHAR(100) PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO system_config (key, value)
      VALUES (
        'locations',
        '{"dongBuildings":["一号楼","二号楼","三号楼","四号楼","五号楼","六号楼"],"dongFloors":["1楼","2楼","3楼","4楼"],"dongRooms":["东1","东2","东3","东4","东5","东6"],"xiFloors":["1楼","2楼","3楼"],"xiRooms":["东1","东2","东3","东4"]}'::jsonb
      )
      ON CONFLICT (key) DO UPDATE
      SET value = '{"dongBuildings":["一号楼","二号楼","三号楼","四号楼","五号楼","六号楼"],"dongFloors":["1楼","2楼","3楼","4楼"],"dongRooms":["东1","东2","东3","东4","东5","东6"],"xiFloors":["1楼","2楼","3楼"],"xiRooms":["东1","东2","东3","东4"]}'::jsonb
      WHERE system_config.key = 'locations' AND (system_config.value->'dongFloors' ? '5楼' OR system_config.value->'dongFloors' ? '6楼');

      INSERT INTO system_config (key, value)
      VALUES (
        'issue_types',
        '[{"name":"硬件故障","desc":"投影灯泡、幕布升降、触摸失灵、电源开不了机"},{"name":"软件系统","desc":"教学软件闪退、系统蓝屏、音视频解码异常"},{"name":"网络问题","desc":"教室网线断连、无网络信号、无法打开网页"},{"name":"其他","desc":"话筒啸叫、功放无声、遥控器失灵等"}]'::jsonb
      )
      ON CONFLICT (key) DO NOTHING;

      INSERT INTO system_config (key, value)
      VALUES ('system_title', '"耿中班班通报修管理系统"'::jsonb)
      ON CONFLICT (key) DO NOTHING;

      INSERT INTO system_config (key, value)
      VALUES ('system_subtitle', '"耿棚中学 · 多媒体教室设备日常报修与排查"'::jsonb)
      ON CONFLICT (key) DO NOTHING;

      -- Ensure tickets table has teacher_name and device_id columns
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS teacher_name VARCHAR(100);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS device_id VARCHAR(100);

      -- Multi-round interaction table (timeline for admin replies, maintenance photos, and user follow-up questions)
      CREATE TABLE IF NOT EXISTS ticket_interactions (
          id SERIAL PRIMARY KEY,
          ticket_id INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
          sender_type VARCHAR(20) NOT NULL, -- 'admin' | 'user'
          sender_name VARCHAR(100),
          content TEXT NOT NULL,
          image_url VARCHAR(500),
          status_at_time VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_ticket_interactions_ticket_id ON ticket_interactions(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_ticket_interactions_created_at ON ticket_interactions(created_at ASC);

      -- Backfill existing legacy admin_reply into ticket_interactions if not already recorded
      INSERT INTO ticket_interactions (ticket_id, sender_type, sender_name, content, status_at_time, created_at)
      SELECT id, 'admin', '运维中心', admin_reply, status, COALESCE(resolved_at, created_at)
      FROM tickets
      WHERE admin_reply IS NOT NULL AND TRIM(admin_reply) != ''
        AND id NOT IN (SELECT DISTINCT ticket_id FROM ticket_interactions);

      -- High-performance database indices for instant query speed
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tickets_location ON tickets(location);
      CREATE INDEX IF NOT EXISTS idx_tickets_teacher ON tickets(teacher_name);
      CREATE INDEX IF NOT EXISTS idx_tickets_device_id ON tickets(device_id);
    `);
    client.release();
    console.log('✅ PostgreSQL tickets & ai_settings tables initialized successfully');
  } catch (err) {
    console.error('❌ Failed to initialize database table:', err);
  }
}

initDb();

// Multer in-memory upload handler
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// ==========================================
// API Endpoints
// ==========================================

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const dbRes = await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      database: 'connected',
      dbTime: dbRes.rows[0].now,
      cloudinary: 'configured',
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', database: err.message });
  }
});

// Stats Summary
app.get('/api/tickets/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = '待处理')::int AS pending,
        COUNT(*) FILTER (WHERE status = '处理中')::int AS processing,
        COUNT(*) FILTER (WHERE status = '已解决')::int AS resolved
      FROM tickets;
    `);
    res.json(result.rows[0] || { total: 0, pending: 0, processing: 0, resolved: 0 });
  } catch (err: any) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper SQL for selecting tickets with aggregated interactions
const TICKET_SELECT_SQL = `
  SELECT 
    t.*,
    COALESCE(
      json_agg(
        json_build_object(
          'id', ti.id,
          'ticket_id', ti.ticket_id,
          'sender_type', ti.sender_type,
          'sender_name', ti.sender_name,
          'content', ti.content,
          'image_url', ti.image_url,
          'status_at_time', ti.status_at_time,
          'created_at', ti.created_at
        ) ORDER BY ti.created_at ASC
      ) FILTER (WHERE ti.id IS NOT NULL),
      '[]'::json
    ) AS interactions
  FROM tickets t
  LEFT JOIN ticket_interactions ti ON t.id = ti.ticket_id
`;

// List Tickets
app.get('/api/tickets', async (req, res) => {
  try {
    const { location, status, issue_type, search, deviceId, teacher_name, ids } = req.query;
    let query = `${TICKET_SELECT_SQL} WHERE 1=1`;
    const params: any[] = [];

    // Filter by specific IDs list
    if (ids && typeof ids === 'string' && ids.trim()) {
      const idList = ids.split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n));
      if (idList.length > 0) {
        params.push(idList);
        query += ` AND t.id = ANY($${params.length})`;
      }
    }

    // Filter by deviceId (for device specific history)
    if (deviceId && typeof deviceId === 'string' && deviceId.trim()) {
      params.push(deviceId.trim());
      query += ` AND t.device_id = $${params.length}`;
    }

    // Filter by teacher_name (exact match if specified)
    if (teacher_name && typeof teacher_name === 'string' && teacher_name.trim()) {
      params.push(teacher_name.trim());
      query += ` AND t.teacher_name = $${params.length}`;
    }

    const searchQuery = (search as string) || (location as string);
    if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim()) {
      params.push(`%${searchQuery.trim()}%`);
      query += ` AND (t.location ILIKE $${params.length} OR t.description ILIKE $${params.length} OR t.teacher_name ILIKE $${params.length})`;
    }

    if (status && typeof status === 'string' && status !== '全部' && status !== '全部状态') {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }

    if (issue_type && typeof issue_type === 'string' && issue_type !== '全部' && issue_type !== '全部类型') {
      params.push(issue_type);
      query += ` AND t.issue_type = $${params.length}`;
    }

    query += ' GROUP BY t.id ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    console.error('Error fetching tickets:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to fetch all tickets submitted by this teacher / device
app.get('/api/my-tickets', async (req, res) => {
  try {
    const deviceId = req.query.deviceId as string;
    const teacherName = req.query.teacherName as string;
    const ids = req.query.ids as string;

    const idList = ids && typeof ids === 'string'
      ? ids.split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n))
      : [];

    // If none provided, return the most recent 10 tickets as fallback
    if ((!deviceId || !deviceId.trim()) && (!teacherName || !teacherName.trim()) && idList.length === 0) {
      const fallbackResult = await pool.query(`${TICKET_SELECT_SQL} GROUP BY t.id ORDER BY t.created_at DESC LIMIT 10;`);
      return res.json(fallbackResult.rows);
    }

    const conditions: string[] = [];
    const params: any[] = [];

    if (deviceId && deviceId.trim()) {
      params.push(deviceId.trim());
      conditions.push(`t.device_id = $${params.length}`);
    }

    if (teacherName && teacherName.trim()) {
      params.push(teacherName.trim());
      conditions.push(`(t.teacher_name = $${params.length} AND t.teacher_name != '')`);
    }

    if (idList.length > 0) {
      params.push(idList);
      conditions.push(`t.id = ANY($${params.length})`);
    }

    const query = `
      ${TICKET_SELECT_SQL}
      WHERE ${conditions.join(' OR ')}
      GROUP BY t.id
      ORDER BY t.created_at DESC
      LIMIT 100;
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    console.error('Error fetching my tickets:', err);
    res.status(500).json({ error: err.message });
  }
});

// Single ticket detail endpoint
app.get('/api/tickets/:id', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) {
      return res.status(400).json({ error: '无效的工单ID' });
    }
    const result = await pool.query(`${TICKET_SELECT_SQL} WHERE t.id = $1 GROUP BY t.id;`, [ticketId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '未找到指定工单' });
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Error fetching single ticket:', err);
    res.status(500).json({ error: err.message });
  }
});

// Device Profile Endpoint (remember teacher name, last location and issue type)
app.get('/api/device-profile', async (req, res) => {
  try {
    const deviceId = req.query.deviceId;
    if (!deviceId || typeof deviceId !== 'string') {
      return res.json({ found: false });
    }
    const result = await pool.query(
      `SELECT teacher_name, location, issue_type
       FROM tickets
       WHERE device_id = $1
       ORDER BY created_at DESC
       LIMIT 1;`,
      [deviceId.trim()]
    );
    if (result.rows.length > 0) {
      res.json({
        found: true,
        teacher_name: result.rows[0].teacher_name || '',
        last_location: result.rows[0].location || '',
        last_issue_type: result.rows[0].issue_type || '',
      });
    } else {
      res.json({ found: false });
    }
  } catch (err: any) {
    console.error('Error fetching device profile:', err);
    res.json({ found: false });
  }
});

// Create Ticket (supports multipart file upload or JSON with existing image_url / base64)
app.post('/api/tickets', upload.single('image'), async (req, res) => {
  try {
    const { location, issue_type, description, teacher_name, device_id } = req.body;
    let imageUrl = req.body.image_url || null;

    if (!location || !location.trim()) {
      return res.status(400).json({ error: '班级或位置为必填项' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: '故障描述为必填项' });
    }

    // If an image file was uploaded, send it to Cloudinary
    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const uploadRes = await cloudinary.uploader.upload(dataURI, {
        folder: 'banbantong_repairs',
        resource_type: 'image',
      });
      imageUrl = uploadRes.secure_url;
    } else if (req.body.imageBase64) {
      const uploadRes = await cloudinary.uploader.upload(req.body.imageBase64, {
        folder: 'banbantong_repairs',
        resource_type: 'image',
      });
      imageUrl = uploadRes.secure_url;
    }

    const cleanTeacherName = (teacher_name && typeof teacher_name === 'string' ? teacher_name.trim() : '') || '未署名教师';
    const cleanDeviceId = (device_id && typeof device_id === 'string' ? device_id.trim() : '') || null;

    const insertResult = await pool.query(
      `INSERT INTO tickets (location, issue_type, description, image_url, status, teacher_name, device_id, created_at)
       VALUES ($1, $2, $3, $4, '待处理', $5, $6, CURRENT_TIMESTAMP)
       RETURNING *;`,
      [location.trim(), issue_type || '硬件故障', description.trim(), imageUrl, cleanTeacherName, cleanDeviceId]
    );

    res.status(201).json({
      success: true,
      ticket: insertResult.rows[0],
    });
  } catch (err: any) {
    console.error('Error creating ticket:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update Ticket (Legacy endpoint - updates status and adds interaction if reply provided)
app.put('/api/tickets/:id', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const { status, admin_reply, admin_name } = req.body;

    if (isNaN(ticketId)) {
      return res.status(400).json({ error: '无效的工单ID' });
    }

    let query = '';
    let params: any[] = [];

    if (status === '已解决') {
      query = `
        UPDATE tickets
        SET status = $1, admin_reply = $2, resolved_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *;
      `;
      params = [status, admin_reply || '', ticketId];
    } else {
      query = `
        UPDATE tickets
        SET status = $1, admin_reply = $2
        WHERE id = $3
        RETURNING *;
      `;
      params = [status || '待处理', admin_reply || '', ticketId];
    }

    const updateRes = await pool.query(query, params);
    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: '未找到指定工单' });
    }

    // If an admin reply is present, save it into ticket_interactions
    if (admin_reply && admin_reply.trim()) {
      await pool.query(
        `INSERT INTO ticket_interactions (ticket_id, sender_type, sender_name, content, status_at_time, created_at)
         VALUES ($1, 'admin', $2, $3, $4, CURRENT_TIMESTAMP);`,
        [ticketId, (admin_name && typeof admin_name === 'string' ? admin_name.trim() : '运维维修教师'), admin_reply.trim(), status || '待处理']
      );
    }

    // Return the updated ticket with all interactions
    const fullRes = await pool.query(`${TICKET_SELECT_SQL} WHERE t.id = $1 GROUP BY t.id;`, [ticketId]);

    res.json({
      success: true,
      ticket: fullRes.rows[0] || updateRes.rows[0],
    });
  } catch (err: any) {
    console.error('Error updating ticket:', err);
    res.status(500).json({ error: err.message });
  }
});

// Front-end Teacher Follow-up Question on a ticket
app.post('/api/tickets/:id/follow-up', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const { content, teacher_name } = req.body;

    if (isNaN(ticketId)) {
      return res.status(400).json({ error: '无效的工单ID' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '追问内容不能为空' });
    }

    const ticketCheck = await pool.query('SELECT status, teacher_name FROM tickets WHERE id = $1', [ticketId]);
    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: '未找到指定工单或已被删除' });
    }

    const currentStatus = ticketCheck.rows[0].status;
    const authorName = (teacher_name && typeof teacher_name === 'string' ? teacher_name.trim() : '') || ticketCheck.rows[0].teacher_name || '报修教师';

    // Insert user question into interactions
    const insertRes = await pool.query(
      `INSERT INTO ticket_interactions (ticket_id, sender_type, sender_name, content, status_at_time, created_at)
       VALUES ($1, 'user', $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING *;`,
      [ticketId, authorName, content.trim(), currentStatus]
    );

    // Fetch full ticket with updated interactions
    const fullRes = await pool.query(`${TICKET_SELECT_SQL} WHERE t.id = $1 GROUP BY t.id;`, [ticketId]);

    res.json({
      success: true,
      message: '追问已成功提交',
      interaction: insertRes.rows[0],
      ticket: fullRes.rows[0],
    });
  } catch (err: any) {
    console.error('Error adding follow-up question:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin Reply / Multi-round processing with optional photo/camera upload
app.post('/api/tickets/:id/admin-reply', upload.single('image'), async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const { content, status, admin_name } = req.body;
    let imageUrl = req.body.image_url || null;

    if (isNaN(ticketId)) {
      return res.status(400).json({ error: '无效的工单ID' });
    }

    // Handle photo upload (e.g. from camera or file picker)
    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const uploadRes = await cloudinary.uploader.upload(dataURI, {
        folder: 'banbantong_repairs',
        resource_type: 'image',
      });
      imageUrl = uploadRes.secure_url;
    } else if (req.body.imageBase64) {
      const uploadRes = await cloudinary.uploader.upload(req.body.imageBase64, {
        folder: 'banbantong_repairs',
        resource_type: 'image',
      });
      imageUrl = uploadRes.secure_url;
    }

    const cleanContent = (content && typeof content === 'string' ? content.trim() : '') || (imageUrl ? '（上传了现场检修/处置照片）' : '已跟进处理');
    const newStatus = status || '处理中';
    const cleanAdminName = (admin_name && typeof admin_name === 'string' ? admin_name.trim() : '') || '运维维修教师';

    // Update tickets table
    if (newStatus === '已解决') {
      await pool.query(
        `UPDATE tickets
         SET status = $1, admin_reply = $2, resolved_at = CURRENT_TIMESTAMP
         WHERE id = $3;`,
        [newStatus, cleanContent, ticketId]
      );
    } else {
      await pool.query(
        `UPDATE tickets
         SET status = $1, admin_reply = $2
         WHERE id = $3;`,
        [newStatus, cleanContent, ticketId]
      );
    }

    // Insert into interactions
    const insertRes = await pool.query(
      `INSERT INTO ticket_interactions (ticket_id, sender_type, sender_name, content, image_url, status_at_time, created_at)
       VALUES ($1, 'admin', $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING *;`,
      [ticketId, cleanAdminName, cleanContent, imageUrl, newStatus]
    );

    // Fetch full ticket with updated interactions
    const fullRes = await pool.query(`${TICKET_SELECT_SQL} WHERE t.id = $1 GROUP BY t.id;`, [ticketId]);

    res.json({
      success: true,
      message: '处置记录与反馈已成功保存并同步',
      interaction: insertRes.rows[0],
      ticket: fullRes.rows[0],
    });
  } catch (err: any) {
    console.error('Error posting admin reply:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete Ticket (Admin capability for removing invalid, duplicate or test tickets)
const handleDeleteTicketHandler = async (req: express.Request, res: express.Response) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) {
      return res.status(400).json({ error: '无效的工单ID' });
    }

    const deleteRes = await pool.query('DELETE FROM tickets WHERE id = $1 RETURNING id, location, teacher_name;', [ticketId]);
    if (deleteRes.rowCount === 0) {
      return res.status(404).json({ error: '未找到指定工单或已被删除' });
    }

    res.json({
      success: true,
      message: `工单 #${ticketId} 已成功删除`,
      deletedTicket: deleteRes.rows[0],
    });
  } catch (err: any) {
    console.error('Error deleting ticket:', err);
    res.status(500).json({ error: err.message });
  }
};

app.delete('/api/tickets/:id', handleDeleteTicketHandler);
app.delete('/api/admin/tickets/:id', handleDeleteTicketHandler);

// Endpoint to read app.py and requirements.txt for the deploy tab
app.get('/api/files/:filename', (req, res) => {
  const allowed = ['app.py', 'requirements.txt', 'Procfile', 'render.yaml', 'README.md'];
  const filename = req.params.filename;
  if (!allowed.includes(filename)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const filePath = path.join(process.cwd(), filename);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.sendFile(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

// Helper to call OpenAI-compatible AI API
async function callAgnesAi(baseUrl: string, apiKey: string, model: string, messages: any[]) {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const tryCall = async (targetModel: string) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        messages,
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });
    const data: any = await response.json();
    return { ok: response.ok, status: response.status, data };
  };

  let result = await tryCall(model);
  if (!result.ok && result.data?.error?.code === 'model_not_found') {
    // Try normalized lowercase model name
    result = await tryCall(model.toLowerCase());
  }

  if (!result.ok) {
    throw new Error(result.data?.error?.message || `AI API 请求失败 (状态码: ${result.status})`);
  }

  const choice = result.data?.choices?.[0];
  let reply = choice?.message?.content;
  if (!reply || reply.trim() === '') {
    reply = choice?.message?.reasoning_content || '（AI 已处理完成，暂无文本输出）';
  }
  return reply;
}

// Admin Authentication
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin123') {
    return res.json({
      success: true,
      token: 'admin-token-' + Date.now(),
      message: '登录成功',
    });
  }
  return res.status(401).json({ success: false, error: '账号或密码不正确' });
});

// Get AI Settings
app.get('/api/admin/ai-config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ai_settings WHERE id = 1 LIMIT 1');
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.json({
        base_url: 'https://apihub.agnes-ai.com/v1',
        api_key: 'sk-vWM7RHG5n7bljBNi3GgHfygxqiKlUYrPWZLLSUByIGm4BiM9',
        text_model: 'Agnes-2.5-flash',
        image_model: 'Agnes-Image-2.1-flash',
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update AI Settings
app.post('/api/admin/ai-config', async (req, res) => {
  try {
    const { base_url, api_key, text_model, image_model } = req.body;
    await pool.query(
      `INSERT INTO ai_settings (id, base_url, api_key, text_model, image_model, updated_at)
       VALUES (1, $1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE
       SET base_url = EXCLUDED.base_url,
           api_key = EXCLUDED.api_key,
           text_model = EXCLUDED.text_model,
           image_model = EXCLUDED.image_model,
           updated_at = CURRENT_TIMESTAMP;`,
      [
        base_url || 'https://apihub.agnes-ai.com/v1',
        api_key || 'sk-vWM7RHG5n7bljBNi3GgHfygxqiKlUYrPWZLLSUByIGm4BiM9',
        text_model || 'Agnes-2.5-flash',
        image_model || 'Agnes-Image-2.1-flash',
      ]
    );
    res.json({ success: true, message: '大模型配置已保存' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const DEFAULT_LOCATIONS = {
  dongBuildings: ['一号楼', '二号楼', '三号楼', '四号楼', '五号楼', '六号楼'],
  dongFloors: ['1楼', '2楼', '3楼', '4楼'],
  dongRooms: ['东1', '东2', '东3', '东4', '东5', '东6'],
  xiFloors: ['1楼', '2楼', '3楼'],
  xiRooms: ['东1', '东2', '东3', '东4'],
};

const DEFAULT_ISSUE_TYPES = [
  { name: '硬件故障', desc: '投影灯泡、幕布升降、触摸失灵、电源开不了机' },
  { name: '软件系统', desc: '教学软件闪退、系统蓝屏、音视频解码异常' },
  { name: '网络问题', desc: '教室网线断连、无网络信号、无法打开网页' },
  { name: '其他', desc: '话筒啸叫、功放无声、遥控器失灵等' },
];

const DEFAULT_SYSTEM_TITLE = '耿中班班通报修管理系统';
const DEFAULT_SYSTEM_SUBTITLE = '耿棚中学 · 多媒体教室设备日常报修与排查';

// Get System Config (Locations, Issue Types, and System Title)
app.get('/api/system-config', async (req, res) => {
  try {
    const locRes = await pool.query("SELECT value FROM system_config WHERE key = 'locations' LIMIT 1");
    const issueRes = await pool.query("SELECT value FROM system_config WHERE key = 'issue_types' LIMIT 1");
    const titleRes = await pool.query("SELECT value FROM system_config WHERE key = 'system_title' LIMIT 1");
    const subRes = await pool.query("SELECT value FROM system_config WHERE key = 'system_subtitle' LIMIT 1");

    const locations = locRes.rows.length > 0 ? locRes.rows[0].value : DEFAULT_LOCATIONS;
    const issue_types = issueRes.rows.length > 0 ? issueRes.rows[0].value : DEFAULT_ISSUE_TYPES;
    
    let system_title = DEFAULT_SYSTEM_TITLE;
    if (titleRes.rows.length > 0) {
      const val = titleRes.rows[0].value;
      system_title = typeof val === 'string' ? val : (val && typeof val === 'object' ? String(val) : DEFAULT_SYSTEM_TITLE);
      // Clean quotes if any JSON string quotes remained
      if (typeof system_title === 'string' && system_title.startsWith('"') && system_title.endsWith('"')) {
        system_title = system_title.slice(1, -1);
      }
    }

    let system_subtitle = DEFAULT_SYSTEM_SUBTITLE;
    if (subRes.rows.length > 0) {
      const val = subRes.rows[0].value;
      system_subtitle = typeof val === 'string' ? val : (val && typeof val === 'object' ? String(val) : DEFAULT_SYSTEM_SUBTITLE);
      if (typeof system_subtitle === 'string' && system_subtitle.startsWith('"') && system_subtitle.endsWith('"')) {
        system_subtitle = system_subtitle.slice(1, -1);
      }
    }

    res.json({
      system_title: system_title || DEFAULT_SYSTEM_TITLE,
      system_subtitle: system_subtitle || DEFAULT_SYSTEM_SUBTITLE,
      locations,
      issue_types,
    });
  } catch (err: any) {
    console.error('Error fetching system config:', err);
    res.json({
      system_title: DEFAULT_SYSTEM_TITLE,
      system_subtitle: DEFAULT_SYSTEM_SUBTITLE,
      locations: DEFAULT_LOCATIONS,
      issue_types: DEFAULT_ISSUE_TYPES,
    });
  }
});

// Update System Config
app.post('/api/admin/system-config', async (req, res) => {
  try {
    const { locations, issue_types, system_title, system_subtitle } = req.body;
    if (system_title && typeof system_title === 'string' && system_title.trim()) {
      await pool.query(
        `INSERT INTO system_config (key, value, updated_at)
         VALUES ('system_title', $1::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
        [JSON.stringify(system_title.trim())]
      );
    }
    if (system_subtitle !== undefined && typeof system_subtitle === 'string') {
      await pool.query(
        `INSERT INTO system_config (key, value, updated_at)
         VALUES ('system_subtitle', $1::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
        [JSON.stringify(system_subtitle.trim())]
      );
    }
    if (locations) {
      await pool.query(
        `INSERT INTO system_config (key, value, updated_at)
         VALUES ('locations', $1::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
        [JSON.stringify(locations)]
      );
    }
    if (issue_types) {
      await pool.query(
        `INSERT INTO system_config (key, value, updated_at)
         VALUES ('issue_types', $1::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
        [JSON.stringify(issue_types)]
      );
    }
    res.json({ success: true, message: '系统显示名称、设备位置与故障分类配置保存成功' });
  } catch (err: any) {
    console.error('Error saving system config:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reset System Config to Default
app.post('/api/admin/system-config/reset', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ('system_title', $1::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
      [JSON.stringify(DEFAULT_SYSTEM_TITLE)]
    );
    await pool.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ('system_subtitle', $1::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
      [JSON.stringify(DEFAULT_SYSTEM_SUBTITLE)]
    );
    await pool.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ('locations', $1::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
      [JSON.stringify(DEFAULT_LOCATIONS)]
    );
    await pool.query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ('issue_types', $1::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
      [JSON.stringify(DEFAULT_ISSUE_TYPES)]
    );
    res.json({
      success: true,
      message: '已恢复系统默认设置（东区各楼为4层，系统名称为耿中班班通报修管理系统）',
      system_title: DEFAULT_SYSTEM_TITLE,
      system_subtitle: DEFAULT_SYSTEM_SUBTITLE,
      locations: DEFAULT_LOCATIONS,
      issue_types: DEFAULT_ISSUE_TYPES,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Test AI Connection
app.post('/api/admin/ai-test', async (req, res) => {
  try {
    const { base_url, api_key, text_model, test_prompt } = req.body;
    const prompt = test_prompt || '请作为中学班班通运维AI，用简短一句话介绍自己的职责。';
    const reply = await callAgnesAi(
      base_url || 'https://apihub.agnes-ai.com/v1',
      api_key || 'sk-vWM7RHG5n7bljBNi3GgHfygxqiKlUYrPWZLLSUByIGm4BiM9',
      text_model || 'Agnes-2.5-flash',
      [
        { role: 'system', content: '你是中学多媒体班班通设备运维测试助手。' },
        { role: 'user', content: prompt },
      ]
    );
    res.json({ success: true, reply });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Public Teacher AI Consultation
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: '咨询内容不能为空' });
    }

    // Load AI config from DB
    const configRes = await pool.query('SELECT * FROM ai_settings WHERE id = 1 LIMIT 1');
    const config = configRes.rows[0] || {
      base_url: 'https://apihub.agnes-ai.com/v1',
      api_key: 'sk-vWM7RHG5n7bljBNi3GgHfygxqiKlUYrPWZLLSUByIGm4BiM9',
      text_model: 'Agnes-2.5-flash',
    };

    const systemPrompt = `你是一名资深的中学信息技术教师兼“班班通多媒体教学设备”专职运维工程师。
你的服务对象是全校一线任课教师。你的任务是耐心解答教师在教室使用多媒体教学一体机、投影机、电子白板、讲台电脑、扩音音响麦克风、校园网络时的各种故障和疑问。

运维知识库与经验：
1. 【投影仪无法开机/红灯闪烁】：多为机身过热保护或电源松动。提示教师切勿强行切断总电扇散热电源，等待其冷却后重启；若红灯常亮多为灯泡老化损坏。
2. 【电子白板/一体机触控偏移】：可在电脑控制面板或桌面“校准触控”快捷程序中点击九点/四点校准。如果是红外框式，检查边框凹槽是否有粉笔灰杂物遮挡。
3. 【电脑无声/话筒啸叫】：检查电脑右下角音频输出设备是否被误切，检查无线麦克风电池及接收器对频指示灯；话筒离音箱太近会引起声反馈啸叫，需调小增益或避开音箱正前方。
4. 【无网络/无法联网】：检查讲台网线水晶头卡扣是否松脱、千兆网口指示灯是否常亮；如为认证网络提示重新登录网关。
5. 【应急与报修】：给出清晰易行的自查步骤（1、2、3）；若属于硬件损坏或自查无法解决，温馨提醒教师使用本系统表单上传故障照片报修，运维教师会第一时间到班处置。

回答要求：语言亲切温和、条理清晰、步骤明确，避免生涩复杂的底层代码术语，让普通任课教师看懂并能直接动手排查。`;

    const messages: any[] = [{ role: 'system', content: systemPrompt }];

    // Append history (up to last 6 turns)
    if (Array.isArray(history)) {
      const recent = history.slice(-6);
      for (const h of recent) {
        if (h.role && h.content) {
          messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content });
        }
      }
    }

    messages.push({ role: 'user', content: message.trim() });

    const reply = await callAgnesAi(config.base_url, config.api_key, config.text_model, messages);
    res.json({ success: true, reply });
  } catch (err: any) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: err.message || 'AI 思考超时，请稍后重试' });
  }
});

// ==========================================
// Vite Middleware & Static Serving
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Static assets caching: 1 year for hashed files (immutable), fast instant reload
    app.use(
      express.static(distPath, {
        maxAge: '1y',
        immutable: true,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BanBanTong High-Speed Server running at http://0.0.0.0:${PORT}`);
  });

  // Enable HTTP Keep-Alive for rapid repeat requests
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

startServer();
