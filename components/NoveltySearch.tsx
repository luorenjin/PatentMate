
import React, { useState } from 'react';
import { performNoveltySearch, generateInventionIdea, analyzePatentBasics, optimizeInventionContent } from '../services/geminiService';
import { NoveltyReport, PatentData, AppView } from '../types';
import { RichTextEditor } from './RichTextEditor';
import { renderMarkdown } from '../services/markdownService';

interface NoveltySearchProps {
  patentData: PatentData;
  updatePatentData: (key: keyof PatentData, value: any) => void;
  setView: (view: AppView) => void;
  onSave: () => void;
  onBack: () => void;
}

// Helper to strip HTML tags to get plain text for AI inputs
const stripHtml = (html: string) => {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
};

const NoveltySearch: React.FC<NoveltySearchProps> = ({ patentData, updatePatentData, setView, onSave, onBack }) => {
  const [isSearching, setIsSearching] = useState(false);
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [isPreparingDraft, setIsPreparingDraft] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedContent, setOptimizedContent] = useState<string | null>(null);
  const [report, setReport] = useState<NoveltyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!patentData.title || !patentData.inventionContent) {
      setError("请输入专利名称和核心发明内容以进行检索。");
      return;
    }
    setError(null);
    setIsSearching(true);
    setReport(null);
    setOptimizedContent(null);

    // Strip HTML for the search prompt to ensure clean context
    const plainDescription = stripHtml(patentData.inventionContent);

    try {
      const result = await performNoveltySearch(patentData.title, plainDescription);
      setReport(result);
    } catch (err) {
      setError("检索过程中发生错误，请检查网络或API Key设置。");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAutoFill = async () => {
    if (!patentData.title) {
      setError("请先输入专利名称，AI 才能为您构思方案。");
      return;
    }
    setError(null);
    setIsGeneratingIdea(true);
    try {
      const idea = await generateInventionIdea(patentData.title);
      // Convert Markdown to HTML for the RichTextEditor
      const htmlIdea = renderMarkdown(idea);
      updatePatentData('inventionContent', htmlIdea);
    } catch (err) {
      setError("AI 构思失败，请重试。");
    } finally {
      setIsGeneratingIdea(false);
    }
  };

  const handleOptimize = async () => {
      if (!report) return;
      setIsOptimizing(true);
      setError(null);
      
      const plainContent = stripHtml(patentData.inventionContent);

      try {
          const optimizedContentRaw = await optimizeInventionContent(plainContent, report.analysis);
          // Convert Markdown to HTML before storing in local state
          const htmlOptimized = renderMarkdown(optimizedContentRaw);
          setOptimizedContent(htmlOptimized);
      } catch (err) {
          setError("优化失败，请重试。");
      } finally {
          setIsOptimizing(false);
      }
  };

  const handleProceedToDraft = async () => {
    setIsPreparingDraft(true);
    // Use plain text for analysis prompt, or allow HTML if the service handles it.
    // Generally stripping is safer for simple extraction prompts.
    const plainContent = stripHtml(patentData.inventionContent);

    try {
        const basics = await analyzePatentBasics(patentData.title, plainContent);
        updatePatentData('technicalField', basics.technicalField);
        updatePatentData('backgroundArt', basics.backgroundArt);
        setView(AppView.DRAFTER);
    } catch (e) {
        console.error(e);
        setView(AppView.DRAFTER);
    } finally {
        setIsPreparingDraft(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      {/* Header Controls */}
      <div className="flex justify-between items-center">
          <button 
            onClick={onBack}
            className="text-slate-500 hover:text-slate-800 flex items-center gap-2 font-medium"
          >
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
             返回工作台
          </button>
          <button 
            onClick={onSave}
            className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2"
          >
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
             保存草稿
          </button>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
          <span className="bg-blue-100 text-blue-600 p-2 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          步骤 1: 新颖性及授权概率评估
        </h2>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">专利/发明名称</label>
            <input
              type="text"
              value={patentData.title}
              onChange={(e) => updatePatentData('title', e.target.value)}
              placeholder="例如：一种基于深度学习的图像去噪方法"
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white text-slate-900 placeholder-slate-400"
            />
          </div>
          
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-slate-700">发明内容概要（核心技术点）</label>
              <button
                onClick={handleAutoFill}
                disabled={isGeneratingIdea || !patentData.title}
                className="text-xs px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                {isGeneratingIdea ? (
                   <span className="animate-pulse">AI 深度构思中...</span>
                ) : (
                   <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      AI 自动联想 (TRIZ 创新)
                   </>
                )}
              </button>
            </div>
            
            <RichTextEditor
              value={patentData.inventionContent}
              onChange={(val) => updatePatentData('inventionContent', val)}
              placeholder="简要描述本发明解决了什么问题，采用了什么核心技术手段（如结构、算法、工艺流程等）... (支持 Markdown 和 LaTeX 公式)"
              className="min-h-[160px]"
            />
          </div>

          <button
            onClick={handleSearch}
            disabled={isSearching || isPreparingDraft || isOptimizing}
            className="w-full bg-blue-600 text-white font-semibold py-4 rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSearching ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                正在进行全球检索与分析...
              </>
            ) : (
              "开始新颖性检索与评估"
            )}
          </button>
          
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
              {error}
            </div>
          )}
        </div>
      </div>

      {report && (
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-blue-100 animate-fade-in-up">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-4">
                 <h3 className="text-xl font-bold text-slate-800">评估报告</h3>
                <div className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg">
                  <span className="text-sm text-slate-500">预估成功率:</span>
                  <div className={`text-2xl font-bold ${
                    report.score >= 80 ? 'text-green-600' : report.score >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {report.score}%
                  </div>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                {/* Show Optimize button explicitly if score < 90 (User Requirement) */}
                {report.score < 90 && (
                    <div className="flex flex-col items-end">
                        <span className="text-xs text-amber-600 mb-1 font-medium">成功率未达90%，建议优化</span>
                        <button 
                            onClick={handleOptimize}
                            disabled={isOptimizing}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold shadow-md transition-all flex items-center gap-2 disabled:opacity-50 animate-pulse-slow"
                        >
                            {isOptimizing ? (
                                <span className="animate-pulse">AI 优化中...</span>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    基于报告优化方案
                                </>
                            )}
                        </button>
                    </div>
                )}

                <button 
                    onClick={handleProceedToDraft}
                    disabled={isPreparingDraft}
                    className={`${
                        report.score >= 80 
                            ? 'bg-green-600 hover:bg-green-700 text-white' 
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                    } px-4 py-2 rounded-lg font-semibold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50`}
                >
                    {isPreparingDraft ? (
                        <span className="animate-pulse">AI 准备中...</span>
                    ) : (
                        <>
                            前往撰写
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                        </>
                    )}
                </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="p-6 bg-slate-50 rounded-xl border border-slate-200">
              <h4 className="font-semibold text-slate-800 mb-3">AI 审查意见分析</h4>
              <div 
                  className="text-slate-600 leading-relaxed prose prose-sm max-w-none prose-slate"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(report.analysis) }} 
              />
            </div>

            <div>
              <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                检出的相关现有技术 (Prior Art)
              </h4>
              <div className="grid gap-3">
                {Array.isArray(report.priorArtLinks) && report.priorArtLinks.length > 0 ? (
                    report.priorArtLinks.map((link, i) => (
                    <a 
                        key={i} 
                        href={link.uri} 
                        target="_blank" 
                        rel="noreferrer"
                        className="block p-4 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all group w-full overflow-hidden"
                    >
                        <div className="flex flex-col gap-1 w-full">
                        <span className="font-medium text-slate-700 group-hover:text-blue-700 truncate block w-full" title={link.title}>
                            {link.title || "未知标题"}
                        </span>
                        <span className="text-xs text-slate-400 group-hover:text-blue-500 break-all line-clamp-2">
                            {link.uri}
                        </span>
                        </div>
                    </a>
                    ))
                ) : (
                    <p className="text-slate-500 text-sm italic p-4 bg-slate-50 rounded-lg">未找到明确的现有技术链接。</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {optimizedContent && (
        <div className="bg-indigo-50 p-8 rounded-2xl shadow-lg border border-indigo-200 animate-fade-in-up mt-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <h3 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              AI 优化方案建议
            </h3>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const newContent = `${patentData.inventionContent}\n\n<hr />\n<h3>【AI 优化方案建议】</h3>\n${optimizedContent}`;
                  updatePatentData('inventionContent', newContent);
                  setOptimizedContent(null);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold shadow-md transition-all"
              >
                采纳建议并将其追加到已有内容末尾
              </button>
              <button
                onClick={() => setOptimizedContent(null)}
                className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-semibold shadow-sm transition-all"
              >
                忽略
              </button>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-indigo-100 max-h-[500px] overflow-y-auto">
            <div 
                className="text-slate-700 leading-relaxed prose prose-sm max-w-none prose-indigo"
                dangerouslySetInnerHTML={{ __html: optimizedContent }} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default NoveltySearch;
