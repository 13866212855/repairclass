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

// Build marker: after three "stale container / stale browser" confusions,
// this makes "is the new version actually running?" answerable at a glance.
// Bump APP_VERSION on every change meant for deployment.
const APP_VERSION = 'v3.5';
const APP_STARTED_AT = new Date().toISOString();
app.get('/api/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ version: APP_VERSION, started_at: APP_STARTED_AT, uptime: process.uptime() });
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

// Same-origin image proxy: browsers with unreliable direct access to
// res.cloudinary.com (notably mainland China networks) fail to render
// uploaded photos even though server-side uploads succeed. Stream images
// through this server instead, with f_auto/q_auto to shrink delivery size
// (a 3-4MB phone photo drops to tens of KB). Whitelisted to our own cloud.
app.get('/api/img', async (req, res) => {
  const url = String(req.query.u || '');
  const prefix = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/`;
  if (!url.startsWith(prefix)) {
    return res.status(400).json({ error: '仅允许代理本图床资源' });
  }
  const optimized = url.replace(`${prefix}v`, `${prefix}f_auto,q_auto/v`);
  try {
    const upstream = await fetch(optimized);
    if (!upstream.ok) {
      return res.status(502).json({ error: `图床返回 ${upstream.status}` });
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err: any) {
    console.error('Image proxy error:', err.message);
    res.status(502).json({ error: '图片代理获取失败' });
  }
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
        '{"zones":[{"key":"dong","name":"东区","buildings":["一号楼","二号楼","三号楼","四号楼","五号楼","六号楼"],"floors":["1楼","2楼","3楼","4楼"],"rooms":["东1","东2","东3","东4","东5","东6"]},{"key":"xi","name":"西区","buildings":[],"floors":["1楼","2楼","3楼"],"rooms":["东1","东2","东3","东4"]}]}'::jsonb
      )
      ON CONFLICT (key) DO NOTHING;

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

      -- Ensure tickets table has teacher_name, phone, and device_id columns
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS teacher_name VARCHAR(100);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
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

      -- Multi-tenant sub-service registry (managed from /admin panel,
      -- rendered into the nginx gateway config automatically)
      CREATE TABLE IF NOT EXISTS tenants (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          subpath VARCHAR(60) NOT NULL UNIQUE,
          upstream_host VARCHAR(100) NOT NULL,
          upstream_port INT NOT NULL,
          enabled BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO tenants (name, subpath, upstream_host, upstream_port, enabled)
      VALUES ('Streamlit 版（pyapp）', '/pyapp/', 'pyapp', 8501, true)
      ON CONFLICT (subpath) DO NOTHING;

      -- Multi-school tenancy registry (SaaS-style: one database, per-school isolation)
      CREATE TABLE IF NOT EXISTS schools (
          id SERIAL PRIMARY KEY,
          code VARCHAR(30) NOT NULL UNIQUE,
          name VARCHAR(100) NOT NULL,
          subtitle VARCHAR(200),
          enabled BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO schools (id, code, name, subtitle)
      VALUES (1, 'gpzx', '耿棚中学', '耿棚中学 · 多媒体教室设备日常报修与排查')
      ON CONFLICT (id) DO NOTHING;

      -- One-time migration: canonical default-tenant code gpzx (耿棚中学)
      UPDATE schools SET code = 'gpzx'
      WHERE id = 1 AND code = 'gengpeng'
        AND NOT EXISTS (SELECT 1 FROM schools WHERE code = 'gpzx' AND id <> 1);

      SELECT setval(pg_get_serial_sequence('schools', 'id'), GREATEST((SELECT MAX(id) FROM schools), 1));

      -- Per-tenant branding: own logo + optional custom display title
      ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500);
      ALTER TABLE schools ADD COLUMN IF NOT EXISTS display_title VARCHAR(100);

      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS school_id INT DEFAULT 1;
      CREATE INDEX IF NOT EXISTS idx_tickets_school ON tickets(school_id);

      -- Per-school config copies (locations / issue_types): each tenant gets
      -- its own editable copy, onboarded from the main tenant's config.
      -- Main tenant (school 1) keeps using global system_config as its store.
      CREATE TABLE IF NOT EXISTS school_config (
          school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
          key VARCHAR(100) NOT NULL,
          value JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (school_id, key)
      );

      -- Backfill copies for schools onboarded before per-school config existed
      INSERT INTO school_config (school_id, key, value)
      SELECT s.id, 'locations', c.value FROM schools s CROSS JOIN system_config c
      WHERE c.key = 'locations' AND s.id <> 1
        AND NOT EXISTS (SELECT 1 FROM school_config sc WHERE sc.school_id = s.id AND sc.key = 'locations');

      INSERT INTO school_config (school_id, key, value)
      SELECT s.id, 'issue_types', c.value FROM schools s CROSS JOIN system_config c
      WHERE c.key = 'issue_types' AND s.id <> 1
        AND NOT EXISTS (SELECT 1 FROM school_config sc WHERE sc.school_id = s.id AND sc.key = 'issue_types');


      -- Default tenant: served at / with no ?tenant= param (admin-configurable)
      INSERT INTO system_config (key, value)
      VALUES ('default_school', '"gpzx"'::jsonb)
      ON CONFLICT (key) DO NOTHING;
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

// Stats Summary (per-school, with fault-type / location distributions)
app.get('/api/tickets/stats', async (req, res) => {
  try {
    const schoolId = await resolveSchoolId(req.query.school as string);
    const schoolCond = schoolId ? 'WHERE school_id = $1' : '';
    const params = schoolId ? [schoolId] : [];

    const result = await pool.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = '待处理')::int AS pending,
        COUNT(*) FILTER (WHERE status = '处理中')::int AS processing,
        COUNT(*) FILTER (WHERE status = '已解决')::int AS resolved
      FROM tickets ${schoolCond};`,
      params
    );
    const byType = await pool.query(
      `SELECT issue_type AS name, COUNT(*)::int AS count FROM tickets ${schoolCond} GROUP BY issue_type ORDER BY count DESC;`,
      params
    );
    const byLocation = await pool.query(
      `SELECT location AS name, COUNT(*)::int AS count FROM tickets ${schoolCond} GROUP BY location ORDER BY count DESC LIMIT 6;`,
      params
    );
    const devices = await pool.query(
      `SELECT COUNT(DISTINCT device_id)::int AS device_count FROM tickets ${schoolCond};`,
      params
    );

    res.json({
      ...(result.rows[0] || { total: 0, pending: 0, processing: 0, resolved: 0 }),
      by_type: byType.rows,
      by_location: byLocation.rows,
      device_count: devices.rows[0]?.device_count || 0,
    });
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
    const { location, status, issue_type, search, deviceId, teacher_name, ids, school } = req.query;
    let query = `${TICKET_SELECT_SQL} WHERE 1=1`;
    const params: any[] = [];

    // Multi-school isolation: scope results to the requested school (code)
    const schoolId = await resolveSchoolId(school);
    if (schoolId) {
      params.push(schoolId);
      query += ` AND t.school_id = $${params.length}`;
    }

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
    const phone = req.query.phone as string;
    const ids = req.query.ids as string;
    const school = req.query.school as string;
    const schoolId = await resolveSchoolId(school);

    const idList = ids && typeof ids === 'string'
      ? ids.split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n))
      : [];

    // If none provided, return the most recent 10 tickets as fallback
    if ((!deviceId || !deviceId.trim()) && (!teacherName || !teacherName.trim()) && (!phone || !phone.trim()) && idList.length === 0) {
      const fallbackResult = await pool.query(
        `${TICKET_SELECT_SQL} ${schoolId ? 'WHERE t.school_id = $1' : ''} GROUP BY t.id ORDER BY t.created_at DESC LIMIT 10;`,
        schoolId ? [schoolId] : []
      );
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

    if (phone && phone.trim()) {
      params.push(phone.trim());
      conditions.push(`(t.phone = $${params.length} AND t.phone != '')`);
    }

    if (idList.length > 0) {
      params.push(idList);
      conditions.push(`t.id = ANY($${params.length})`);
    }

    const schoolCond = schoolId ? ` AND t.school_id = $${params.length + 1}` : '';
    if (schoolId) params.push(schoolId);

    const query = `
      ${TICKET_SELECT_SQL}
      WHERE (${conditions.join(' OR ')})${schoolCond}
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

// Device Profile Endpoint (remember teacher name, phone, last location and issue type)
app.get('/api/device-profile', async (req, res) => {
  try {
    const deviceId = req.query.deviceId;
    if (!deviceId || typeof deviceId !== 'string') {
      return res.json({ found: false });
    }
    const result = await pool.query(
      `SELECT teacher_name, phone, location, issue_type
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
        phone: result.rows[0].phone || '',
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
    const { location, issue_type, description, teacher_name, phone, device_id } = req.body;
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
    const cleanPhone = (phone && typeof phone === 'string' ? phone.trim() : '') || null;
    const cleanDeviceId = (device_id && typeof device_id === 'string' ? device_id.trim() : '') || null;

    // Multi-school tenancy: bind the ticket to the submitting school
    const ticketSchoolId = (await resolveSchoolId(req.body.school_code)) ?? 1;

    const insertResult = await pool.query(
      `INSERT INTO tickets (location, issue_type, description, image_url, status, teacher_name, phone, device_id, school_id, created_at)
       VALUES ($1, $2, $3, $4, '待处理', $5, $6, $7, $8, CURRENT_TIMESTAMP)
       RETURNING *;`,
      [location.trim(), issue_type || '硬件故障', description.trim(), imageUrl, cleanTeacherName, cleanPhone, cleanDeviceId, ticketSchoolId]
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
  zones: [
    {
      key: 'dong',
      name: '东区',
      buildings: ['一号楼', '二号楼', '三号楼', '四号楼', '五号楼', '六号楼'],
      floors: ['1楼', '2楼', '3楼', '4楼'],
      rooms: ['东1', '东2', '东3', '东4', '东5', '东6'],
    },
    {
      key: 'xi',
      name: '西区',
      buildings: [],
      floors: ['1楼', '2楼', '3楼'],
      rooms: ['东1', '东2', '东3', '东4'],
    },
  ],
};

// Accept both the legacy flat location config (dongBuildings / xiFloors ...)
// and the zones array; always return the zones array shape.
function normalizeLocations(raw: any) {
  if (raw && Array.isArray(raw.zones)) {
    const zones = raw.zones
      .filter((z: any) => z && typeof z === 'object')
      .map((z: any, i: number) => ({
        key: String(z.key || `zone-${i + 1}`),
        name: String(z.name || `区域${i + 1}`),
        buildings: Array.isArray(z.buildings) ? z.buildings.map(String) : [],
        floors: Array.isArray(z.floors) ? z.floors.map(String) : [],
        rooms: Array.isArray(z.rooms) ? z.rooms.map(String) : [],
      }));
    if (zones.length > 0) return { zones };
  }
  if (raw && (Array.isArray(raw.dongFloors) || Array.isArray(raw.xiFloors))) {
    const zones: any[] = [];
    if (Array.isArray(raw.dongFloors) || Array.isArray(raw.dongRooms)) {
      zones.push({
        key: 'dong',
        name: '东区',
        buildings: Array.isArray(raw.dongBuildings) ? raw.dongBuildings.map(String) : [],
        floors: Array.isArray(raw.dongFloors) ? raw.dongFloors.map(String) : [],
        rooms: Array.isArray(raw.dongRooms) ? raw.dongRooms.map(String) : [],
      });
    }
    if (Array.isArray(raw.xiFloors) || Array.isArray(raw.xiRooms)) {
      zones.push({
        key: 'xi',
        name: '西区',
        buildings: [],
        floors: Array.isArray(raw.xiFloors) ? raw.xiFloors.map(String) : [],
        rooms: Array.isArray(raw.xiRooms) ? raw.xiRooms.map(String) : [],
      });
    }
    if (zones.length > 0) return { zones };
  }
  return DEFAULT_LOCATIONS;
}

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
    // Per-school config: school != 1 reads its own copies (falls back to the
    // main tenant's global config when its copy is missing); main tenant and
    // no-school callers read the global config, as before.
    const schoolId = await resolveSchoolId(req.query.school);
    let scopedLocations: any = null;
    let scopedIssueTypes: any = null;
    let schoolRow: any = null;
    if (schoolId && schoolId !== 1) {
      const sr = await pool.query('SELECT id, name, subtitle FROM schools WHERE id = $1', [schoolId]);
      schoolRow = sr.rows[0] || null;
      if (schoolRow) {
        const scRes = await pool.query(
          'SELECT key, value FROM school_config WHERE school_id = $1 AND key IN ($2, $3)',
          [schoolId, 'locations', 'issue_types']
        );
        scRes.rows.forEach((r: any) => {
          if (r.key === 'locations') scopedLocations = r.value;
          if (r.key === 'issue_types') scopedIssueTypes = r.value;
        });
      }
    }

    const locRes = await pool.query("SELECT value FROM system_config WHERE key = 'locations' LIMIT 1");
    const issueRes = await pool.query("SELECT value FROM system_config WHERE key = 'issue_types' LIMIT 1");
    const titleRes = await pool.query("SELECT value FROM system_config WHERE key = 'system_title' LIMIT 1");
    const subRes = await pool.query("SELECT value FROM system_config WHERE key = 'system_subtitle' LIMIT 1");

    const locations = normalizeLocations(
      scopedLocations || (locRes.rows.length > 0 ? locRes.rows[0].value : null)
    );
    const issue_types =
      scopedIssueTypes || (issueRes.rows.length > 0 ? issueRes.rows[0].value : DEFAULT_ISSUE_TYPES);
    
    let system_title = DEFAULT_SYSTEM_TITLE;
    if (schoolRow) {
      system_title = schoolRow.name || DEFAULT_SYSTEM_TITLE;
    } else if (titleRes.rows.length > 0) {
      const val = titleRes.rows[0].value;
      system_title = typeof val === 'string' ? val : (val && typeof val === 'object' ? String(val) : DEFAULT_SYSTEM_TITLE);
      // Clean quotes if any JSON string quotes remained
      if (typeof system_title === 'string' && system_title.startsWith('"') && system_title.endsWith('"')) {
        system_title = system_title.slice(1, -1);
      }
    }

    let system_subtitle = DEFAULT_SYSTEM_SUBTITLE;
    if (schoolRow) {
      system_subtitle = schoolRow.subtitle || DEFAULT_SYSTEM_SUBTITLE;
    } else if (subRes.rows.length > 0) {
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

// Update System Config (per-school for locations/issue_types when ?school=
// resolves to a sub-tenant; system_title/subtitle stay global and are only
// writable from the super admin context)
app.post('/api/admin/system-config', async (req, res) => {
  try {
    const { locations, issue_types, system_title, system_subtitle } = req.body;
    // Guard: an EXPLICIT school context that fails to resolve must REJECT,
    // never silently fall back to the global (main-tenant) config — that
    // fallback once caused cross-tenant data corruption via stale clients.
    const rawSchool = req.body?.school || req.query?.school;
    let schoolId: number | null = null;
    if (rawSchool) {
      schoolId = await resolveSchoolId(rawSchool);
      if (!schoolId) {
        return res.status(400).json({
          error: `学校代码「${rawSchool}」无效或已停用，已拒绝保存以防误写主租户配置。请刷新页面（Ctrl+F5）后重试`,
        });
      }
    }
    const scoped = schoolId && schoolId !== 1 ? schoolId : null;

    const saveKv = scoped
      ? (key: string, value: any) =>
          pool.query(
            `INSERT INTO school_config (school_id, key, value, updated_at)
             VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
             ON CONFLICT (school_id, key) DO UPDATE
             SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
            [scoped, key, JSON.stringify(value)]
          )
      : (key: string, value: any) =>
          pool.query(
            `INSERT INTO system_config (key, value, updated_at)
             VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
            [key, JSON.stringify(value)]
          );

    if (!scoped && system_title && typeof system_title === 'string' && system_title.trim()) {
      await saveKv('system_title', system_title.trim());
    }
    if (!scoped && system_subtitle !== undefined && typeof system_subtitle === 'string') {
      await saveKv('system_subtitle', system_subtitle.trim());
    }
    if (locations) {
      await saveKv('locations', normalizeLocations(locations));
    }
    if (issue_types) {
      await saveKv('issue_types', issue_types);
    }
    res.json({
      success: true,
      message: scoped
        ? '本校设备位置与故障分类配置已保存（不影响其他学校）'
        : '系统显示名称、设备位置与故障分类配置保存成功',
    });
  } catch (err: any) {
    console.error('Error saving system config:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reset System Config to Default (per-school when a sub-tenant context is given)
app.post('/api/admin/system-config/reset', async (req, res) => {
  try {
    const rawSchool = req.body?.school || req.query?.school;
    let schoolId: number | null = null;
    if (rawSchool) {
      schoolId = await resolveSchoolId(rawSchool);
      if (!schoolId) {
        return res.status(400).json({ error: `学校代码「${rawSchool}」无效，已拒绝操作` });
      }
    }
    if (schoolId && schoolId !== 1) {
      const upsert = (key: string, value: any) =>
        pool.query(
          `INSERT INTO school_config (school_id, key, value, updated_at)
           VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
           ON CONFLICT (school_id, key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
          [schoolId, key, JSON.stringify(value)]
        );
      await upsert('locations', DEFAULT_LOCATIONS);
      await upsert('issue_types', DEFAULT_ISSUE_TYPES);
      return res.json({
        success: true,
        message: '已为本校恢复默认位置与分类配置（不影响其他学校）',
        locations: DEFAULT_LOCATIONS,
        issue_types: DEFAULT_ISSUE_TYPES,
      });
    }
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
// Multi-Tenant Gateway: Sub-Tenant Registry & Nginx Config Rendering
// ==========================================

// Strict whitelist validation: every field is re-checked before it is
// allowed anywhere near a rendered nginx config (injection guard)
const SUBPATH_RE = /^\/[a-z0-9][a-z0-9_-]{0,49}\/$/;
const HOST_RE = /^[a-z0-9][a-z0-9-_.]{0,99}$/;

function sanitizeTenantInput(body: any): {
  error?: string;
  value?: { name: string; subpath: string; upstream_host: string; upstream_port: number };
} {
  const name = String(body?.name || '').trim().slice(0, 100);
  let subpath = String(body?.subpath || '').trim().toLowerCase();
  const upstream_host = String(body?.upstream_host || '').trim().toLowerCase();
  const upstream_port = parseInt(body?.upstream_port, 10);
  if (!name) return { error: '租户名称不能为空' };
  if (!subpath.endsWith('/')) subpath += '/';
  if (!SUBPATH_RE.test(subpath)) {
    return { error: '子路径格式不合法（仅允许小写字母/数字/-_，如 /myapp/）' };
  }
  if (['/api/', '/admin/', '/assets/', '/static/'].includes(subpath)) {
    return { error: `子路径 ${subpath} 为系统保留路径，不可使用` };
  }
  if (!HOST_RE.test(upstream_host)) return { error: '上游容器主机名格式不合法' };
  if (!upstream_port || upstream_port < 1 || upstream_port > 65535) {
    return { error: '上游端口必须在 1-65535 之间' };
  }
  return { value: { name, subpath, upstream_host, upstream_port } };
}

// Render enabled tenants as nginx location blocks. Consumed by the
// gateway sidecar (gateway_sync.sh): it atomically swaps this text into
// /etc/nginx/conf.d/tenants/tenants.conf after a successful `nginx -t`.
// Rendering lives here so the nginx side stays parser-free.
app.get('/api/gateway/render', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT name, subpath, upstream_host, upstream_port FROM tenants WHERE enabled = true ORDER BY id ASC'
    );
    const blocks = result.rows.map(
      (t) =>
        `# tenant: ${t.name}\n` +
        `location ${t.subpath} {\n` +
        `    proxy_pass http://${t.upstream_host}:${t.upstream_port}${t.subpath};\n` +
        `    proxy_http_version 1.1;\n` +
        `    proxy_set_header Upgrade $http_upgrade;\n` +
        `    proxy_set_header Connection "upgrade";\n` +
        `    proxy_set_header Host $host;\n` +
        `    proxy_set_header X-Real-IP $remote_addr;\n` +
        `    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n` +
        `    proxy_set_header X-Forwarded-Proto $scheme;\n` +
        `    proxy_connect_timeout 300s;\n` +
        `    proxy_send_timeout 300s;\n` +
        `    proxy_read_timeout 300s;\n` +
        `    proxy_buffering off;\n` +
        `}\n`
    );
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(blocks.join('\n'));
  } catch (err: any) {
    res.status(500).type('text/plain').send('# render error: ' + err.message);
  }
});

// Gateway polling endpoint (JSON view of enabled tenants)
app.get('/api/gateway/tenants', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, subpath, upstream_host, upstream_port FROM tenants WHERE enabled = true ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Admin CRUD for sub-tenants (used by the /admin panel) ----

app.get('/api/admin/tenants', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tenants ORDER BY id ASC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/tenants', async (req, res) => {
  const check = sanitizeTenantInput(req.body);
  if (check.error || !check.value) return res.status(400).json({ error: check.error });
  const { name, subpath, upstream_host, upstream_port } = check.value;
  try {
    const dup = await pool.query('SELECT id FROM tenants WHERE subpath = $1', [subpath]);
    if (dup.rows.length > 0) {
      return res.status(400).json({ error: `子路径 ${subpath} 已被占用` });
    }
    // Linkage guard: a school code is routed internally by the main app
    // (/s/<code>/) — never allow a gateway tenant to shadow it
    const codeKey = subpath.split('/').join('');
    const schoolClash = await pool.query('SELECT id, name FROM schools WHERE code = $1', [codeKey]);
    if (schoolClash.rows.length > 0) {
      return res.status(400).json({
        error: `子路径 ${subpath} 与入驻学校「${schoolClash.rows[0].name}」代码冲突：学校入口由主应用内部路由，无需网关租户`,
      });
    }
    const result = await pool.query(
      `INSERT INTO tenants (name, subpath, upstream_host, upstream_port, enabled)
       VALUES ($1, $2, $3, $4, true) RETURNING *`,
      [name, subpath, upstream_host, upstream_port]
    );
    res.json({
      success: true,
      tenant: result.rows[0],
      message: '子租户已添加，网关将在 10 秒内自动生效',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/tenants/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const check = sanitizeTenantInput(req.body);
  if (check.error || !check.value) return res.status(400).json({ error: check.error });
  const { name, subpath, upstream_host, upstream_port } = check.value;
  const enabled = req.body.enabled === undefined ? null : Boolean(req.body.enabled);
  try {
    const dup = await pool.query('SELECT id FROM tenants WHERE subpath = $1 AND id != $2', [subpath, id]);
    if (dup.rows.length > 0) {
      return res.status(400).json({ error: `子路径 ${subpath} 已被占用` });
    }
    const codeKey = subpath.split('/').join('');
    const schoolClash = await pool.query('SELECT id FROM schools WHERE code = $1', [codeKey]);
    if (schoolClash.rows.length > 0) {
      return res.status(400).json({
        error: `子路径 ${subpath} 与入驻学校代码「${codeKey}」冲突：学校入口由主应用内部路由，无需网关租户`,
      });
    }
    const result = await pool.query(
      `UPDATE tenants
       SET name = $1, subpath = $2, upstream_host = $3, upstream_port = $4,
           enabled = COALESCE($5::boolean, enabled), updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
      [name, subpath, upstream_host, upstream_port, enabled, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '租户不存在' });
    }
    res.json({
      success: true,
      tenant: result.rows[0],
      message: '子租户已更新，网关将在 10 秒内自动生效',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/tenants/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const result = await pool.query('DELETE FROM tenants WHERE id = $1 RETURNING id, subpath', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '租户不存在' });
    }
    res.json({
      success: true,
      message: `子租户 ${result.rows[0].subpath} 已删除，网关将在 10 秒内自动摘除路由`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Multi-School Tenancy: School Registry (one database, per-school isolation)
// ==========================================

// Resolve a school code to its id; returns null when absent/unknown so
// legacy callers without a school context keep working unfiltered.
async function resolveSchoolId(code: any): Promise<number | null> {
  if (!code || typeof code !== 'string' || !code.trim()) return null;
  try {
    const r = await pool.query('SELECT id FROM schools WHERE code = $1 AND enabled = true', [code.trim()]);
    return r.rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

// Public tenant resolver: returns THE school the visitor belongs to.
// ?tenant=<code> wins; unknown/disabled codes fall back to the configured
// default tenant. Never lists other schools (dedicated-app feel per tenant).
app.get('/api/schools', async (req, res) => {
  try {
    const code = String(req.query.tenant || '').trim().toLowerCase();
    let school: any = null;
    let requestedFound = false;
    if (code) {
      const r = await pool.query(
        'SELECT id, code, name, subtitle, logo_url, display_title FROM schools WHERE code = $1 AND enabled = true',
        [code]
      );
      if (r.rows[0]) {
        school = r.rows[0];
        requestedFound = true;
      }
    }
    if (!school) {
      const d = await pool.query(`
        SELECT id, code, name, subtitle, logo_url, display_title FROM schools
        WHERE enabled = true
          AND code = COALESCE(
            (SELECT value#>>'{}' FROM system_config WHERE key = 'default_school'),
            (SELECT code FROM schools WHERE id = 1)
          )
        ORDER BY id ASC LIMIT 1`);
      school = d.rows[0] || null;
    }
    if (!school) return res.json({ school: null, requested_found: requestedFound, is_default: true });
    const def = await pool.query(`
      SELECT COALESCE(
        (SELECT value#>>'{}' FROM system_config WHERE key = 'default_school'),
        (SELECT code FROM schools WHERE id = 1),
        ''
      ) AS code`);
    res.json({ school, requested_found: requestedFound, is_default: school.code === def.rows[0].code });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const SCHOOL_CODE_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;

// Admin: list all schools (incl. disabled) with default-tenant flag
app.get('/api/admin/schools', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*,
        (s.code = COALESCE(
          (SELECT value#>>'{}' FROM system_config WHERE key = 'default_school'),
          (SELECT code FROM schools WHERE id = 1)
        )) AS is_default
      FROM schools s ORDER BY s.id ASC`);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: set the default tenant served at / (no ?tenant= param)
app.post('/api/admin/schools/:id/set-default', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query('SELECT code, name FROM schools WHERE id = $1 AND enabled = true', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: '学校不存在或已停用' });
    await pool.query(
      `INSERT INTO system_config (key, value) VALUES ('default_school', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(r.rows[0].code)]
    );
    res.json({
      success: true,
      message: `默认子租户已设为「${r.rows[0].name}」，直接访问 / 即进入该校`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: onboard a new school
app.post('/api/admin/schools', async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim().slice(0, 100);
    const subtitle = String(req.body?.subtitle || '').trim().slice(0, 200) || null;
    if (!SCHOOL_CODE_RE.test(code)) {
      return res.status(400).json({ error: '学校代码格式不合法（2-30位小写字母/数字/连字符，如 gengpeng）' });
    }
    if (!name) return res.status(400).json({ error: '学校名称不能为空' });
    const dup = await pool.query('SELECT id FROM schools WHERE code = $1', [code]);
    if (dup.rows.length > 0) return res.status(400).json({ error: `学校代码 ${code} 已被使用` });
    const result = await pool.query(
      'INSERT INTO schools (code, name, subtitle) VALUES ($1, $2, $3) RETURNING *',
      [code, name, subtitle]
    );
    // Onboard with a COPY of the main tenant's locations/issue_types so the
    // new school starts from the main config but edits independently
    const newSchoolId = result.rows[0].id;
    const [locRes, issueRes] = await Promise.all([
      pool.query("SELECT value FROM system_config WHERE key = 'locations' LIMIT 1"),
      pool.query("SELECT value FROM system_config WHERE key = 'issue_types' LIMIT 1"),
    ]);
    const locVal = locRes.rows[0]?.value ?? DEFAULT_LOCATIONS;
    const issueVal = issueRes.rows[0]?.value ?? DEFAULT_ISSUE_TYPES;
    await pool.query(
      `INSERT INTO school_config (school_id, key, value) VALUES
        ($1, 'locations', $2::jsonb), ($1, 'issue_types', $3::jsonb)
       ON CONFLICT (school_id, key) DO NOTHING;`,
      [newSchoolId, JSON.stringify(locVal), JSON.stringify(issueVal)]
    );
    res.json({
      success: true,
      school: result.rows[0],
      message: `学校已入驻（位置与分类配置已从主租户复制），师生可通过 /s/${code}/ 访问本校专属报修入口`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update school (dynamic SET so empty strings can CLEAR a field;
// omitted keys are left untouched). Fields: name, subtitle, enabled,
// logo_url, display_title.
app.put('/api/admin/schools/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sets: string[] = [];
    const params: any[] = [];
    const put = (col: string, value: any) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };
    if (req.body?.name !== undefined) put('name', String(req.body.name).trim().slice(0, 100) || '未命名学校');
    if (req.body?.subtitle !== undefined) put('subtitle', String(req.body.subtitle).trim().slice(0, 200) || null);
    if (req.body?.enabled !== undefined) put('enabled', Boolean(req.body.enabled));
    if (req.body?.logo_url !== undefined) put('logo_url', String(req.body.logo_url || '').trim() || null);
    if (req.body?.display_title !== undefined) {
      put('display_title', String(req.body.display_title || '').trim().slice(0, 100) || null);
    }
    if (sets.length === 0) return res.status(400).json({ error: '没有需要更新的字段' });
    params.push(id);
    const result = await pool.query(
      `UPDATE schools SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '学校不存在' });
    res.json({ success: true, school: result.rows[0], message: '学校信息已更新' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: upload a school logo (stored on Cloudinary, URL saved on the row)
app.post('/api/admin/schools/:id/logo', upload.single('logo'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
    const exists = await pool.query('SELECT id, code FROM schools WHERE id = $1', [id]);
    if (exists.rows.length === 0) return res.status(404).json({ error: '学校不存在' });
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const uploadRes = await cloudinary.uploader.upload(dataURI, {
      folder: 'school_logos',
      resource_type: 'image',
    });
    await pool.query('UPDATE schools SET logo_url = $1 WHERE id = $2', [uploadRes.secure_url, id]);
    res.json({
      success: true,
      logo_url: uploadRes.secure_url,
      message: `「${exists.rows[0].code}」校徽已更新，师生端即刻生效`,
    });
  } catch (err: any) {
    console.error('School logo upload error:', err);
    res.status(500).json({ error: err.message || '校徽上传失败' });
  }
});

// Admin: remove a school (only when it has no tickets — use disable otherwise)
app.delete('/api/admin/schools/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === 1) return res.status(400).json({ error: '默认学校不可删除' });
    const isDefault = await pool.query(`
      SELECT 1 WHERE COALESCE(
        (SELECT value#>>'{}' FROM system_config WHERE key = 'default_school'),
        (SELECT code FROM schools WHERE id = 1)
      ) = (SELECT code FROM schools WHERE id = $1)`, [id]);
    if (isDefault.rows.length > 0) {
      return res.status(400).json({ error: '该学校是当前默认子租户，请先把默认设为其他学校再删除' });
    }
    const ticketCount = await pool.query('SELECT COUNT(*)::int AS c FROM tickets WHERE school_id = $1', [id]);
    if (ticketCount.rows[0].c > 0) {
      return res.status(400).json({ error: `该校名下已有 ${ticketCount.rows[0].c} 张工单，请改用「停用」保留数据` });
    }
    const result = await pool.query('DELETE FROM schools WHERE id = $1 RETURNING code', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '学校不存在' });
    res.json({ success: true, message: `学校 ${result.rows[0].code} 已移除` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
