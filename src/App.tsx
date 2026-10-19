import React, { useState, useEffect } from 'react';
import { TeacherView } from './components/TeacherView';
import { AdminView } from './components/AdminView';
import { ChevronDown, Check, School as SchoolIcon } from 'lucide-react';

interface SchoolInfo {
  id: number;
  code: string;
  name: string;
  subtitle: string | null;
}

export default function App() {
  // ---- Multi-school routing: /s/<code>/... (blank = default school) ----
  const readSchoolCode = (): string => {
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

  const [schoolCode, setSchoolCode] = useState<string>(readSchoolCode);
  const [isAdmin, setIsAdmin] = useState<boolean>(readIsAdmin);
  const [schools, setSchools] = useState<SchoolInfo[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const [systemTitle, setSystemTitle] = useState('耿中班班通报修管理系统');
  const [systemSubtitle, setSystemSubtitle] = useState('耿棚中学 · 多媒体教室设备日常报修与排查');

  // Load system title and config dynamically
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

  useEffect(() => {
    loadSystemConfig();
    fetch('/api/schools')
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) setSchools(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleUrlChange = () => {
      setSchoolCode(readSchoolCode());
      setIsAdmin(readIsAdmin());
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Friendly alias: visiting /<code>/ (e.g. /jkzx) auto-corrects to the
  // canonical school entry /s/<code>/ so isolation always kicks in
  useEffect(() => {
    if (schools.length === 0) return;
    const m = window.location.pathname.match(/^\/([a-z0-9][a-z0-9-]*)\/?$/i);
    if (!m) return;
    const seg = m[1].toLowerCase();
    if (['s', 'admin', 'api', 'assets', 'pyapp'].includes(seg)) return;
    const hit = schools.find((s) => s.code === seg);
    if (hit) {
      window.history.replaceState({}, '', `/s/${hit.code}/`);
      setSchoolCode(hit.code);
    }
  }, [schools]);

  // Resolve the active school (URL code wins; fallback to first enabled)
  const currentSchool = schools.find((s) => s.code === schoolCode) || null;
  const defaultSchool = schools.length > 0 ? schools[0] : null;
  const activeSchool = currentSchool || defaultSchool;
  const effectiveCode = schoolCode || activeSchool?.code || '';
  const headerTitle = currentSchool?.name || systemTitle;
  const headerSubtitle = currentSchool?.subtitle || systemSubtitle;

  useEffect(() => {
    if (currentSchool) {
      document.title = currentSchool.name;
    }
  }, [currentSchool]);

  const navigateToHome = () => {
    const base = effectiveCode ? `/s/${effectiveCode}/` : '/';
    window.history.pushState({}, '', base);
    setIsAdmin(false);
  };

  const switchSchool = (code: string) => {
    setSwitcherOpen(false);
    if (code === schoolCode) return;
    const target = `/s/${code}/${isAdmin ? 'admin' : ''}`;
    window.history.pushState({}, '', target);
    setSchoolCode(code);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* 极简顶部标题栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div
            onClick={navigateToHome}
            className="flex items-center gap-3 cursor-pointer select-none min-w-0"
          >
            <img
              src="/logo.png"
              alt="校徽"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full object-contain shadow-2xs border border-slate-200 bg-white p-0.5 shrink-0"
              onError={(e) => {
                e.currentTarget.src = '/school-badge.svg';
              }}
            />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight flex items-center gap-2 truncate">
                <span className="truncate">{headerTitle}</span>
              </h1>
              <p className="text-[11px] text-slate-500 hidden sm:block truncate">
                {headerSubtitle}
              </p>
            </div>
          </div>

          {/* 多校切换器（单库多租户 · 校级数据隔离） */}
          <div className="relative shrink-0">
            <button
              onClick={() => setSwitcherOpen(!switcherOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer max-w-[170px]"
            >
              <SchoolIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate">{activeSchool?.name || '选择学校'}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 shrink-0 transition-transform ${switcherOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {switcherOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
                <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-3.5 py-2 text-[11px] text-slate-400 bg-slate-50 border-b border-slate-100">
                    多校入驻 · 数据按校隔离
                  </div>
                  {schools.map((s) => (
                    <button
                      key={s.code}
                      onClick={() => switchSchool(s.code)}
                      className={`w-full text-left px-3.5 py-2.5 text-xs hover:bg-blue-50 transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                        s.code === effectiveCode ? 'text-blue-700 font-bold bg-blue-50/60' : 'text-slate-700'
                      }`}
                    >
                      <span className="truncate">{s.name}</span>
                      {s.code === effectiveCode && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  ))}
                  {schools.length === 0 && (
                    <div className="px-3.5 py-3 text-xs text-slate-400">暂无已入驻学校</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 主体视图区域（按校重挂载，确保数据隔离） */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8">
        {isAdmin ? (
          <AdminView
            key={effectiveCode}
            schoolCode={schoolCode}
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
        ) : (
          <TeacherView
            key={effectiveCode}
            systemTitle={headerTitle}
            schoolCode={effectiveCode}
          />
        )}
      </main>
    </div>
  );
}
