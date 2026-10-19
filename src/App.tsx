import React, { useState, useEffect, useCallback } from 'react';
import { TeacherView } from './components/TeacherView';
import { AdminView } from './components/AdminView';

interface SchoolInfo {
  id: number;
  code: string;
  name: string;
  subtitle: string | null;
}

// Tenant entry styles (all resolve to one school context):
//   /                    -> default tenant (admin-configurable, e.g. gpzx)
//   /?tenant=hqzx        -> HuangQiao Middle School tenant
//   /s/<code>/...        -> legacy path style, still supported
// Each tenant only ever sees its own school — no cross-school switcher UI.
export default function App() {
  const readRequestedCode = (): string => {
    const param = new URLSearchParams(window.location.search).get('tenant');
    if (param && param.trim()) return param.trim().toLowerCase();
    const m = window.location.pathname.match(/^\/s\/([a-z0-9-]+)/i);
    return m ? m[1].toLowerCase() : '';
  };

  const readIsAdmin = (): boolean => {
    const path = window.location.pathname;
    const search = window.location.search;
    const hash = window.location.hash;
    return (
      path.startsWith('/admin') ||
      /^\/s\/[^/]+\/admin/.test(path) ||
      search.includes('admin') ||
      search.includes('page=admin') ||
      hash.includes('admin')
    );
  };

  const [requestedCode, setRequestedCode] = useState<string>(readRequestedCode);
  const [isAdmin, setIsAdmin] = useState<boolean>(readIsAdmin);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [schoolResolved, setSchoolResolved] = useState(false);

  const [systemTitle, setSystemTitle] = useState('耿中班班通报修管理系统');
  const [systemSubtitle, setSystemSubtitle] = useState('耿棚中学 · 多媒体教室设备日常报修与排查');

  const loadSystemConfig = () => {
    fetch('/api/system-config')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.system_title) {
          setSystemTitle(data.system_title);
          document.title = data.system_title;
        }
        if (data && data.system_subtitle) {
          setSystemSubtitle(data.system_subtitle);
        }
      })
      .catch((err) => console.error('Failed to load system config title:', err));
  };

  // Resolve the tenant: ?tenant= / /s/<code>/ wins, else default tenant
  const resolveSchool = useCallback(async (code: string) => {
    try {
      const q = code ? `?tenant=${encodeURIComponent(code)}` : '';
      const res = await fetch(`/api/schools${q}`);
      const data = await res.json();
      if (data && data.school) {
        setSchool(data.school);
        document.title = data.school.name;
      } else {
        setSchool(null);
      }
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

  const navigateToHome = () => {
    // Preserve the entry style the visitor used (?tenant= or /s/ or plain /)
    const search = window.location.search;
    const path = window.location.pathname;
    if (search.includes('tenant=')) {
      window.history.pushState({}, '', effectiveCode ? `/?tenant=${effectiveCode}` : '/');
    } else if (/^\/s\//.test(path)) {
      window.history.pushState({}, '', effectiveCode ? `/s/${effectiveCode}/` : '/');
    } else {
      window.history.pushState({}, '', '/');
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
              src="/logo.png"
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

          {/* 管理入口：仅 URL 显式带 admin 时出现，不向普通师生暴露多租户信息 */}
          {isAdmin && (
            <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold border border-blue-100 shrink-0">
              {requestedCode ? `${school?.name || requestedCode} · 校级后台` : '超级后台 · 全部租户'}
            </span>
          )}
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
