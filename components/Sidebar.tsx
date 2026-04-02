import React from 'react';
import { AppView } from '../types';

interface SidebarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  toggleChat: () => void;
  isChatOpen: boolean;
  hasActivePatent: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, toggleChat, isChatOpen, hasActivePatent }) => {
  const navItems = [
    { id: AppView.DASHBOARD, label: '工作台', icon: 'M4 6h16M4 12h16M4 18h16' },
    { id: AppView.NOVELTY_SEARCH, label: '新颖性评估', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
    { id: AppView.DRAFTER, label: '智能撰写', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    { id: AppView.EDITOR, label: '文书润色', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
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

      <div className="p-4 border-t border-slate-700">
        <button
          onClick={toggleChat}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
            isChatOpen ? 'bg-blue-500/20 border-blue-500 text-blue-300' : 'border-slate-600 text-slate-300 hover:bg-slate-800'
          }`}
        >
           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            {isChatOpen ? '收起助手' : 'AI 专利顾问'}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;