import React, { useState, useEffect } from 'react';
import { TeacherView } from './components/TeacherView';
import { AdminView } from './components/AdminView';

export default function App() {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    const path = window.location.pathname;
    const search = window.location.search;
    const hash = window.location.hash;
    return (
      path.startsWith('/admin') ||
      search.includes('admin') ||
      search.includes('page=admin') ||
      hash.includes('admin')
    );
  });

  useEffect(() => {
    const handleUrlChange = () => {
      const path = window.location.pathname;
      const search = window.location.search;
      const hash = window.location.hash;
      setIsAdmin(
        path.startsWith('/admin') ||
          search.includes('admin') ||
          search.includes('page=admin') ||
          hash.includes('admin')
      );
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  const navigateToHome = () => {
    window.history.pushState({}, '', '/');
    setIsAdmin(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* 极简顶部标题栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
          <div
            onClick={navigateToHome}
            className="flex items-center gap-3 cursor-pointer select-none"
          >
            <img
              src="/logo.png"
              alt="耿棚中学校徽"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full object-contain shadow-2xs border border-slate-200 bg-white p-0.5 shrink-0"
              onError={(e) => {
                e.currentTarget.src = '/school-badge.svg';
              }}
            />
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight flex items-center gap-2">
                <span>班班通智慧报修管理系统</span>
              </h1>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                耿棚中学 · 多媒体教室设备日常报修与排查
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* 主体视图区域 */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8">
        {isAdmin ? <AdminView onBackToHome={navigateToHome} /> : <TeacherView />}
      </main>
    </div>
  );
}
