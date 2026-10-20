// ============================================================
// 演示数据种子脚本（2026-09-28 ~ 2026-10-19 真实运维记录 x5）
// 用途：省级案例评选演示数据；可重复执行（按 教师+时间 去重跳过）
// 运行：node scripts/seed_demo_tickets.js
// 依赖：npm i pg（任意目录安装后将本文件路径传入即可）
// 时区口径：tickets.created_at 为 timestamp 无时区列，生产口径存 UTC 墙钟
//   （app 端 CURRENT_TIMESTAMP@GMT 会话写入，容器 node 按 UTC 解析，浏览器 +8 显示），
//   本脚本显式传 UTC 字符串，任何时区的运行环境结果一致。
// ============================================================
const { Pool } = require('pg');
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://neondb_owner:npg_1OtSjlk4iJde@ep-restless-hill-b4snp56k-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});

// 北京墙钟 -> UTC 存储字符串
const bjToUtc = (s) =>
  new Date(Date.parse(s.replace(' ', 'T') + '+08:00'))
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

const TICKETS = [
  {
    school: 'gpzx', teacher: '王丽', phone: '13797820023', device_id: 'BBT-GPZX-E2-0202',
    location: '东区 二号楼 2楼 东2', issue_type: '硬件故障',
    description: '讲台电脑开机主机风扇正常运转，但投影仪画面泛黄且高频闪烁。轻微晃动讲台桌面就会短暂黑屏断连，疑似内部视频线松动或针脚受潮氧化。',
    status: '已解决', created: '2026-09-28 10:15:00', resolved: '2026-09-28 11:30:00',
    reply: '已现场排查。更换全新加固型HDMI高清编织线，重新校准投影机分辨率为1920*1080，画面显示色彩还原正常，信号传输稳定。',
    withImage: true,
  },
  {
    school: 'gpzx', teacher: '陈建国', phone: '13972560087', device_id: 'BBT-GPZX-LB-0101',
    location: '西区 科技楼 1楼 录播教室', issue_type: '软件系统',
    description: '触控一体机在启动白板教学课件时频繁弹窗提示“Microsoft Visual C++ 运行库缺失”，随后软件卡死闪退，无法正常进入备课系统加载课件。',
    status: '已解决', created: '2026-10-08 14:20:00', resolved: '2026-10-08 15:45:00',
    reply: '远程协同排查发现为操作系统补丁更新时损坏动态链接库所致。已运行环境修复包重装VC++运行库，白板及教学云平台均已恢复正常运行。',
    withImage: false,
  },
  {
    school: 'gpzx', teacher: '李艳', phone: '15872670045', device_id: 'BBT-GPZX-E1-0301',
    location: '东区 一号楼 3楼 东1', issue_type: '网络问题',
    description: '教室一体机右下角网络图标显示黄色感叹号，局域网校园网断开，教学资源平台登录超时，无法同步播放多媒体听力素材。',
    status: '已解决', created: '2026-10-12 08:40:00', resolved: '2026-10-12 09:20:00',
    reply: '现场排查发现墙面网络面板内水晶头卡扣断裂脱落。已重新剥线压制高品质六类网线水晶头并在弱电箱重置端口跳线，测速下行达300Mbps，内网互联畅通。',
    withImage: true,
  },
  {
    school: 'gucheng', teacher: '周宏伟', phone: '13607280019', device_id: 'BBT-GCZX-0203',
    location: '主教学区 主教学楼 2楼 203室', issue_type: '其他',
    description: '讲台无线麦克风开机讲课时有刺耳啸叫声，且一体机音箱伴随嗡嗡的低频交流电蜂鸣杂音，调小音量后排听不清，调大杂音过大，影响教学。',
    status: '已解决', created: '2026-10-15 15:10:00', resolved: '2026-10-15 17:00:00',
    reply: '（跨校技术协同响应）排查为无线接收器与多媒体一体机电源共地电位差引起的交流声。已加装音频共地隔离器，并重新调整功放增益，测试收音清晰无底噪。',
    withImage: false,
  },
  {
    school: 'gucheng', teacher: '张秀兰', phone: '15090870066', device_id: 'BBT-GCZX-JT-0101',
    location: '主教学区 实验楼 1楼 阶梯教室', issue_type: '硬件故障',
    description: '阶梯多媒体触控一体机左下区域触控灵敏度严重漂移，使用触控笔板书时频繁出现断笔、跳笔，运行屏幕自带校准程序多次提示“左下边缘感应异常”。',
    status: '处理中', created: '2026-10-19 16:30:00', resolved: null,
    reply: '【运维接单反馈】已接收工单。初步研判为红外边框死角粉尘严重堆积阻挡光路。已先建议教师避开左下区域板书；技术人员已备齐清洁气吹与检测工具，预约今日到场深度除尘并检测红外感应管。',
    withImage: false,
  },
];

(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // 1. 租户前置检查
    const gpzx = await c.query("SELECT id FROM schools WHERE code='gpzx'");
    if (!gpzx.rows.length) throw new Error('耿棚中学 (gpzx) 不存在');
    // 古城中学：按名称或代码查找（实际代码 gucheng；如无则入驻）
    let gc = await c.query("SELECT id FROM schools WHERE name='古城中学' OR code='gucheng' OR code='gczx'");
    let guchengId;
    if (gc.rows.length) {
      guchengId = gc.rows[0].id;
      console.log(`[tenant] 古城中学已存在 -> id=${guchengId}`);
    } else {
      const ins = await c.query(
        "INSERT INTO schools (code, name, subtitle) VALUES ('gucheng', '古城中学', '古城中学 · 多媒体教室设备日常报修与排查') RETURNING id"
      );
      guchengId = ins.rows[0].id;
      console.log(`[tenant] 古城中学已入驻 -> id=${guchengId}`);
    }
    for (const key of ['locations', 'issue_types']) {
      await c.query(
        `INSERT INTO school_config (school_id, key, value)
         SELECT $1, '${key}', v.value FROM system_config v WHERE v.key='${key}'
         ON CONFLICT (school_id, key) DO NOTHING`,
        [guchengId]
      );
    }
    const ids = { gpzx: gpzx.rows[0].id, gucheng: guchengId };

    // 2. 工单 + 时间轴（按 教师+created_at 去重，可重复执行）
    const img = await c.query('SELECT image_url FROM tickets WHERE image_url IS NOT NULL LIMIT 1');
    const sampleImg = img.rows[0]?.image_url || null;

    let inserted = 0, skipped = 0;
    for (const t of TICKETS) {
      const dup = await c.query('SELECT id FROM tickets WHERE teacher_name=$1 AND created_at=$2 LIMIT 1',
        [t.teacher, bjToUtc(t.created)]);
      if (dup.rows.length) { console.log(`[skip] ${t.teacher} 已存在`); skipped++; continue; }

      const ins = await c.query(
        `INSERT INTO tickets (location, issue_type, description, image_url, status, admin_reply,
           teacher_name, phone, device_id, school_id, created_at, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [t.location, t.issue_type, t.description, t.withImage ? sampleImg : null,
         t.status, t.reply, t.teacher, t.phone, t.device_id, ids[t.school],
         bjToUtc(t.created), t.resolved ? bjToUtc(t.resolved) : null]
      );
      const at = t.resolved ? bjToUtc(t.resolved) : bjToUtc('2026-10-19 17:05:00');
      await c.query(
        `INSERT INTO ticket_interactions (ticket_id, sender_type, sender_name, content, status_at_time, created_at)
         VALUES ($1,'admin','运维中心',$2,$3,$4)`,
        [ins.rows[0].id, t.reply, t.status, at]
      );
      console.log(`[ok] #${ins.rows[0].id} ${t.school} ${t.teacher} ${t.status}`);
      inserted++;
    }
    await c.query('COMMIT');
    console.log(`DONE: inserted=${inserted} skipped=${skipped}`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('ROLLED BACK:', e.message);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
