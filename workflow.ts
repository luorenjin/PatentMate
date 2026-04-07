import { AppView, PatentData, PatentStatus } from './types';

export type WorkflowStageState = 'locked' | 'available' | 'active' | 'completed';
export type BusinessStageKey = 'disclosure' | 'evaluation' | 'drafting' | 'finalization';

export interface WorkflowStageMeta {
  view: AppView;
  stepNumber: number;
  label: string;
  shortLabel: string;
  description: string;
}

export interface PatentJourneyMeta {
  stageKey: BusinessStageKey;
  stageView: AppView;
  stageLabel: string;
  stepNumber: number;
  milestoneKey: PatentStatus;
  milestoneLabel: string;
  badgeClass: string;
  nextAction: string;
}

export const WORKFLOW_STAGES: WorkflowStageMeta[] = [
  {
    view: AppView.DISCLOSURE,
    stepNumber: 1,
    label: '技术交底',
    shortLabel: '交底',
    description: '专利类型、技术领域与问卷采集',
  },
  {
    view: AppView.NOVELTY_SEARCH,
    stepNumber: 2,
    label: '方案评估',
    shortLabel: '评估',
    description: '交底确认、挑战式检索与保护策略',
  },
  {
    view: AppView.DRAFTER,
    stepNumber: 3,
    label: '申请撰写',
    shortLabel: '撰写',
    description: '摘要、权利要求与说明书生成',
  },
  {
    view: AppView.EDITOR,
    stepNumber: 4,
    label: '审校定稿',
    shortLabel: '定稿',
    description: '审查回写、终稿检查与导出',
  },
];

const WORKFLOW_STAGE_MAP = WORKFLOW_STAGES.reduce<Record<string, WorkflowStageMeta>>((acc, stage) => {
  acc[stage.view] = stage;
  return acc;
}, {});

const hasDisclosureCompleted = (patentData: PatentData | null) => {
  if (!patentData) return false;
  return patentData.status !== 'disclosure_collecting';
};

const hasDraftingStarted = (patentData: PatentData | null) => {
  if (!patentData) return false;
  return ['drafting', 'editing', 'ready_to_submit'].includes(patentData.status) || Boolean(patentData.draftingProgress);
};

const hasReviewStarted = (patentData: PatentData | null) => {
  if (!patentData) return false;
  return ['editing', 'ready_to_submit'].includes(patentData.status);
};

export const getWorkflowStageMeta = (view: AppView): WorkflowStageMeta | null => {
  return WORKFLOW_STAGE_MAP[view] || null;
};

export const getPatentBusinessStageKey = (status: PatentStatus): BusinessStageKey => {
  switch (status) {
    case 'disclosure_collecting':
      return 'disclosure';
    case 'disclosure_review':
      return 'evaluation';
    case 'drafting':
      return 'drafting';
    case 'editing':
    case 'ready_to_submit':
    default:
      return 'finalization';
  }
};

export const getPatentJourneyMeta = (status: PatentStatus): PatentJourneyMeta => {
  switch (status) {
    case 'disclosure_collecting':
      return {
        stageKey: 'disclosure',
        stageView: AppView.DISCLOSURE,
        stageLabel: '技术交底',
        stepNumber: 1,
        milestoneKey: status,
        milestoneLabel: '交底采集中',
        badgeClass: 'bg-amber-100 text-amber-700',
        nextAction: '继续完成技术交底',
      };
    case 'disclosure_review':
      return {
        stageKey: 'evaluation',
        stageView: AppView.NOVELTY_SEARCH,
        stageLabel: '方案评估',
        stepNumber: 2,
        milestoneKey: status,
        milestoneLabel: '评估与检索中',
        badgeClass: 'bg-sky-100 text-sky-700',
        nextAction: '继续完善评估结论',
      };
    case 'drafting':
      return {
        stageKey: 'drafting',
        stageView: AppView.DRAFTER,
        stageLabel: '申请撰写',
        stepNumber: 3,
        milestoneKey: status,
        milestoneLabel: '申请撰写中',
        badgeClass: 'bg-indigo-100 text-indigo-700',
        nextAction: '继续生成申请文本',
      };
    case 'editing':
      return {
        stageKey: 'finalization',
        stageView: AppView.EDITOR,
        stageLabel: '审校定稿',
        stepNumber: 4,
        milestoneKey: status,
        milestoneLabel: '审校定稿中',
        badgeClass: 'bg-violet-100 text-violet-700',
        nextAction: '继续审校正式文稿',
      };
    case 'ready_to_submit':
    default:
      return {
        stageKey: 'finalization',
        stageView: AppView.EDITOR,
        stageLabel: '审校定稿',
        stepNumber: 4,
        milestoneKey: status,
        milestoneLabel: '已定稿待提交',
        badgeClass: 'bg-emerald-100 text-emerald-700',
        nextAction: '查看正式文稿',
      };
  }
};

export const getRecommendedViewForPatent = (patentData: PatentData): AppView => {
  switch (patentData.status) {
    case 'ready_to_submit':
    case 'editing':
      return AppView.EDITOR;
    case 'drafting':
      return AppView.DRAFTER;
    case 'disclosure_collecting':
      return AppView.DISCLOSURE;
    case 'disclosure_review':
    default:
      return AppView.NOVELTY_SEARCH;
  }
};

export const getCurrentWorkflowStage = (patentData: PatentData | null): WorkflowStageMeta | null => {
  if (!patentData) return null;
  return getWorkflowStageMeta(getRecommendedViewForPatent(patentData));
};

export const canNavigateToWorkflowStage = (view: AppView, patentData: PatentData | null): boolean => {
  if (!patentData) return false;

  switch (view) {
    case AppView.DISCLOSURE:
      return true;
    case AppView.NOVELTY_SEARCH:
      return hasDisclosureCompleted(patentData);
    case AppView.DRAFTER:
      return hasDraftingStarted(patentData);
    case AppView.EDITOR:
      return hasReviewStarted(patentData);
    default:
      return true;
  }
};

export const getWorkflowStageState = (
  view: AppView,
  currentView: AppView,
  patentData: PatentData | null,
): WorkflowStageState => {
  if (currentView === view) return 'active';
  if (!patentData) return 'locked';

  switch (view) {
    case AppView.DISCLOSURE:
      return hasDisclosureCompleted(patentData) ? 'completed' : 'available';
    case AppView.NOVELTY_SEARCH:
      if (!canNavigateToWorkflowStage(view, patentData)) return 'locked';
      return hasDraftingStarted(patentData) ? 'completed' : 'available';
    case AppView.DRAFTER:
      if (!canNavigateToWorkflowStage(view, patentData)) return 'locked';
      return hasReviewStarted(patentData) ? 'completed' : 'available';
    case AppView.EDITOR:
      if (!canNavigateToWorkflowStage(view, patentData)) return 'locked';
      return patentData.status === 'ready_to_submit' ? 'completed' : 'available';
    default:
      return 'available';
  }
};

export const getWorkflowStageStatusLabel = (patentData: PatentData | null): string => {
  if (!patentData) return '未开始';

  const journeyMeta = getPatentJourneyMeta(patentData.status);
  return `步骤 ${journeyMeta.stepNumber} / ${journeyMeta.milestoneLabel}`;
};