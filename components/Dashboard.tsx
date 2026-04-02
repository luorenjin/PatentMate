import React, { useEffect, useState } from 'react';
import { PatentData } from '../types';
import { getPatents, deletePatentFromStorage } from '../services/storageService';

interface DashboardProps {
    onOpenPatent: (patent: PatentData) => void;
    onCreateNew: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onOpenPatent, onCreateNew }) => {
    const [patents, setPatents] = useState<PatentData[]>([]);
    const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

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
                    <p className="text-slate-500 mt-2">管理您的专利申请草稿和已完成的项目</p>
                </div>
                <button 
                    onClick={onCreateNew}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1 flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    新建专利申请
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Create New Card Placeholder */}
                <div 
                    onClick={onCreateNew}
                    className="border-2 border-dashed border-slate-300 rounded-2xl p-8 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer min-h-[240px] group"
                >
                    <div className="w-16 h-16 rounded-full bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center mb-4 transition-colors">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    </div>
                    <span className="font-medium">创建新项目</span>
                </div>

                {/* Patent Cards */}
                {patents.map((patent) => (
                    <div 
                        key={patent.id}
                        onClick={() => onOpenPatent(patent)}
                        className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all cursor-pointer relative group flex flex-col"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                                patent.status === 'ready_to_submit' 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-amber-100 text-amber-700'
                            }`}>
                                {patent.status === 'ready_to_submit' ? '待提交' : '草稿中'}
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
                            {patent.technicalField ? `领域：${patent.technicalField}` : "暂无技术领域信息..."}
                        </p>

                        <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
                            <span>最后编辑: {new Date(patent.lastModified).toLocaleDateString()}</span>
                            <span className="flex items-center gap-1 text-blue-600 font-medium group-hover:translate-x-1 transition-transform">
                                继续编辑
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </span>
                        </div>
                    </div>
                ))}
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