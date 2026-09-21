import React, { useState, useEffect } from 'react';
import { Ticket, SystemConfig } from '../types';
import { LocationSelector, DEFAULT_LOCATION_CONFIG } from './LocationSelector';
import { AiChatModal } from './AiChatModal';
import {
  Send,
  Camera,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Image as ImageIcon,
  Check,
  X,
  RefreshCw,
  Sparkles,
  User,
  Phone,
  ClipboardList,
  MessageCircle,
  MessageSquare,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
} from 'lucide-react';

interface TeacherViewProps {
  onTicketSubmitted?: () => void;
  systemTitle?: string;
}

export const TeacherView: React.FC<TeacherViewProps> = ({ onTicketSubmitted, systemTitle }) => {
  const [activeTab, setActiveTab] = useState<'submit' | 'query'>('submit');

  // Device unique identification
  const [deviceId, setDeviceId] = useState<string>(() => {
    let id = localStorage.getItem('bbt_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
      localStorage.setItem('bbt_device_id', id);
    }
    return id;
  });

  // Teacher identification state
  const [teacherName, setTeacherName] = useState<string>(() => {
    return localStorage.getItem('bbt_teacher_name') || '';
  });
  const [teacherPhone, setTeacherPhone] = useState<string>(() => {
    return localStorage.getItem('bbt_teacher_phone') || '';
  });
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [modalNameInput, setModalNameInput] = useState('');
  const [modalPhoneInput, setModalPhoneInput] = useState('');
  const [modalError, setModalError] = useState('');
  const [hasSmartDefault, setHasSmartDefault] = useState(false);

  // System Config state
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    locations: DEFAULT_LOCATION_CONFIG,
    issue_types: [
      { name: '硬件故障', desc: '投影灯泡、幕布升降、触摸失灵、电源开不了机' },
      { name: '软件系统', desc: '教学软件闪退、系统蓝屏、音视频解码异常' },
      { name: '网络问题', desc: '教室网线断连、无网络信号、无法打开网页' },
      { name: '其他', desc: '话筒啸叫、功放无声、遥控器失灵等' },
    ],
  });

  // Submit form state - initialize with smart defaults from localStorage if present
  const [location, setLocation] = useState(() => {
    return localStorage.getItem('bbt_last_location') || '东区 一号楼 1楼 东1';
  });
  const [issueType, setIssueType] = useState(() => {
    return localStorage.getItem('bbt_last_issue_type') || '硬件故障';
  });
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<Ticket | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // AI Chat modal state
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  // Query state
  const [queryMode, setQueryMode] = useState<'my' | 'all'>('my');
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [loadingMyTickets, setLoadingMyTickets] = useState(false);
  const [justSubmittedId, setJustSubmittedId] = useState<number | null>(null);

  // All school tickets state
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loadingAllTickets, setLoadingAllTickets] = useState(false);
  const [allStatusFilter, setAllStatusFilter] = useState<string>('全部');
  const [allZoneFilter, setAllZoneFilter] = useState<string>('全部');
  const [searchLocation, setSearchLocation] = useState('');

  // Follow-up interaction state
  const [followUpTexts, setFollowUpTexts] = useState<{ [id: number]: string }>({});
  const [submittingFollowUpId, setSubmittingFollowUpId] = useState<number | null>(null);
  const [followUpToast, setFollowUpToast] = useState<string | null>(null);
  const [activeFollowUpInputId, setActiveFollowUpInputId] = useState<number | null>(null);

  // Fetch tickets submitted by this teacher / device
  const fetchMyTickets = async (highlightId?: number) => {
    setLoadingMyTickets(true);
    try {
      const savedIds: number[] = JSON.parse(localStorage.getItem('bbt_my_ticket_ids') || '[]');
      const params = new URLSearchParams();
      if (deviceId) params.append('deviceId', deviceId);
      const currentTeacher = teacherName || localStorage.getItem('bbt_teacher_name') || '';
      const currentPhone = teacherPhone || localStorage.getItem('bbt_teacher_phone') || '';
      if (currentTeacher) params.append('teacherName', currentTeacher);
      if (currentPhone) params.append('phone', currentPhone);
      if (savedIds.length > 0) params.append('ids', savedIds.join(','));

      const res = await fetch(`/api/my-tickets?${params.toString()}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setMyTickets(list);
      if (highlightId) {
        setJustSubmittedId(highlightId);
      }
    } catch (err) {
      console.error('Failed to load my tickets:', err);
    } finally {
      setLoadingMyTickets(false);
    }
  };

  // Fetch all tickets across school
  const fetchAllTickets = async (searchParam?: string) => {
    setLoadingAllTickets(true);
    try {
      const trimmed = searchParam !== undefined ? searchParam.trim() : searchLocation.trim();
      const url = trimmed ? `/api/tickets?location=${encodeURIComponent(trimmed)}` : '/api/tickets';
      const res = await fetch(url);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setAllTickets(list);
    } catch (err) {
      console.error('Failed to load all tickets:', err);
    } finally {
      setLoadingAllTickets(false);
    }
  };

  // Auto fetch tickets when switching to query tab or switching queryMode
  useEffect(() => {
    if (activeTab === 'query') {
      fetchMyTickets();
      fetchAllTickets();
    }
  }, [activeTab]);

  useEffect(() => {
    if (queryMode === 'all') {
      fetchAllTickets();
    }
  }, [queryMode]);

  // On mount: load system config and query device profile for smart defaults
  useEffect(() => {
    // 1. Fetch system config
    fetch('/api/system-config')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.locations && data.issue_types) {
          setSystemConfig(data);
          // If current issueType is not in the loaded list, default to first
          if (data.issue_types.length > 0 && !data.issue_types.some((it: any) => it.name === issueType)) {
            const savedType = localStorage.getItem('bbt_last_issue_type');
            if (savedType && data.issue_types.some((it: any) => it.name === savedType)) {
              setIssueType(savedType);
            } else {
              setIssueType(data.issue_types[0].name);
            }
          }
        }
      })
      .catch((err) => console.error('Failed to load system config:', err));

    // 2. Fetch remote device profile to restore defaults if user switched browsers or cleared storage
    if (deviceId) {
      fetch(`/api/device-profile?deviceId=${encodeURIComponent(deviceId)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.found) {
            let changed = false;
            if (data.teacher_name && !localStorage.getItem('bbt_teacher_name')) {
              setTeacherName(data.teacher_name);
              localStorage.setItem('bbt_teacher_name', data.teacher_name);
            }
            if (data.phone && !localStorage.getItem('bbt_teacher_phone')) {
              setTeacherPhone(data.phone);
              localStorage.setItem('bbt_teacher_phone', data.phone);
            }
            if (data.last_location && !localStorage.getItem('bbt_last_location')) {
              setLocation(data.last_location);
              localStorage.setItem('bbt_last_location', data.last_location);
              changed = true;
            }
            if (data.last_issue_type && !localStorage.getItem('bbt_last_issue_type')) {
              setIssueType(data.last_issue_type);
              localStorage.setItem('bbt_last_issue_type', data.last_issue_type);
              changed = true;
            }
            if (changed || localStorage.getItem('bbt_last_location')) {
              setHasSmartDefault(true);
            }
          }
        })
        .catch((err) => console.error('Failed to load device profile:', err));
    }

    if (localStorage.getItem('bbt_last_location') || localStorage.getItem('bbt_last_issue_type')) {
      setHasSmartDefault(true);
    }
  }, [deviceId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  // Trigger submission with confirmed teacher name & phone
  const executeSubmit = async (nameToUse: string, phoneToUse?: string) => {
    if (!location.trim()) {
      setErrorMsg('请选择或输入设备位置');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('请填写具体的故障现象描述');
      return;
    }

    const finalPhone = (phoneToUse !== undefined ? phoneToUse : teacherPhone).trim();

    setErrorMsg('');
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('location', location.trim());
      formData.append('issue_type', issueType);
      formData.append('description', description.trim());
      formData.append('teacher_name', nameToUse.trim());
      if (finalPhone) {
        formData.append('phone', finalPhone);
      }
      formData.append('device_id', deviceId);
      if (imageFile) {
        formData.append('image', imageFile);
      }

      const res = await fetch('/api/tickets', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '提交失败，请稍后重试');
      }

      setSubmitSuccess(data.ticket);
      
      // Save smart defaults for future visits on this device
      localStorage.setItem('bbt_teacher_name', nameToUse.trim());
      if (finalPhone) {
        localStorage.setItem('bbt_teacher_phone', finalPhone);
      }
      localStorage.setItem('bbt_last_location', location.trim());
      localStorage.setItem('bbt_last_issue_type', issueType);
      setHasSmartDefault(true);

      // Save ticket ID to local ticket history
      const prevIds: number[] = JSON.parse(localStorage.getItem('bbt_my_ticket_ids') || '[]');
      if (data.ticket?.id && !prevIds.includes(data.ticket.id)) {
        prevIds.unshift(data.ticket.id);
        localStorage.setItem('bbt_my_ticket_ids', JSON.stringify(prevIds.slice(0, 50)));
      }

      // Prepend newly submitted ticket to myTickets state immediately
      setMyTickets((prev) => [data.ticket, ...prev.filter((t) => t.id !== data.ticket.id)]);
      setJustSubmittedId(data.ticket.id);

      // Reset form description and photo, but KEEP location and issueType for convenience
      setDescription('');
      setImageFile(null);
      setImagePreview(null);
      if (onTicketSubmitted) onTicketSubmitted();

      // Immediately switch to the progress query tab and display the newly submitted record!
      setQueryMode('my');
      setActiveTab('query');

      // Sync from server in background
      fetchMyTickets(data.ticket.id);
    } catch (err: any) {
      setErrorMsg(err.message || '网络连接异常，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Validate basic input first
    if (!location.trim()) {
      setErrorMsg('请选择或输入设备位置');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('请填写具体的故障现象描述');
      return;
    }

    // 2. Check if name and phone are filled.
    // If not filled (first-time submission), pop up the dialog asking for name and phone!
    const currentName = teacherName.trim();
    const currentPhone = teacherPhone.trim();

    if (!currentName || !currentPhone) {
      setModalNameInput(currentName);
      setModalPhoneInput(currentPhone);
      setModalError('');
      setIsNameModalOpen(true);
      return;
    }

    // Subsequent submissions: automatically use remembered previous name & phone!
    executeSubmit(currentName, currentPhone);
  };

  const handleModalConfirmContact = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = modalNameInput.trim();
    const cleanPhone = modalPhoneInput.trim();

    if (!cleanName) {
      setModalError('请填写您的姓名或称谓');
      return;
    }
    if (!cleanPhone) {
      setModalError('请填写联系手机号，方便运维老师及时联系');
      return;
    }
    const digits = cleanPhone.replace(/\D/g, '');
    if (digits.length < 7) {
      setModalError('请输入有效的联系手机号码');
      return;
    }

    setTeacherName(cleanName);
    setTeacherPhone(cleanPhone);
    localStorage.setItem('bbt_teacher_name', cleanName);
    localStorage.setItem('bbt_teacher_phone', cleanPhone);
    setIsNameModalOpen(false);
    executeSubmit(cleanName, cleanPhone);
  };

  // Check if a ticket was submitted by current teacher / device
  const isTicketMine = (ticket: Ticket) => {
    try {
      const savedIds: number[] = JSON.parse(localStorage.getItem('bbt_my_ticket_ids') || '[]');
      if (savedIds.includes(ticket.id)) return true;
    } catch (e) {}
    if (ticket.device_id && ticket.device_id === deviceId) return true;
    const currentName = teacherName || localStorage.getItem('bbt_teacher_name') || '';
    if (currentName && ticket.teacher_name && ticket.teacher_name.trim() === currentName.trim()) return true;
    return false;
  };

  // Submit follow-up question
  const handleSendFollowUp = async (ticketId: number) => {
    const text = followUpTexts[ticketId]?.trim();
    if (!text) return;

    setSubmittingFollowUpId(ticketId);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          sender_name: teacherName || localStorage.getItem('bbt_teacher_name') || '报修教师',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '追问提交失败');

      setFollowUpTexts((prev) => ({ ...prev, [ticketId]: '' }));
      setActiveFollowUpInputId(null);
      setFollowUpToast(`✅ 针对工单 #${ticketId} 的追问已成功送达运维人员！`);
      setTimeout(() => setFollowUpToast(null), 3500);

      // Refresh both lists
      await Promise.all([fetchMyTickets(), fetchAllTickets()]);
    } catch (err: any) {
      alert(err.message || '提交追问失败，请重试');
    } finally {
      setSubmittingFollowUpId(null);
    }
  };

  const handleQuery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    fetchAllTickets(searchLocation);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case '待处理':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            待处理
          </span>
        );
      case '处理中':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">
            <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
            处理中
          </span>
        );
      case '已解决':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            已解决
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-5">
      {/* AI 对话弹窗 */}
      <AiChatModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} />

      {/* 首次报修教师姓名与手机号输入弹窗 */}
      {isNameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">请登记报修联系信息</h3>
                <p className="text-xs text-slate-500">方便后台运维人员及时核实与联系沟通</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-blue-50/70 p-3 rounded-xl border border-blue-100/80 leading-relaxed">
              💡 <strong>首次报修请完善联系信息：</strong>填写后<strong>本机将自动记住</strong>您的姓名与手机号，后期再次提交报修时将自动填入，无需重复输入。
            </p>

            {modalError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleModalConfirmContact} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  教师姓名 / 称谓 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={modalNameInput}
                  onChange={(e) => {
                    setModalNameInput(e.target.value);
                    if (modalError) setModalError('');
                  }}
                  placeholder="例如：张老师 / 李华"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-blue-600" />
                  联系手机号 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={modalPhoneInput}
                  onChange={(e) => {
                    setModalPhoneInput(e.target.value);
                    if (modalError) setModalError('');
                  }}
                  placeholder="例如：13800138000"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  增加手机号以便运维人员排查或上门时联系沟通
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsNameModalOpen(false)}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  返回修改
                </button>
                <button
                  type="submit"
                  disabled={!modalNameInput.trim() || !modalPhoneInput.trim()}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  确认并立即提交
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 顶部服务台通知 + AI 入口按钮 */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {systemTitle ? `${systemTitle} · 快速报修` : '班班通多媒体教学设备报修台'}
          </h2>
          <p className="text-xs sm:text-sm text-blue-100 mt-1">
            投影仪、触控黑板、讲台电脑或音响网络故障？选择设备位置拍照报修，运维教师将及时排查维修。
          </p>
        </div>

        <button
          onClick={() => setIsAiModalOpen(true)}
          className="px-4 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-slate-900 font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all shrink-0 cursor-pointer active:scale-95"
        >
          <Sparkles className="w-4 h-4 text-slate-900" />
          <span>在线咨询 AI 助手</span>
        </button>
      </div>

      {/* 模式切换选项卡 */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl shadow-2xs p-1">
        <button
          id="tab-submit-report"
          onClick={() => setActiveTab('submit')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
            activeTab === 'submit'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Send className="w-4 h-4" />
          填写设备报修
        </button>
        <button
          id="tab-query-progress"
          onClick={() => {
            setActiveTab('query');
            fetchMyTickets();
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
            activeTab === 'query'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Search className="w-4 h-4" />
          查询报修进度
        </button>
      </div>

      {/* TAB 1: 提交表单 */}
      {activeTab === 'submit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
          {submitSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 space-y-2 animate-fadeIn">
              <div className="flex items-center gap-2 font-bold text-emerald-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                报修提交成功！工单编号 #{submitSuccess.id}
              </div>
              <p className="text-sm text-emerald-700">
                报修人：<span className="font-semibold">{submitSuccess.teacher_name || teacherName}</span> | 设备位置：<span className="font-semibold">{submitSuccess.location}</span> | 故障类型：{submitSuccess.issue_type}
              </p>
              <p className="text-xs text-emerald-600">
                工单已同步至运维中心并自动记住您的设备常用位置，运维教师收到提醒后将尽快为您处理！
              </p>
              <button
                onClick={() => setSubmitSuccess(null)}
                className="mt-1 text-xs text-emerald-800 underline hover:text-emerald-900 cursor-pointer"
              >
                关闭提示
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* 智能预设记忆提醒 */}
          {hasSmartDefault && !submitSuccess && (
            <div className="px-3.5 py-2.5 bg-blue-50/90 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  <strong>智能记忆就绪：</strong>已为您自动预选本机常用的【{location}】与【{issueType}】，直接描述问题即可提交。
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHasSmartDefault(false)}
                className="text-blue-500 hover:text-blue-800 text-xs shrink-0 cursor-pointer"
              >
                ×
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 设备位置：级联下拉与手动输入组件 */}
            <LocationSelector
              value={location}
              onChange={(val) => {
                setLocation(val);
                localStorage.setItem('bbt_last_location', val);
              }}
              config={systemConfig.locations}
              required={true}
            />

            {/* 故障分类 */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                故障分类 <span className="text-rose-500">*</span>
              </label>
              <select
                id="select-issue-type"
                value={issueType}
                onChange={(e) => {
                  setIssueType(e.target.value);
                  localStorage.setItem('bbt_last_issue_type', e.target.value);
                }}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {systemConfig.issue_types.map((it) => (
                  <option key={it.name} value={it.name}>
                    {it.name} {it.desc ? `(${it.desc})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 详细描述 */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                故障现象描述 <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="textarea-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="请简要描述具体的故障情况，例如：按电源键投影机红灯高频闪烁、触控笔偏移约2厘米无法校准、音箱杂音大等..."
                rows={3}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                required
              />
            </div>

            {/* 图片上传 */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                现场故障照片 (推荐上传，便于老师备件)
              </label>

              {!imagePreview ? (
                <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50 hover:bg-blue-50/40">
                  <div className="p-2.5 bg-blue-100 rounded-full text-blue-600 mb-1.5">
                    <Camera className="w-5 h-5" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-slate-700">点击拍照或上传现场图片</span>
                  <span className="text-[11px] text-slate-500 mt-0.5">支持手机相机拍照或相册图片</span>
                  <input
                    id="input-file-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="relative border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center gap-4">
                  <img
                    src={imagePreview}
                    alt="现场预览"
                    className="w-20 h-20 object-cover rounded-lg border border-slate-200"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-sm font-medium text-slate-800 truncate">
                      <ImageIcon className="w-4 h-4 text-blue-600 shrink-0" />
                      {imageFile?.name || '已选照片'}
                    </div>
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1 font-medium">
                      <Check className="w-3.5 h-3.5" /> 准备就绪，提交时上传
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearImage}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                    title="移除图片"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* 报修联系人提示（已记住，首次提交由弹窗填写，后期自动带入） */}
            {teacherName.trim() && teacherPhone.trim() && (
              <div className="flex items-center justify-between px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                <span className="flex items-center gap-1.5 truncate">
                  <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>报修联系人：<strong className="text-slate-800 font-medium">{teacherName}</strong> ({teacherPhone})</span>
                  <span className="text-[11px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">已自动记忆</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setModalNameInput(teacherName);
                    setModalPhoneInput(teacherPhone);
                    setModalError('');
                    setIsNameModalOpen(true);
                  }}
                  className="text-blue-600 hover:text-blue-800 font-medium shrink-0 ml-2 hover:underline cursor-pointer"
                >
                  修改
                </button>
              </div>
            )}

            {/* 提交按钮 */}
            <div className="pt-2">
              <button
                id="btn-submit-repair"
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    正在提交工单...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    立即提交报修工单
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: 进度查询 */}
      {activeTab === 'query' && (
        <div className="space-y-4 animate-fadeIn">
          {/* 刚刚提交成功的突出提示横幅 */}
          {submitSuccess && (
            <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300 rounded-2xl text-emerald-950 space-y-2 shadow-xs animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm sm:text-base">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>报修工单已提交成功！工单编号 #{submitSuccess.id}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSubmitSuccess(null)}
                  className="text-emerald-700 hover:text-emerald-900 text-xs px-2.5 py-1 rounded-md bg-emerald-100 hover:bg-emerald-200 transition-colors cursor-pointer"
                >
                  ✕ 关闭提示
                </button>
              </div>
              <p className="text-xs sm:text-sm text-emerald-800">
                已自动为您切换到<strong>查询报修进度</strong>页。报修人：<strong>{submitSuccess.teacher_name || teacherName}</strong> | 设备位置：<strong>{submitSuccess.location}</strong> | 故障类型：<strong>{submitSuccess.issue_type}</strong>
              </p>
              <p className="text-xs text-emerald-700 font-medium">
                🔔 运维维护老师已同步收到该工单，正在安排排查。您可以随时在下方查看此工单的处理状态与运维答复。
              </p>
            </div>
          )}

          {/* 追问成功提示横幅 */}
          {followUpToast && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs sm:text-sm flex items-center justify-between shadow-xs animate-fadeIn">
              <div className="flex items-center gap-2 font-medium">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{followUpToast}</span>
              </div>
              <button
                type="button"
                onClick={() => setFollowUpToast(null)}
                className="text-blue-500 hover:text-blue-800 text-xs px-2 py-0.5 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* 查询模式切换子栏：我的报修 vs 全校报修 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setQueryMode('my')}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  queryMode === 'my'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                我的报修记录 ({myTickets.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setQueryMode('all');
                  if (allTickets.length === 0) fetchAllTickets();
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  queryMode === 'all'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                全校故障排查记录 ({allTickets.length})
              </button>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  fetchMyTickets();
                  fetchAllTickets();
                }}
                disabled={loadingMyTickets || loadingAllTickets}
                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="刷新工单状态"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-blue-600 ${
                    loadingMyTickets || loadingAllTickets ? 'animate-spin' : ''
                  }`}
                />
                <span>刷新最新进度</span>
              </button>
            </div>
          </div>

          {/* 模式 1：我的报修记录列表 */}
          {queryMode === 'my' && (
            <div className="space-y-4">
              {loadingMyTickets && myTickets.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500">
                  <RefreshCw className="w-7 h-7 mx-auto text-blue-500 animate-spin mb-3" />
                  <p className="text-sm font-medium text-slate-700">正在获取您的报修工单状态...</p>
                </div>
              ) : myTickets.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 space-y-3">
                  <ClipboardList className="w-10 h-10 mx-auto text-slate-300" />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">暂未查询到您当前设备的报修记录</p>
                    <p className="text-xs text-slate-500 mt-1">
                      您可以切换到“全校故障排查记录”查看所有教室故障，也可以立即提交新的报修。
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('submit')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      去填写设备报修
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQueryMode('all');
                        fetchAllTickets();
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Search className="w-3.5 h-3.5" />
                      查看全校排查记录
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                    <span>
                      当前共展示 <strong className="text-slate-800">{myTickets.length}</strong> 条报修工单
                      {teacherName && <span className="ml-1 text-blue-700">（报修教师：{teacherName}）</span>}
                    </span>
                    <span>按报修时间倒序</span>
                  </div>

                  {myTickets.map((ticket) => {
                    const isJustSubmitted = ticket.id === justSubmittedId;
                    const isFollowUpOpen = activeFollowUpInputId === ticket.id;
                    const followUpVal = followUpTexts[ticket.id] || '';
                    const isSubmittingThisFollowUp = submittingFollowUpId === ticket.id;

                    return (
                      <div
                        key={ticket.id}
                        className={`rounded-2xl border transition-all p-4 sm:p-5 space-y-3.5 ${
                          isJustSubmitted
                            ? 'bg-emerald-50/40 border-2 border-emerald-400 shadow-md ring-2 ring-emerald-200/50'
                            : 'bg-white border-slate-200 shadow-2xs'
                        }`}
                      >
                        {isJustSubmitted && (
                          <div className="flex items-center gap-1 text-xs font-bold text-emerald-800 pb-1 border-b border-emerald-200/60">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                            <span>✨ 刚刚提交成功 · 运维中心已受理</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-base">📍 {ticket.location}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                              #{ticket.id}
                            </span>
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 font-semibold flex items-center gap-1">
                              <User className="w-3 h-3 text-blue-600" />
                              我提交的
                            </span>
                          </div>
                          {getStatusBadge(ticket.status)}
                        </div>

                        <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                          {ticket.teacher_name && (
                            <span className="text-blue-700 font-medium">
                              报修教师：<strong>{ticket.teacher_name}</strong>
                              {ticket.phone && <span className="ml-1 text-slate-500 font-normal">({ticket.phone})</span>}
                            </span>
                          )}
                          <span>分类：<strong>{ticket.issue_type}</strong></span>
                          <span>报修时间：{formatDate(ticket.created_at)}</span>
                          {ticket.resolved_at && (
                            <span className="text-emerald-600 font-medium">
                              解决时间：{formatDate(ticket.resolved_at)}
                            </span>
                          )}
                        </div>

                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs sm:text-sm text-slate-700 space-y-2">
                          <div>
                            <span className="font-semibold text-slate-900">初始故障说明：</span>
                            <span className="leading-relaxed">{ticket.description}</span>
                          </div>
                          {ticket.image_url && (
                            <div className="pt-2 border-t border-slate-200/60">
                              <span className="text-xs text-slate-500 block mb-1">现场报修照片：</span>
                              <a
                                href={ticket.image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block"
                              >
                                <img
                                  src={ticket.image_url}
                                  alt="现场故障照"
                                  className="w-32 h-24 object-cover rounded-lg border border-slate-200 hover:opacity-90 transition-opacity shadow-2xs"
                                />
                              </a>
                            </div>
                          )}
                        </div>

                        {/* 多轮处理进展与沟通记录时间轴 */}
                        <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200/80 space-y-2.5">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800 border-b border-slate-200/60 pb-1.5">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-blue-600" />
                              运维多轮处理与沟通答复记录
                            </span>
                            <span className="text-[11px] font-normal text-slate-500">
                              共 {(ticket.interactions?.length || 0) + (ticket.admin_reply ? 1 : 0)} 条处理与答复
                            </span>
                          </div>

                          {/* 渲染多轮互动 */}
                          {ticket.interactions && ticket.interactions.length > 0 ? (
                            <div className="space-y-2.5">
                              {ticket.interactions.map((interaction, idx) => (
                                <div
                                  key={interaction.id || idx}
                                  className={`p-3 rounded-lg border text-xs sm:text-sm space-y-1.5 ${
                                    interaction.sender_type === 'user'
                                      ? 'bg-violet-50/70 border-violet-200 text-violet-950'
                                      : 'bg-blue-50/70 border-blue-200 text-blue-950'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold flex items-center gap-1.5 text-xs">
                                      {interaction.sender_type === 'user' ? (
                                        <>
                                          <MessageCircle className="w-3.5 h-3.5 text-violet-600" />
                                          <span className="text-violet-800">
                                            {interaction.sender_name || '教师'} 提出追问
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                                          <span className="text-blue-800">
                                            {interaction.sender_name || '运维人员'} 处理反馈
                                          </span>
                                          {interaction.status_at_time && (
                                            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100/80 text-blue-700 font-semibold">
                                              {interaction.status_at_time}
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </span>
                                    <span className="text-[11px] text-slate-400">
                                      {formatDate(interaction.created_at)}
                                    </span>
                                  </div>

                                  <p className="whitespace-pre-wrap leading-relaxed text-slate-700 text-xs sm:text-sm">
                                    {interaction.content}
                                  </p>

                                  {/* 运维上传的检修/更换部件照片 */}
                                  {interaction.image_url && (
                                    <div className="pt-1.5 border-t border-blue-100">
                                      <span className="text-[11px] text-blue-700 font-medium block mb-1">
                                        📷 运维现场处置 / 更换部件存证照片：
                                      </span>
                                      <a
                                        href={interaction.image_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block"
                                      >
                                        <img
                                          src={interaction.image_url}
                                          alt="运维处置照片"
                                          className="max-h-36 rounded border border-blue-200 object-cover shadow-2xs hover:opacity-90"
                                        />
                                      </a>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : ticket.admin_reply ? (
                            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg text-xs sm:text-sm text-blue-900 space-y-1">
                              <div className="font-semibold text-blue-800 text-xs flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                                运维维修教师回复与处理反馈：
                              </div>
                              <p className="leading-relaxed">{ticket.admin_reply}</p>
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500 flex items-center gap-1.5 bg-white p-2.5 rounded-lg border border-slate-100">
                              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>运维教师已接收此工单，正在排查处置中，处理结果与备件进展将在此实时同步...</span>
                            </div>
                          )}
                        </div>

                        {/* 追问与补充情况区域 */}
                        <div className="pt-1">
                          {!isFollowUpOpen ? (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => setActiveFollowUpInputId(ticket.id)}
                                className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                针对此工单继续追问 / 补充说明
                              </button>
                            </div>
                          ) : (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                  <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
                                  向运维老师继续追问或补充现场情况：
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setActiveFollowUpInputId(null)}
                                  className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                                >
                                  收起
                                </button>
                              </div>

                              <textarea
                                rows={2}
                                value={followUpVal}
                                onChange={(e) =>
                                  setFollowUpTexts((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                                }
                                placeholder="例如：请问上午第3节课前能修好吗？或者补充说明：刚发现投影仪开机有焦糊味..."
                                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />

                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-slate-500">
                                  提交后后台运维教师将第一时间收到并答复
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setActiveFollowUpInputId(null)}
                                    className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                                  >
                                    取消
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSendFollowUp(ticket.id)}
                                    disabled={isSubmittingThisFollowUp || !followUpVal.trim()}
                                    className="px-3.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                                  >
                                    {isSubmittingThisFollowUp ? (
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Send className="w-3 h-3" />
                                    )}
                                    提交追问
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* 模式 2：全校故障排查记录 (包括自己提交的记录) */}
          {queryMode === 'all' && (
            <div className="space-y-4">
              {/* 筛选与搜索卡片 */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <Search className="w-4 h-4 text-blue-600" />
                      全校设备故障与排查处置公示
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      实时展示全校各教学楼、教室设备报修与运维答复进展，包含您提交的工单
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">
                    全校共计 <strong className="text-blue-700 font-bold">{allTickets.length}</strong> 条记录
                  </div>
                </div>

                {/* 状态与校区过滤标签 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    <span className="text-xs text-slate-500 shrink-0 mr-1 flex items-center gap-1">
                      <Filter className="w-3 h-3" /> 状态:
                    </span>
                    {['全部', '待处理', '处理中', '已解决'].map((st) => {
                      const count =
                        st === '全部'
                          ? allTickets.length
                          : allTickets.filter((t) => t.status === st).length;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setAllStatusFilter(st)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer shrink-0 ${
                            allStatusFilter === st
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {st} ({count})
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    <span className="text-xs text-slate-500 shrink-0 mr-1">校区:</span>
                    {['全部', '东区', '西区', '微机室'].map((zn) => (
                      <button
                        key={zn}
                        type="button"
                        onClick={() => setAllZoneFilter(zn)}
                        className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer shrink-0 ${
                          allZoneFilter === zn
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {zn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 搜索栏 */}
                <form onSubmit={handleQuery} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                    <input
                      id="input-search-location"
                      type="text"
                      value={searchLocation}
                      onChange={(e) => setSearchLocation(e.target.value)}
                      placeholder="搜索教室、位置、教师姓名或故障关键词（如：东区、张老师、投影仪、黑屏）"
                      className="w-full pl-10 pr-9 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                    {searchLocation && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchLocation('');
                          fetchAllTickets('');
                        }}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    id="btn-search-tickets"
                    type="submit"
                    disabled={loadingAllTickets}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                  >
                    {loadingAllTickets ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    搜索 / 刷新
                  </button>
                </form>

                {/* 快捷搜索标签 */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-400 mr-1">快捷定位:</span>
                  {['东区 1号楼', '东区 2号楼', '西区 1楼', '西区 2楼', '微机室'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setSearchLocation(k);
                        fetchAllTickets(k);
                      }}
                      className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      {k}
                    </button>
                  ))}
                  {searchLocation && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchLocation('');
                        fetchAllTickets('');
                      }}
                      className="text-[11px] px-2 py-0.5 text-blue-600 hover:underline cursor-pointer ml-1"
                    >
                      清除搜索条件
                    </button>
                  )}
                </div>
              </div>

              {/* 全校记录结果列表 */}
              {loadingAllTickets && allTickets.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500">
                  <RefreshCw className="w-7 h-7 mx-auto text-blue-500 animate-spin mb-3" />
                  <p className="text-sm font-medium text-slate-700">正在获取全校故障排查记录...</p>
                </div>
              ) : (() => {
                // Filter all tickets based on filters
                const filtered = allTickets.filter((ticket) => {
                  if (allStatusFilter !== '全部' && ticket.status !== allStatusFilter) return false;
                  if (allZoneFilter !== '全部' && !ticket.location.includes(allZoneFilter)) return false;
                  if (searchLocation.trim()) {
                    const q = searchLocation.trim().toLowerCase();
                    const locMatch = ticket.location.toLowerCase().includes(q);
                    const teacherMatch = ticket.teacher_name?.toLowerCase().includes(q);
                    const issueMatch = ticket.issue_type.toLowerCase().includes(q);
                    const descMatch = ticket.description.toLowerCase().includes(q);
                    if (!locMatch && !teacherMatch && !issueMatch && !descMatch) return false;
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 space-y-3">
                      <AlertCircle className="w-9 h-9 mx-auto text-slate-300" />
                      <div>
                        <p className="text-sm font-semibold text-slate-700">未找到符合条件的故障排查记录</p>
                        <p className="text-xs text-slate-400 mt-1">
                          您可以尝试清除搜索关键词或切换状态分类查看全校其他记录
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchLocation('');
                          setAllStatusFilter('全部');
                          setAllZoneFilter('全部');
                          fetchAllTickets('');
                        }}
                        className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                      >
                        重置所有筛选条件
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                      <span>
                        共匹配到 <strong className="text-slate-900 font-bold">{filtered.length}</strong> 条记录
                        {allStatusFilter !== '全部' && (
                          <span className="ml-1 text-blue-700">（当前筛选：{allStatusFilter}）</span>
                        )}
                      </span>
                      <span>按报修时间倒序排列</span>
                    </div>

                    {filtered.map((ticket) => {
                      const isMine = isTicketMine(ticket);
                      const isFollowUpOpen = activeFollowUpInputId === ticket.id;
                      const followUpVal = followUpTexts[ticket.id] || '';
                      const isSubmittingThisFollowUp = submittingFollowUpId === ticket.id;

                      return (
                        <div
                          key={ticket.id}
                          className={`rounded-2xl border transition-all p-4 sm:p-5 space-y-3.5 ${
                            isMine
                              ? 'bg-blue-50/25 border-blue-200 shadow-2xs ring-1 ring-blue-100'
                              : 'bg-white border-slate-200 shadow-2xs'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-base">📍 {ticket.location}</span>
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                                #{ticket.id}
                              </span>
                              {isMine && (
                                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 font-bold flex items-center gap-1 shadow-2xs">
                                  <User className="w-3 h-3 text-blue-600" />
                                  我提交的
                                </span>
                              )}
                            </div>
                            {getStatusBadge(ticket.status)}
                          </div>

                          <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                            {ticket.teacher_name && (
                              <span className="text-blue-700 font-medium">
                                报修教师：<strong>{ticket.teacher_name}</strong>
                                {ticket.phone && isMine && <span className="ml-1 text-slate-500 font-normal">({ticket.phone})</span>}
                              </span>
                            )}
                            <span>分类：<strong>{ticket.issue_type}</strong></span>
                            <span>报修时间：{formatDate(ticket.created_at)}</span>
                            {ticket.resolved_at && (
                              <span className="text-emerald-600 font-medium">
                                解决时间：{formatDate(ticket.resolved_at)}
                              </span>
                            )}
                          </div>

                          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs sm:text-sm text-slate-700 space-y-2">
                            <div>
                              <span className="font-semibold text-slate-900">故障说明：</span>
                              <span className="leading-relaxed">{ticket.description}</span>
                            </div>
                            {ticket.image_url && (
                              <div className="pt-2 border-t border-slate-200/60">
                                <span className="text-xs text-slate-500 block mb-1">现场报修照片：</span>
                                <a
                                  href={ticket.image_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block"
                                >
                                  <img
                                    src={ticket.image_url}
                                    alt="现场故障照"
                                    className="w-32 h-24 object-cover rounded-lg border border-slate-200 hover:opacity-90 transition-opacity shadow-2xs"
                                  />
                                </a>
                              </div>
                            )}
                          </div>

                          {/* 多轮处理进展与沟通记录时间轴 */}
                          <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200/80 space-y-2.5">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-800 border-b border-slate-200/60 pb-1.5">
                              <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-blue-600" />
                                运维多轮处理与沟通答复记录
                              </span>
                              <span className="text-[11px] font-normal text-slate-500">
                                共 {(ticket.interactions?.length || 0) + (ticket.admin_reply ? 1 : 0)} 条记录
                              </span>
                            </div>

                            {/* 渲染多轮互动 */}
                            {ticket.interactions && ticket.interactions.length > 0 ? (
                              <div className="space-y-2.5">
                                {ticket.interactions.map((interaction, idx) => (
                                  <div
                                    key={interaction.id || idx}
                                    className={`p-3 rounded-lg border text-xs sm:text-sm space-y-1.5 ${
                                      interaction.sender_type === 'user'
                                        ? 'bg-violet-50/70 border-violet-200 text-violet-950'
                                        : 'bg-blue-50/70 border-blue-200 text-blue-950'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold flex items-center gap-1.5 text-xs">
                                        {interaction.sender_type === 'user' ? (
                                          <>
                                            <MessageCircle className="w-3.5 h-3.5 text-violet-600" />
                                            <span className="text-violet-800">
                                              {interaction.sender_name || '教师'} 提出追问
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                                            <span className="text-blue-800">
                                              {interaction.sender_name || '运维人员'} 处理反馈
                                            </span>
                                            {interaction.status_at_time && (
                                              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100/80 text-blue-700 font-semibold">
                                                {interaction.status_at_time}
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </span>
                                      <span className="text-[11px] text-slate-400">
                                        {formatDate(interaction.created_at)}
                                      </span>
                                    </div>

                                    <p className="whitespace-pre-wrap leading-relaxed text-slate-700 text-xs sm:text-sm">
                                      {interaction.content}
                                    </p>

                                    {/* 运维上传的检修/更换部件照片 */}
                                    {interaction.image_url && (
                                      <div className="pt-1.5 border-t border-blue-100">
                                        <span className="text-[11px] text-blue-700 font-medium block mb-1">
                                          📷 运维现场处置 / 更换部件存证照片：
                                        </span>
                                        <a
                                          href={interaction.image_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-block"
                                        >
                                          <img
                                            src={interaction.image_url}
                                            alt="运维处置照片"
                                            className="max-h-36 rounded border border-blue-200 object-cover shadow-2xs hover:opacity-90"
                                          />
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : ticket.admin_reply ? (
                              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg text-xs sm:text-sm text-blue-900 space-y-1">
                                <div className="font-semibold text-blue-800 text-xs flex items-center gap-1">
                                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                                  运维维修教师回复与处理反馈：
                                </div>
                                <p className="leading-relaxed">{ticket.admin_reply}</p>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 flex items-center gap-1.5 bg-white p-2.5 rounded-lg border border-slate-100">
                                <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span>运维教师已接收此工单，正在排查处置中，处理结果与备件进展将在此实时同步...</span>
                              </div>
                            )}
                          </div>

                          {/* 追问与补充情况区域 */}
                          <div className="pt-1">
                            {!isFollowUpOpen ? (
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => setActiveFollowUpInputId(ticket.id)}
                                  className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  针对此工单继续追问 / 补充说明
                                </button>
                              </div>
                            ) : (
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
                                    向运维老师继续追问或补充现场情况：
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveFollowUpInputId(null)}
                                    className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                                  >
                                    收起
                                  </button>
                                </div>

                                <textarea
                                  rows={2}
                                  value={followUpVal}
                                  onChange={(e) =>
                                    setFollowUpTexts((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                                  }
                                  placeholder="例如：请问上午第3节课前能修好吗？或者补充说明现场新情况..."
                                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />

                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-slate-500">
                                    提交后后台运维教师将第一时间收到并答复
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setActiveFollowUpInputId(null)}
                                      className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                                    >
                                      取消
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSendFollowUp(ticket.id)}
                                      disabled={isSubmittingThisFollowUp || !followUpVal.trim()}
                                      className="px-3.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                                    >
                                      {isSubmittingThisFollowUp ? (
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Send className="w-3 h-3" />
                                      )}
                                      提交追问
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
