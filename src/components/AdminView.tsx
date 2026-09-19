import React, { useState, useEffect, useRef } from 'react';
import { Ticket, Stats, LocationConfig, IssueTypeItem } from '../types';
import {
  CheckCircle2,
  Clock,
  Wrench,
  RefreshCw,
  Search,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Save,
  MessageSquare,
  Lock,
  Bot,
  Sparkles,
  Sliders,
  LogOut,
  Send,
  AlertTriangle,
  Plus,
  Trash2,
  RotateCcw,
  Building2,
  MapPin,
  Tag,
  Settings2,
  Camera,
  Image as ImageIcon,
  MessageCircle,
  X,
  User,
  ShieldCheck,
} from 'lucide-react';

interface AdminViewProps {
  onBackToHome?: () => void;
  currentSystemTitle?: string;
  currentSystemSubtitle?: string;
  onSystemConfigUpdated?: (newTitle: string, newSubtitle: string) => void;
}

const TagListEditor: React.FC<{
  title: string;
  items: string[];
  onChange: (newItems: string[]) => void;
  placeholder?: string;
  helperText?: string;
}> = ({ title, items, onChange, placeholder = '添加项...', helperText }) => {
  const [newVal, setNewVal] = useState('');

  const handleAdd = () => {
    if (!newVal.trim()) return;
    const parts = newVal
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const combined = Array.from(new Set([...items, ...parts]));
    onChange(combined);
    setNewVal('');
  };

  const handleRemove = (index: number) => {
    if (items.length <= 1) {
      alert('每项至少保留一个选项');
      return;
    }
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-800">{title}</label>
        <span className="text-[11px] text-slate-400 font-normal">当前 {items.length} 个选项</span>
      </div>
      {helperText && <p className="text-[11px] text-slate-500">{helperText}</p>}

      <div className="flex flex-wrap gap-1.5 min-h-[32px] p-1 bg-white border border-slate-200 rounded-lg">
        {items.map((item, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-md text-xs font-medium group"
          >
            <span>{item}</span>
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="text-blue-400 hover:text-rose-600 hover:bg-rose-50 rounded-full w-3.5 h-3.5 flex items-center justify-center cursor-pointer transition-colors text-[13px] leading-none"
              title="删除此选项"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <input
          type="text"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
          className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-lg cursor-pointer flex items-center gap-1 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          添加
        </button>
      </div>
    </div>
  );
};

export const AdminView: React.FC<AdminViewProps> = ({
  onBackToHome,
  currentSystemTitle,
  currentSystemSubtitle,
  onSystemConfigUpdated,
}) => {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!sessionStorage.getItem('bbt_admin_auth');
  });
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Tab in Admin: 'tickets' | 'system_config' | 'ai_config'
  const [adminTab, setAdminTab] = useState<'tickets' | 'system_config' | 'ai_config'>('tickets');

  // System title & subtitle state
  const [systemTitle, setSystemTitle] = useState(currentSystemTitle || '耿中班班通报修管理系统');
  const [systemSubtitle, setSystemSubtitle] = useState(
    currentSystemSubtitle || '耿棚中学 · 多媒体教室设备日常报修与排查'
  );

  // System Configuration state (Locations & Issue Types)
  const [locationsConfig, setLocationsConfig] = useState<LocationConfig>({
    dongBuildings: ['一号楼', '二号楼', '三号楼', '四号楼', '五号楼', '六号楼'],
    dongFloors: ['1楼', '2楼', '3楼', '4楼'],
    dongRooms: ['东1', '东2', '东3', '东4', '东5', '东6'],
    xiFloors: ['1楼', '2楼', '3楼'],
    xiRooms: ['东1', '东2', '东3', '东4'],
  });

  const [issueTypes, setIssueTypes] = useState<IssueTypeItem[]>([
    { name: '硬件故障', desc: '投影灯泡、幕布升降、触摸失灵、电源开不了机' },
    { name: '软件系统', desc: '教学软件闪退、系统蓝屏、音视频解码异常' },
    { name: '网络问题', desc: '教室网线断连、无网络信号、无法打开网页' },
    { name: '其他', desc: '话筒啸叫、功放无声、遥控器失灵等' },
  ]);

  const [savingSystemConfig, setSavingSystemConfig] = useState(false);
  const [systemConfigSuccess, setSystemConfigSuccess] = useState('');
  const [systemConfigError, setSystemConfigError] = useState('');

  // New Issue Type input
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDesc, setNewTypeDesc] = useState('');

  // Tickets state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, processing: 0, resolved: 0 });
  const [loading, setLoading] = useState(false);

  // Ticket Filters
  const [statusFilter, setStatusFilter] = useState('全部');
  const [typeFilter, setTypeFilter] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Form states per ticket
  const [editingStatus, setEditingStatus] = useState<{ [id: number]: string }>({});
  const [editingReply, setEditingReply] = useState<{ [id: number]: string }>({});
  const [adminReplyImageFiles, setAdminReplyImageFiles] = useState<{ [id: number]: File | null }>({});
  const [adminReplyImagePreviews, setAdminReplyImagePreviews] = useState<{ [id: number]: string | null }>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleAdminImageChange = (ticketId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAdminReplyImageFiles((prev) => ({ ...prev, [ticketId]: file }));
      const reader = new FileReader();
      reader.onload = () => {
        setAdminReplyImagePreviews((prev) => ({ ...prev, [ticketId]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearAdminImage = (ticketId: number) => {
    setAdminReplyImageFiles((prev) => ({ ...prev, [ticketId]: null }));
    setAdminReplyImagePreviews((prev) => ({ ...prev, [ticketId]: null }));
  };

  // In-app modal state for ticket deletion (bypasses iframe window.confirm block)
  const [ticketToDelete, setTicketToDelete] = useState<{
    id: number;
    location: string;
    teacher?: string | null;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Trigger delete modal
  const handleDeleteTicket = (ticketId: number, locationName: string, teacher?: string | null, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setDeleteError(null);
    setTicketToDelete({
      id: ticketId,
      location: locationName,
      teacher,
    });
  };

  // Confirm and execute delete via API
  const handleConfirmDelete = async () => {
    if (!ticketToDelete) return;
    const ticketId = ticketToDelete.id;

    setDeletingId(ticketId);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除工单失败');

      setSaveToast(`✅ 工单 #${ticketId} 已成功彻底删除！`);
      setTimeout(() => setSaveToast(null), 3500);

      // Instant UI update
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));
      if (expandedId === ticketId) {
        setExpandedId(null);
      }
      setTicketToDelete(null);

      // Refresh stats
      fetchTicketsAndStats();
    } catch (err: any) {
      console.error('Delete ticket error:', err);
      setDeleteError(err.message || '网络连接异常或删除失败，请重试');
    } finally {
      setDeletingId(null);
    }
  };
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // AI Configuration state
  const [baseUrl, setBaseUrl] = useState('https://apihub.agnes-ai.com/v1');
  const [apiKey, setApiKey] = useState('sk-vWM7RHG5n7bljBNi3GgHfygxqiKlUYrPWZLLSUByIGm4BiM9');
  const [textModel, setTextModel] = useState('Agnes-2.5-flash');
  const [imageModel, setImageModel] = useState('Agnes-Image-2.1-flash');
  const [savingAiConfig, setSavingAiConfig] = useState(false);
  const [aiConfigSuccess, setAiConfigSuccess] = useState('');

  // AI Test Dialog state
  const [testPrompt, setTestPrompt] = useState('请用一句话测试连通性，并说明你的角色定位。');
  const [testResult, setTestResult] = useState('');
  const [testingAi, setTestingAi] = useState(false);
  const [testError, setTestError] = useState('');

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '账号或密码不正确');
      }
      sessionStorage.setItem('bbt_admin_auth', 'true');
      setIsAuthenticated(true);
      fetchTicketsAndStats();
      fetchAiConfig();
    } catch (err: any) {
      setLoginError(err.message || '登录失败');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('bbt_admin_auth');
    setIsAuthenticated(false);
    if (onBackToHome) onBackToHome();
  };

  // Load Tickets
  const fetchTicketsAndStats = async () => {
    setLoading(true);
    try {
      const [ticketsRes, statsRes] = await Promise.all([
        fetch('/api/tickets'),
        fetch('/api/tickets/stats'),
      ]);
      const ticketsData = await ticketsRes.json();
      const statsData = await statsRes.json();

      if (Array.isArray(ticketsData)) {
        setTickets(ticketsData);
        const statusMap: { [id: number]: string } = {};
        const replyMap: { [id: number]: string } = {};
        ticketsData.forEach((t: Ticket) => {
          statusMap[t.id] = t.status;
          replyMap[t.id] = t.admin_reply || '';
        });
        setEditingStatus(statusMap);
        setEditingReply(replyMap);

        if (expandedId === null && ticketsData.length > 0) {
          const pending = ticketsData.find((t: Ticket) => t.status === '待处理');
          setExpandedId(pending ? pending.id : ticketsData[0].id);
        }
      }
      if (statsData && typeof statsData.total === 'number') {
        setStats(statsData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Load AI Config
  const fetchAiConfig = async () => {
    try {
      const res = await fetch('/api/admin/ai-config');
      const data = await res.json();
      if (data) {
        if (data.base_url) setBaseUrl(data.base_url);
        if (data.api_key) setApiKey(data.api_key);
        if (data.text_model) setTextModel(data.text_model);
        if (data.image_model) setImageModel(data.image_model);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Load System Config (Locations, Issue Types, and Title)
  const fetchSystemConfig = async () => {
    try {
      const res = await fetch('/api/system-config');
      const data = await res.json();
      if (data) {
        if (data.system_title) setSystemTitle(data.system_title);
        if (data.system_subtitle) setSystemSubtitle(data.system_subtitle);
        if (data.locations) setLocationsConfig(data.locations);
        if (data.issue_types) setIssueTypes(data.issue_types);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchTicketsAndStats();
      fetchAiConfig();
      fetchSystemConfig();
    }
  }, [isAuthenticated]);

  // Save System Config
  const handleSaveSystemConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingSystemConfig(true);
    setSystemConfigSuccess('');
    setSystemConfigError('');
    try {
      const res = await fetch('/api/admin/system-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_title: systemTitle.trim(),
          system_subtitle: systemSubtitle.trim(),
          locations: locationsConfig,
          issue_types: issueTypes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存配置失败');
      setSystemConfigSuccess('✅ 系统显示名称、设备位置与故障分类配置已成功保存！');
      if (onSystemConfigUpdated) {
        onSystemConfigUpdated(systemTitle.trim(), systemSubtitle.trim());
      }
      setTimeout(() => setSystemConfigSuccess(''), 4000);
    } catch (err: any) {
      setSystemConfigError(err.message || '保存失败');
    } finally {
      setSavingSystemConfig(false);
    }
  };

  // Reset System Config Confirmation State
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

  // Reset System Config to Default
  const handleResetSystemConfig = () => {
    setShowResetConfirmModal(true);
  };

  const executeResetSystemConfig = async () => {
    setShowResetConfirmModal(false);
    setSavingSystemConfig(true);
    setSystemConfigSuccess('');
    setSystemConfigError('');
    try {
      const res = await fetch('/api/admin/system-config/reset', { method: 'POST' });
      const data = await res.json();
      if (data.system_title) setSystemTitle(data.system_title);
      if (data.system_subtitle) setSystemSubtitle(data.system_subtitle);
      if (data.locations) setLocationsConfig(data.locations);
      if (data.issue_types) setIssueTypes(data.issue_types);
      if (onSystemConfigUpdated && data.system_title) {
        onSystemConfigUpdated(data.system_title, data.system_subtitle || '');
      }
      setSystemConfigSuccess('✅ 已恢复为系统默认配置（耿中班班通报修管理系统，东区各楼为4层）！');
      setTimeout(() => setSystemConfigSuccess(''), 4000);
    } catch (err: any) {
      setSystemConfigError(err.message || '恢复默认失败');
    } finally {
      setSavingSystemConfig(false);
    }
  };

  // Save AI Config
  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAiConfig(true);
    setAiConfigSuccess('');
    try {
      const res = await fetch('/api/admin/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_url: baseUrl,
          api_key: apiKey,
          text_model: textModel,
          image_model: imageModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存配置失败');
      setAiConfigSuccess('大模型参数已成功保存并立即生效！');
      setTimeout(() => setAiConfigSuccess(''), 3500);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingAiConfig(false);
    }
  };

  // Test AI Model
  const handleTestAi = async () => {
    setTestingAi(true);
    setTestError('');
    setTestResult('');
    try {
      const res = await fetch('/api/admin/ai-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_url: baseUrl,
          api_key: apiKey,
          text_model: textModel,
          test_prompt: testPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '模型调用失败');
      setTestResult(data.reply || '（调用成功，无文本返回）');
    } catch (err: any) {
      setTestError(err.message || '测试失败');
    } finally {
      setTestingAi(false);
    }
  };

  // Save Single Ticket with multi-round progress and optional photo
  const handleSaveTicket = async (ticketId: number) => {
    setSavingId(ticketId);
    try {
      const currentStatus = editingStatus[ticketId] || '待处理';
      const currentReply = editingReply[ticketId] || '';
      const imageFile = adminReplyImageFiles[ticketId];

      const formData = new FormData();
      formData.append('status', currentStatus);
      formData.append('content', currentReply);
      formData.append('admin_name', '运维管理人员');
      if (imageFile) {
        formData.append('image', imageFile);
      }

      const res = await fetch(`/api/tickets/${ticketId}/admin-reply`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');

      setSaveToast(`✅ 工单 #${ticketId} 处置记录已更新并同步！`);
      setTimeout(() => setSaveToast(null), 3000);

      // Clear the local photo upload preview and input for this ticket
      handleClearAdminImage(ticketId);

      await fetchTicketsAndStats();
    } catch (err: any) {
      alert(err.message || '更新失败');
    } finally {
      setSavingId(null);
    }
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

  // Login view if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="w-full max-w-md mx-auto py-12 px-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">班班通运维管理后台</h2>
            <p className="text-xs text-slate-500">仅供信息技术中心及多媒体设备管理人员登录</p>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">管理账号</label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="请输入管理员账号"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">管理密码</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="请输入管理密码"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
            >
              {loggingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              登录管理后台
            </button>
          </form>

          {onBackToHome && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={onBackToHome}
                className="text-xs text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
              >
                ← 返回教师报修前台
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    if (statusFilter !== '全部' && t.status !== statusFilter) return false;
    if (typeFilter !== '全部' && t.issue_type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const loc = (t.location || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const teacher = (t.teacher_name || '').toLowerCase();
      return loc.includes(q) || desc.includes(q) || teacher.includes(q);
    }
    return true;
  });

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {saveToast && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4" />
          {saveToast}
        </div>
      )}

      {/* 顶部管理员导航与操作条 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              🛠️ 班班通运维管理后台
            </h2>
            <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold border border-blue-100">
              已登录 (/admin)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            工单维修跟踪 · 现场照片研判 · 大模型参数配置与测试
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* 功能标签切换 */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setAdminTab('tickets')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                adminTab === 'tickets' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              工单记录处理 ({tickets.length})
            </button>
            <button
              onClick={() => setAdminTab('system_config')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                adminTab === 'system_config' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5 text-blue-600" />
              位置与分类配置
            </button>
            <button
              onClick={() => setAdminTab('ai_config')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                adminTab === 'ai_config' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
              大模型参数配置
            </button>
          </div>

          <button
            onClick={handleLogout}
            title="退出登录"
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 模块一：工单记录管理 */}
      {adminTab === 'tickets' && (
        <div className="space-y-6">
          {/* 统计指标卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs font-medium text-slate-500">累计工单</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
            </div>

            <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-800">待处理</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold text-amber-900 mt-1">{stats.pending}</div>
            </div>

            <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-800">处理中</span>
                <Wrench className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-900 mt-1">{stats.processing}</div>
            </div>

            <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-800">已解决</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-900 mt-1">{stats.resolved}</div>
            </div>
          </div>

          {/* 筛选与搜索 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索设备位置或故障描述关键词..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="全部">全部状态</option>
                <option value="待处理">待处理</option>
                <option value="处理中">处理中</option>
                <option value="已解决">已解决</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="全部">全部类型</option>
                <option value="硬件故障">硬件故障</option>
                <option value="软件系统">软件系统</option>
                <option value="网络问题">网络问题</option>
                <option value="其他">其他</option>
              </select>

              <button
                onClick={fetchTicketsAndStats}
                disabled={loading}
                className="px-3 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>
          </div>

          {/* 工单卡片列表 */}
          <div className="space-y-3">
            {filteredTickets.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-800">暂无工单记录</p>
              </div>
            ) : (
              filteredTickets.map((t) => {
                const isExpanded = expandedId === t.id;
                const currentStatus = editingStatus[t.id] || t.status;
                const currentReply = editingReply[t.id] !== undefined ? editingReply[t.id] : t.admin_reply || '';

                return (
                  <div
                    key={t.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden transition-all"
                  >
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : t.id)}
                      className="p-4 cursor-pointer hover:bg-slate-50 flex items-center justify-between select-none"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                          #{t.id}
                        </span>
                        <div className="truncate">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-sm">📍 {t.location}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {t.issue_type}
                            </span>
                            {t.teacher_name && (
                              <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-semibold">
                                👤 报修教师: {t.teacher_name}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 truncate mt-0.5 max-w-md">
                            {t.description || '无故障描述'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {t.interactions && t.interactions.some((i) => i.sender_type === 'user') && (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-violet-100 text-violet-800 border border-violet-200 flex items-center gap-1 shadow-2xs">
                            <MessageCircle className="w-3 h-3 text-violet-600 animate-pulse" />
                            教师有追问 ({t.interactions.filter((i) => i.sender_type === 'user').length})
                          </span>
                        )}
                        {t.status === '待处理' && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            待处理
                          </span>
                        )}
                        {t.status === '处理中' && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                            处理中
                          </span>
                        )}
                        {t.status === '已解决' && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                            已解决
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTicket(t.id, t.location, t.teacher_name, e)}
                          disabled={deletingId === t.id}
                          title="删除此工单（清理无意义/测试记录）"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          {deletingId === t.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-500" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <div className="text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-5 border-t border-slate-100 bg-slate-50/50 space-y-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                          {/* 左侧：详细信息与多轮沟通历史时间轴 */}
                          <div className="space-y-3">
                            <div className="bg-white p-3.5 rounded-lg border border-slate-200 text-xs space-y-2 shadow-2xs">
                              <div className="flex justify-between items-center bg-blue-50/60 p-2 rounded-md border border-blue-100">
                                <span className="text-blue-900 font-semibold flex items-center gap-1">
                                  👤 报修提交教师：
                                </span>
                                <span className="font-bold text-blue-700 text-sm">
                                  {t.teacher_name || '未填写姓名'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">报修时间：</span>
                                <span className="font-medium text-slate-800">{formatDate(t.created_at)}</span>
                              </div>
                              {t.resolved_at && (
                                <div className="flex justify-between text-emerald-700">
                                  <span>解决完成时间：</span>
                                  <span className="font-medium">{formatDate(t.resolved_at)}</span>
                                </div>
                              )}
                              <div className="pt-2 border-t border-slate-100">
                                <span className="font-semibold text-slate-800 block mb-1">初始故障描述：</span>
                                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                                  {t.description}
                                </p>
                              </div>
                              {t.image_url && (
                                <div className="pt-2 border-t border-slate-100">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-semibold text-slate-700">现场初始报修照片</span>
                                    <a
                                      href={t.image_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                    >
                                      查看大图 <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                  <img
                                    src={t.image_url}
                                    alt="现场初始照片"
                                    className="w-full max-h-48 object-contain rounded-md border border-slate-200 bg-slate-50"
                                  />
                                </div>
                              )}
                            </div>

                            {/* 多轮处理与追问记录时间轴 */}
                            <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                                  多轮处理进展与沟通记录
                                </div>
                                <span className="text-[11px] text-slate-400">
                                  共 {(t.interactions?.length || 0) + 1} 个节点
                                </span>
                              </div>

                              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                                {/* 节点 1：初始提交 */}
                                <div className="flex gap-2 text-xs">
                                  <div className="w-5 flex flex-col items-center">
                                    <div className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                                      1
                                    </div>
                                    <div className="w-0.5 flex-1 bg-slate-200 my-1"></div>
                                  </div>
                                  <div className="flex-1 bg-slate-50 rounded-lg p-2.5 border border-slate-200/80">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                                        <User className="w-3 h-3 text-slate-500" />
                                        {t.teacher_name || '教师'} 提交报修
                                      </span>
                                      <span className="text-[11px] text-slate-400">{formatDate(t.created_at)}</span>
                                    </div>
                                    <p className="text-slate-600 line-clamp-2">{t.description}</p>
                                  </div>
                                </div>

                                {/* 后续多轮记录 */}
                                {t.interactions && t.interactions.length > 0 ? (
                                  t.interactions.map((interaction, idx) => (
                                    <div key={interaction.id || idx} className="flex gap-2 text-xs">
                                      <div className="w-5 flex flex-col items-center">
                                        <div
                                          className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                            interaction.sender_type === 'user'
                                              ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-200'
                                              : 'bg-blue-100 text-blue-700 ring-2 ring-blue-200'
                                          }`}
                                        >
                                          {idx + 2}
                                        </div>
                                        {idx !== (t.interactions?.length ?? 0) - 1 && (
                                          <div className="w-0.5 flex-1 bg-slate-200 my-1"></div>
                                        )}
                                      </div>
                                      <div
                                        className={`flex-1 rounded-lg p-2.5 border ${
                                          interaction.sender_type === 'user'
                                            ? 'bg-violet-50/60 border-violet-200 text-violet-950'
                                            : 'bg-blue-50/50 border-blue-200 text-blue-950'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="font-bold flex items-center gap-1">
                                            {interaction.sender_type === 'user' ? (
                                              <>
                                                <MessageCircle className="w-3 h-3 text-violet-600" />
                                                <span className="text-violet-800">
                                                  {interaction.sender_name || '报修教师'} 提出追问
                                                </span>
                                              </>
                                            ) : (
                                              <>
                                                <ShieldCheck className="w-3 h-3 text-blue-600" />
                                                <span className="text-blue-800">
                                                  {interaction.sender_name || '运维人员'} 处理反馈
                                                </span>
                                              </>
                                            )}
                                          </span>
                                          <span className="text-[11px] text-slate-400">
                                            {formatDate(interaction.created_at)}
                                          </span>
                                        </div>
                                        <p className="whitespace-pre-wrap leading-relaxed text-slate-700">
                                          {interaction.content}
                                        </p>
                                        {interaction.image_url && (
                                          <div className="mt-2 pt-2 border-t border-blue-100">
                                            <span className="text-[11px] text-blue-700 font-medium block mb-1">
                                              📷 运维现场检修/处置照片：
                                            </span>
                                            <a
                                              href={interaction.image_url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-block"
                                            >
                                              <img
                                                src={interaction.image_url}
                                                alt="检修照片"
                                                className="max-h-36 rounded border border-blue-200 object-cover shadow-2xs hover:opacity-90"
                                              />
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-center py-3 text-slate-400 text-xs">
                                    暂无后续多轮处理或追问记录
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 右侧：维修反馈与拍照上传 */}
                          <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-4 shadow-2xs">
                            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                              <MessageSquare className="w-4 h-4 text-blue-600" />
                              运维维修处置、答复与拍照上传
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">更新工单状态：</label>
                              <select
                                value={currentStatus}
                                onChange={(e) =>
                                  setEditingStatus((prev) => ({ ...prev, [t.id]: e.target.value }))
                                }
                                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                              >
                                <option value="待处理">⏳ 待处理</option>
                                <option value="处理中">⚙️ 处理中 (正在备件/检修)</option>
                                <option value="已解决">✅ 已解决 (维修完成)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                本次处理反馈 / 答复教师追问 (教师端可见)：
                              </label>
                              <textarea
                                rows={4}
                                value={currentReply}
                                onChange={(e) =>
                                  setEditingReply((prev) => ({ ...prev, [t.id]: e.target.value }))
                                }
                                placeholder="例如：已安排下午第3节课前更换投影仪灯泡；已上门排查，正在等待配件到货..."
                                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                              />
                            </div>

                            {/* 允许拍照和上传图片 */}
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                                  <Camera className="w-3.5 h-3.5 text-blue-600" />
                                  现场检修照片 / 更换部件存证 (可选)：
                                </span>
                                {adminReplyImagePreviews[t.id] && (
                                  <button
                                    type="button"
                                    onClick={() => handleClearAdminImage(t.id)}
                                    className="text-[11px] text-rose-600 hover:text-rose-800 flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <X className="w-3 h-3" /> 清除照片
                                  </button>
                                )}
                              </div>

                              {adminReplyImagePreviews[t.id] ? (
                                <div className="relative rounded-lg overflow-hidden border border-slate-300 max-w-xs">
                                  <img
                                    src={adminReplyImagePreviews[t.id]!}
                                    alt="待上传照片预览"
                                    className="w-full h-32 object-cover"
                                  />
                                  <div className="absolute bottom-0 inset-x-0 bg-slate-900/60 text-white text-[10px] px-2 py-0.5 text-center">
                                    就绪，保存时将上传同步
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <label className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-white border border-slate-300 hover:border-blue-400 hover:bg-blue-50/30 text-slate-700 text-xs font-medium rounded-lg cursor-pointer transition-colors shadow-2xs">
                                    <Camera className="w-3.5 h-3.5 text-blue-600" />
                                    <span>现场拍照</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      capture="environment"
                                      className="hidden"
                                      onChange={(e) => handleAdminImageChange(t.id, e)}
                                    />
                                  </label>
                                  <label className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-white border border-slate-300 hover:border-blue-400 hover:bg-blue-50/30 text-slate-700 text-xs font-medium rounded-lg cursor-pointer transition-colors shadow-2xs">
                                    <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>相册选取</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => handleAdminImageChange(t.id, e)}
                                    />
                                  </label>
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => handleSaveTicket(t.id)}
                              disabled={savingId === t.id}
                              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                            >
                              {savingId === t.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Save className="w-3.5 h-3.5" />
                              )}
                              保存处理结果并同步给教师端
                            </button>

                            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-[11px] text-slate-400">
                                误报、测试或重复提交的工单？
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteTicket(t.id, t.location, t.teacher_name, e)}
                                disabled={deletingId === t.id}
                                className="px-3 py-1.5 text-xs text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 font-medium"
                              >
                                {deletingId === t.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                                彻底删除此工单
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 模块二：设备位置与故障分类动态配置 */}
      {adminTab === 'system_config' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-6">
            {/* 顶栏标题与操作 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">设备位置与故障分类动态配置</h3>
                  <p className="text-xs text-slate-500">
                    动态调整东区/西区楼层与教室门牌、增删故障类型，保存后前台立即生效
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleResetSystemConfig}
                  disabled={savingSystemConfig}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                  title="重置为默认配置（东区各楼为4层）"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  恢复默认
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveSystemConfig()}
                  disabled={savingSystemConfig}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  {savingSystemConfig ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  保存系统名称与分类配置
                </button>
              </div>
            </div>

            {/* 提示条 */}
            {systemConfigSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                {systemConfigSuccess}
              </div>
            )}
            {systemConfigError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                {systemConfigError}
              </div>
            )}

            {/* 配置区域 0：系统显示名称与副标题配置 */}
            <div className="space-y-4 p-4.5 bg-gradient-to-br from-blue-50/70 to-indigo-50/40 border border-blue-200/80 rounded-2xl">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-slate-900">系统标题与副标题设置</h4>
                  <p className="text-xs text-slate-500">
                    支持自定义教师前台和管理端显示的系统名称，修改保存后全站即时生效
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    系统显示主标题 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={systemTitle}
                    onChange={(e) => setSystemTitle(e.target.value)}
                    placeholder="如: 耿中班班通报修管理系统"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <p className="text-[11px] text-slate-500">
                    页面顶部左侧和顶栏展示的系统主名称（默认为：耿中班班通报修管理系统）
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    系统副标题 / 补充说明
                  </label>
                  <input
                    type="text"
                    value={systemSubtitle}
                    onChange={(e) => setSystemSubtitle(e.target.value)}
                    placeholder="如: 耿棚中学 · 多媒体教室设备日常报修与排查"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <p className="text-[11px] text-slate-500">
                    主标题下方的辅助说明文字或学校名称
                  </p>
                </div>
              </div>

              {/* 即时预览卡片 */}
              <div className="p-3 bg-white/90 border border-blue-100 rounded-xl flex items-center gap-3">
                <span className="text-[11px] font-semibold text-blue-800 bg-blue-100 px-2 py-1 rounded shrink-0">
                  前台预览
                </span>
                <div className="truncate">
                  <span className="text-sm font-black text-slate-900 mr-2">
                    {systemTitle || '耿中班班通报修管理系统'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {systemSubtitle || '耿棚中学 · 多媒体教室设备日常报修与排查'}
                  </span>
                </div>
              </div>
            </div>

            {/* 配置区域 1：东区级联设置 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900">东区设备位置选项配置</h4>
                <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                  东区所有楼宇默认为 1~4 层
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <TagListEditor
                  title="东区楼号"
                  items={locationsConfig.dongBuildings}
                  onChange={(dongBuildings) => setLocationsConfig({ ...locationsConfig, dongBuildings })}
                  placeholder="如: 七号楼..."
                  helperText="选择东区后可选的教学楼宇"
                />
                <TagListEditor
                  title="东区楼层 (1楼~4楼)"
                  items={locationsConfig.dongFloors}
                  onChange={(dongFloors) => setLocationsConfig({ ...locationsConfig, dongFloors })}
                  placeholder="如: 5楼..."
                  helperText="东区各教学楼层数（已按要求设定为4层）"
                />
                <TagListEditor
                  title="东区教室/方位"
                  items={locationsConfig.dongRooms}
                  onChange={(dongRooms) => setLocationsConfig({ ...locationsConfig, dongRooms })}
                  placeholder="如: 东7..."
                  helperText="每层楼对应的教室从东面起编号"
                />
              </div>
            </div>

            {/* 配置区域 2：西区级联设置 */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <h4 className="text-sm font-bold text-slate-900">西区设备位置选项配置</h4>
                <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-medium">
                  西区默认 1~3 层，每层东1~东4
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <TagListEditor
                  title="西区楼层"
                  items={locationsConfig.xiFloors}
                  onChange={(xiFloors) => setLocationsConfig({ ...locationsConfig, xiFloors })}
                  placeholder="如: 4楼..."
                  helperText="西区楼层列表"
                />
                <TagListEditor
                  title="西区教室/方位"
                  items={locationsConfig.xiRooms}
                  onChange={(xiRooms) => setLocationsConfig({ ...locationsConfig, xiRooms })}
                  placeholder="如: 东5..."
                  helperText="西区每层楼对应的教室从东面起编号"
                />
              </div>
            </div>

            {/* 配置区域 3：故障分类配置 */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-purple-600" />
                  <h4 className="text-sm font-bold text-slate-900">故障分类与说明配置</h4>
                </div>
                <span className="text-xs text-slate-400">
                  当前共 {issueTypes.length} 个分类
                </span>
              </div>
              <p className="text-xs text-slate-500">
                定义教师在报修表单中可选的故障大类及简短故障举例
              </p>

              <div className="space-y-2.5">
                {issueTypes.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
                  >
                    <div className="sm:w-44 shrink-0">
                      <label className="block text-[10px] text-slate-400 mb-0.5 font-medium">分类名称</label>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => {
                          const updated = [...issueTypes];
                          updated[idx].name = e.target.value;
                          setIssueTypes(updated);
                        }}
                        placeholder="分类名称"
                        className="w-full px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-slate-400 mb-0.5 font-medium">典型故障举例/提示说明</label>
                      <input
                        type="text"
                        value={item.desc || ''}
                        onChange={(e) => {
                          const updated = [...issueTypes];
                          updated[idx].desc = e.target.value;
                          setIssueTypes(updated);
                        }}
                        placeholder="说明或举例"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                    <div className="sm:self-end pt-1 sm:pt-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (issueTypes.length <= 1) {
                            alert('至少保留一种故障分类');
                            return;
                          }
                          setIssueTypes(issueTypes.filter((_, i) => i !== idx));
                        }}
                        className="w-full sm:w-auto p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 text-xs"
                        title="删除该分类"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="sm:hidden">删除分类</span>
                      </button>
                    </div>
                  </div>
                ))}

                {/* 添加新故障分类行 */}
                <div className="p-3.5 bg-blue-50/50 border border-dashed border-blue-200 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5 text-blue-600" />
                    添加新故障分类
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        value={newTypeName}
                        onChange={(e) => setNewTypeName(e.target.value)}
                        placeholder="新分类名称 (如: 触控交互)"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                    <div className="sm:col-span-6">
                      <input
                        type="text"
                        value={newTypeDesc}
                        onChange={(e) => setNewTypeDesc(e.target.value)}
                        placeholder="简要举例 (如: 触控偏移、电子白板无笔触反应)"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!newTypeName.trim()) {
                            alert('请输入新分类名称');
                            return;
                          }
                          setIssueTypes([
                            ...issueTypes,
                            { name: newTypeName.trim(), desc: newTypeDesc.trim() },
                          ]);
                          setNewTypeName('');
                          setNewTypeDesc('');
                        }}
                        className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        添加
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 底部保存按钮 */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                提示：编辑完成后请点击保存，修改将立即持久化存储并同步生效。
              </span>
              <button
                type="button"
                onClick={() => handleSaveSystemConfig()}
                disabled={savingSystemConfig}
                className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                {savingSystemConfig ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                保存系统名称与分类配置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模块三：大模型参数配置与连通性测试 */}
      {adminTab === 'ai_config' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Sliders className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">大模型连接参数配置</h3>
                <p className="text-xs text-slate-500">
                  配置前端“在线咨询 AI”及运维辅助系统所使用的大模型服务
                </p>
              </div>
            </div>

            {aiConfigSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                {aiConfigSuccess}
              </div>
            )}

            <form onSubmit={handleSaveAiConfig} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  API Base URL (接口基础地址)
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://apihub.agnes-ai.com/v1"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  API Key (访问密钥)
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  文本 Model 名称
                </label>
                <input
                  type="text"
                  value={textModel}
                  onChange={(e) => setTextModel(e.target.value)}
                  placeholder="Agnes-2.5-flash"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  图片 Model 名称 (备用)
                </label>
                <input
                  type="text"
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  placeholder="Agnes-Image-2.1-flash"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div className="md:col-span-2 pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingAiConfig}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  {savingAiConfig ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  保存大模型参数设置
                </button>
              </div>
            </form>
          </div>

          {/* 模型在线连通性测试卡片 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Bot className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">大模型在线连通性测试</h3>
                <p className="text-xs text-slate-500">
                  向当前配置的大模型发送测试消息，验证 API 鉴权与回复生成是否正常
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">测试 Prompt：</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <button
                    onClick={handleTestAi}
                    disabled={testingAi}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    {testingAi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    测试连接并对话
                  </button>
                </div>
              </div>

              {testError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
                  ❌ 测试连接失败: {testError}
                </div>
              )}

              {testResult && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 模型响应成功：
                  </span>
                  <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
                    {testResult}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 彻底删除工单确认弹窗 (全环境无阻断，避免 iframe 下 window.confirm 失灵) */}
      {ticketToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">确定彻底删除此工单？</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  此操作将从数据库中永久移除该工单记录，不可撤销。
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">工单编号：</span>
                <span className="font-mono font-bold text-slate-900 text-sm">#{ticketToDelete.id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">设备位置：</span>
                <span className="font-semibold text-slate-900">{ticketToDelete.location}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">报修教师：</span>
                <span className="font-semibold text-blue-700">{ticketToDelete.teacher || '未提供'}</span>
              </div>
              <div className="pt-2 border-t border-slate-200/60 text-[11px] text-amber-700">
                ⚠️ 提示：主要用于清理测试、误报或重复提交的无效工单。
              </div>
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTicketToDelete(null);
                  setDeleteError(null);
                }}
                disabled={deletingId !== null}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingId !== null}
                className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                {deletingId !== null ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    正在删除...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    确认彻底删除
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 恢复默认系统配置确认弹窗 */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0 text-amber-600">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">确认恢复系统默认配置？</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  将重置系统标题为「耿中班班通报修管理系统」，并将东区楼层恢复为 1-4 层。
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={executeResetSystemConfig}
                className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                确认恢复默认配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
