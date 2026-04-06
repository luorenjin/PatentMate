
import React, { useState, useRef } from 'react';
import { AppView, PatentData } from '../types';
import { generateClaimStrategyPackage, generatePatentSection, generatePatentDrawing, refineText } from '../services/geminiService';
import { renderMarkdown } from '../services/markdownService';
import { RichTextEditor } from './RichTextEditor';

interface PatentDrafterProps {
  patentData: PatentData;
  updatePatentData: (key: keyof PatentData, value: any) => void;
    setView: (view: AppView) => void;
  onSave: () => void;
  onBack: () => void;
}

const PatentDrafter: React.FC<PatentDrafterProps> = ({ patentData, updatePatentData, setView, onSave, onBack }) => {
  const [activeSection, setActiveSection] = useState<keyof PatentData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Define sections
  const sections: Array<{ key: keyof PatentData; label: string; desc: string }> = [
    { key: 'abstract', label: '摘要 (Abstract)', desc: '简明扼要地说明发明的技术要点。' },
    { key: 'claims', label: '权利要求书 (Claims)', desc: '界定专利保护范围的法律文件，最核心部分。' },
    { key: 'descriptionOfDrawings', label: '附图说明 (Description of Drawings)', desc: '说明书附图的简要说明。' },
    { key: 'detailedDescription', label: '具体实施方式 (Detailed Description)', desc: '详细描述发明的实施细节，需充分公开。' },
  ];

    const strategyRisksText = patentData.strategyRisks.join('\n');

    const handleUpdateClaimStrategy = (value: string) => {
        updatePatentData('claimStrategy', value);
        updatePatentData('claimStrategyConfirmed', false);
    };

    const handleUpdateStrategyRisks = (value: string) => {
        updatePatentData('strategyRisks', value.split('\n').map((item) => item.trim()).filter(Boolean));
        updatePatentData('claimStrategyConfirmed', false);
    };

    const handleConfirmStrategy = () => {
        if (!patentData.claimStrategy.trim()) {
            alert('请先确认保护骨架内容，再进入正式起草。');
            return;
        }

        if (patentData.technicalHighlights.length < 3) {
            alert('关键技术特征不足，建议先返回交底采集补齐后再确认策略。');
            return;
        }

        updatePatentData('claimStrategyConfirmed', true);
        updatePatentData('status', 'drafting');
    };

    const handleRegenerateStrategy = async () => {
        const strategyPackage = await generateClaimStrategyPackage(patentData);
        updatePatentData('claimStrategy', strategyPackage.claimStrategy);
        updatePatentData('independentClaimSkeleton', strategyPackage.independentClaimSkeleton);
        updatePatentData('dependentClaimOptions', strategyPackage.dependentClaimOptions);
        updatePatentData('strategyRisks', strategyPackage.strategyRisks);
        updatePatentData('claimStrategyConfirmed', false);
    };

    const handleProceedToEditor = () => {
        updatePatentData('status', 'editing');
        setView(AppView.EDITOR);
    };

  const handleGenerate = async (key: keyof PatentData, label: string) => {
        if (!patentData.claimStrategyConfirmed) {
                alert('请先确认左侧的保护策略，再开始生成章节。');
                return;
        }

    if (!patentData.title || !patentData.inventionContent) {
        alert("请先完善左侧的基础信息（至少需填写发明名称和核心方案）");
        return;
    }

    setActiveSection(key);
    setIsGenerating(true);
    
    try {
      const initialContent = await generatePatentSection(label, patentData);
      // Convert Markdown/Text response to HTML with KaTeX support using markdownService
      const htmlContent = renderMarkdown(initialContent);
      updatePatentData(key, htmlContent);
    } catch (error) {
      console.error("Generation failed:", error);
      alert("生成失败，请重试。");
    } finally {
      setIsGenerating(false);
      setActiveSection(null);
    }
  };

  const handleBatchGenerate = async () => {
      if (!patentData.claimStrategyConfirmed) {
          alert('请先确认保护策略，再执行一键起草。');
          return;
      }

      if (!patentData.title || !patentData.inventionContent) {
          alert("无法开始：请先在左侧填写“发明名称”和“发明内容”。");
          return;
      }

      if (!window.confirm("确定要一键生成所有章节吗？\n\n系统将依次撰写：摘要 -> 权利要求 -> 附图说明 -> 具体实施方式。\n\n整个过程可能需要约 1-2 分钟，请保持网络连接。")) {
          return;
      }

      setIsBatchProcessing(true);

      const workingData = { ...patentData };

      const batchOrder: Array<{key: keyof PatentData, label: string}> = [
          { key: 'abstract', label: '摘要 (Abstract)' },
          { key: 'claims', label: '权利要求书 (Claims)' },
          { key: 'descriptionOfDrawings', label: '附图说明 (Description of Drawings)' },
          { key: 'detailedDescription', label: '具体实施方式 (Detailed Description)' }
      ];

      try {
        for (const section of batchOrder) {
            setActiveSection(section.key);
            
            const initialContent = await generatePatentSection(section.label, workingData);
            // Convert Markdown/Text to HTML
            const htmlContent = renderMarkdown(initialContent);
            
            updatePatentData(section.key, htmlContent);
            (workingData as any)[section.key] = initialContent; // Use raw content for context
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        alert("所有章节生成完毕！请检查内容并进行微调。");
      } catch (error) {
          console.error("Batch generation failed", error);
          alert("自动生成过程中断，部分内容可能已保存。");
      } finally {
          setActiveSection(null);
          setIsBatchProcessing(false);
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64String = (event.target.result as string).split(',')[1];
          const currentDrawings = patentData.drawings || [];
          updatePatentData('drawings', [...currentDrawings, base64String]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteImage = (index: number) => {
      if(window.confirm("确定要删除这张附图吗？")) {
          const currentDrawings = patentData.drawings || [];
          const newDrawings = currentDrawings.filter((_, i) => i !== index);
          updatePatentData('drawings', newDrawings);
      }
  };

  const handleGenerateImage = async () => {
    if (!patentData.title) {
        alert("请先填写专利名称。");
        return;
    }

    setIsGeneratingImage(true);
    try {
      let drawingContext = patentData.descriptionOfDrawings;

      if (!drawingContext) {
          if (!patentData.inventionContent) {
              alert("请先填写左侧的“发明内容”，AI 需要由此生成附图说明。");
              setIsGeneratingImage(false);
              return;
          }
          
          const generatedText = await generatePatentSection(
              '附图说明 (Description of Drawings)', 
              patentData, 
              "请简要描述本发明的1幅核心原理图或结构图。请简要描述不要太复杂，专注于核心结构或步骤，以便后续绘图。"
          );
          // Save HTML version
          drawingContext = renderMarkdown(generatedText);
          updatePatentData('descriptionOfDrawings', drawingContext);
      }

      const cleanContext = drawingContext.replace(/<[^>]+>/g, '\n');
      if (!cleanContext) {
          throw new Error("无法生成附图说明上下文");
      }

      const base64Image = await generatePatentDrawing(patentData.title, cleanContext);
            if (!base64Image) {
                alert("当前模型服务不支持附图生成，或附图生成暂时不可用。请切换到 Gemini 服务后重试。");
                return;
            }
      const currentDrawings = patentData.drawings || [];
      updatePatentData('drawings', [...currentDrawings, base64Image]);
    } catch (error) {
      console.error("Image generation failed:", error);
      alert("生成附图失败，请重试。");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="h-full flex flex-col relative">
       <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-sky-600 mb-2">Flow</div>
                  <h2 className="text-xl font-bold text-slate-900">步骤 2：策略确认后起草</h2>
                  <p className="text-sm text-slate-500 mt-2">先确认保护边界和风险，再批量生成权利要求、摘要和实施方式，避免直接从原始交底跳到文稿。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">1. 交底采集完成</span>
                  <span className={`px-3 py-1 rounded-full ${patentData.claimStrategyConfirmed ? 'bg-blue-600 text-white' : 'bg-amber-50 text-amber-700'}`}>
                      2. {patentData.claimStrategyConfirmed ? '策略已确认' : '待确认保护策略'}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600">3. 审校定稿</span>
              </div>
          </div>
       </div>

       {/* Header */}
       <div className="flex justify-between items-center mb-6 shrink-0">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-800 flex items-center gap-2 font-medium">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
             返回工作台
          </button>
                     <div className="flex items-center gap-3">
                     <button onClick={handleProceedToEditor} className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 flex items-center gap-2">
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                         进入审校定稿
                     </button>
                     <button onClick={onSave} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
             保存草稿
          </button>
                     </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden pb-4">
        {/* Lightbox Overlay */}
        {selectedImage && (
            <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-10" onClick={() => setSelectedImage(null)}>
                <div className="relative max-w-full max-h-full">
                    <img src={`data:image/jpeg;base64,${selectedImage}`} className="max-h-[90vh] max-w-[90vw] object-contain rounded-md" alt="Full size" />
                    <button 
                        className="absolute top-4 right-4 text-white bg-gray-800/50 hover:bg-gray-700 p-2 rounded-full"
                        onClick={() => setSelectedImage(null)}
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>
        )}

        {/* Input Column */}
        <div className="w-full md:w-1/3 flex flex-col gap-6 overflow-y-auto pr-2">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-lg mb-4 text-slate-800">基础信息录入</h3>
            
            <div className="space-y-4">
                <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">发明名称 *</label>
                <input
                    type="text"
                    value={patentData.title}
                    onChange={(e) => updatePatentData('title', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                />
                </div>
                <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">所属技术领域</label>
                <input
                    type="text"
                    value={patentData.technicalField}
                    onChange={(e) => updatePatentData('technicalField', e.target.value)}
                    placeholder="例如：人工智能、图像处理"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                />
                </div>
                <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">背景技术 (现有缺陷)</label>
                <textarea
                    value={patentData.backgroundArt}
                    onChange={(e) => updatePatentData('backgroundArt', e.target.value)}
                    placeholder="现有技术存在什么问题？为何需要本发明？"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm h-24 focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 resize-y"
                />
                </div>
                <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">发明内容 (核心方案) *</label>
                <RichTextEditor
                    value={patentData.inventionContent}
                    onChange={(val) => updatePatentData('inventionContent', val)}
                    placeholder="本发明的具体技术方案是什么？(支持 Markdown 和 LaTeX 公式)"
                    className="min-h-40"
                />
                </div>
            </div>
            </div>

            <div className="bg-slate-950 text-white p-6 rounded-xl shadow-sm border border-slate-900">
                <div className="text-xs uppercase tracking-[0.2em] text-cyan-300 mb-3">Claim Strategy</div>
                <h3 className="font-bold text-lg mb-3">起草保护骨架</h3>
                <p className="text-sm text-slate-300 leading-relaxed mb-4">
                    这里承接交底采集阶段整理出的必要技术特征。起草权利要求时，应优先围绕这些特征组织独立权利要求。
                </p>
                <textarea
                    value={patentData.claimStrategy}
                    onChange={(e) => handleUpdateClaimStrategy(e.target.value)}
                    className="w-full min-h-50 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm leading-relaxed text-slate-100 outline-none focus:ring-2 focus:ring-cyan-400 resize-y"
                    placeholder="在这里确认独立权利要求的必要技术特征、从属层级和保护边界。"
                />
                <div className="mt-4">
                    <label className="block text-xs uppercase tracking-[0.15em] text-slate-400 mb-2">策略风险与待补强点</label>
                    <textarea
                        value={strategyRisksText}
                        onChange={(e) => handleUpdateStrategyRisks(e.target.value)}
                        className="w-full min-h-30 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm leading-relaxed text-slate-200 outline-none focus:ring-2 focus:ring-cyan-400 resize-y"
                        placeholder="每行一条，记录保护边界不清、技术效果不足、实施例不够等风险。"
                    />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                    <div className={`text-sm font-medium ${patentData.claimStrategyConfirmed ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {patentData.claimStrategyConfirmed ? '保护策略已确认，可开始正式起草。' : '保护策略尚未确认，系统将阻止直接生成章节。'}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRegenerateStrategy}
                            className="px-4 py-2 rounded-lg font-semibold bg-white/10 text-white hover:bg-white/20"
                        >
                            重新生成策略
                        </button>
                        <button
                            onClick={handleConfirmStrategy}
                            className={`px-4 py-2 rounded-lg font-semibold ${patentData.claimStrategyConfirmed ? 'bg-emerald-600 text-white' : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'}`}
                        >
                            {patentData.claimStrategyConfirmed ? '已确认策略' : '确认保护策略'}
                        </button>
                    </div>
                </div>

                {patentData.independentClaimSkeleton && (
                    <div className="mt-4 pt-4 border-t border-slate-800">
                        <div className="text-xs uppercase tracking-[0.15em] text-slate-400 mb-2">独立权利要求骨架</div>
                        <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-slate-200">{patentData.independentClaimSkeleton}</pre>
                    </div>
                )}

                {patentData.dependentClaimOptions.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-800">
                        <div className="text-xs uppercase tracking-[0.15em] text-slate-400 mb-2">从属层级建议</div>
                        <ul className="space-y-2 text-sm text-slate-200">
                            {patentData.dependentClaimOptions.map((item) => (
                                <li key={item}>• {item}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>

        {/* Generation Column */}
        <div className="w-full md:w-2/3 space-y-6 overflow-y-auto pb-10 pr-2">
            <div className="sticky top-0 bg-slate-50 z-10 py-2 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                    <span className="bg-blue-100 text-blue-600 p-2 rounded-lg">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </span>
                    步骤 2: 策略确认后起草
                </h2>
                
                <button 
                    type="button"
                    onClick={handleBatchGenerate}
                    disabled={isGenerating || isBatchProcessing}
                    className={`px-4 py-2 rounded-lg font-semibold shadow-md transition-all flex items-center gap-2 ${
                        isBatchProcessing || isGenerating || !patentData.claimStrategyConfirmed
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                        : 'bg-linear-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transform hover:-translate-y-0.5'
                    }`}
                >
                    {isBatchProcessing ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            正在一键生成全部...
                        </>
                    ) : !patentData.claimStrategyConfirmed ? (
                        <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2h-1V9a5 5 0 00-10 0v2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                            先确认保护策略
                        </>
                    ) : (
                        <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                            一键生成全部章节
                        </>
                    )}
                </button>
            </div>

            {sections.map((section) => (
            <div key={section.key} className={`bg-white rounded-xl shadow-sm border overflow-visible transition-colors ${activeSection === section.key ? 'border-blue-400 ring-2 ring-blue-50' : 'border-slate-200'}`}>
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center rounded-t-xl">
                <div>
                    <h4 className="font-bold text-slate-700">{section.label}</h4>
                    <p className="text-xs text-slate-500">{section.desc}</p>
                </div>
                <button
                    type="button"
                    onClick={() => handleGenerate(section.key, section.label)}
                    disabled={isGenerating || isBatchProcessing}
                    className="px-4 py-2 bg-white border border-blue-200 text-blue-600 rounded-lg text-sm hover:bg-blue-50 hover:border-blue-300 transition-all disabled:opacity-50 flex items-center gap-2 font-medium"
                >
                    {activeSection === section.key && (isGenerating || isBatchProcessing) ? (
                    <span className="flex items-center gap-2">
                        <svg className="animate-spin h-3 w-3 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        撰写中...
                    </span>
                    ) : (
                    <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        AI 生成文本
                    </>
                    )}
                </button>
                </div>

                <div className="p-6">
                    {section.key === 'descriptionOfDrawings' && (
                        <div className="mb-6 p-4 bg-slate-100 rounded-xl border border-slate-200">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex flex-col">
                                    <h5 className="font-bold text-slate-600 text-sm">附图管理 (Drawings)</h5>
                                    <span className="text-xs text-slate-400">
                                        {patentData.descriptionOfDrawings 
                                            ? "AI 绘图将依据下方“附图说明”的内容生成。" 
                                            : "附图说明为空时，点击“自动配图”将先自动生成说明文本。"
                                        }
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    <input 
                                        type="file" 
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                        accept="image/*"
                                        className="hidden"
                                    />
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                        上传图片
                                    </button>
                                    <button 
                                        onClick={handleGenerateImage}
                                        disabled={isGeneratingImage}
                                        className="px-3 py-1.5 bg-indigo-600 border border-indigo-600 rounded-lg text-xs text-white hover:bg-indigo-700 flex items-center gap-1 disabled:opacity-50"
                                    >
                                        {isGeneratingImage ? '生成说明与绘图中...' : (
                                            <>
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                                AI 自动配图
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                            
                            {(patentData.drawings && patentData.drawings.length > 0) ? (
                                <div className="grid grid-cols-3 gap-4">
                                    {patentData.drawings.map((img, idx) => (
                                        <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-300 bg-white aspect-4/3">
                                            <img 
                                                src={`data:image/jpeg;base64,${img}`} 
                                                alt={`Fig ${idx + 1}`} 
                                                className="w-full h-full object-contain cursor-zoom-in" 
                                                onClick={() => setSelectedImage(img)}
                                            />
                                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center">
                                                图 {idx + 1}
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteImage(idx); }}
                                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                                title="删除图片"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-slate-400 text-xs border-2 border-dashed border-slate-300 rounded-lg">
                                    暂无附图。点击“AI 自动配图”可自动生成附图说明及图片。
                                </div>
                            )}
                        </div>
                    )}

                <RichTextEditor
                    value={(patentData[section.key] as string) || ''}
                    onChange={(newHtml) => updatePatentData(section.key, newHtml)}
                    placeholder={`在此处撰写或生成${section.label}... (支持 Markdown 和 LaTeX 公式)`}
                    className="min-h-62.5"
                />
                </div>
            </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default PatentDrafter;
