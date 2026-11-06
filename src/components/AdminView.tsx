import React, { useState, useEffect, useRef } from 'react';
import { Ticket, Stats, LocationConfig, LocationZone, IssueTypeItem, AppUser, UserRole } from '../types';

// 图片经同域 /api/img 代理加载（浏览器直连 res.cloudinary.com 在大陆网络不可靠）
const imgProxy = (u?: string | null) => (u ? `/api/img?u=${encodeURIComponent(u)}` : '');
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
  Phone,
  ShieldCheck,
  Network,
  Layers,
  Power,
  Eye,
  EyeOff,
  Link,
  CheckSquare,
  Square,
  Users,
  Unlink,
  UserCheck,
  UserX,
  Smartphone,
  Shield,
  Edit2,
  FileSpreadsheet,
  UserPlus,
  SendHorizonal,
  ArrowRightLeft,
} from 'lucide-react';
import { ExportTicketsModal } from './ExportTicketsModal';

interface AdminViewProps {
  onBackToHome?: () => void;
  currentSystemTitle?: string;
  currentSystemSubtitle?: string;
  onSystemConfigUpdated?: (newTitle: string, newSubtitle: string) => void;
  schoolCode?: string;
}

const TagListEditor: React.FC<{
  title: string;
  items: string[];
  onChange: (newItems: string[]) => void;
  placeholder?: string;
  helperText?: string;
  allowEmpty?: boolean;
}> = ({ title, items, onChange, placeholder = '添加项...', helperText, allowEmpty = false }) => {
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
    if (!allowEmpty && items.length <= 1) {
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

interface Tenant {
  id: number;
  name: string;
  subpath: string;
  upstream_host: string;
  upstream_port: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export const AdminView: React.FC<AdminViewProps> = ({
  onBackToHome,
  currentSystemTitle,
  currentSystemSubtitle,
  schoolCode,
  onSystemConfigUpdated,
}) => {
  // Authentication state (supports localStorage persistence for technicians)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!sessionStorage.getItem('bbt_admin_auth') || !!localStorage.getItem('bbt_auth_token');
  });
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const saved = sessionStorage.getItem('bbt_current_user') || localStorage.getItem('bbt_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const isTechnician = currentUser?.role === 'technician';
  const isOperator = currentUser?.role === 'operator';
  const isStaffRole = isTechnician || isOperator;

  // Smart Login (Pillar 2 of mymultenant: Identity-Blind Single Form)
  const [smartAccount, setSmartAccount] = useState(() => {
    return localStorage.getItem('bbt_teacher_phone') || '';
  });
  const [smartPassword, setSmartPassword] = useState('');
  const [deviceBoundUser, setDeviceBoundUser] = useState<AppUser | null>(null);
  const [checkingDevice, setCheckingDevice] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Dispatch & Review modal state (租户操作员 / 调度员审核派单)
  const [dispatchTicket, setDispatchTicket] = useState<Ticket | null>(null);
  const [schoolTechnicians, setSchoolTechnicians] = useState<Array<{ id: number; name: string; phone: string; role: string; active_tickets_count?: number }>>([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);
  const [selectedTechId, setSelectedTechId] = useState<number | ''>('');
  const [dispatchNoteInput, setDispatchNoteInput] = useState('');
  const [dispatchingAction, setDispatchingAction] = useState(false);
  const [technicianFilterMine, setTechnicianFilterMine] = useState<'mine' | 'all'>('mine');

  // Tab in Admin: 'tickets' | 'system_config' | 'ai_config' | 'tenants' | 'users'
  const [adminTab, setAdminTab] = useState<'tickets' | 'system_config' | 'ai_config' | 'tenants' | 'users'>('tickets');

  // Users & Role Management state (角色与会员管理 / 设备绑定与解绑)
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userBoundFilter, setUserBoundFilter] = useState<'all' | 'bound' | 'unbound'>('all');
  const [userSchoolFilter, setUserSchoolFilter] = useState<string>('all');
  const [unbindingUserId, setUnbindingUserId] = useState<number | null>(null);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('teacher');
  const [newUserSchoolId, setNewUserSchoolId] = useState<number>(1);
  const [userActionMsg, setUserActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // System title & subtitle state
  const [systemTitle, setSystemTitle] = useState(currentSystemTitle || '耿中班班通报修管理系统');
  const [systemSubtitle, setSystemSubtitle] = useState(
    currentSystemSubtitle || '耿棚中学 · 多媒体教室设备日常报修与排查'
  );

  // System Configuration state (Locations & Issue Types)
  const [locationsConfig, setLocationsConfig] = useState<LocationConfig>({
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
  });
  const [zoneHint, setZoneHint] = useState('');

  // ===== 区域级联规则：楼层清空 或 教室/方位清空 => 自动移除该区域 =====
  const updateZoneField = (key: string, patch: Partial<LocationZone>) =>
    setLocationsConfig((prev) => ({
      zones: prev.zones.map((z) => (z.key === key ? { ...z, ...patch } : z)),
    }));
  const removeZoneByKey = (key: string, reason: string) => {
    const z = locationsConfig.zones.find((x) => x.key === key);
    setLocationsConfig((prev) => ({ zones: prev.zones.filter((x) => x.key !== key) }));
    setZoneHint(z ? `「${z.name}」${reason}，该区域已自动移除（保存前可点「新增区域」重建，不影响线上配置）` : '');
  };
  const handleZoneFloorsChange = (key: string, items: string[]) =>
    items.length === 0 ? removeZoneByKey(key, '楼层已清空') : updateZoneField(key, { floors: items });
  const handleZoneRoomsChange = (key: string, items: string[]) =>
    items.length === 0 ? removeZoneByKey(key, '教室/方位已清空') : updateZoneField(key, { rooms: items });
  const handleRemoveZone = (key: string) => {
    const z = locationsConfig.zones.find((x) => x.key === key);
    if (!z) return;
    if (!window.confirm(`确认删除区域「${z.name}」？其楼号、楼层与教室配置将一并移除。`)) return;
    removeZoneByKey(key, '已手动删除');
  };
  const handleAddZone = () =>
    setLocationsConfig((prev) => ({
      zones: [
        ...prev.zones,
        { key: `zone-${Date.now()}`, name: `区域${prev.zones.length + 1}`, buildings: [], floors: ['1楼'], rooms: ['1室'] },
      ],
    }));

  const [issueTypes, setIssueTypes] = useState<IssueTypeItem[]>([
    { id: 'opt_hw', name: '硬件故障', desc: '投影灯泡、幕布升降、触摸失灵、电源开不了机', enabled: true },
    { id: 'opt_sw', name: '软件系统', desc: '教学软件闪退、系统蓝屏、音视频解码异常', enabled: true },
    { id: 'opt_net', name: '网络问题', desc: '教室网线断连、无网络信号、无法打开网页', enabled: true },
    { id: 'opt_other', name: '其他', desc: '话筒啸叫、功放无声、遥控器失灵等', enabled: true },
  ]);
  const [isIssueTypesInherited, setIsIssueTypesInherited] = useState<boolean>(false);
  const [resettingInheritance, setResettingInheritance] = useState<boolean>(false);

  const [savingSystemConfig, setSavingSystemConfig] = useState(false);
  const [systemConfigSuccess, setSystemConfigSuccess] = useState('');
  const [systemConfigError, setSystemConfigError] = useState('');

  // New Issue Type input
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDesc, setNewTypeDesc] = useState('');
  const [newTypeEnabled, setNewTypeEnabled] = useState(true);

  // Tickets state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, processing: 0, resolved: 0 });
  const [loading, setLoading] = useState(false);

  // Ticket Filters
  const [statusFilter, setStatusFilter] = useState('全部');
  const [typeFilter, setTypeFilter] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

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

  // ===== Sub-tenant management (single-domain multi-service gateway) =====
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: '', subpath: '', upstream_host: '', upstream_port: '' });
  const [tenantMsg, setTenantMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tenantBusyId, setTenantBusyId] = useState<number | null>(null);

  // ===== 入驻学校管理（SaaS 式多校隔离） =====
  interface SchoolRow {
    id: number;
    code: string;
    name: string;
    subtitle: string | null;
    enabled: boolean;
    is_default?: boolean;
    logo_url?: string | null;
    display_title?: string | null;
  }
  const [schoolsList, setSchoolsList] = useState<SchoolRow[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [newSchool, setNewSchool] = useState({ code: '', name: '', subtitle: '' });

  // 超级后台（/admin）按学校筛选工单；校级后台（/s/code/admin）固定本校
  const [schoolFilter, setSchoolFilter] = useState<'all' | number>('all');

  // 运行版本标记（排查"部署未生效/浏览器缓存"问题的一眼判据）
  const [appVersion, setAppVersion] = useState('');
  useEffect(() => {
    fetch('/api/version')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.version) setAppVersion(d.version);
      })
      .catch(() => {});
  }, []);

  // 角色权限与租户隔离（Pillar 7: UI 物理级裁剪）：
  // 1. 租户操作员与运维工程师角色：仅展示其所在租户下的工单审核与维修列表，物理隐藏系统配置、AI配置、子租户、角色管理等
  // 2. 子校后台（/s/<code>/admin）：不允许出现「子租户管理」
  useEffect(() => {
    if (isStaffRole && adminTab !== 'tickets') {
      setAdminTab('tickets');
    } else if (schoolCode && adminTab === 'tenants') {
      setAdminTab('tickets');
    }
  }, [isStaffRole, schoolCode, adminTab]);

  const [savingAiConfig, setSavingAiConfig] = useState(false);
  const [aiConfigSuccess, setAiConfigSuccess] = useState('');

  // AI Test Dialog state
  const [testPrompt, setTestPrompt] = useState('请用一句话测试连通性，并说明你的角色定位。');
  const [testResult, setTestResult] = useState('');
  const [testingAi, setTestingAi] = useState(false);
  const [testError, setTestError] = useState('');

  // Check device binding on mount when not authenticated
  useEffect(() => {
    const devId = localStorage.getItem('bbt_device_id');
    if (devId && !isAuthenticated) {
      setCheckingDevice(true);
      fetch(`/api/user-by-device?deviceId=${encodeURIComponent(devId)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data && data.found && data.user) {
            setDeviceBoundUser(data.user);
            if (!smartAccount && data.user.phone) {
              setSmartAccount(data.user.phone);
            }
          }
        })
        .catch(() => {})
        .finally(() => setCheckingDevice(false));
    }
  }, [isAuthenticated]);

  // Handle Fast Device Login (One-click login for bound devices)
  const handleFastDeviceLogin = async () => {
    const devId = localStorage.getItem('bbt_device_id');
    if (!devId) {
      setLoginError('未检测到本机设备标识');
      return;
    }
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch('/api/auth/device-fast-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: devId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '设备快捷登录失败');

      // 持久化存储至 localStorage（支持页面关闭后重新访问免密直达）
      if (data.token) localStorage.setItem('bbt_auth_token', data.token);
      if (data.user) localStorage.setItem('bbt_auth_user', JSON.stringify(data.user));
      sessionStorage.setItem('bbt_admin_auth', 'true');
      sessionStorage.setItem('bbt_current_user', JSON.stringify(data.user));
      sessionStorage.removeItem('bbt_view_teacher_home');

      setCurrentUser(data.user);
      setIsAuthenticated(true);
      setAdminTab('tickets');
      fetchTicketsAndStats();
    } catch (err: any) {
      setLoginError(err.message || '快捷登录失败');
    } finally {
      setLoggingIn(false);
    }
  };

  // Pillar 2 & 3: Smart Login (Identity-Blind Single Form & Tenant Self-Healing)
  const handleSmartLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smartAccount.trim()) {
      setLoginError('请输入手机号或管理员账号');
      return;
    }
    setLoginError('');
    setLoggingIn(true);
    try {
      let devId = localStorage.getItem('bbt_device_id');
      if (!devId) {
        devId = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
        localStorage.setItem('bbt_device_id', devId);
      }
      const res = await fetch('/api/auth/smart-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: smartAccount.trim(),
          password: smartPassword,
          device_id: devId,
          school_code: schoolCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登录失败，请检查账号或密码');

      // 凭据优先与租户自愈（Pillar 3: Tenant Self-Healing）
      if (data.school_code && schoolCode && data.school_code !== schoolCode) {
        // 如果当前访问的租户与该员工真正归属租户不一致，无感纠偏跳转
        console.log(`[Tenant Self-Healing] Redirecting from /s/${schoolCode}/admin to /s/${data.school_code}/admin`);
        window.location.href = `/s/${data.school_code}/admin`;
        return;
      }

      if (data.token) localStorage.setItem('bbt_auth_token', data.token);
      if (data.user) localStorage.setItem('bbt_auth_user', JSON.stringify(data.user));
      sessionStorage.setItem('bbt_admin_auth', 'true');
      sessionStorage.setItem('bbt_current_user', JSON.stringify(data.user));
      sessionStorage.removeItem('bbt_view_teacher_home');

      setCurrentUser(data.user);
      setIsAuthenticated(true);
      setAdminTab('tickets');
      fetchTicketsAndStats();
      if (data.user?.role === 'admin' || data.user?.role === 'superadmin') {
        fetchAiConfig();
        fetchTenants();
        fetchSchools();
        fetchUsers();
      }
    } catch (err: any) {
      setLoginError(err.message || '登录认证失败');
    } finally {
      setLoggingIn(false);
    }
  };

  // Fetch school technicians list for dispatch modal
  const fetchTechnicians = async () => {
    setLoadingTechnicians(true);
    try {
      const schoolParam = schoolCode || (currentUser?.school_id ? `school_id=${currentUser.school_id}` : '');
      const url = schoolParam ? `/api/schools/technicians?${schoolParam}` : '/api/schools/technicians';
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setSchoolTechnicians(data);
      }
    } catch (err) {
      console.error('Failed to load technicians:', err);
    } finally {
      setLoadingTechnicians(false);
    }
  };

  // Open Dispatch Modal for a ticket
  const openDispatchModal = (ticket: Ticket) => {
    setDispatchTicket(ticket);
    setSelectedTechId(ticket.assigned_to_id || '');
    setDispatchNoteInput(ticket.dispatch_note || '');
    fetchTechnicians();
  };

  // Confirm Dispatch
  const handleConfirmDispatch = async () => {
    if (!dispatchTicket || !selectedTechId) {
      alert('请选择要委派派单的维修工程师');
      return;
    }
    const tech = schoolTechnicians.find((t) => t.id === Number(selectedTechId));
    if (!tech) return;

    setDispatchingAction(true);
    try {
      const res = await fetch(`/api/tickets/${dispatchTicket.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          technician_id: tech.id,
          technician_name: tech.name,
          technician_phone: tech.phone,
          dispatch_note: dispatchNoteInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '派单失败');

      setSaveToast(`✅ 工单 #${dispatchTicket.id} 已成功指派给「${tech.name}」！`);
      setTimeout(() => setSaveToast(null), 3500);

      // Local state update
      setTickets((prev) =>
        prev.map((t) =>
          t.id === dispatchTicket.id
            ? {
                ...t,
                status: '已派单',
                assigned_to_id: tech.id,
                assigned_to_name: tech.name,
                assigned_to_phone: tech.phone,
                assigned_at: new Date().toISOString(),
                dispatch_note: dispatchNoteInput.trim(),
              }
            : t
        )
      );
      setDispatchTicket(null);
      fetchTicketsAndStats();
    } catch (err: any) {
      alert(err.message || '派单失败');
    } finally {
      setDispatchingAction(false);
    }
  };

  // Technician Start Repair
  const handleStartRepair = async (ticketId: number) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/start-repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '接单失败');

      setSaveToast(`⚙️ 已开始检修排查！工单 #${ticketId} 状态已更新为「处理中」`);
      setTimeout(() => setSaveToast(null), 3500);

      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: '处理中' } : t))
      );
      fetchTicketsAndStats();
    } catch (err: any) {
      alert(err.message || '操作失败');
    }
  };

  // Technician Atomic Claim (Pillar 6)
  const handleClaimTicket = async (ticketId: number) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '抢单失败');

      setSaveToast(`🤝 认领成功！工单 #${ticketId} 已分配给您处置`);
      setTimeout(() => setSaveToast(null), 3500);

      fetchTicketsAndStats();
    } catch (err: any) {
      alert(err.message || '认领失败');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('bbt_auth_token');
    localStorage.removeItem('bbt_auth_user');
    sessionStorage.removeItem('bbt_admin_auth');
    sessionStorage.removeItem('bbt_current_user');
    sessionStorage.removeItem('bbt_view_teacher_home');
    setIsAuthenticated(false);
    setCurrentUser(null);
    if (onBackToHome) onBackToHome();
  };


  // ===== Sub-tenant management handlers =====
  const fetchTenants = async () => {
    setTenantsLoading(true);
    try {
      const res = await fetch('/api/admin/tenants');
      const data = await res.json();
      if (Array.isArray(data)) setTenants(data);
    } catch (err) {
      console.error('Failed to load tenants:', err);
    } finally {
      setTenantsLoading(false);
    }
  };

  const handleAddTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenantMsg(null);
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTenant.name,
          subpath: newTenant.subpath,
          upstream_host: newTenant.upstream_host,
          upstream_port: parseInt(newTenant.upstream_port, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '添加失败');
      setTenantMsg({ type: 'success', text: data.message || '子租户已添加' });
      setNewTenant({ name: '', subpath: '', upstream_host: '', upstream_port: '' });
      fetchTenants();
    } catch (err: any) {
      setTenantMsg({ type: 'error', text: err.message || '添加失败' });
    }
  };

  const handleToggleTenant = async (t: Tenant) => {
    setTenantMsg(null);
    setTenantBusyId(t.id);
    try {
      const res = await fetch(`/api/admin/tenants/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: t.name,
          subpath: t.subpath,
          upstream_host: t.upstream_host,
          upstream_port: t.upstream_port,
          enabled: !t.enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      setTenantMsg({
        type: 'success',
        text: `已${t.enabled ? '停用' : '启用'} ${t.subpath}，网关将在 10 秒内自动生效`,
      });
      fetchTenants();
    } catch (err: any) {
      setTenantMsg({ type: 'error', text: err.message || '操作失败' });
    } finally {
      setTenantBusyId(null);
    }
  };

  const handleDeleteTenant = async (t: Tenant) => {
    if (!window.confirm(`确认删除子租户「${t.name}」(${t.subpath})？网关将在 10 秒内摘除该路由。`)) return;
    setTenantMsg(null);
    setTenantBusyId(t.id);
    try {
      const res = await fetch(`/api/admin/tenants/${t.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');
      setTenantMsg({ type: 'success', text: data.message || '已删除' });
      fetchTenants();
    } catch (err: any) {
      setTenantMsg({ type: 'error', text: err.message || '删除失败' });
    } finally {
      setTenantBusyId(null);
    }
  };

  // ===== 入驻学校管理处理器 =====
  const fetchSchools = async () => {
    setSchoolsLoading(true);
    try {
      const res = await fetch('/api/admin/schools');
      const data = await res.json();
      if (Array.isArray(data)) setSchoolsList(data);
    } catch (err) {
      console.error('Failed to load schools:', err);
    } finally {
      setSchoolsLoading(false);
    }
  };

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenantMsg(null);
    try {
      const res = await fetch('/api/admin/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSchool),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '入驻失败');
      setTenantMsg({ type: 'success', text: data.message || '学校已入驻' });
      setNewSchool({ code: '', name: '', subtitle: '' });
      fetchSchools();
    } catch (err: any) {
      setTenantMsg({ type: 'error', text: err.message || '入驻失败' });
    }
  };

  const handleToggleSchool = async (s: SchoolRow) => {
    setTenantMsg(null);
    try {
      const res = await fetch(`/api/admin/schools/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      setTenantMsg({ type: 'success', text: `已${s.enabled ? '停用' : '启用'} ${s.name}` });
      fetchSchools();
    } catch (err: any) {
      setTenantMsg({ type: 'error', text: err.message || '操作失败' });
    }
  };

  const handleDeleteSchool = async (s: SchoolRow) => {
    if (!window.confirm(`确认移除学校「${s.name}」？仅无工单的学校可移除，有数据的请改用停用。`)) return;
    setTenantMsg(null);
    try {
      const res = await fetch(`/api/admin/schools/${s.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '移除失败');
      setTenantMsg({ type: 'success', text: data.message || '已移除' });
      fetchSchools();
    } catch (err: any) {
      setTenantMsg({ type: 'error', text: err.message || '移除失败' });
    }
  };

  const handleSetDefaultSchool = async (s: SchoolRow) => {
    setTenantMsg(null);
    try {
      const res = await fetch(`/api/admin/schools/${s.id}/set-default`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '设置失败');
      setTenantMsg({ type: 'success', text: data.message || '默认子租户已更新' });
      fetchSchools();
    } catch (err: any) {
      setTenantMsg({ type: 'error', text: err.message || '设置失败' });
    }
  };

  // 校徽上传（Cloudinary 存储，URL 写回学校行）
  const handleUploadSchoolLogo = async (s: SchoolRow, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setTenantMsg({ type: 'error', text: '校徽图片请小于 5MB' });
      return;
    }
    setTenantMsg(null);
    setTenantBusyId(s.id);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch(`/api/admin/schools/${s.id}/logo`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      setTenantMsg({ type: 'success', text: data.message || '校徽已更新' });
      fetchSchools();
    } catch (err: any) {
      setTenantMsg({ type: 'error', text: err.message || '上传失败' });
    } finally {
      setTenantBusyId(null);
    }
  };

  // 显示标题失焦时保存（默认规则：校名 + 班班通报修管理系统）
  const handleSaveSchoolTitle = async (s: SchoolRow, value: string) => {
    const next = value.trim();
    if (next === (s.display_title || '')) return;
    setTenantMsg(null);
    try {
      const res = await fetch(`/api/admin/schools/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_title: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      setTenantMsg({ type: 'success', text: '显示标题已更新，浏览器标签页即刻生效' });
      fetchSchools();
    } catch (err: any) {
      setTenantMsg({ type: 'error', text: err.message || '保存失败' });
    }
  };

  // Load Tickets
  const fetchTicketsAndStats = async () => {
    setLoading(true);
    try {
      // 运维工程师严格限定为其所在租户学校，不可跨校查询
      const targetSchool = schoolCode || (isTechnician ? (currentUser?.school_code || 'gpzx') : '');
      const schoolQ = targetSchool ? `?school=${encodeURIComponent(targetSchool)}` : '';
      const [ticketsRes, statsRes] = await Promise.all([
        fetch(`/api/tickets${schoolQ}`),
        fetch(`/api/tickets/stats${schoolQ}`),
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
      const res = await fetch(`/api/system-config${schoolCode ? `?school=${encodeURIComponent(schoolCode)}` : ''}`);
      const data = await res.json();
      if (data) {
        if (data.system_title) setSystemTitle(data.system_title);
        if (data.system_subtitle) setSystemSubtitle(data.system_subtitle);
        if (data.locations && Array.isArray(data.locations.zones)) setLocationsConfig(data.locations);
        if (data.issue_types && Array.isArray(data.issue_types)) {
          setIssueTypes(
            data.issue_types.map((it: any, idx: number) => ({
              id: it.id || `opt_${idx + 1}`,
              name: it.name || '',
              desc: it.desc || '',
              enabled: it.enabled !== false,
            }))
          );
        }
        if (typeof data.is_issue_types_inherited === 'boolean') {
          setIsIssueTypesInherited(data.is_issue_types_inherited);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch users list (members, roles, device binding status)
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const params = new URLSearchParams();
      if (userRoleFilter && userRoleFilter !== 'all') params.append('role', userRoleFilter);
      if (userBoundFilter && userBoundFilter !== 'all') params.append('bound', userBoundFilter);
      if (userSearch.trim()) params.append('search', userSearch.trim());
      if (userSchoolFilter && userSchoolFilter !== 'all') {
        params.append('school', userSchoolFilter);
      } else if (schoolCode) {
        params.append('school', schoolCode);
      }
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsers(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Unbind device for user (解绑设备ID)
  const handleUnbindDevice = async (user: AppUser) => {
    if (!window.confirm(`确定要解绑用户「${user.name}（手机号：${user.phone}）」当前绑定的设备识别码吗？\n\n解绑后，该用户下次在任何手机或电脑上提交报修时，将自动将其新设备绑定至该会员。`)) {
      return;
    }
    setUnbindingUserId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/unbind-device`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '解绑设备失败');
      setUserActionMsg({ type: 'success', text: `✅ ${data.message || `已成功解绑「${user.name}」的设备`}` });
      setTimeout(() => setUserActionMsg(null), 4000);
      fetchUsers();
    } catch (err: any) {
      setUserActionMsg({ type: 'error', text: `❌ ${err.message || '解绑失败'}` });
      setTimeout(() => setUserActionMsg(null), 4000);
    } finally {
      setUnbindingUserId(null);
    }
  };

  // Update role
  const handleUpdateRole = async (userId: number, role: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '角色更新失败');
      setUserActionMsg({ type: 'success', text: `✅ ${data.message || '角色已更新'}` });
      setTimeout(() => setUserActionMsg(null), 3000);
      fetchUsers();
    } catch (err: any) {
      setUserActionMsg({ type: 'error', text: `❌ ${err.message || '更新失败'}` });
      setTimeout(() => setUserActionMsg(null), 4000);
    }
  };

  // Toggle user status
  const handleToggleUserStatus = async (userId: number) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/toggle-status`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '切换状态失败');
      setUserActionMsg({ type: 'success', text: `✅ ${data.message || '用户状态已更新'}` });
      setTimeout(() => setUserActionMsg(null), 3000);
      fetchUsers();
    } catch (err: any) {
      setUserActionMsg({ type: 'error', text: `❌ ${err.message || '操作失败'}` });
      setTimeout(() => setUserActionMsg(null), 4000);
    }
  };

  // Delete user
  const handleDeleteUser = async (user: AppUser) => {
    if (!window.confirm(`确定要从系统删除会员用户「${user.name}（${user.phone}）」吗？该操作不可撤销。`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');
      setUserActionMsg({ type: 'success', text: `✅ ${data.message || '用户已删除'}` });
      setTimeout(() => setUserActionMsg(null), 3000);
      fetchUsers();
    } catch (err: any) {
      setUserActionMsg({ type: 'error', text: `❌ ${err.message || '删除失败'}` });
      setTimeout(() => setUserActionMsg(null), 4000);
    }
  };

  // Add new user
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserPhone.trim()) {
      alert('请填写姓名与手机号');
      return;
    }
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName.trim(),
          phone: newUserPhone.trim(),
          role: newUserRole,
          school_id: newUserSchoolId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '添加用户失败');
      setIsAddUserModalOpen(false);
      setNewUserName('');
      setNewUserPhone('');
      setNewUserRole('teacher');
      setUserActionMsg({ type: 'success', text: `✅ ${data.message || '用户添加成功'}` });
      setTimeout(() => setUserActionMsg(null), 3000);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || '添加用户失败');
    }
  };

  // Save edit user
  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingUser.name,
          phone: editingUser.phone,
          role: editingUser.role,
          school_id: editingUser.school_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失败');
      setEditingUser(null);
      setUserActionMsg({ type: 'success', text: '✅ 用户信息已成功更新' });
      setTimeout(() => setUserActionMsg(null), 3000);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || '更新失败');
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchTicketsAndStats();
      // 仅当非运维工程师（如管理员、超级管理员）时才去加载全局系统配置、AI与角色数据
      if (!isTechnician) {
        fetchAiConfig();
        fetchSystemConfig();
        fetchUsers();
      }
    }
  }, [isAuthenticated, isTechnician]);

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
          school: schoolCode || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存配置失败');
      setSystemConfigSuccess(data.message ? `✅ ${data.message}` : '✅ 配置已成功保存！');
      setZoneHint('');
      if (schoolCode) {
        setIsIssueTypesInherited(false);
      }
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

  // Sub-tenant action: restore inheritance from master tenant
  const handleResetIssueTypesToMaster = async () => {
    if (!window.confirm('确认恢复继承主租户（主校区）故障分类配置？\n恢复后本校将自动实时同步主租户的配置与激活状态。')) return;
    setResettingInheritance(true);
    setSystemConfigSuccess('');
    setSystemConfigError('');
    try {
      const res = await fetch(
        `/api/admin/system-config/reset-issue-types-to-master?school=${encodeURIComponent(schoolCode || '')}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '恢复继承失败');
      if (data.issue_types) {
        setIssueTypes(
          data.issue_types.map((it: any, idx: number) => ({
            id: it.id || `opt_${idx + 1}`,
            name: it.name || '',
            desc: it.desc || '',
            enabled: it.enabled !== false,
          }))
        );
      }
      setIsIssueTypesInherited(true);
      setSystemConfigSuccess('✅ 已成功恢复继承主租户故障分类配置！前台下拉列表已同步主租户。');
      setTimeout(() => setSystemConfigSuccess(''), 4000);
    } catch (err: any) {
      setSystemConfigError(err.message || '恢复继承失败');
    } finally {
      setResettingInheritance(false);
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
      const res = await fetch(`/api/admin/system-config/reset${schoolCode ? `?school=${encodeURIComponent(schoolCode)}` : ''}`, { method: 'POST' });
      const data = await res.json();
      if (data.system_title) setSystemTitle(data.system_title);
      if (data.system_subtitle) setSystemSubtitle(data.system_subtitle);
      if (data.locations && Array.isArray(data.locations.zones)) setLocationsConfig(data.locations);
      if (data.issue_types && Array.isArray(data.issue_types)) {
        setIssueTypes(
          data.issue_types.map((it: any, idx: number) => ({
            id: it.id || `opt_${idx + 1}`,
            name: it.name || '',
            desc: it.desc || '',
            enabled: it.enabled !== false,
          }))
        );
      }
      if (typeof data.is_issue_types_inherited === 'boolean') {
        setIsIssueTypesInherited(data.is_issue_types_inherited);
      }
      if (onSystemConfigUpdated && data.system_title) {
        onSystemConfigUpdated(data.system_title, data.system_subtitle || '');
      }
      setSystemConfigSuccess(
        schoolCode
          ? '✅ 已为本校恢复默认位置配置，并恢复继承主租户故障分类！'
          : '✅ 已恢复为系统默认配置（耿中班班通报修管理系统，东区各楼为4层）！'
      );
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
      const operatorName = currentUser
        ? `${currentUser.role === 'technician' ? '运维工程师 ' : currentUser.role === 'admin' ? '管理员 ' : ''}${currentUser.name}`
        : '运维管理人员';
      formData.append('admin_name', operatorName);
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
      <div className="w-full max-w-md mx-auto py-10 px-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-5">
          <div className="text-center space-y-1.5">
            <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
              <Wrench className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {schoolCode ? `${currentSystemTitle || '耿棚中学'} · 运维与管理后台` : '班班通运维与管理后台'}
            </h2>
            <p className="text-xs text-slate-500">
              运维工程师专属工作台 · 设备维修跟踪 · 系统综合配置
            </p>
          </div>

          {/* 若检测到当前设备已绑定运维人员（如张强），提示一键免输直接进入工作台 */}
          {deviceBoundUser && (
            <div className="p-3.5 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  已识别本机绑定的运维人员
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-semibold">
                  免密直达
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs shrink-0">
                  {deviceBoundUser.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-900 text-sm">{deviceBoundUser.name}</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-1.5 py-0.2 rounded">
                      {deviceBoundUser.role === 'technician' ? '维修工' : deviceBoundUser.role === 'operator' ? '租户操作员' : deviceBoundUser.role === 'admin' ? '管理员' : '会员'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                    {deviceBoundUser.phone} {deviceBoundUser.school_name ? `· ${deviceBoundUser.school_name}` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleFastDeviceLogin}
                disabled={loggingIn}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {loggingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                以「{deviceBoundUser.name}」身份一键进入工作台
              </button>
            </div>
          )}

          {loginError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              {loginError}
            </div>
          )}

          {/* 支柱 2：智能单表单登录（Identity-Blind Smart Login） */}
          <form onSubmit={handleSmartLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                账号 / 手机号码
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={smartAccount}
                  onChange={(e) => setSmartAccount(e.target.value)}
                  placeholder="手机号（租户操作员/维修工）或管理员账号"
                  className="w-full pl-9 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                无需手动切换身份，输入手机号自动进入一线作业通道，输入 admin 自动进入管理通道。
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">登录密码 / 动态凭据</label>
                <span className="text-[11px] text-slate-400">（手机号首次登录或免密成员可留空）</span>
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={smartPassword}
                  onChange={(e) => setSmartPassword(e.target.value)}
                  placeholder="管理员请输入密码，一线操作员若设置了密码请填写"
                  className="w-full pl-9 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
            >
              {loggingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
              智能识别并登录系统
            </button>
          </form>

          {onBackToHome && (
            <div className="text-center pt-2 border-t border-slate-100">
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


  // Filtered tickets（租户操作员与维修工仅展示其所在租户下的工单列表，超级管理员可全校筛选）
  const filteredTickets = tickets.filter((t) => {
    if (isStaffRole) {
      if (currentUser?.school_id && t.school_id && t.school_id !== currentUser.school_id) {
        return false;
      }
      // 维修工角色默认可切换「派发给我的工单」
      if (isTechnician && technicianFilterMine === 'mine' && currentUser?.id) {
        if (t.assigned_to_id !== currentUser.id) return false;
      }
    } else {
      if (!schoolCode && schoolFilter !== 'all' && t.school_id !== schoolFilter) return false;
    }
    if (statusFilter !== '全部' && t.status !== statusFilter) return false;
    if (typeFilter !== '全部' && t.issue_type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const loc = (t.location || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const teacher = (t.teacher_name || '').toLowerCase();
      const dev = (t.device_id || '').toLowerCase();
      const assigned = (t.assigned_to_name || '').toLowerCase();
      return loc.includes(q) || desc.includes(q) || teacher.includes(q) || dev.includes(q) || assigned.includes(q);
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
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              🛠️ {isOperator
                ? `${schoolCode ? currentSystemTitle : (currentUser?.school_name || currentSystemTitle || '耿棚中学')} · 租户调度中心 (审核与派单)`
                : isTechnician
                ? `${schoolCode ? currentSystemTitle : (currentUser?.school_name || currentSystemTitle || '耿棚中学')} · 维修工程师工作台`
                : '班班通运维管理后台'}
            </h2>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-md font-semibold border ${
                isOperator
                  ? 'bg-purple-50 text-purple-800 border-purple-200'
                  : isTechnician
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border-blue-100'
              }`}
            >
              {isOperator
                ? `租户操作员: ${currentUser?.name} (调度派单)`
                : isTechnician
                ? `维修工: ${currentUser?.name}`
                : currentUser?.name
                ? `${currentUser.name} (${currentUser.role})`
                : '已登录 (/admin)'}
            </span>
            {isStaffRole && (
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-mono flex items-center gap-1">
                <Smartphone className="w-3 h-3 text-emerald-600" />
                已绑定当前设备
              </span>
            )}
            {appVersion && (
              <span
                className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 font-mono"
                title={`当前运行版本 ${appVersion}（若与预期不符说明部署未生效，请重新执行 redeploy 并强刷浏览器）`}
              >
                {appVersion}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isOperator
              ? `欢迎您，${currentUser?.name}（${currentUser?.phone}）· 负责本租户工单审核、指派分流维修工程师与调度催办`
              : isTechnician
              ? `欢迎您，${currentUser?.name}（${currentUser?.phone}）· 负责班班通教室故障现场研判、维修处置与进度回执`
              : '工单维修跟踪 · 现场照片研判 · 大模型参数配置与测试'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* 功能标签切换：一线人员（租户操作员/维修工）仅展示工单处理与派单看板，系统全局配置物理级裁剪隐藏 */}
          {isStaffRole ? (
            <div className="flex items-center gap-1.5 bg-blue-50/80 border border-blue-200 text-blue-700 px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-2xs">
              <Wrench className="w-3.5 h-3.5 text-blue-600" />
              <span>{isOperator ? '工单审核与派单' : '我的检修任务'} ({filteredTickets.length})</span>
            </div>
          ) : (
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
              {!schoolCode && (
                <button
                  onClick={() => {
                    setAdminTab('tenants');
                    fetchTenants();
                    fetchSchools();
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    adminTab === 'tenants' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Network className="w-3.5 h-3.5 text-indigo-600" />
                  子租户管理
                </button>
              )}
              <button
                onClick={() => {
                  setAdminTab('users');
                  fetchUsers();
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  adminTab === 'users' ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-purple-600" />
                角色与会员管理 ({users.length})
              </button>
            </div>
          )}

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

          {/* 故障分布统计（数据闭环 · 设备电子档案） */}
          {((stats.by_type && stats.by_type.length > 0) || (stats.by_location && stats.by_location.length > 0)) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-slate-800">故障类型分布</span>
                  <span className="text-[11px] text-slate-400">在管设备 {stats.device_count ?? 0} 台</span>
                </div>
                <div className="space-y-1.5">
                  {(stats.by_type || []).slice(0, 5).map((row) => {
                    const max = Math.max(...(stats.by_type || []).map((r) => r.count), 1);
                    return (
                      <div key={row.name} className="flex items-center gap-2">
                        <span className="w-16 text-[11px] text-slate-600 truncate">{row.name}</span>
                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.round((row.count / max) * 100)}%` }}
                          />
                        </div>
                        <span className="w-7 text-right text-[11px] font-semibold text-slate-700">{row.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-slate-800">高发位置 TOP6</span>
                  <span className="text-[11px] text-slate-400">点击条目可筛选工单</span>
                </div>
                <div className="space-y-1.5">
                  {(stats.by_location || []).map((row) => {
                    const max = Math.max(...(stats.by_location || []).map((r) => r.count), 1);
                    return (
                      <button
                        key={row.name}
                        onClick={() => setSearchQuery(row.name)}
                        className="w-full flex items-center gap-2 cursor-pointer group"
                        title={`筛选位置：${row.name}`}
                      >
                        <span className="w-28 text-[11px] text-slate-600 truncate text-left">{row.name}</span>
                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full group-hover:bg-indigo-600 transition-colors"
                            style={{ width: `${Math.round((row.count / max) * 100)}%` }}
                          />
                        </div>
                        <span className="w-7 text-right text-[11px] font-semibold text-slate-700">{row.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

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

            <div className="flex gap-2 flex-wrap">
              {!schoolCode && !isStaffRole && (
                <select
                  value={String(schoolFilter)}
                  onChange={(e) => setSchoolFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  title="按入驻学校筛选（仅超级后台可用）"
                >
                  <option value="all">全部学校</option>
                  {schoolsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}

              {isStaffRole && (
                <div
                  className="px-3 py-2 text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg flex items-center gap-1.5 shrink-0 select-none"
                  title="一线人员已自动锁定为其所在租户学校"
                >
                  <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{schoolCode ? currentSystemTitle : (currentUser?.school_name || '耿棚中学')}（本校）</span>
                </div>
              )}

              {/* 维修工任务切换开关 */}
              {isTechnician && (
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setTechnicianFilterMine('mine')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      technicianFilterMine === 'mine'
                        ? 'bg-white text-blue-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    派发给我的任务
                  </button>
                  <button
                    type="button"
                    onClick={() => setTechnicianFilterMine('all')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      technicianFilterMine === 'all'
                        ? 'bg-white text-blue-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    全校工单池
                  </button>
                </div>
              )}

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="全部">全部状态</option>
                <option value="待派单">待派单 (待审核)</option>
                <option value="已派单">已派单 (待工程师接单)</option>
                <option value="处理中">处理中 (正在排查维修)</option>
                <option value="已解决">已解决 (已完成)</option>
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

              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:shadow-xs shrink-0 select-none"
                title="导出当前租户报修明细与月度工作量汇总为 Excel 报表"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>导出报修数据</span>
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
                            {!schoolCode && t.school_id && (
                              <span className="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-100 font-semibold">
                                🏫 {schoolsList.find((s) => s.id === t.school_id)?.name || `#${t.school_id}`}
                              </span>
                            )}
                            {t.teacher_name && (
                              <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-semibold flex items-center gap-1">
                                <span>👤 报修教师: {t.teacher_name}</span>
                                {t.phone && <span className="text-indigo-500 font-normal">({t.phone})</span>}
                              </span>
                            )}
                            {t.device_id && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSearchQuery(t.device_id || '');
                                  setExpandedId(null);
                                }}
                                title="查看该设备的全部报修记录（设备电子档案）"
                                className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 cursor-pointer transition-colors flex items-center gap-1"
                              >
                                🖥️ 设备档案: {t.device_id}
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 truncate mt-0.5 max-w-md">
                            {t.description || '无故障描述'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {/* 工单状态与指派展示 */}
                        {t.interactions && t.interactions.some((i) => i.sender_type === 'user') && (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-violet-100 text-violet-800 border border-violet-200 flex items-center gap-1 shadow-2xs">
                            <MessageCircle className="w-3 h-3 text-violet-600 animate-pulse" />
                            教师追问 ({t.interactions.filter((i) => i.sender_type === 'user').length})
                          </span>
                        )}

                        {t.status === '待派单' && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            待派单
                          </span>
                        )}
                        {t.status === '待处理' && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            待处理
                          </span>
                        )}
                        {t.status === '已派单' && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                            <SendHorizonal className="w-3 h-3 text-indigo-600" />
                            已派单: {t.assigned_to_name || '待接单'}
                          </span>
                        )}
                        {t.status === '处理中' && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1">
                            <Wrench className="w-3 h-3 text-blue-600 animate-spin" />
                            检修中 {t.assigned_to_name ? `(${t.assigned_to_name})` : ''}
                          </span>
                        )}
                        {t.status === '已解决' && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            已解决
                          </span>
                        )}

                        {/* 租户操作员 / 管理员：直接在卡片外侧审核派单 */}
                        {(isOperator || (!isStaffRole)) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDispatchModal(t);
                            }}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1 shadow-2xs ${
                              t.status === '待派单' || t.status === '待处理'
                                ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600 animate-pulse'
                                : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                            }`}
                            title="由租户操作员审核并将此工单分派给维修工程师"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>{t.assigned_to_id ? '改派' : '审核派单'}</span>
                          </button>
                        )}

                        {/* 维修工：如果被派发此单且未处理，可一键接单开始排查 */}
                        {isTechnician && t.assigned_to_id === currentUser?.id && t.status === '已派单' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartRepair(t.id);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="接单开始排查维修"
                          >
                            <Wrench className="w-3 h-3" />
                            <span>接单开始检修</span>
                          </button>
                        )}

                        {/* 维修工：全校工单池中未分配的工单，可主动原子认领 (Pillar 6) */}
                        {isTechnician && !t.assigned_to_id && (t.status === '待派单' || t.status === '待处理') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClaimTicket(t.id);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="主动原子抢单认领此工单"
                          >
                            <Check className="w-3 h-3" />
                            <span>主动认领</span>
                          </button>
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
                                <span className="font-bold text-blue-700 text-sm flex items-center gap-2 flex-wrap">
                                  <span>{t.teacher_name || '未填写姓名'}</span>
                                  {t.phone && (
                                    <a
                                      href={`tel:${t.phone}`}
                                      className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-100 hover:bg-blue-200 px-2 py-0.5 rounded font-normal transition-colors cursor-pointer"
                                      title="点击呼叫该教师"
                                    >
                                      <Phone className="w-3 h-3 text-blue-600" />
                                      {t.phone}
                                    </a>
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">报修时间：</span>
                                <span className="font-medium text-slate-800">{formatDate(t.created_at)}</span>
                              </div>
                              {/* 租户调度派单与维修工详情 */}
                              <div className="p-2.5 rounded-lg border border-purple-200 bg-purple-50/50 space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-purple-900 flex items-center gap-1">
                                    <SendHorizonal className="w-3.5 h-3.5 text-purple-700" />
                                    派单与责任工程师：
                                  </span>
                                  {t.assigned_to_name ? (
                                    <span className="font-bold text-purple-800 flex items-center gap-1.5">
                                      <span>{t.assigned_to_name}</span>
                                      {t.assigned_to_phone && (
                                        <a
                                          href={`tel:${t.assigned_to_phone}`}
                                          className="text-[11px] text-purple-700 hover:underline font-mono"
                                        >
                                          ({t.assigned_to_phone})
                                        </a>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-amber-700 font-semibold text-[11px]">⏳ 尚未派发维修工</span>
                                  )}
                                </div>
                                {t.dispatch_note && (
                                  <div className="text-[11px] text-purple-900 bg-white/80 p-1.5 rounded border border-purple-100 mt-1">
                                    <span className="font-semibold text-purple-800">调度审核备注：</span>
                                    {t.dispatch_note}
                                  </div>
                                )}
                                {t.assigned_at && (
                                  <div className="text-[10px] text-slate-400 text-right">
                                    派单时间：{formatDate(t.assigned_at)}
                                  </div>
                                )}
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
                                      href={imgProxy(t.image_url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                    >
                                      查看大图 <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                  <img
                                    src={imgProxy(t.image_url)}
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
                                              href={imgProxy(interaction.image_url)}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-block"
                                            >
                                              <img
                                                src={imgProxy(interaction.image_url)}
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
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                                <MessageSquare className="w-4 h-4 text-blue-600" />
                                运维维修处置、答复与拍照上传
                              </div>
                              {(isOperator || !isStaffRole) && (
                                <button
                                  type="button"
                                  onClick={() => openDispatchModal(t)}
                                  className="text-xs text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>{t.assigned_to_id ? '改派他人' : '指定维修工'}</span>
                                </button>
                              )}
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
                                <option value="待派单">⏳ 待派单 (等待审核分派)</option>
                                <option value="待处理">⏳ 待处理</option>
                                <option value="已派单">📤 已派单 (等待工程师上门)</option>
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

      {/* 模块二：设备位置与故障分类动态配置（仅超级管理员可见） */}
      {adminTab === 'system_config' && !isTechnician && (
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

            {/* 配置区域 0：系统标题（仅超级后台可改；子租户标题随学校信息走） */}
            {!schoolCode ? (
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
            ) : (
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-slate-600 flex items-center gap-2 leading-relaxed">
                <Settings2 className="w-4 h-4 text-blue-500 shrink-0" />
                当前学校「{systemTitle}」的名称与副标题由超级后台统一维护。本页保存的
                <strong>设备位置与故障分类仅对本校生效</strong>，与其他学校完全独立。
              </div>
            )}

            {/* 配置区域：动态多区域（区名可编辑，楼层/教室清空自动移除区域） */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <h4 className="text-sm font-bold text-slate-900">设备位置区域配置</h4>
                  <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                    当前 {locationsConfig.zones.length} 个区域
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddZone}
                  className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增区域
                </button>
              </div>

              {zoneHint && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                  {zoneHint}
                </div>
              )}

              <p className="text-xs text-slate-500">
                区名可直接点击编辑；某区域的「楼层」或「教室/方位」删至为空时，该区域将被自动移除（其全部配置一并清除）；
                楼号留空表示教师端选择该区域时无需选楼。
              </p>

              {locationsConfig.zones.map((zone) => (
                <div key={zone.key} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={zone.name}
                      onChange={(e) => updateZoneField(zone.key, { name: e.target.value })}
                      placeholder="区域名称"
                      className="w-32 px-2.5 py-1.5 text-sm font-bold text-slate-900 bg-white border-b-2 border-blue-300 focus:border-blue-500 focus:outline-hidden"
                    />
                    <span className="text-[11px] text-slate-400">区域名称可直接编辑</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveZone(zone.key)}
                      className="ml-auto px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                    >
                      删除区域
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <TagListEditor
                      title="楼号（可留空）"
                      items={zone.buildings}
                      onChange={(buildings) => updateZoneField(zone.key, { buildings })}
                      allowEmpty
                      placeholder="如: 七号楼..."
                      helperText="留空时教师端免选楼号"
                    />
                    <TagListEditor
                      title="楼层（清空=移除本区域）"
                      items={zone.floors}
                      onChange={(floors) => handleZoneFloorsChange(zone.key, floors)}
                      allowEmpty
                      placeholder="如: 5楼..."
                      helperText="删除最后一个楼层将自动移除本区域"
                    />
                    <TagListEditor
                      title="教室/方位（清空=移除本区域）"
                      items={zone.rooms}
                      onChange={(rooms) => handleZoneRoomsChange(zone.key, rooms)}
                      allowEmpty
                      placeholder="如: 东7..."
                      helperText="删除最后一间教室将自动移除本区域"
                    />
                  </div>
                </div>
              ))}

              {locationsConfig.zones.length === 0 && (
                <div className="p-4 border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-400">
                  暂无区域，请点击「新增区域」创建（教师端仍可使用「其他」手动输入位置）
                </div>
              )}
            </div>

            {/* 配置区域 3：故障分类配置 */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Tag className="w-4.5 h-4.5 text-purple-600" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">前台「故障分类」下拉列表与激活配置</h4>
                    <p className="text-xs text-slate-500">
                      通过复选框勾选激活/停用；只有后台选中的项目前台下拉列表中才会显示。支持自由编辑名称与典型故障举例。
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg border border-purple-200">
                    已激活 {issueTypes.filter((it) => it.enabled !== false).length} / {issueTypes.length} 项
                  </span>
                </div>
              </div>

              {/* 租户继承提示条 */}
              {!schoolCode ? (
                <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2 text-indigo-900">
                    <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[11px] font-bold shrink-0">
                      👑 全局主租户模板
                    </span>
                    <span>
                      当前为主租户（主校区）后台。此处配置为全局默认项，<strong>所有未单独修改的子租户系统均会自动继承本页配置与激活状态</strong>。
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className={`p-3 border rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs ${
                    isIssueTypesInherited
                      ? 'bg-blue-50/90 border-blue-200 text-blue-900'
                      : 'bg-amber-50/90 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isIssueTypesInherited ? (
                      <>
                        <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[11px] font-bold shrink-0 flex items-center gap-1">
                          <Link className="w-3 h-3" />
                          正在继承主租户
                        </span>
                        <span>
                          当前本校故障分类<strong>实时自动继承主租户（主校区）配置</strong>。修改下方项目并点击保存后，将转换为本校专属独立配置。
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="px-2 py-0.5 bg-amber-600 text-white rounded text-[11px] font-bold shrink-0">
                          🏷️ 本校专属自定义配置
                        </span>
                        <span>
                          当前已保存本校专属故障分类配置，前台按本校配置独立显示（不再跟随主租户）。如需恢复实时跟随主租户，可点击右侧按钮：
                        </span>
                      </>
                    )}
                  </div>
                  {!isIssueTypesInherited && (
                    <button
                      type="button"
                      onClick={handleResetIssueTypesToMaster}
                      disabled={resettingInheritance}
                      className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1 transition-colors shadow-2xs"
                    >
                      {resettingInheritance ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      恢复继承主租户配置
                    </button>
                  )}
                </div>
              )}

              {/* 快捷批量操作工具栏 */}
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                <span className="text-xs font-semibold text-slate-700">分类项目列表（勾选左侧复选框即可控制前台显示/隐藏）：</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIssueTypes(issueTypes.map((it) => ({ ...it, enabled: true })))}
                    className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    全选激活
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssueTypes(issueTypes.map((it) => ({ ...it, enabled: false })))}
                    className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5" />
                    全部取消
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setIssueTypes([
                        { id: 'opt_hw', name: '硬件故障', desc: '投影灯泡、幕布升降、触摸失灵、电源开不了机', enabled: true },
                        { id: 'opt_sw', name: '软件系统', desc: '教学软件闪退、系统蓝屏、音视频解码异常', enabled: true },
                        { id: 'opt_net', name: '网络问题', desc: '教室网线断连、无网络信号、无法打开网页', enabled: true },
                        { id: 'opt_other', name: '其他', desc: '话筒啸叫、功放无声、遥控器失灵等', enabled: true },
                      ])
                    }
                    className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    重置标准4项
                  </button>
                </div>
              </div>

              {/* 分类子项列表卡片 */}
              <div className="space-y-2.5">
                {issueTypes.map((item, idx) => {
                  const isEnabled = item.enabled !== false;
                  return (
                    <div
                      key={item.id || idx}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isEnabled
                          ? 'bg-white border-blue-200/90 shadow-2xs'
                          : 'bg-slate-50/70 border-slate-200 opacity-75'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        {/* 复选激活开关 */}
                        <div className="shrink-0 flex items-center gap-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => {
                                const updated = [...issueTypes];
                                updated[idx].enabled = !isEnabled;
                                setIssueTypes(updated);
                              }}
                              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                            />
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                                isEnabled
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-slate-200 text-slate-500 border border-slate-300'
                              }`}
                            >
                              {isEnabled ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  已激活 · 前台显示
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  未激活 · 前台隐藏
                                </>
                              )}
                            </span>
                          </label>
                        </div>

                        {/* 分类名称编辑 */}
                        <div className="w-full sm:w-48 shrink-0">
                          <label className="block text-[10px] text-slate-400 mb-0.5 font-medium">分类名称</label>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const updated = [...issueTypes];
                              updated[idx].name = e.target.value;
                              setIssueTypes(updated);
                            }}
                            placeholder="如: 硬件故障"
                            className="w-full px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                          />
                        </div>

                        {/* 举例与说明编辑 */}
                        <div className="w-full sm:flex-1">
                          <label className="block text-[10px] text-slate-400 mb-0.5 font-medium">典型故障举例/提示说明 (括号内显示)</label>
                          <input
                            type="text"
                            value={item.desc || ''}
                            onChange={(e) => {
                              const updated = [...issueTypes];
                              updated[idx].desc = e.target.value;
                              setIssueTypes(updated);
                            }}
                            placeholder="如: 投影灯泡、幕布升降、触摸失灵、电源开不了机"
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                          />
                        </div>

                        {/* 排序与删除操作 */}
                        <div className="shrink-0 flex items-center gap-1 self-end sm:self-center pt-1 sm:pt-4">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => {
                              if (idx === 0) return;
                              const updated = [...issueTypes];
                              const temp = updated[idx];
                              updated[idx] = updated[idx - 1];
                              updated[idx - 1] = temp;
                              setIssueTypes(updated);
                            }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-400 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="上移"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === issueTypes.length - 1}
                            onClick={() => {
                              if (idx === issueTypes.length - 1) return;
                              const updated = [...issueTypes];
                              const temp = updated[idx];
                              updated[idx] = updated[idx + 1];
                              updated[idx + 1] = temp;
                              setIssueTypes(updated);
                            }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-400 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="下移"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (issueTypes.length <= 1) {
                                alert('至少保留一种故障分类选项');
                                return;
                              }
                              setIssueTypes(issueTypes.filter((_, i) => i !== idx));
                            }}
                            className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="删除此分类"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* 添加新故障分类卡片 */}
                <div className="p-3.5 bg-gradient-to-r from-blue-50/60 to-purple-50/50 border border-dashed border-blue-200 rounded-xl space-y-2.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <Plus className="w-4 h-4 text-blue-600" />
                    添加新故障分类
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        value={newTypeName}
                        onChange={(e) => setNewTypeName(e.target.value)}
                        placeholder="新分类名称 (如: 触控交互 / 广播音响)"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        value={newTypeDesc}
                        onChange={(e) => setNewTypeDesc(e.target.value)}
                        placeholder="简要举例 (如: 电子白板无笔触反应、喇叭破音)"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                    <div className="sm:col-span-3 flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer shrink-0 select-none">
                        <input
                          type="checkbox"
                          checked={newTypeEnabled}
                          onChange={(e) => setNewTypeEnabled(e.target.checked)}
                          className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300"
                        />
                        <span>默认激活</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (!newTypeName.trim()) {
                            alert('请输入新分类名称');
                            return;
                          }
                          setIssueTypes([
                            ...issueTypes,
                            {
                              id: `opt_${Date.now()}`,
                              name: newTypeName.trim(),
                              desc: newTypeDesc.trim(),
                              enabled: newTypeEnabled,
                            },
                          ]);
                          setNewTypeName('');
                          setNewTypeDesc('');
                          setNewTypeEnabled(true);
                        }}
                        className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        添加
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 前台任课教师端下拉效果实时预览 */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-blue-600" />
                    前台报修表单下拉效果实时预览（只有后台勾选激活的项目才会呈现）：
                  </span>
                  <span className="text-[11px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium">
                    前台实际呈现 {issueTypes.filter((it) => it.enabled !== false && it.name).length} 项
                  </span>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-300 shadow-2xs max-w-2xl">
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    故障分类 <span className="text-rose-500">*</span>
                  </label>
                  <div className="w-full px-3.5 py-2.5 border-2 border-blue-400 rounded-lg text-xs bg-blue-50/30 text-slate-900 flex items-center justify-between font-medium">
                    <span>
                      {issueTypes.filter((it) => it.enabled !== false && it.name).length > 0
                        ? `${issueTypes.filter((it) => it.enabled !== false && it.name)[0].name} ${
                            issueTypes.filter((it) => it.enabled !== false && it.name)[0].desc
                              ? `(${issueTypes.filter((it) => it.enabled !== false && it.name)[0].desc})`
                              : ''
                          }`
                        : '（暂无激活项，前台将降级显示通用选项）'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-blue-600" />
                  </div>

                  {/* 模拟展开的下拉选项列表 */}
                  <div className="mt-2 border border-slate-200 rounded-lg bg-white overflow-hidden shadow-xs divide-y divide-slate-100">
                    {issueTypes
                      .filter((it) => it.enabled !== false && it.name)
                      .map((it, idx) => (
                        <div
                          key={idx}
                          className={`px-3.5 py-2 text-xs flex items-center justify-between ${
                            idx === 0 ? 'bg-blue-600 text-white font-medium' : 'text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <span>
                            {it.name} {it.desc ? <span className={idx === 0 ? 'text-blue-100' : 'text-slate-500 font-normal'}>({it.desc})</span> : ''}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              idx === 0 ? 'bg-blue-500 text-white' : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            前台可见
                          </span>
                        </div>
                      ))}
                    {issueTypes.filter((it) => it.enabled !== false && it.name).length === 0 && (
                      <div className="px-3.5 py-2 text-xs text-rose-500 text-center">
                        当前所有项均已取消勾选，前台将仅显示保底通用项。请至少勾选激活 1 个分类。
                      </div>
                    )}
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

      {/* 模块三：大模型参数配置与连通性测试（仅超级管理员可见） */}
      {adminTab === 'ai_config' && !isTechnician && (
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

      {/* 恢复默认系统配置确认弹窗（仅超级管理员可用） */}
      {showResetConfirmModal && !isTechnician && (
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

      {/* 模块四：子租户管理（单域名多服务网关，仅超级管理员可见） */}
      {adminTab === 'tenants' && !isTechnician && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Network className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">添加子租户服务</h3>
                <p className="text-xs text-slate-500">
                  将新的容器服务挂到同一域名的子路径下（单入口，免开新端口）。要求：目标容器已加入
                  mynet 网络；建议服务以子路径为根运行（如 Streamlit 配 baseUrlPath）。保存后网关
                  10 秒内自动热加载，无需重启任何容器。
                  <span className="text-amber-700">
                    注意：本模块仅用于挂载外部容器服务；入驻学校无需在此配置，请使用下方「入驻学校管理」。
                  </span>
                </p>
              </div>
            </div>

            {tenantMsg && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                  tenantMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                {tenantMsg.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                {tenantMsg.text}
              </div>
            )}

            <form onSubmit={handleAddTenant} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">租户名称</label>
                <input
                  type="text"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  placeholder="如：综合素质评价系统"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  子路径（挂载点，如 /zhpj/）
                </label>
                <input
                  type="text"
                  value={newTenant.subpath}
                  onChange={(e) => setNewTenant({ ...newTenant, subpath: e.target.value })}
                  placeholder="/zhpj/"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  上游容器主机名（mynet 网络内的容器名）
                </label>
                <input
                  type="text"
                  value={newTenant.upstream_host}
                  onChange={(e) => setNewTenant({ ...newTenant, upstream_host: e.target.value })}
                  placeholder="如：zhpj"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">容器内部端口</label>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={newTenant.upstream_port}
                  onChange={(e) => setNewTenant({ ...newTenant, upstream_port: e.target.value })}
                  placeholder="如：3000"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加子租户
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-slate-700" />
                <h3 className="text-base font-bold text-slate-900">
                  网关子服务 · 外部容器（{tenants.length}）
                </h3>
              </div>
              <button
                onClick={fetchTenants}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                title="刷新列表"
              >
                <RefreshCw className={`w-4 h-4 ${tenantsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {tenants.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                暂无子租户，使用上方表单添加第一个服务
              </p>
            ) : (
              <div className="space-y-2.5">
                {tenants.map((t) => (
                  <div
                    key={t.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-colors ${
                      t.enabled ? 'bg-slate-50 border-slate-200' : 'bg-slate-100/60 border-slate-200 opacity-70'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-800">{t.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            t.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {t.enabled ? '运行中' : '已停用'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-1 truncate">
                        {window.location.origin}
                        {t.subpath} → {t.upstream_host}:{t.upstream_port}
                      </div>
                      {(() => {
                        const codeKey = t.subpath.split('/').join('');
                        const clash = schoolsList.find((s) => s.code === codeKey);
                        return clash ? (
                          <div className="mt-1.5 text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1.5 leading-relaxed">
                            ⚠ 与入驻学校「{clash.name}」代码重名：学校入口由主应用内部路由（/s/{codeKey}/），
                            此网关租户无效，建议点右侧删除清理
                          </div>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleToggleTenant(t)}
                        disabled={tenantBusyId === t.id}
                        className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg cursor-pointer flex items-center gap-1 transition-colors border ${
                          t.enabled
                            ? 'bg-white hover:bg-amber-50 text-slate-600 hover:text-amber-700 border-slate-200'
                            : 'bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border-slate-200'
                        }`}
                        title={t.enabled ? '停用该路由' : '启用该路由'}
                      >
                        <Power className="w-3.5 h-3.5" />
                        {t.enabled ? '停用' : '启用'}
                      </button>
                      <button
                        onClick={() => handleDeleteTenant(t)}
                        disabled={tenantBusyId === t.id}
                        className="px-2.5 py-1.5 text-[11px] font-medium bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                        title="删除该租户"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-100 pt-3">
              路由原理：网关容器每 10 秒从本系统拉取一次渲染好的 nginx 配置，经 <code>nginx -t</code>
              校验后原子替换并热重载；校验失败自动回滚，不影响现有访问。
            </p>
          </div>

          {/* 入驻学校管理（单库多校 · 数据隔离） */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Building2 className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">入驻学校管理</h3>
                <p className="text-xs text-slate-500">
                  兄弟学校「零部署、零经费」入驻：填写学校代码即生成专属入口
                  <code className="mx-1">/?tenant=代码</code> 或 <code className="mx-1">/s/代码/</code>，
                  工单、统计、数据全部按校隔离，师生只能看到自己的学校。「设为默认」后，直接访问
                  <code className="mx-1">/</code> 即进入该校。
                </p>
              </div>
            </div>

            <form onSubmit={handleAddSchool} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">学校名称 *</label>
                <input
                  type="text"
                  value={newSchool.name}
                  onChange={(e) => setNewSchool({ ...newSchool, name: e.target.value })}
                  placeholder="如：耿棚中学"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">学校代码（入口路径）*</label>
                <input
                  type="text"
                  value={newSchool.code}
                  onChange={(e) => setNewSchool({ ...newSchool, code: e.target.value })}
                  placeholder="如：gengpeng"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">副标题（选填）</label>
                <input
                  type="text"
                  value={newSchool.subtitle}
                  onChange={(e) => setNewSchool({ ...newSchool, subtitle: e.target.value })}
                  placeholder="如：多媒体教室设备日常报修与排查"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-3">
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  学校入驻
                </button>
              </div>
            </form>

            <div className="space-y-2.5">
              {schoolsList.map((s) => (
                <div
                  key={s.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-colors ${
                    s.enabled ? 'bg-slate-50 border-slate-200' : 'bg-slate-100/60 border-slate-200 opacity-70'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <img
                        src={s.logo_url ? imgProxy(s.logo_url) : '/logo.png'}
                        alt={`${s.name} 校徽`}
                        className="w-7 h-7 rounded-full object-contain border border-slate-200 bg-white p-0.5 shrink-0"
                        onError={(e) => {
                          e.currentTarget.src = '/school-badge.svg';
                        }}
                      />
                      <span className="text-sm font-bold text-slate-800">{s.name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          s.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        {s.enabled ? '入驻中' : '已停用'}
                      </span>
                      {s.is_default && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-600 text-white">
                          默认子租户
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-1 flex items-center gap-1.5 flex-wrap">
                      <span>/s/{s.code}/</span>
                      {s.subtitle && <span className="font-sans">· {s.subtitle}</span>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <label
                        className="px-2 py-1 text-[10px] font-medium bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 rounded-md cursor-pointer transition-colors flex items-center gap-1"
                        title="上传该校自己的校徽（存储于 Cloudinary，师生端即时生效）"
                      >
                        <Camera className="w-3 h-3" />
                        {s.logo_url ? '更换校徽' : '上传校徽'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={tenantBusyId === s.id}
                          onChange={(e) => handleUploadSchoolLogo(s, e)}
                        />
                      </label>
                      <input
                        type="text"
                        defaultValue={s.display_title || ''}
                        onBlur={(e) => handleSaveSchoolTitle(s, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        placeholder={`浏览器标题（默认：${s.name}班班通报修管理系统）`}
                        title="留空则自动使用「校名 + 班班通报修管理系统」；失焦或回车保存"
                        className="w-56 px-2 py-1 text-[10px] bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-blue-400 focus:outline-hidden text-slate-600 placeholder:text-slate-300"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={`/s/${s.code}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 text-[11px] font-medium bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                      title="打开该校专属入口"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      访问
                    </a>
                    {!s.is_default && s.enabled && (
                      <button
                        onClick={() => handleSetDefaultSchool(s)}
                        title="设为默认子租户：直接访问 / 即进入该校"
                        className="px-2.5 py-1.5 text-[11px] font-medium bg-white hover:bg-blue-600 hover:text-white text-blue-700 border border-blue-200 rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        设为默认
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleSchool(s)}
                      className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg cursor-pointer flex items-center gap-1 transition-colors border ${
                        s.enabled
                          ? 'bg-white hover:bg-amber-50 text-slate-600 hover:text-amber-700 border-slate-200'
                          : 'bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border-slate-200'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      {s.enabled ? '停用' : '启用'}
                    </button>
                    {s.id !== 1 && !s.is_default && (
                      <button
                        onClick={() => handleDeleteSchool(s)}
                        className="px-2.5 py-1.5 text-[11px] font-medium bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                        title="移除该校（仅无工单且非默认时可移除）"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {schoolsList.length === 0 && !schoolsLoading && (
                <p className="text-xs text-slate-400 py-4 text-center">暂无入驻学校</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 模块五：角色与会员管理（超级用户管理，仅超级管理员可见） */}
      {adminTab === 'users' && !isTechnician && (
        <div className="space-y-6 animate-fadeIn">
          {userActionMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-2 ${
                userActionMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <span>{userActionMsg.text}</span>
              <button
                type="button"
                onClick={() => setUserActionMsg(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ×
              </button>
            </div>
          )}

          {/* 顶栏说明与操作卡片 */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  角色与会员管理（超级用户管理）
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  手机号即为系统登录用户名，报修时自动注册会员并识别绑定设备识别码（Device ID）。同一用户若在另一台设备再次提交，系统将自动解绑旧设备并重新绑定新设备；管理员亦可在此一键手动解绑与维护角色权限。
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={fetchUsers}
                  disabled={loadingUsers}
                  className="px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                  刷新列表
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewUserName('');
                    setNewUserPhone('');
                    setNewUserRole('teacher');
                    setIsAddUserModalOpen(true);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增会员用户
                </button>
              </div>
            </div>

            {/* 核心指标统计 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-3">
                <p className="text-[11px] text-purple-600 font-medium">总注册会员数</p>
                <p className="text-xl font-bold text-purple-900 mt-0.5">{users.length}</p>
                <p className="text-[10px] text-purple-400 mt-0.5">手机号自动建档</p>
              </div>
              <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3">
                <p className="text-[11px] text-emerald-600 font-medium">已绑定设备数</p>
                <p className="text-xl font-bold text-emerald-900 mt-0.5">
                  {users.filter((u) => u.device_id && u.device_id.trim()).length}
                </p>
                <p className="text-[10px] text-emerald-500 mt-0.5">支持一键解绑重绑</p>
              </div>
              <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3">
                <p className="text-[11px] text-blue-600 font-medium">教师 / 报修人员</p>
                <p className="text-xl font-bold text-blue-900 mt-0.5">
                  {users.filter((u) => u.role === 'teacher').length}
                </p>
                <p className="text-[10px] text-blue-400 mt-0.5">前台提交自动注册</p>
              </div>
              <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3">
                <p className="text-[11px] text-amber-600 font-medium">运维工程师 / 管理员</p>
                <p className="text-xl font-bold text-amber-900 mt-0.5">
                  {users.filter((u) => u.role !== 'teacher').length}
                </p>
                <p className="text-[10px] text-amber-500 mt-0.5">技术处理与系统授权</p>
              </div>
            </div>

            {/* 搜索过滤栏 */}
            <div className="pt-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-t border-slate-100">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') fetchUsers();
                  }}
                  placeholder="搜索会员姓名、手机号、用户名或设备ID..."
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500 transition-all"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={userRoleFilter}
                  onChange={(e) => {
                    setUserRoleFilter(e.target.value);
                  }}
                  className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">全部角色</option>
                  <option value="teacher">报修教师 (teacher)</option>
                  <option value="technician">维修工程师 (technician)</option>
                  <option value="operator">租户操作员 (operator)</option>
                  <option value="admin">校级管理员 (admin)</option>
                  <option value="superadmin">超级管理员 (superadmin)</option>
                </select>

                <select
                  value={userBoundFilter}
                  onChange={(e) => {
                    setUserBoundFilter(e.target.value as any);
                  }}
                  className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">全部设备状态</option>
                  <option value="bound">仅看已绑定设备</option>
                  <option value="unbound">仅看未绑定设备</option>
                </select>

                <button
                  type="button"
                  onClick={fetchUsers}
                  className="px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-xl cursor-pointer transition-colors"
                >
                  筛选查询
                </button>
              </div>
            </div>
          </div>

          {/* 会员与用户列表 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900">
                  会员列表（共 {users.length} 位）
                </h4>
                <span className="text-[11px] text-slate-400">
                  前台匿名提交报修后自动入驻，可在此集中管理角色与设备
                </span>
              </div>
            </div>

            {loadingUsers ? (
              <div className="py-16 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                正在加载会员与角色数据...
              </div>
            ) : users.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <Users className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm text-slate-500 font-medium">暂无符合条件的会员记录</p>
                <p className="text-xs text-slate-400">
                  前台教师首次提交报修后，系统将自动录入并绑定其设备
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                      <th className="py-3 px-4">会员姓名 & 手机号/用户名</th>
                      <th className="py-3 px-4">角色身份</th>
                      <th className="py-3 px-4">绑定设备 (Device ID)</th>
                      <th className="py-3 px-4">工单报修统计</th>
                      <th className="py-3 px-4">所属学校</th>
                      <th className="py-3 px-4">账号状态</th>
                      <th className="py-3 px-4 text-right">管理操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => {
                      const isBound = !!(u.device_id && u.device_id.trim());
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* 会员姓名 & 手机号/用户名 */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                                {u.name ? u.name.slice(0, 1) : '用'}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                                  <span>{u.name || '未署名'}</span>
                                  {!u.enabled && (
                                    <span className="text-[10px] bg-rose-50 text-rose-600 px-1.5 py-0.2 rounded border border-rose-200">
                                      已停用
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span>{u.phone}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 角色身份 */}
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <select
                                value={u.role || 'teacher'}
                                onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                                className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                                  u.role === 'superadmin'
                                    ? 'bg-purple-50 text-purple-800 border-purple-200'
                                    : u.role === 'admin'
                                    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                    : u.role === 'operator'
                                    ? 'bg-purple-50 text-purple-800 border-purple-200'
                                    : u.role === 'technician'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-blue-50 text-blue-800 border-blue-200'
                                }`}
                              >
                                <option value="teacher">报修教师 (teacher)</option>
                                <option value="operator">租户操作员 / 调度员 (operator)</option>
                                <option value="technician">维修工程师 (technician)</option>
                                <option value="admin">校级管理员 (admin)</option>
                                <option value="superadmin">超级管理员 (superadmin)</option>
                              </select>
                            </div>
                          </td>

                          {/* 绑定设备 (Device ID) & 解绑按钮 */}
                          <td className="py-3 px-4">
                            {isBound ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                  <Smartphone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span
                                    className="font-mono text-[11px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded"
                                    title={u.device_id || ''}
                                  >
                                    {(u.device_id || '').slice(0, 14)}...
                                  </span>
                                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                                    已绑定
                                  </span>
                                </div>
                                <div>
                                  <button
                                    type="button"
                                    disabled={unbindingUserId === u.id}
                                    onClick={() => handleUnbindDevice(u)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md transition-colors cursor-pointer"
                                    title="解除此设备与该会员的绑定关系"
                                  >
                                    <Unlink className="w-3 h-3 text-rose-600" />
                                    {unbindingUserId === u.id ? '正在解绑...' : '解绑设备'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-slate-400">
                                <Smartphone className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                <span className="text-[11px]">未绑定设备（下次提交自动绑定）</span>
                              </div>
                            )}
                          </td>

                          {/* 报修统计 */}
                          <td className="py-3 px-4">
                            <div className="space-y-0.5">
                              <span className="font-semibold text-slate-800 text-xs">
                                {u.ticket_count || 0} 张工单
                              </span>
                              <div className="text-[11px] text-slate-400">
                                {u.last_ticket_at
                                  ? `最近: ${new Date(u.last_ticket_at).toLocaleDateString()}`
                                  : '尚未报修'}
                              </div>
                            </div>
                          </td>

                          {/* 所属学校 */}
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1 text-slate-700 font-medium text-xs">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              {u.school_name || '耿棚中学'}
                            </span>
                          </td>

                          {/* 账号状态 */}
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(u.id)}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer transition-colors ${
                                u.enabled
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-rose-50 hover:text-rose-700'
                                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-emerald-50 hover:text-emerald-700'
                              }`}
                              title="点击切换启用/停用"
                            >
                              {u.enabled ? '正常启用' : '已停用'}
                            </button>
                          </td>

                          {/* 管理操作 */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingUser(u)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="编辑会员资料"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="删除此会员用户"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 新增用户弹窗 */}
          {isAddUserModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-600" />
                    手动新增会员/用户
                  </h3>
                  <button
                    onClick={() => setIsAddUserModalOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleAddUser} className="space-y-3.5 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      手机号码（将作为系统登录用户名） <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      placeholder="例如：13800138000"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      会员姓名 / 称谓 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="例如：张老师 / 李工"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">角色权限</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                    >
                      <option value="teacher">报修教师 (teacher) - 默认会员</option>
                      <option value="operator">租户操作员 / 调度员 (operator) - 审核工单与派单</option>
                      <option value="technician">维修工程师 (technician) - 技术维修</option>
                      <option value="admin">校级管理员 (admin) - 学校运维管理</option>
                      <option value="superadmin">超级管理员 (superadmin) - 全部管理权限</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">所属学校</label>
                    <select
                      value={newUserSchoolId}
                      onChange={(e) => setNewUserSchoolId(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                    >
                      {schoolsList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                      {schoolsList.length === 0 && <option value={1}>耿棚中学 (gpzx)</option>}
                    </select>
                  </div>

                  <p className="text-[11px] text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    💡 提示：该用户添加后，当其在前台提交报修时系统将自动识别其会员身份并自动绑定该发起设备。
                  </p>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddUserModalOpen(false)}
                      className="flex-1 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold cursor-pointer shadow-2xs"
                    >
                      保存新增
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* 编辑用户弹窗 */}
          {editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Edit2 className="w-5 h-5 text-blue-600" />
                    编辑会员资料
                  </h3>
                  <button
                    onClick={() => setEditingUser(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveEditUser} className="space-y-3.5 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      手机号码 / 用户名 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={editingUser.phone}
                      onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      会员姓名 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editingUser.name}
                      onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">角色权限</label>
                    <select
                      value={editingUser.role}
                      onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    >
                      <option value="teacher">报修教师 (teacher)</option>
                      <option value="operator">租户操作员 / 调度员 (operator)</option>
                      <option value="technician">维修工程师 (technician)</option>
                      <option value="admin">校级管理员 (admin)</option>
                      <option value="superadmin">超级管理员 (superadmin)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">当前绑定设备</label>
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="font-mono text-[11px] text-slate-600 truncate max-w-[200px]">
                        {editingUser.device_id || '暂未绑定设备'}
                      </span>
                      {editingUser.device_id && (
                        <button
                          type="button"
                          onClick={() => {
                            handleUnbindDevice(editingUser);
                            setEditingUser({ ...editingUser, device_id: null });
                          }}
                          className="px-2 py-0.5 text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md cursor-pointer"
                        >
                          立即解绑
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="flex-1 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-2xs"
                    >
                      保存更新
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 租户操作员 / 调度员 审核与指派维修工弹窗 (审核与派单机制) */}
      {dispatchTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    审核工单并派单 (#{dispatchTicket.id})
                  </h3>
                  <p className="text-xs text-slate-500">
                    由租户操作员审核报修诉求，并指定具体维修工程师负责现场排查
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDispatchTicket(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 工单基本信息摘要 */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">教室/位置：</span>
                <span className="font-bold text-slate-900">📍 {dispatchTicket.location}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">故障类型：</span>
                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                  {dispatchTicket.issue_type}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">报修教师：</span>
                <span className="text-slate-800 font-medium">
                  {dispatchTicket.teacher_name || '未提供'} ({dispatchTicket.phone || '无电话'})
                </span>
              </div>
              <div className="pt-1 border-t border-slate-200 text-slate-700">
                <span className="text-slate-500">故障自述：</span>
                <span>{dispatchTicket.description}</span>
              </div>
            </div>

            {/* 选择派发维修工 */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 flex items-center gap-1">
                  <span>选择指派负责的维修工 / 工程师</span>
                  <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={fetchTechnicians}
                  className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingTechnicians ? 'animate-spin' : ''}`} />
                  刷新人员
                </button>
              </div>

              {loadingTechnicians ? (
                <div className="p-4 text-center text-slate-400">正在查询本校维修工程师...</div>
              ) : schoolTechnicians.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                  ⚠️ 本校尚未添加维修工程师账号。请在「角色与会员管理」中添加或将用户角色修改为「维修工程师 (technician)」。
                </div>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {schoolTechnicians.map((tech) => {
                    const isSelected = selectedTechId === tech.id;
                    return (
                      <label
                        key={tech.id}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-purple-50/80 border-purple-400 shadow-2xs ring-1 ring-purple-300'
                            : 'bg-white hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="selected_technician"
                            value={tech.id}
                            checked={isSelected}
                            onChange={() => setSelectedTechId(tech.id)}
                            className="text-purple-600 focus:ring-purple-500"
                          />
                          <div>
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                              <span>{tech.name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-semibold">
                                {tech.role === 'technician' ? '维修工' : '操作员'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              {tech.phone}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                              (tech.active_tickets_count || 0) > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            待办: {tech.active_tickets_count || 0} 件
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 调度派单指导说明或备注 */}
            <div className="space-y-1 text-xs">
              <label className="font-bold text-slate-800">
                审核派单说明 / 调度备注（可选，维修工与教师均可见）：
              </label>
              <textarea
                rows={2}
                value={dispatchNoteInput}
                onChange={(e) => setDispatchNoteInput(e.target.value)}
                placeholder="例如：已安排张师傅下午第3节课前带备用灯泡上门排查，请教师保持电话畅通..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDispatchTicket(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDispatch}
                disabled={dispatchingAction || !selectedTechId}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
              >
                {dispatchingAction ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <SendHorizonal className="w-3.5 h-3.5" />
                )}
                确认指派维修工
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导出报修数据 Excel 弹窗 */}
      <ExportTicketsModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        tickets={tickets}
        filteredTickets={filteredTickets}
        schoolName={schoolCode ? (currentSystemTitle || '耿棚中学') : (currentUser?.school_name || currentSystemTitle || '耿棚中学')}
        schoolCode={schoolCode || currentUser?.school_code || ''}
        currentUserName={currentUser?.name || '运维人员'}
        currentUserRole={currentUser?.role === 'technician' ? '运维工程师' : currentUser?.role === 'operator' ? '租户操作员' : currentUser?.role === 'superadmin' ? '超级管理员' : '管理员'}
        onExportSuccess={(fileName, count) => {
          setSaveToast(`✅ 成功导出 ${count} 条报修数据至 Excel 文件「${fileName}」！`);
          setTimeout(() => setSaveToast(null), 4500);
        }}
      />
    </div>
  );
};
