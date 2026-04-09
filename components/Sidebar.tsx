import React from 'react';
import { AppView, PatentData } from '../types';
import {
  WORKFLOW_STAGES,
  canNavigateToWorkflowStage,
  getCurrentWorkflowStage,
  getWorkflowStageState,
  getWorkflowStageStatusLabel,
} from '../workflow';
import QuotaIndicator from './QuotaIndicator';

interface SidebarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  patentData: PatentData | null;
  userId?: string; // P1-1: User ID for quota display
  onSignOut?: () => void;
  onUpgrade?: () => void; // P1-1: Upgrade subscription callback
}

const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setView,
  patentData,
  userId,
  onSignOut,
  onUpgrade,
}) => {
  const hasActivePatent = Boolean(patentData);
  const currentStage = getCurrentWorkflowStage(patentData);
  const stateMeta = {
    active: { label: '当前', className: 'border-blue-400/30 bg-blue-500/10 text-blue-200' },
    completed: { label: '已完成', className: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' },
    available: { label: '可进入', className: 'border-slate-500/40 bg-slate-700/60 text-slate-200' },
    locked: { label: '待上一步', className: 'border-slate-700 bg-slate-900/60 text-slate-500' },
  } as const;

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-full shrink-0 transition-all duration-300 shadow-xl z-20">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span className="text-blue-400">❖</span> 智专易
        </h1>
        <p className="text-xs text-slate-400 mt-1">专业专利申请辅助系统</p>
      </div>

      <nav className="flex-1 p-4 space-y-3 overflow-y-auto">
        <button
          onClick={() => setView(AppView.DASHBOARD)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
            currentView === AppView.DASHBOARD
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-slate-200 hover:bg-slate-800'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="font-medium">工作台</span>
        </button>

        {hasActivePatent ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400 mb-2">当前项目</div>
            <div className="text-sm font-semibold text-white leading-6 break-words">{patentData?.title || '未命名专利'}</div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-400">当前阶段</span>
              <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-cyan-200">
                {currentStage ? `${currentStage.stepNumber}. ${currentStage.label}` : '未开始'}
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400">{getWorkflowStageStatusLabel(patentData)}</div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/40 p-4 text-sm leading-6 text-slate-400">
            从工作台新建项目后，侧边栏会按专利业务顺序依次解锁 4 个阶段。
          </div>
        )}

        <div>
          <div className="px-2 pb-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">专利流程</div>
          <div className="space-y-2">
            {WORKFLOW_STAGES.map((item) => {
              const state = getWorkflowStageState(item.view, currentView, patentData);
              const isDisabled = !canNavigateToWorkflowStage(item.view, patentData);
              const isActive = state === 'active';
              const baseClass = isActive
                ? 'bg-slate-800 ring-1 ring-blue-500/40 text-white shadow-lg'
                : isDisabled
                  ? 'bg-slate-900/50 text-slate-500 cursor-not-allowed'
                  : 'text-slate-200 hover:bg-slate-800/80';
              const stepCircleClass = isActive
                ? 'bg-blue-500 text-white'
                : state === 'completed'
                  ? 'bg-emerald-500/15 text-emerald-200'
                  : isDisabled
                    ? 'bg-slate-800 text-slate-500'
                    : 'bg-slate-700 text-slate-100';

              return (
                <button
                  key={item.view}
                  onClick={() => !isDisabled && setView(item.view)}
                  disabled={isDisabled}
                  className={`w-full rounded-2xl px-4 py-3 transition-colors ${baseClass}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${stepCircleClass}`}>
                      {item.stepNumber}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className={`mt-1 block text-xs leading-5 ${isDisabled ? 'text-slate-600' : 'text-slate-400'}`}>
                        {item.description}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium ${stateMeta[state].className}`}>
                      {stateMeta[state].label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="p-4 border-t border-slate-700 space-y-3">
        {/* P1-1: Quota indicator */}
        {userId && (
          <div className="mb-2">
            <QuotaIndicator userId={userId} compact onUpgrade={onUpgrade} />
          </div>
        )}

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