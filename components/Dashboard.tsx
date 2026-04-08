import React, { useEffect, useState, useMemo } from 'react';
import { PatentData, PatentStatus, DraftingStage } from '../types';
import { loadPatents, deletePatentFromStorage } from '../services/storageService';
import { BusinessStageKey, getPatentBusinessStageKey, getPatentJourneyMeta } from '../workflow';

// Maps drafting stage keys to display labels
const STAGE_LABELS: Record<DraftingStage, string> = {
    abstract: '摘要',
    claims: '权利要求',
    description: '说明书',
    embodiment: '实施例',
    drawings: '附图说明',
};

// Maps patent type values to display labels
const PATENT_TYPE_LABELS: Record<string, string> = {
    invention: '发明专利',
    utility: '实用新型',
};

const DRAFTING_STAGES: DraftingStage[] = ['abstract', 'claims', 'description', 'embodiment', 'drawings'];
const MILESTONE_ORDER: Record<PatentStatus, number> = {
    disclosure_collecting: 1,
    disclosure_review: 2,
    drafting: 3,
    editing: 4,
    ready_to_submit: 5,
};

interface DashboardProps {
    onOpenPatent: (patent: PatentData) => void;
    onCreateNew: () => void;
    currentUserId?: string | null;
    currentOrganizationId?: string | null;
    currentOrganizationName?: string | null;
}

const Dashboard: React.FC<DashboardProps> = ({
    onOpenPatent,
    onCreateNew,
    currentUserId,
    currentOrganizationId,
    currentOrganizationName,
}) => {
    const [patents, setPatents] = useState<PatentData[]>([]);
    const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<'all' | BusinessStageKey>('all');

    // Search, filter, and sort state
    const [searchQuery, setSearchQuery] = useState('');
    const [milestoneFilter, setMilestoneFilter] = useState<'all' | PatentStatus>('all');
    const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | 'milestone'>('date-desc');

    const getBlockers = (patent: PatentData) => {
        const blockers: string[] = [];
        const stageKey = getPatentBusinessStageKey(patent.status);

        if (stageKey === 'drafting') {
            const confirmedCount = patent.draftingProgress
                ? DRAFTING_STAGES.filter((stage) => patent.draftingProgress?.[stage].isConfirmed).length
                : 0;

            if (confirmedCount === 0) {
                blockers.push('尚未确认任何申请章节');
            } else if (confirmedCount < DRAFTING_STAGES.length) {
                blockers.push(`仅确认 ${confirmedCount} / ${DRAFTING_STAGES.length} 个撰写章节`);
            }

            return blockers;
        }

        if (stageKey === 'finalization') {
            if (patent.status === 'ready_to_submit') {
                return blockers;
            }

            if (patent.lastReviewScore === 0) {
                blockers.push('尚未执行终稿审查');
            } else if (patent.lastReviewScore < 80) {
                blockers.push(`最近审查分数仅 ${patent.lastReviewScore} 分`);
            }

            if (!patent.reviewSummary?.trim()) {
                blockers.push('尚未形成审校结论摘要');
            }

            return blockers.slice(0, 2);
        }

        if (patent.disclosureData) {
            const totalQuestions = patent.patentType === 'utility' ? 5 : 7;
            const answeredCount = patent.disclosureData.answers.filter(a => a.answer.trim().length > 0).length;
            if (answeredCount < totalQuestions) {
                blockers.push(`交底问卷仅完成 ${answeredCount} / ${totalQuestions} 题`);
            }
            if (!patent.disclosureData.title?.trim()) {
                blockers.push('尚未填写发明名称');
            }
        } else {
            // Legacy NoveltySearch-based flow
            if (!patent.technicalProblem?.trim()) {
                blockers.push('技术问题还未明确');
            }
            if ((patent.technicalHighlights || []).length < 3) {
                blockers.push('关键技术特征不足 3 条');
            }
        }

        if (stageKey === 'evaluation' && !patent.claimStrategy.trim()) {
            blockers.push('尚未形成保护策略');
        }

        return blockers.slice(0, 2);
    };

    const matchesFilter = (patent: PatentData) => {
        return activeFilter === 'all' ? true : getPatentBusinessStageKey(patent.status) === activeFilter;
    };

    const getProgressMeta = (patent: PatentData) => {
        const stageKey = getPatentBusinessStageKey(patent.status);

        if (stageKey === 'disclosure' || stageKey === 'evaluation') {
            const totalQuestions = patent.patentType === 'utility' ? 5 : 7;
            const answeredCount = patent.disclosureData
                ? patent.disclosureData.answers.filter((answer) => answer.answer.trim().length > 0).length
                : 0;
            const progressPercent = patent.disclosureData
                ? Math.round((answeredCount / totalQuestions) * 100)
                : patent.draftReadiness;

            return {
                label: stageKey === 'disclosure' ? '交底完成度' : '评估准备度',
                percent: progressPercent,
                caption: patent.disclosureData ? `${answeredCount} / ${totalQuestions} 题` : `${patent.draftReadiness}%`,
                detail: stageKey === 'disclosure' ? '围绕问卷补齐事实信息' : '补强差异点、检索结论与保护策略',
            };
        }

        if (stageKey === 'drafting') {
            const confirmedCount = patent.draftingProgress
                ? DRAFTING_STAGES.filter((stage) => patent.draftingProgress?.[stage].isConfirmed).length
                : 0;
            const currentStageLabel = patent.draftingProgress?.currentStage
                ? STAGE_LABELS[patent.draftingProgress.currentStage]
                : '待启动';

            return {
                label: '撰写完成度',
                percent: patent.draftingProgress ? Math.round((confirmedCount / DRAFTING_STAGES.length) * 100) : 0,
                caption: `${confirmedCount} / ${DRAFTING_STAGES.length} 节已确认`,
                detail: `当前：${currentStageLabel}`,
            };
        }

        const reviewReadyScore = patent.status === 'ready_to_submit'
            ? 100
            : patent.lastReviewScore > 0
                ? patent.lastReviewScore
                : 20;

        return {
            label: '定稿就绪度',
            percent: reviewReadyScore,
            caption: patent.status === 'ready_to_submit' ? '已通过内部审校' : patent.lastReviewScore > 0 ? `最近审查 ${patent.lastReviewScore} 分` : '待执行终稿审查',
            detail: patent.status === 'ready_to_submit' ? '可导出并准备正式提交' : '建议完成审查与问题回写',
        };
    };

    // Search and status filter + sorting
    const filteredAndSortedPatents = useMemo(() => {
        let result = patents.filter(matchesFilter);

        // Search filter by title
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(p =>
                (p.title || '').toLowerCase().includes(query) ||
                (p.disclosureSummary || '').toLowerCase().includes(query) ||
                (p.technicalField || '').toLowerCase().includes(query)
            );
        }

        // Milestone filter
        if (milestoneFilter !== 'all') {
            result = result.filter(p => p.status === milestoneFilter);
        }

        // Sort
        result = [...result].sort((a, b) => {
            switch (sortBy) {
                case 'date-desc':
                    return b.lastModified - a.lastModified;
                case 'date-asc':
                    return a.lastModified - b.lastModified;
                case 'title-asc':
                    return (a.title || '').localeCompare(b.title || '');
                case 'title-desc':
                    return (b.title || '').localeCompare(a.title || '');
                case 'milestone':
                    return MILESTONE_ORDER[a.status] - MILESTONE_ORDER[b.status];
                default:
                    return 0;
            }
        });

        return result;
    }, [patents, searchQuery, milestoneFilter, sortBy, activeFilter]);

    // Format relative time
    const formatRelativeTime = (timestamp: number): string => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes} 分钟前`;
        if (hours < 24) return `${hours} 小时前`;
        if (days === 1) return '昨天';
        if (days < 7) return `${days} 天前`;
        return new Date(timestamp).toLocaleDateString('zh-CN');
    };

    const stageStats = patents.reduce(
        (acc, patent) => {
            const stageKey = getPatentBusinessStageKey(patent.status);
            acc[stageKey] += 1;
            if (patent.status === 'ready_to_submit') acc.ready += 1;
            return acc;
        },
        { disclosure: 0, evaluation: 0, drafting: 0, finalization: 0, ready: 0 },
    );

    const loadPatentItems = async () => {
        const data = await loadPatents({
            userId: currentUserId,
            organizationId: currentOrganizationId,
        });
        setPatents(data);
    };

    useEffect(() => {
        void loadPatentItems();
    }, [currentOrganizationId, currentUserId]);

    const handleDeleteClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeleteCandidateId(id);
    };

    const confirmDelete = () => {
        if (deleteCandidateId) {
            void (async () => {
                await deletePatentFromStorage(deleteCandidateId);
                await loadPatentItems();
                setDeleteCandidateId(null);
            })();
        }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <header className="mb-10 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">工作台</h1>
                    <p className="text-slate-500 mt-2">围绕技术交底、方案评估、申请撰写和审校定稿管理您的项目</p>
                    {currentOrganizationName && (
                        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700">
                            <span className="font-medium">当前组织</span>
                            <span>{currentOrganizationName}</span>
                        </div>
                    )}
                </div>
                <button 
                    onClick={onCreateNew}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1 flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    新建专利项目
                </button>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                {[
                    { key: 'disclosure', title: '步骤 1 技术交底', value: stageStats.disclosure, note: '采集专利类型、技术领域与事实材料', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
                    { key: 'evaluation', title: '步骤 2 方案评估', value: stageStats.evaluation, note: '完成差异检索、保护策略与进入起草判断', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
                    { key: 'drafting', title: '步骤 3 申请撰写', value: stageStats.drafting, note: '生成摘要、权利要求和说明书正文', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
                    { key: 'finalization', title: '步骤 4 审校定稿', value: stageStats.finalization, note: stageStats.ready > 0 ? `其中 ${stageStats.ready} 项已达待提交里程碑` : '执行终稿审查、问题回写与导出', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
                ].map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveFilter(item.key as BusinessStageKey)}
                        className={`rounded-2xl border p-5 shadow-sm text-left transition-colors ${activeFilter === item.key ? item.tone : 'bg-white border-slate-200 hover:border-slate-300'}`}
                    >
                        <div className="text-sm text-slate-500 mb-2">{item.title}</div>
                        <div className="text-3xl font-bold text-slate-900">{item.value}</div>
                        <div className="text-xs text-slate-400 mt-2 leading-5">{item.note}</div>
                    </button>
                ))}
            </section>

            {/* Search, Status Filter, and Sort */}
            <section className="mb-6 flex flex-wrap gap-3 items-center">
                {/* Search Input */}
                <div className="relative flex-1 min-w-50 max-w-md">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索专利标题..."
                        className="w-full pl-10 pr-4 py-2 rounded-full border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                </div>

                {/* Status Filter Dropdown */}
                <select
                    value={milestoneFilter}
                    onChange={(e) => setMilestoneFilter(e.target.value as typeof milestoneFilter)}
                    className="px-4 py-2 rounded-full border border-slate-200 text-sm font-medium bg-white text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                    <option value="all">全部里程碑</option>
                    <option value="disclosure_collecting">交底采集中</option>
                    <option value="disclosure_review">评估与检索中</option>
                    <option value="drafting">申请撰写中</option>
                    <option value="editing">审校定稿中</option>
                    <option value="ready_to_submit">已定稿待提交</option>
                </select>

                {/* Sort Dropdown */}
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="px-4 py-2 rounded-full border border-slate-200 text-sm font-medium bg-white text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                    <option value="date-desc">日期 (最新)</option>
                    <option value="date-asc">日期 (最早)</option>
                    <option value="title-asc">标题 (A-Z)</option>
                    <option value="title-desc">标题 (Z-A)</option>
                    <option value="milestone">里程碑</option>
                </select>
            </section>

            {/* Quick Filters */}
            <section className="mb-6 flex flex-wrap gap-3">
                {[
                    { key: 'all', label: '全部阶段' },
                    { key: 'disclosure', label: '步骤 1 技术交底' },
                    { key: 'evaluation', label: '步骤 2 方案评估' },
                    { key: 'drafting', label: '步骤 3 申请撰写' },
                    { key: 'finalization', label: '步骤 4 审校定稿' },
                ].map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveFilter(item.key as typeof activeFilter)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeFilter === item.key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                        {item.label}
                    </button>
                ))}
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Create New Card Placeholder */}
                <div 
                    onClick={onCreateNew}
                    className="border-2 border-dashed border-slate-300 rounded-2xl p-8 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer min-h-60 group"
                >
                    <div className="w-16 h-16 rounded-full bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center mb-4 transition-colors">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    </div>
                    <span className="font-medium">创建新专利项目</span>
                </div>

                {/* Patent Cards */}
                {filteredAndSortedPatents.map((patent) => {
                    const journeyMeta = getPatentJourneyMeta(patent.status);
                    const blockers = getBlockers(patent);
                    const progressMeta = getProgressMeta(patent);

                    // Patent type badge using top-level constant
                    const typeBadge = patent.patentType ? (PATENT_TYPE_LABELS[patent.patentType] ?? null) : null;
                    // Field badge (separate from type badge)
                    const fieldBadge = patent.disclosureData?.field || patent.technicalField || null;

                    // Drafting stage label using top-level constant
                    const currentStageLabel = patent.draftingProgress?.currentStage
                        ? (STAGE_LABELS[patent.draftingProgress.currentStage] ?? patent.draftingProgress.currentStage)
                        : null;

                    // Description line: try new disclosure title, then summary/field
                    const description = patent.disclosureData?.title && patent.disclosureData.title !== patent.title
                        ? `领域：${patent.disclosureData.field}`
                        : patent.disclosureSummary || (patent.technicalField ? `领域：${patent.technicalField}` : '尚未开始整理技术交底内容...');

                    return (
                    <div 
                        key={patent.id}
                        onClick={() => onOpenPatent(patent)}
                        className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all cursor-pointer relative group flex flex-col"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex flex-wrap gap-2 pr-3">
                                <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                                    步骤 {journeyMeta.stepNumber} · {journeyMeta.stageLabel}
                                </div>
                                <div className={`px-3 py-1 rounded-full text-xs font-bold ${journeyMeta.badgeClass}`}>
                                    {journeyMeta.milestoneLabel}
                                </div>
                            </div>
                            <button 
                                onClick={(e) => handleDeleteClick(e, patent.id)}
                                className="text-slate-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                title="删除项目"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                        
                        <h3 className="text-lg font-bold text-slate-800 mb-2 line-clamp-2 h-14">
                            {patent.title || "未命名专利项目"}
                        </h3>
                        
                        <p className="text-sm text-slate-500 mb-6 line-clamp-2 h-10">
                            {description}
                        </p>

                        <div className="mb-5">
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span>{progressMeta.label}</span>
                                <span>{progressMeta.caption}</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-linear-to-r from-blue-500 to-cyan-400 rounded-full"
                                    style={{ width: `${Math.max(6, progressMeta.percent)}%` }}
                                />
                            </div>
                            <div className="mt-2 text-xs text-slate-400">{progressMeta.detail}</div>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-5">
                            {typeBadge && (
                                <div className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                                    {typeBadge}
                                </div>
                            )}
                            {!typeBadge && fieldBadge && (
                                <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                                    {fieldBadge}
                                </div>
                            )}
                            {currentStageLabel && (
                                <div className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium">
                                    撰写：{currentStageLabel}
                                </div>
                            )}
                            <div className={`px-3 py-1 rounded-full text-xs font-medium ${patent.lastReviewScore ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                                审查 {patent.lastReviewScore ? `${patent.lastReviewScore} 分` : '未开始'}
                            </div>
                        </div>

                        <div className="mb-5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                            <div className="text-xs font-semibold text-slate-700 mb-2">当前里程碑与卡点</div>
                            <div className="text-xs text-slate-500 mb-2">下一动作：{journeyMeta.nextAction}</div>
                            {blockers.length > 0 ? (
                                <div className="space-y-1 text-xs text-slate-500">
                                    {blockers.map((item) => (
                                        <div key={item}>• {item}</div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs text-emerald-600">当前已满足该里程碑的继续推进条件。</div>
                            )}
                        </div>

                        <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
                            <span>最后编辑: {formatRelativeTime(patent.lastModified)}</span>
                            <span className="flex items-center gap-1 text-blue-600 font-medium group-hover:translate-x-1 transition-transform">
                                {journeyMeta.nextAction}
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </span>
                        </div>
                    </div>
                    );
                })}

                {filteredAndSortedPatents.length === 0 && (
                    <div className="md:col-span-2 lg:col-span-3 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
                        当前筛选条件下没有项目。
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteCandidateId && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in"
                    onClick={() => setDeleteCandidateId(null)}
                >
                    <div 
                        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100 transform transition-all scale-100"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex flex-col items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">删除确认</h3>
                            <p className="text-slate-600 mb-6">
                                您确定要删除这个专利草稿吗？<br/>
                                <span className="text-red-600 font-medium text-sm block mt-2 bg-red-50 py-1 px-2 rounded">
                                    ⚠️ 风险提示：此操作无法撤销，所有相关文本和图片数据将永久丢失。
                                </span>
                            </p>
                            <div className="flex w-full gap-3">
                                <button 
                                    onClick={() => setDeleteCandidateId(null)}
                                    className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
                                >
                                    取消
                                </button>
                                <button 
                                    onClick={confirmDelete}
                                    className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
                                >
                                    确认删除
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;