import React, { useEffect, useState, useMemo } from 'react';
import { PatentData, PatentStatus } from '../types';
import { getPatents, deletePatentFromStorage } from '../services/storageService';

interface DashboardProps {
    onOpenPatent: (patent: PatentData) => void;
    onCreateNew: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onOpenPatent, onCreateNew }) => {
    const [patents, setPatents] = useState<PatentData[]>([]);
    const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<'all' | 'in_disclosure' | 'in_drafting' | 'in_review' | 'completed'>('all');

    // Search, filter, and sort state
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | PatentStatus>('all');
    const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | 'status'>('date-desc');

    const getBlockers = (patent: PatentData) => {
        const blockers: string[] = [];

        // New disclosure wizard flow
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

        if (patent.lastReviewScore > 0 && patent.lastReviewScore < 80) {
            blockers.push(`最近审查分数仅 ${patent.lastReviewScore} 分`);
        }

        return blockers.slice(0, 2);
    };

    const matchesFilter = (patent: PatentData) => {
        if (activeFilter === 'in_disclosure') {
            return patent.status === 'disclosure_collecting' || patent.status === 'disclosure_review';
        }
        if (activeFilter === 'in_drafting') {
            return patent.status === 'drafting';
        }
        if (activeFilter === 'in_review') {
            return patent.status === 'editing';
        }
        if (activeFilter === 'completed') {
            return patent.status === 'ready_to_submit';
        }
        return true;
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

        // Status filter
        if (statusFilter !== 'all') {
            result = result.filter(p => p.status === statusFilter);
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
                case 'status':
                    return a.status.localeCompare(b.status);
                default:
                    return 0;
            }
        });

        return result;
    }, [patents, searchQuery, statusFilter, sortBy, activeFilter]);

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

    const getStatusMeta = (status: PatentData['status']) => {
        switch (status) {
            case 'disclosure_review':
                return {
                    label: '待确认',
                    badgeClass: 'bg-sky-100 text-sky-700',
                    nextAction: '继续确认交底书',
                };
            case 'drafting':
                return {
                    label: '起草中',
                    badgeClass: 'bg-indigo-100 text-indigo-700',
                    nextAction: '继续生成专利初稿',
                };
            case 'editing':
                return {
                    label: '待审校',
                    badgeClass: 'bg-violet-100 text-violet-700',
                    nextAction: '继续文稿精修',
                };
            case 'ready_to_submit':
                return {
                    label: '待提交',
                    badgeClass: 'bg-emerald-100 text-emerald-700',
                    nextAction: '查看正式文稿',
                };
            case 'disclosure_collecting':
            default:
                return {
                    label: '交底采集中',
                    badgeClass: 'bg-amber-100 text-amber-700',
                    nextAction: '继续完成技术交底',
                };
        }
    };

    const stageStats = patents.reduce(
        (acc, patent) => {
            if (patent.status === 'ready_to_submit') {
                acc.ready += 1;
            } else if (patent.status === 'drafting' || patent.status === 'editing') {
                acc.drafting += 1;
            } else {
                acc.disclosure += 1;
            }
            return acc;
        },
        { disclosure: 0, drafting: 0, ready: 0 },
    );

    const loadPatents = () => {
        const data = getPatents();
        // Sort by last modified descending
        setPatents(data.sort((a, b) => b.lastModified - a.lastModified));
    };

    useEffect(() => {
        loadPatents();
    }, []);

    const handleDeleteClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeleteCandidateId(id);
    };

    const confirmDelete = () => {
        if (deleteCandidateId) {
            deletePatentFromStorage(deleteCandidateId);
            loadPatents();
            setDeleteCandidateId(null);
        }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <header className="mb-10 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">工作台</h1>
                    <p className="text-slate-500 mt-2">围绕技术交底采集、专利起草和正式审校管理您的项目</p>
                </div>
                <button 
                    onClick={onCreateNew}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1 flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    新建技术交底任务
                </button>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="text-sm text-slate-500 mb-2">交底阶段项目</div>
                    <div className="text-3xl font-bold text-slate-900">{stageStats.disclosure}</div>
                    <div className="text-xs text-slate-400 mt-2">需要继续访谈、整理或确认交底书</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="text-sm text-slate-500 mb-2">起草与审校</div>
                    <div className="text-3xl font-bold text-slate-900">{stageStats.drafting}</div>
                    <div className="text-xs text-slate-400 mt-2">已进入权利要求起草或正式文稿编辑</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="text-sm text-slate-500 mb-2">待提交文稿</div>
                    <div className="text-3xl font-bold text-slate-900">{stageStats.ready}</div>
                    <div className="text-xs text-slate-400 mt-2">已通过内部审校，可准备提交</div>
                </div>
            </section>

            {/* Search, Status Filter, and Sort */}
            <section className="mb-6 flex flex-wrap gap-3 items-center">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px] max-w-md">
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
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                    className="px-4 py-2 rounded-full border border-slate-200 text-sm font-medium bg-white text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                    <option value="all">全部状态</option>
                    <option value="disclosure_collecting">交底采集中</option>
                    <option value="disclosure_review">待确认</option>
                    <option value="drafting">起草中</option>
                    <option value="editing">待审校</option>
                    <option value="ready_to_submit">待提交</option>
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
                    <option value="status">状态</option>
                </select>
            </section>

            {/* Quick Filters */}
            <section className="mb-6 flex flex-wrap gap-3">
                {[
                    { key: 'all', label: '全部项目' },
                    { key: 'in_disclosure', label: '交底阶段' },
                    { key: 'in_drafting', label: '撰写中' },
                    { key: 'in_review', label: '审校中' },
                    { key: 'completed', label: '已完成' },
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
                    className="border-2 border-dashed border-slate-300 rounded-2xl p-8 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer min-h-[240px] group"
                >
                    <div className="w-16 h-16 rounded-full bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center mb-4 transition-colors">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    </div>
                    <span className="font-medium">创建新交底项目</span>
                </div>

                {/* Patent Cards */}
                {filteredAndSortedPatents.map((patent) => {
                    const statusMeta = getStatusMeta(patent.status);
                    const reviewScore = patent.lastReviewScore ? `${patent.lastReviewScore} 分` : '未审查';
                    const blockers = getBlockers(patent);

                    // Compute disclosure progress: prefer new wizard data, fall back to draftReadiness
                    const hasNewDisclosure = !!patent.disclosureData;
                    const totalQuestions = patent.patentType === 'utility' ? 5 : 7;
                    const answeredCount = hasNewDisclosure
                        ? patent.disclosureData!.answers.filter(a => a.answer.trim().length > 0).length
                        : 0;
                    const disclosurePercent = hasNewDisclosure
                        ? Math.round((answeredCount / totalQuestions) * 100)
                        : patent.draftReadiness;
                    const disclosureLabel = hasNewDisclosure
                        ? `${answeredCount} / ${totalQuestions} 题`
                        : `${patent.draftReadiness}%`;

                    // Patent type badge (only show explicit type labels)
                    const typeBadge = patent.patentType === 'invention' ? '发明专利'
                        : patent.patentType === 'utility' ? '实用新型'
                        : null;
                    // Field badge (separate from type badge)
                    const fieldBadge = patent.disclosureData?.field || patent.technicalField || null;

                    // Drafting stage label map
                    const STAGE_LABELS: Record<string, string> = {
                        abstract: '摘要',
                        claims: '权利要求',
                        description: '说明书',
                        embodiment: '实施例',
                        drawings: '附图说明',
                    };
                    const currentStageLabel = patent.draftingProgress?.currentStage
                        ? STAGE_LABELS[patent.draftingProgress.currentStage] ?? patent.draftingProgress.currentStage
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
                            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${statusMeta.badgeClass}`}>
                                {statusMeta.label}
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
                                <span>交底完整度</span>
                                <span>{disclosureLabel}</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                                    style={{ width: `${Math.max(6, disclosurePercent)}%` }}
                                />
                            </div>
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
                                审查 {reviewScore}
                            </div>
                        </div>

                        <div className="mb-5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                            <div className="text-xs font-semibold text-slate-700 mb-2">当前状态</div>
                            {blockers.length > 0 ? (
                                <div className="space-y-1 text-xs text-slate-500">
                                    {blockers.map((item) => (
                                        <div key={item}>• {item}</div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs text-emerald-600">当前没有明显卡点，可继续推进下一阶段。</div>
                            )}
                        </div>

                        <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
                            <span>最后编辑: {formatRelativeTime(patent.lastModified)}</span>
                            <span className="flex items-center gap-1 text-blue-600 font-medium group-hover:translate-x-1 transition-transform">
                                {statusMeta.nextAction}
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