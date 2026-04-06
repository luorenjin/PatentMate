import React from 'react';
import { AppView } from '../types';

interface SidebarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  hasActivePatent: boolean;
  onSignOut?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setView,
  hasActivePatent,
  onSignOut
}) => {
  const navItems = [
    { id: AppView.DASHBOARD, label: '工作台', icon: 'M4 6h16M4 12h16M4 18h16' },
    { id: AppView.NOVELTY_SEARCH, label: '交底采集', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
    { id: AppView.DRAFTER, label: '策略起草', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    { id: AppView.EDITOR, label: '审校定稿', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-full shrink-0 transition-all duration-300 shadow-xl z-20">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span className="text-blue-400">❖</span> 智专易
        </h1>
        <p className="text-xs text-slate-400 mt-1">专业专利申请辅助系统</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          // Disable project-specific tabs if no project is active
          const isDisabled = !hasActivePatent && item.id !== AppView.DASHBOARD;

          return (
            <button
              key={item.id}
              onClick={() => !isDisabled && setView(item.id)}
              disabled={isDisabled}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                currentView === item.id && hasActivePatent
                  ? 'bg-blue-600 text-white shadow-lg'
                  : isDisabled
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-300 hover:bg-slate-800'
              } ${currentView === AppView.DASHBOARD && item.id === AppView.DASHBOARD && !hasActivePatent ? 'bg-slate-800 text-white' : ''}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              <span className={isDisabled ? 'opacity-50' : ''}>{item.label}</span>
              {isDisabled && (
                  <span className="ml-auto text-xs opacity-30">🔒</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-700 space-y-2">
        <button
          onClick={() => setView(AppView.SETTINGS)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
            currentView === AppView.SETTINGS
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>设置</span>
        </button>

        {onSignOut && (
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>退出</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default Sidebar;