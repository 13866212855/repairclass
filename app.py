# -*- coding: utf-8 -*-
"""
班班通智慧报修管理系统 (Smart Multimedia Classroom Repair System)
基于 Python + Streamlit 框架开发，面向中小学多媒体教学设备（班班通）的日常报修与运维管理。
后端存储：Neon PostgreSQL 数据库
图片存储：Cloudinary 云图床
部署平台：Render.com / 云服务器
"""

import os
import requests
import streamlit as st
import psycopg2
from psycopg2.extras import RealDictCursor
import cloudinary
import cloudinary.uploader
from datetime import datetime
import pytz

# ==========================================
# 1. 页面基本配置 (移动端优先响应式)
# ==========================================
st.set_page_config(
    page_title="班班通智慧报修管理系统",
    page_icon="🏫",
    layout="centered",
    initial_sidebar_state="collapsed"
)

# 统一时区：中国标准时间
BEIJING_TZ = pytz.timezone("Asia/Shanghai")

# 环境变量与配置
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://neondb_owner:npg_1OtSjlk4iJde@ep-restless-hill-b4snp56k-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require"
)

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "jcgfauar")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "334846743197461")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "08QPJV_jQenHGREGo2dBRpO_834")

# 初始化 Cloudinary
cloudinary.config(
    cloud_name=CLOUDINARY_CLOUD_NAME,
    api_key=CLOUDINARY_API_KEY,
    api_secret=CLOUDINARY_API_SECRET,
    secure=True
)

# ==========================================
# 2. 数据库连接与表结构初始化
# ==========================================
def get_db_connection():
    """获取数据库连接"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        st.error(f"❌ 数据库连接异常: {str(e)}")
        return None

def init_database():
    """初始化数据表 tickets 与 ai_settings"""
    conn = get_db_connection()
    if not conn:
        return
    try:
        with conn.cursor() as cur:
            # 工单表
            cur.execute("""
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
            """)

            # 大模型配置表
            cur.execute("""
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
            """)
        conn.commit()
        conn.close()
    except Exception as e:
        st.error(f"❌ 数据库表结构初始化失败: {str(e)}")

init_database()

# ==========================================
# 3. 大模型配置读取与调用函数
# ==========================================
def get_ai_config():
    """从数据库读取最新的大模型参数"""
    conn = get_db_connection()
    default_config = {
        "base_url": "https://apihub.agnes-ai.com/v1",
        "api_key": "sk-vWM7RHG5n7bljBNi3GgHfygxqiKlUYrPWZLLSUByIGm4BiM9",
        "text_model": "Agnes-2.5-flash",
        "image_model": "Agnes-Image-2.1-flash",
    }
    if not conn:
        return default_config
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM ai_settings WHERE id = 1 LIMIT 1;")
            row = cur.fetchone()
            if row:
                return {
                    "base_url": row.get("base_url") or default_config["base_url"],
                    "api_key": row.get("api_key") or default_config["api_key"],
                    "text_model": row.get("text_model") or default_config["text_model"],
                    "image_model": row.get("image_model") or default_config["image_model"],
                }
        conn.close()
    except Exception:
        pass
    return default_config

def save_ai_config(base_url, api_key, text_model, image_model):
    """保存大模型参数到数据库"""
    conn = get_db_connection()
    if not conn:
        return False, "数据库连接不可用"
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO ai_settings (id, base_url, api_key, text_model, image_model, updated_at)
                VALUES (1, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO UPDATE
                SET base_url = EXCLUDED.base_url,
                    api_key = EXCLUDED.api_key,
                    text_model = EXCLUDED.text_model,
                    image_model = EXCLUDED.image_model,
                    updated_at = CURRENT_TIMESTAMP;
            """, (base_url, api_key, text_model, image_model))
        conn.commit()
        conn.close()
        return True, "参数配置已成功持久化保存！"
    except Exception as e:
        return False, str(e)

def call_agnes_ai(base_url, api_key, model, messages):
    """请求 OpenAI 兼容接口的大模型"""
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    def _do_request(target_model):
        payload = {
            "model": target_model,
            "messages": messages,
            "max_tokens": 1200,
            "temperature": 0.7
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        return resp

    try:
        resp = _do_request(model)
        # 若报 model_not_found，尝试小写名称
        if resp.status_code != 200:
            err_json = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            if err_json.get("error", {}).get("code") == "model_not_found":
                resp = _do_request(model.lower())

        if resp.status_code == 200:
            data = resp.json()
            choice = data["choices"][0]["message"]
            content = choice.get("content") or choice.get("reasoning_content") or "（模型处理完毕，未返回文本）"
            return True, content
        else:
            return False, f"HTTP {resp.status_code}: {resp.text}"
    except Exception as e:
        return False, f"网络请求发生错误: {str(e)}"

# ==========================================
# 4. 路由逻辑判定 (/admin 与 教师前台)
# ==========================================
query_params = st.query_params
# 支持 ?admin, ?admin=true, ?page=admin 访问管理后台
is_admin_url = "admin" in query_params or query_params.get("page") == "admin"

# 初始化登录状态
if "admin_logged_in" not in st.session_state:
    st.session_state["admin_logged_in"] = False

# ==========================================
# 5. 管理员端视图 (/admin)
# ==========================================
if is_admin_url:
    st.title("🛠️ 班班通运维管理后台")

    # 未登录时展示登录表单 (不显示密码明文，防泄密)
    if not st.session_state["admin_logged_in"]:
        st.caption("仅限现代教育技术中心及信息技术运维教师登录")
        with st.form("admin_login_form"):
            username = st.text_input("管理员账号", placeholder="请输入账号")
            password = st.text_input("管理员密码", type="password", placeholder="请输入密码")
            submitted = st.form_submit_button("登录运维系统", use_container_width=True)

            if submitted:
                if username == "admin" and password == "admin123":
                    st.session_state["admin_logged_in"] = True
                    st.success("✅ 登录成功！")
                    st.rerun()
                else:
                    st.error("❌ 账号或密码不正确，请重新输入")
        
        st.write("")
        if st.button("← 返回教师报修前台"):
            st.query_params.clear()
            st.rerun()

    else:
        # 已登录：顶部状态与注销
        col_title, col_logout = st.columns([4, 1])
        with col_title:
            st.caption("当前权限：超级运维管理员 (已鉴权)")
        with col_logout:
            if st.button("退出登录", key="btn_logout"):
                st.session_state["admin_logged_in"] = False
                st.rerun()

        # 核心管理功能分页
        admin_tab1, admin_tab2 = st.tabs(["📋 报修工单集中处置", "⚙️ 大模型参数设置与在线测试"])

        # TAB 1: 工单管理
        with admin_tab1:
            conn = get_db_connection()
            if conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("""
                        SELECT 
                            COUNT(*)::int AS total,
                            COUNT(*) FILTER (WHERE status = '待处理')::int AS pending,
                            COUNT(*) FILTER (WHERE status = '处理中')::int AS processing,
                            COUNT(*) FILTER (WHERE status = '已解决')::int AS resolved
                        FROM tickets;
                    """)
                    stats = cur.fetchone() or {"total": 0, "pending": 0, "processing": 0, "resolved": 0}

                # 指标展示
                m1, m2, m3, m4 = st.columns(4)
                m1.metric("累计工单", stats["total"])
                m2.metric("待处理", stats["pending"])
                m3.metric("处理中", stats["processing"])
                m4.metric("已解决", stats["resolved"])

                st.divider()

                # 筛选工具条
                f1, f2, f3 = st.columns([2, 1, 1])
                with f1:
                    search_kw = st.text_input("搜索位置或关键词", placeholder="输入东区、2号楼、微机室...")
                with f2:
                    filter_status = st.selectbox("状态筛选", ["全部", "待处理", "处理中", "已解决"])
                with f3:
                    filter_type = st.selectbox("故障分类", ["全部", "硬件故障", "软件系统", "网络问题", "其他"])

                # 查询工单数据
                query_sql = "SELECT * FROM tickets WHERE 1=1"
                params = []
                if search_kw.strip():
                    query_sql += " AND (location ILIKE %s OR description ILIKE %s)"
                    kw = f"%{search_kw.strip()}%"
                    params.extend([kw, kw])
                if filter_status != "全部":
                    query_sql += " AND status = %s"
                    params.append(filter_status)
                if filter_type != "全部":
                    query_sql += " AND issue_type = %s"
                    params.append(filter_type)

                query_sql += " ORDER BY created_at DESC;"

                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(query_sql, params)
                    ticket_rows = cur.fetchall()
                conn.close()

                st.write(f"共检索到 **{len(ticket_rows)}** 条工单记录")

                for t in ticket_rows:
                    t_id = t["id"]
                    t_loc = t["location"]
                    t_status = t["status"]
                    t_time = t["created_at"].astimezone(BEIJING_TZ).strftime("%Y-%m-%d %H:%M") if t["created_at"] else ""

                    with st.expander(f"📍 #{t_id} 【{t_status}】 {t_loc} ({t['issue_type']}) - {t_time}", expanded=(t_status == "待处理")):
                        col_info, col_action = st.columns([1, 1])
                        with col_info:
                            st.write(f"**报修位置**：{t_loc}")
                            st.write(f"**故障现象**：{t['description']}")
                            st.write(f"**报修时间**：{t_time}")
                            if t.get("resolved_at"):
                                r_time = t["resolved_at"].astimezone(BEIJING_TZ).strftime("%Y-%m-%d %H:%M")
                                st.write(f"**解决时间**：{r_time}")
                            if t.get("image_url"):
                                st.image(t["image_url"], caption="现场故障照", use_column_width=True)
                            else:
                                st.caption("（教师未上传现场照片）")

                        with col_action:
                            st.markdown("##### 运维处置与答复")
                            new_status = st.selectbox(
                                "更新状态",
                                ["待处理", "处理中", "已解决"],
                                index=["待处理", "处理中", "已解决"].index(t_status),
                                key=f"status_{t_id}"
                            )
                            new_reply = st.text_area(
                                "处理反馈日志 (教师可见)",
                                value=t.get("admin_reply") or "",
                                placeholder="例如：已更换投影机灯泡并测试正常...",
                                key=f"reply_{t_id}",
                                height=100
                            )

                            if st.button("保存处理结果", key=f"save_{t_id}", use_container_width=True):
                                c2 = get_db_connection()
                                if c2:
                                    with c2.cursor() as cur:
                                        if new_status == "已解决":
                                            cur.execute("""
                                                UPDATE tickets
                                                SET status = %s, admin_reply = %s, resolved_at = CURRENT_TIMESTAMP
                                                WHERE id = %s;
                                            """, (new_status, new_reply, t_id))
                                        else:
                                            cur.execute("""
                                                UPDATE tickets
                                                SET status = %s, admin_reply = %s
                                                WHERE id = %s;
                                            """, (new_status, new_reply, t_id))
                                    c2.commit()
                                    c2.close()
                                    st.success(f"工单 #{t_id} 处理结果已更新！")
                                    st.rerun()

        # TAB 2: 大模型参数设置与测试
        with admin_tab2:
            st.subheader("大模型 API 参数设置")
            current_cfg = get_ai_config()

            with st.form("ai_config_form"):
                cfg_base_url = st.text_input("Base URL", value=current_cfg["base_url"])
                cfg_api_key = st.text_input("API Key", value=current_cfg["api_key"], type="password")
                cfg_text_model = st.text_input("文本 Model", value=current_cfg["text_model"])
                cfg_image_model = st.text_input("图片 Model", value=current_cfg["image_model"])

                submit_cfg = st.form_submit_button("保存参数配置", use_container_width=True)
                if submit_cfg:
                    ok, msg = save_ai_config(cfg_base_url, cfg_api_key, cfg_text_model, cfg_image_model)
                    if ok:
                        st.success(msg)
                    else:
                        st.error(f"保存失败: {msg}")

            st.divider()
            st.subheader("大模型在线连通性测试")
            test_prompt = st.text_input("测试 Prompt", value="请用一句话介绍你是中学班班通运维排查 AI 助手。")
            if st.button("立即测试模型连接", use_container_width=True):
                with st.spinner("正在向配置的大模型发送测试指令..."):
                    ok, reply = call_agnes_ai(
                        current_cfg["base_url"],
                        current_cfg["api_key"],
                        current_cfg["text_model"],
                        [
                            {"role": "system", "content": "你是中学班班通设备运维排查助手。"},
                            {"role": "user", "content": test_prompt}
                        ]
                    )
                    if ok:
                        st.success("✅ 连接成功！模型响应结果：")
                        st.info(reply)
                    else:
                        st.error(f"❌ 连接失败: {reply}")

# ==========================================
# 6. 教师报修端视图 (普通教师使用，界面简洁友好)
# ==========================================
else:
    # 顶部标题栏
    st.title("班班通智慧报修管理系统")

    # 在线咨询 AI 折叠入口
    with st.expander("🤖 在线咨询 AI 智能排查助手（投影仪/白板/网络/声音应急自查）", expanded=False):
        st.info("💡 教学遇到故障可先咨询 AI 助手获取 10 秒应急处理步骤，若无法解决再拍照提交报修。")
        
        # 快捷提问词
        q_cols = st.columns(2)
        quick_pick = None
        with q_cols[0]:
            if st.button("投影仪红灯高热断电怎么处理？", key="q1", use_container_width=True):
                quick_pick = "投影仪红灯一直闪烁，无法开机且机身发热，课堂急用怎么应急处理？"
            if st.button("电子白板触控严重偏移怎么校准？", key="q2", use_container_width=True):
                quick_pick = "电子白板触控笔迹严重偏移，触控不准怎么快速重新校准？"
        with q_cols[1]:
            if st.button("教室内电脑无法联网怎么自查？", key="q3", use_container_width=True):
                quick_pick = "教室内电脑连接不上校园网，网页打不开，怎么快速检查网线与连接？"
            if st.button("麦克风没有声音或尖锐啸叫？", key="q4", use_container_width=True):
                quick_pick = "授课无线麦克风没有声音或者对着音箱发出刺耳啸叫，怎么调试？"

        user_ai_question = st.text_input(
            "请输入您的设备疑问：",
            value=quick_pick if quick_pick else "",
            placeholder="例如：电脑屏幕没有声音、电子白板触控不灵敏..."
        )

        if st.button("发送咨询并获取排查方案", type="primary"):
            if not user_ai_question.strip():
                st.warning("请输入您遇到的问题")
            else:
                with st.spinner("AI 运维专家正在为您生成应急排查步骤..."):
                    cfg = get_ai_config()
                    system_prompt = (
                        "你是一名资深的中学信息技术教师兼多媒体班班通运维工程师。"
                        "服务对象是学校任课教师。给出条理清晰、步骤明确（1、2、3）的应急自查步骤。"
                        "若属于设备硬件损坏，指导教师在表单中上传照片报修，运维教师会第一时间到班处置。"
                    )
                    ok, reply = call_agnes_ai(
                        cfg["base_url"],
                        cfg["api_key"],
                        cfg["text_model"],
                        [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_ai_question.strip()}
                        ]
                    )
                    if ok:
                        st.markdown(f"**AI 建议**：\n\n{reply}")
                    else:
                        st.error(f"咨询暂时受阻：{reply}")

    # 教师核心功能选项卡
    t_tab1, t_tab2 = st.tabs(["📝 填写设备报修", "🔍 查询报修进度"])

    # 选项卡 1：填写报修
    with t_tab1:
        with st.form("repair_submit_form", clear_on_submit=True):
            st.markdown("#### 设备位置选择")
            
            # 位置模式切换
            input_mode = st.radio(
                "位置填写方式",
                ["区域楼栋级联选择", "自由手动输入"],
                horizontal=True,
                label_visibility="collapsed"
            )

            final_location = ""

            if input_mode == "区域楼栋级联选择":
                loc_col1, loc_col2 = st.columns([1, 2])
                with loc_col1:
                    zone = st.selectbox("1. 选择校区区域", ["东区", "西区", "其他"])

                with loc_col2:
                    if zone == "东区":
                        c_b, c_f, c_r = st.columns(3)
                        with c_b:
                            building = st.selectbox("楼号", ["一号楼", "二号楼", "三号楼", "四号楼", "五号楼", "六号楼"])
                        with c_f:
                            floor = st.selectbox("楼层", ["1楼", "2楼", "3楼", "4楼", "5楼", "6楼"])
                        with c_r:
                            room = st.selectbox("教室编号", ["东1", "东2", "东3", "东4", "东5", "东6"])
                        final_location = f"东区 {building} {floor} {room}"

                    elif zone == "西区":
                        c_f, c_r = st.columns(2)
                        with c_f:
                            floor = st.selectbox("楼层", ["1楼", "2楼", "3楼"])
                        with c_r:
                            room = st.selectbox("教室编号", ["东1", "东2", "东3", "东4"])
                        final_location = f"西区 {floor} {room}"

                    else:
                        other_loc = st.text_input("请输入专用教室或具体位置", placeholder="例如：科技楼301微机室、综合实验楼录播教室")
                        final_location = other_loc.strip()

                st.caption(f"当前选定位置：**{final_location if final_location else '（等待输入）'}**")
            else:
                final_location = st.text_input("设备位置", placeholder="例如：东区 2号楼 3楼 东2、微机室1、报告厅")

            # 故障类型
            issue_type = st.selectbox(
                "故障分类",
                ["硬件故障", "软件系统", "网络问题", "其他"],
                help="硬件：投影、白板触控、电源；软件：系统蓝屏、教学软件闪退；网络：教室网线断连"
            )

            # 故障描述
            description = st.text_area(
                "故障现象描述",
                placeholder="请简要说明故障现象（例如：按开机键投影机红灯常亮无画面，触控笔失灵偏移严重...）",
                height=100
            )

            # 照片上传
            uploaded_file = st.file_uploader(
                "现场故障照片 (推荐上传，便于老师备件)",
                type=["jpg", "jpeg", "png"],
                help="支持手机拍照上传，图片将自动托管至 Cloudinary 云图床"
            )

            submit_btn = st.form_submit_button("立即提交报修", type="primary", use_container_width=True)

            if submit_btn:
                if not final_location or not final_location.strip():
                    st.error("请选择或输入设备位置")
                elif not description or not description.strip():
                    st.error("请填写具体的故障现象描述")
                else:
                    image_url = None
                    if uploaded_file:
                        with st.spinner("正在上传现场故障照片至云端图床..."):
                            try:
                                upload_res = cloudinary.uploader.upload(
                                    uploaded_file,
                                    folder="banbantong_repairs",
                                    resource_type="image"
                                )
                                image_url = upload_res.get("secure_url")
                            except Exception as up_err:
                                st.warning(f"图片上传受阻，将继续提交文字工单: {str(up_err)}")

                    with st.spinner("正在保存报修工单..."):
                        conn = get_db_connection()
                        if conn:
                            with conn.cursor() as cur:
                                cur.execute("""
                                    INSERT INTO tickets (location, issue_type, description, image_url, status, created_at)
                                    VALUES (%s, %s, %s, %s, '待处理', CURRENT_TIMESTAMP)
                                    RETURNING id;
                                """, (final_location.strip(), issue_type, description.strip(), image_url))
                                new_id = cur.fetchone()[0]
                            conn.commit()
                            conn.close()

                            st.success(f"🎉 报修提交成功！工单编号 #{new_id}，技术老师已收到提醒，将尽快为您处理。")

    # 选项卡 2：进度查询
    with t_tab2:
        st.markdown("#### 报修进度查询")
        search_query = st.text_input("请输入设备位置关键词", placeholder="输入东区、2号楼、微机室...")

        if st.button("开始查询进度") or search_query:
            if not search_query.strip():
                st.warning("请输入查询关键词")
            else:
                conn = get_db_connection()
                if conn:
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        cur.execute("""
                            SELECT * FROM tickets
                            WHERE location ILIKE %s
                            ORDER BY created_at DESC;
                        """, (f"%{search_query.strip()}%",))
                        results = cur.fetchall()
                    conn.close()

                    if not results:
                        st.info("未查询到相关报修工单。")
                    else:
                        st.write(f"共检索到 **{len(results)}** 条报修记录：")
                        for item in results:
                            created_str = item["created_at"].astimezone(BEIJING_TZ).strftime("%Y-%m-%d %H:%M") if item["created_at"] else ""
                            with st.container():
                                st.markdown(f"**📍 {item['location']}** | 状态：`{item['status']}` | 报修时间：{created_str}")
                                st.write(f"故障描述：{item['description']}")
                                if item.get("image_url"):
                                    st.image(item["image_url"], width=200)
                                if item.get("admin_reply"):
                                    st.success(f"🛠️ 维修处置回复：{item['admin_reply']}")
                                else:
                                    st.caption("运维老师正在排查中，暂未回复...")
                                st.divider()
