import React, { useState, useEffect, useCallback } from 'react';
import { TeacherView } from './components/TeacherView';
import { AdminView } from './components/AdminView';
import { Wrench } from 'lucide-react';

// 图片经同域 /api/img 代理加载（浏览器直连 res.cloudinary.com 在大陆网络不可靠）
const imgProxy = (u?: string | null) => (u ? `/api/img?u=${encodeURIComponent(u)}` : '');

interface SchoolInfo {
  id: number;
  code: string;
  name: string;
  subtitle: string | null;
  logo_url?: string | null;
  display_title?: string | null;
}

// Tenant entry styles (all resolve to one school context):
//   /                    -> default tenant (admin-configurable, e.g. gpzx)
//   /?tenant=hqzx        -> HuangQiao Middle School tenant
//   /s/<code>/...        -> legacy path style, still supported
// Each tenant only ever sees its own school — no cross-school switcher UI.

interface CachedUser {
  id: number;
  username: string;
  name: string;
  phone?: string;
  role: 'superadmin' | 'admin' | 'operator' | 'technician' | 'teacher';
  school_id?: number | null;
  school_name?: string | null;
  school_code?: string | null;
  device_id?: string | null;
}

const getCachedUser = (): CachedUser | null => {
  try {
    const token = localStorage.getItem('bbt_auth_token');
    const userStr = localStorage.getItem('bbt_auth_user');
    if (!token || !userStr) return null;
    const u = JSON.parse(userStr);
    if (u && (u.role === 'technician' || u.role === 'operator' || u.role === 'admin' || u.role === 'superadmin')) {
      return u;
    }
  } catch {
    return null;
  }
  return null;
};

export default function App() {
  const readRequestedCode = (): string => {
    const param = new URLSearchParams(window.location.search).get('tenant');
    if (param && param.trim()) return param.trim().toLowerCase();
    const m = window.location.pathname.match(/^\/s\/([a-z0-9-]+)/i);
    if (m) return m[1].toLowerCase();

    // 持久化登录：若已登录运维工程师或租户操作员且非主动切回教师前台，自动定位到其归属学校代码
    const isTeacherView = sessionStorage.getItem('bbt_view_teacher_home') === 'true';
    if (!isTeacherView) {
      const cached = getCachedUser();
      if ((cached?.role === 'technician' || cached?.role === 'operator') && cached.school_code) {
        return cached.school_code.toLowerCase();
      }
    }
    return '';
  };

  const readIsAdmin = (): boolean => {
    const path = window.location.pathname;
    const search = window.location.search;
    const hash = window.location.hash;
    const isExplicitAdminUrl = (
      path.startsWith('/admin') ||
      /^\/s\/[^/]+\/admin/.test(path) ||
      search.includes('admin') ||
      search.includes('page=admin') ||
      hash.includes('admin')
    );
    if (isExplicitAdminUrl) return true;

    // 持久化登录检测：若本地缓存了运维工程师或租户操作员身份，且本会话中未主动选择预览教师前台，则自动进入管理工作台
    const isTeacherView = sessionStorage.getItem('bbt_view_teacher_home') === 'true';
    if (!isTeacherView) {
      const cached = getCachedUser();
      if (cached && (cached.role === 'technician' || cached.role === 'operator')) {
        return true;
      }
    }
    return false;
  };

  const [cachedUser, setCachedUser] = useState<CachedUser | null>(getCachedUser);
  const [requestedCode, setRequestedCode] = useState<string>(readRequestedCode);
  const [isAdmin, setIsAdmin] = useState<boolean>(readIsAdmin);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [schoolResolved, setSchoolResolved] = useState(false);

  const [systemTitle, setSystemTitle] = useState('耿中班班通报修管理系统');
  const [systemSubtitle, setSystemSubtitle] = useState('耿棚中学 · 多媒体教室设备日常报修与排查');

  // 运维工程师与租户操作员持久化登录自动跳转与免密进入
  useEffect(() => {
    const token = localStorage.getItem('bbt_auth_token');
    const cached = getCachedUser();
    if (!token || !cached) return;

    setCachedUser(cached);

    // 若当前未主动点击“返回教师前台”，操作员/运维工程师重新进入页面时自动跳转专属租户后台
    const isTeacherView = sessionStorage.getItem('bbt_view_teacher_home') === 'true';
    if (!isTeacherView && (cached.role === 'technician' || cached.role === 'operator')) {
      const targetSchoolCode = cached.school_code ? cached.school_code.toLowerCase() : '';
      const currentPath = window.location.pathname;
      const expectedPath = targetSchoolCode ? `/s/${targetSchoolCode}/admin` : '/admin';

      if (currentPath !== expectedPath && !currentPath.endsWith('/admin')) {
        window.history.replaceState({}, '', expectedPath);
      }
      if (targetSchoolCode) {
        setRequestedCode(targetSchoolCode);
      }
      setIsAdmin(true);

      // 同步当前 tab 的会话缓存
      sessionStorage.setItem('bbt_admin_auth', 'true');
      sessionStorage.setItem('bbt_current_user', JSON.stringify(cached));
    }

    // 后台静默校验 token 有效性，防止管理员在后台禁用或删除了该运维人员
    fetch('/api/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, user_id: cached.id }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.valid && data.user) {
          localStorage.setItem('bbt_auth_user', JSON.stringify(data.user));
          sessionStorage.setItem('bbt_current_user', JSON.stringify(data.user));
          setCachedUser(data.user);
        } else if (data && data.valid === false) {
          // Token 失效或已被停用，清理持久化凭据
          localStorage.removeItem('bbt_auth_token');
          localStorage.removeItem('bbt_auth_user');
          sessionStorage.removeItem('bbt_admin_auth');
          sessionStorage.removeItem('bbt_current_user');
          setCachedUser(null);
          setIsAdmin(false);
        }
      })
      .catch((err) => {
        console.warn('Silent token validation error:', err);
      });
  }, []);

  const loadSystemConfig = () => {
    // Values only — document.title is owned by the school-resolution effect
    // below (prevents the GLOBAL title overwriting a tenant title on race)
    fetch('/api/system-config')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.system_title) setSystemTitle(data.system_title);
        if (data && data.system_subtitle) setSystemSubtitle(data.system_subtitle);
      })
      .catch((err) => console.error('Failed to load system config title:', err));
  };

  // Resolve the tenant: ?tenant= / /s/<code>/ wins, else default tenant
  const resolveSchool = useCallback(async (code: string) => {
    try {
      const q = code ? `?tenant=${encodeURIComponent(code)}` : '';
      const res = await fetch(`/api/schools${q}`);
      const data = await res.json();
      setSchool(data && data.school ? data.school : null);
    } catch {
      setSchool(null);
    } finally {
      setSchoolResolved(true);
    }
  }, []);

  useEffect(() => {
    loadSystemConfig();
  }, []);

  useEffect(() => {
    resolveSchool(requestedCode);
  }, [requestedCode, resolveSchool]);

  useEffect(() => {
    const handleUrlChange = () => {
      setRequestedCode(readRequestedCode());
      setIsAdmin(readIsAdmin());
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Friendly alias: /<code>/ (e.g. /hqzx) -> /?tenant=<code>
  useEffect(() => {
    const m = window.location.pathname.match(/^\/([a-z0-9][a-z0-9-]*)\/?$/i);
    if (!m) return;
    const seg = m[1].toLowerCase();
    if (['s', 'admin', 'api', 'assets', 'pyapp'].includes(seg)) return;
    // Only redirect when the segment actually matches the current tenant
    // resolution would differ — simplest: let server resolver decide via param
    window.history.replaceState({}, '', `/?tenant=${seg}`);
    setRequestedCode(seg);
  }, []);

  const effectiveCode = school?.code || '';

  // Super admin (/admin, no tenant in URL) sees the platform-wide title;
  // tenant visitors (incl. default tenant at /) see their own school name
  const headerTitle = !requestedCode && isAdmin ? systemTitle : school?.name || systemTitle;
  const headerSubtitle = !requestedCode && isAdmin ? systemSubtitle : school?.subtitle || systemSubtitle;

  // Single owner of document.title + favicon (no race with global config):
  // tenant page -> "<校名>班班通报修管理系统" (or custom display_title) + own logo;
  // super admin / page before resolution -> platform title
  useEffect(() => {
    if (school) {
      document.title = school.display_title || `${school.name}班班通报修管理系统`;
      if (school.logo_url) {
        let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = imgProxy(school.logo_url);
      }
    } else if (schoolResolved) {
      document.title = systemTitle;
    }
  }, [school, schoolResolved, systemTitle]);

  useEffect(() => {
    const handleStorage = () => {
      setCachedUser(getCachedUser());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const navigateToHome = () => {
    // 标记当前会话已主动切回教师前台，避免被自动重定向逻辑死循环拦截
    sessionStorage.setItem('bbt_view_teacher_home', 'true');
    setCachedUser(getCachedUser());

    // Preserve the entry style the visitor used (?tenant= or /s/ or plain /)
    const search = window.location.search;
    const path = window.location.pathname;
    if (search.includes('tenant=')) {
      window.history.pushState({}, '', effectiveCode ? `/?tenant=${effectiveCode}` : '/');
    } else if (/^\/s\//.test(path)) {
      window.history.pushState({}, '', effectiveCode ? `/s/${effectiveCode}/` : '/');
    } else {
      window.history.pushState({}, '', effectiveCode ? `/s/${effectiveCode}/` : '/');
    }
    setIsAdmin(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* 极简顶部标题栏（每租户只呈现自己的学校） */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div onClick={navigateToHome} className="flex items-center gap-3 cursor-pointer select-none min-w-0">
            <img
              src={school?.logo_url ? imgProxy(school.logo_url) : '/logo.png'}
              alt="校徽"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full object-contain shadow-2xs border border-slate-200 bg-white p-0.5 shrink-0"
              onError={(e) => {
                e.currentTarget.src = '/school-badge.svg';
              }}
            />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">
                {headerTitle}
              </h1>
              <p className="text-[11px] text-slate-500 hidden sm:block truncate">{headerSubtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin ? (
              <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold border border-blue-100 shrink-0">
                {cachedUser?.role === 'operator'
                  ? `${school?.name || requestedCode || '本校'} · 租户调度操作员 (${cachedUser.name})`
                  : cachedUser?.role === 'technician'
                  ? `${school?.name || requestedCode || '本校'} · 维修工程师 (${cachedUser.name})`
                  : requestedCode
                  ? `${school?.name || requestedCode} · 校级后台`
                  : '超级后台 · 全部租户'}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem('bbt_view_teacher_home');
                  const nextTenant = cachedUser?.school_code || effectiveCode;
                  const nextUrl = nextTenant ? `/s/${nextTenant}/admin` : '/admin';
                  window.history.pushState({}, '', nextUrl);
                  if (nextTenant) setRequestedCode(nextTenant);
                  setIsAdmin(true);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-blue-700 hover:bg-blue-50/80 border border-slate-200 hover:border-blue-200 rounded-lg transition-all cursor-pointer shadow-2xs select-none"
                title="运维工程师与管理员工作台入口"
              >
                <Wrench className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">
                  {cachedUser
                    ? `${cachedUser.name} · ${cachedUser.role === 'operator' ? '调度看板' : '工作台'}`
                    : '运维工作台'}
                </span>
                <span className="sm:hidden">{cachedUser ? cachedUser.name : '运维'}</span>
              </button>
            )}
          </div>
        </div>
      </header>


      {/* 主体视图区域：教师端待租户解析完成后挂载，确保数据按校隔离 */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8">
        {isAdmin ? (
          <AdminView
            key={requestedCode}
            schoolCode={requestedCode}
            onBackToHome={navigateToHome}
            currentSystemTitle={headerTitle}
            currentSystemSubtitle={headerSubtitle}
            onSystemConfigUpdated={(newTitle, newSub) => {
              if (newTitle) {
                setSystemTitle(newTitle);
                document.title = newTitle;
              }
              if (newSub) {
                setSystemSubtitle(newSub);
              }
            }}
          />
        ) : schoolResolved ? (
          <TeacherView
            key={effectiveCode}
            systemTitle={headerTitle}
            schoolCode={effectiveCode}
          />
        ) : (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">
            正在进入本校报修入口...
          </div>
        )}
      </main>
    </div>
  );
}
