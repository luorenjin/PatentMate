
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { AppView, PatentData, ReviewResult, ReviewIssue } from '../types';
import { refineText, regenerateClaimStrategyFromReview, runFinalPatentReview } from '../services/geminiService';
import { renderMarkdown } from '../services/markdownService';
import { RichTextEditor } from './RichTextEditor';
import { exportToDocx, exportToPdf, downloadBlob } from '../services/exportService';

interface EditorProps {
  patentData: PatentData;
  updatePatentData: (key: keyof PatentData, value: any) => void;
    setView: (view: AppView) => void;
  onSave: () => void;
  onBack: () => void;
}

// Helper to strip HTML tags to get plain text for AI inputs
const stripHtml = (html?: string) => {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html || '';
    return tmp.textContent || tmp.innerText || '';
};

// Helper to auto-number paragraphs for Description sections [0001], [0002]...
const formatTextWithNumbering = (content?: string, startCount: number = 1): { html: React.ReactNode, nextCount: number } => {
    if (!content) return { html: <p className="text-slate-400 text-sm mb-2">[暂无内容]</p>, nextCount: startCount };
    
    let blocks: { isBlock: boolean, content: string }[] = [];

    // Check if content is HTML
    if (/<[a-z][\s\S]*>/i.test(content)) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        const nodes = Array.from(doc.body.childNodes);
        
        nodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                // Treat paragraphs, divs, list items as numbered blocks
                // Headers and other structures might be kept without numbering or as blocks depending on preference
                if (el.tagName === 'P' || el.tagName === 'DIV' || el.tagName === 'LI') {
                   if (el.textContent?.trim()) {
                       blocks.push({ isBlock: true, content: el.innerHTML });
                   }
                } else if (['H1', 'H2', 'H3', 'H4', 'H5'].includes(el.tagName)) {
                   // Headers usually not numbered with [0001] in patent body, but let's keep simple logic
                   blocks.push({ isBlock: false, content: el.outerHTML });
                } else {
                   blocks.push({ isBlock: false, content: el.outerHTML });
                }
            } else if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent?.trim();
                if (text) blocks.push({ isBlock: true, content: text });
            }
        });
    } else {
        content.split('\n').forEach(line => {
             if(line.trim()) blocks.push({ isBlock: true, content: line });
        });
    }

    let currentCount = startCount;

    const elements = blocks.map((block, index) => {
        if (block.isBlock) {
            const numStr = String(currentCount).padStart(4, '0');
            currentCount++;
            return (
                <div key={index} className="mb-2 text-justify leading-relaxed text-base indent-8 relative">
                    <span className="font-mono text-sm text-slate-500 absolute -left-2 select-none w-10 text-right">[{numStr}]</span>
                    <span dangerouslySetInnerHTML={{ __html: block.content }} />
                </div>
            );
        } else {
            return <div key={index} dangerouslySetInnerHTML={{ __html: block.content }} className="mb-2" />;
        }
    });

    return { html: <div className="pl-10">{elements}</div>, nextCount: currentCount };
};

const Editor: React.FC<EditorProps> = ({ patentData, updatePatentData, setView, onSave, onBack }) => {
  const [selectedSection, setSelectedSection] = useState<keyof PatentData>('claims');
  const [processingType, setProcessingType] = useState<string | null>(null);
  
  // Review State
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [fixedIssueIndices, setFixedIssueIndices] = useState<number[]>([]); // Track which issues are fixed
    const [isRegeneratingStrategy, setIsRegeneratingStrategy] = useState(false);

  // Preview State
  const [showPreview, setShowPreview] = useState(false);

  // Paragraph Selection & Polish State
  const [selectedParagraphs, setSelectedParagraphs] = useState<number[]>([]);
  const [showPolishToolbar, setShowPolishToolbar] = useState(false);
  const [polishPosition, setPolishPosition] = useState({ x: 0, y: 0 });
  const [isPolishing, setIsPolishing] = useState(false);

  // Validation State
  const [validationIssues, setValidationIssues] = useState<{ section: string; issue: string; severity: 'error' | 'warning' | 'info' }[]>([]);

  // Export State
  const [isExporting, setIsExporting] = useState(false);

  const appendTextBlock = (current: string, title: string, content: string) => {
      const block = `${title}\n- ${content}`;
      if (current.includes(content)) return current;
      return [current, block].filter(Boolean).join('\n\n');
  };

  const mergeStrategyRisk = (risk: string) => {
      if (patentData.strategyRisks.includes(risk)) return;
      updatePatentData('strategyRisks', [...patentData.strategyRisks, risk]);
  };

  // Validation Checker
  const validatePatent = () => {
      const issues: typeof validationIssues = [];

      // Abstract validation: 200-300 characters
      const abstractText = stripHtml(patentData.abstract);
      if (!abstractText) {
          issues.push({ section: '摘要', issue: '摘要为空', severity: 'error' });
      } else if (abstractText.length < 50) {
          issues.push({ section: '摘要', issue: `摘要过短 (${abstractText.length}字符)，建议50-300字符`, severity: 'warning' });
      } else if (abstractText.length > 300) {
          issues.push({ section: '摘要', issue: `摘要过长 (${abstractText.length}字符)，建议控制在300字符以内`, severity: 'warning' });
      }

      // Claims validation
      const claimsText = stripHtml(patentData.claims);
      if (!claimsText) {
          issues.push({ section: '权利要求书', issue: '权利要求书为空', severity: 'error' });
      } else if (!/^1\./m.test(claimsText)) {
          issues.push({ section: '权利要求书', issue: '独立权利要求应从"1."开始', severity: 'error' });
      }

      // Description validation
      const hasBackground = stripHtml(patentData.backgroundArt).length > 20;
      const hasPurpose = stripHtml(patentData.inventionContent).length > 20;
      const hasSolution = stripHtml(patentData.inventionContent).includes('解决') || stripHtml(patentData.inventionContent).includes('方案');
      const hasEmbodiments = stripHtml(patentData.detailedDescription).length > 50;

      if (!hasBackground) {
          issues.push({ section: '说明书', issue: '背景技术描述不足', severity: 'warning' });
      }
      if (!hasPurpose) {
          issues.push({ section: '说明书', issue: '发明目的/技术问题不明确', severity: 'warning' });
      }
      if (!hasSolution) {
          issues.push({ section: '说明书', issue: '未明确技术方案或解决手段', severity: 'warning' });
      }
      if (!hasEmbodiments) {
          issues.push({ section: '说明书', issue: '具体实施方式内容不足', severity: 'error' });
      }

      setValidationIssues(issues);
  };

  useEffect(() => {
      validatePatent();
  }, [patentData.abstract, patentData.claims, patentData.backgroundArt, patentData.inventionContent, patentData.detailedDescription]);

  // Paragraph selection handlers
  const handleParagraphSelect = (index: number, event: React.MouseEvent) => {
      if (event.shiftKey && selectedParagraphs.length > 0) {
          // Multi-select with Shift+Click
          const lastSelected = selectedParagraphs[selectedParagraphs.length - 1];
          const start = Math.min(lastSelected, index);
          const end = Math.max(lastSelected, index);
          const range = Array.from({ length: end - start + 1 }, (_, i) => start + i);
          setSelectedParagraphs([...new Set([...selectedParagraphs, ...range])]);
      } else if (event.ctrlKey || event.metaKey) {
          // Toggle selection with Ctrl/Cmd+Click
          if (selectedParagraphs.includes(index)) {
              setSelectedParagraphs(selectedParagraphs.filter(i => i !== index));
          } else {
              setSelectedParagraphs([...selectedParagraphs, index]);
          }
      } else {
          // Single select
          setSelectedParagraphs([index]);
      }
  };

  const handleTextSelection = () => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 10) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setPolishPosition({ x: rect.left + rect.width / 2, y: rect.top - 40 });
          setShowPolishToolbar(true);
      } else {
          setShowPolishToolbar(false);
      }
  };

  const handlePolishSelection = async () => {
      const selection = window.getSelection();
      if (!selection || selection.toString().trim().length < 10) return;

      const selectedText = selection.toString().trim();
      setIsPolishing(true);
      try {
          const polished = await refineText(selectedText, 'polish');
          // Replace selected text with polished version
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(polished));
          setShowPolishToolbar(false);
          selection.removeAllRanges();
      } catch (err) {
          console.error('Polish failed:', err);
      } finally {
          setIsPolishing(false);
      }
  };

  const handleWriteBackToStrategy = (issue: ReviewIssue) => {
      const strategyUpdate = appendTextBlock(
          patentData.claimStrategy,
          `【审查回写 - ${getSectionLabel(issue.section)}】`,
          `${issue.issue}；修改方向：${stripHtml(renderMarkdown(issue.suggestion))}`,
      );
      updatePatentData('claimStrategy', strategyUpdate);
      updatePatentData('claimStrategyConfirmed', false);
      mergeStrategyRisk(issue.issue);
  };

  const handleWriteBackToDisclosure = (issue: ReviewIssue) => {
      const disclosureUpdate = appendTextBlock(
          patentData.disclosureSummary,
          `【审查回写 - ${getSectionLabel(issue.section)}】`,
          issue.issue,
      );
      updatePatentData('disclosureSummary', disclosureUpdate);
      mergeStrategyRisk(issue.issue);
  };

  const handleWriteBackAllIssues = (target: 'strategy' | 'disclosure') => {
      if (!reviewResult?.detailedIssues || reviewResult.detailedIssues.length === 0) return;
      reviewResult.detailedIssues.forEach((issue) => {
          if (target === 'strategy') {
              handleWriteBackToStrategy(issue);
          } else {
              handleWriteBackToDisclosure(issue);
          }
      });
  };

  const handleRegenerateStrategyAfterWriteBack = async () => {
      setIsRegeneratingStrategy(true);
      try {
          const result = await regenerateClaimStrategyFromReview(patentData);
          updatePatentData('claimStrategy', result.claimStrategy);
          updatePatentData('independentClaimSkeleton', result.independentClaimSkeleton);
          updatePatentData('dependentClaimOptions', result.dependentClaimOptions);
          updatePatentData('strategyRisks', result.strategyRisks);
          updatePatentData('claimStrategyConfirmed', false);
      } finally {
          setIsRegeneratingStrategy(false);
      }
  };

  const handleRefine = async (type: 'expand' | 'polish' | 'fix_legal') => {
    const currentContent = patentData[selectedSection];
    if (typeof currentContent !== 'string' || !currentContent) return;

    // 1. Strip HTML to send clean text to AI
    const plainText = stripHtml(currentContent);

    setProcessingType(type);
    try {
      const newText = await refineText(plainText, type);
      // 2. Convert result (likely Markdown) to HTML
      const newHtml = renderMarkdown(newText);
      updatePatentData(selectedSection, newHtml);
    } finally {
      setProcessingType(null);
    }
  };

  const handleExportDocx = async () => {
    setIsExporting(true);
    try {
        const blob = await exportToDocx(patentData);
        downloadBlob(blob, `${patentData.title || 'patent'}_申请书.docx`);
    } catch (err) {
        console.error('DOCX export failed:', err);
        alert('导出失败，请重试');
    } finally {
        setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
        const blob = await exportToPdf(patentData);
        downloadBlob(blob, `${patentData.title || 'patent'}_申请书.pdf`);
    } catch (err) {
        console.error('PDF export failed:', err);
        alert('导出失败，请重试');
    } finally {
        setIsExporting(false);
    }
  };

  const handleExportLegacy = () => {
    const { title, technicalField, backgroundArt, inventionContent, abstract, claims, descriptionOfDrawings, detailedDescription } = patentData;

    // Simple export needs to strip HTML for now as we are creating a basic .doc blob
    const clean = (html: string | undefined) => stripHtml(html || '');

    const exportContent = `发明名称：${title}\n\n摘要：\n${clean(abstract)}\n\n权利要求书：\n${clean(claims)}\n\n说明书：\n\n技术领域\n${clean(technicalField)}\n\n背景技术\n${clean(backgroundArt)}\n\n发明内容\n${clean(inventionContent)}\n\n附图说明\n${clean(descriptionOfDrawings)}\n\n具体实施方式\n${clean(detailedDescription)}`;
    const blob = new Blob([exportContent], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title || 'patent'}_申请书.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleStartReview = async () => {
      if(!patentData.claims || !patentData.detailedDescription) {
          alert("请先确保“权利要求书”和“具体实施方式”已填写，审查员无法审查空白文档。");
          return;
      }
      setIsReviewing(true);
      setReviewResult(null);
      setFixedIssueIndices([]); 
      
      // Pass a clean copy of data to review to avoid HTML tag noise in prompt
      const cleanData = { ...patentData };
      (Object.keys(cleanData) as Array<keyof PatentData>).forEach(key => {
          if (typeof cleanData[key] === 'string') {
              (cleanData as any)[key] = stripHtml(cleanData[key] as string);
          }
      });

      try {
          const result = await runFinalPatentReview(cleanData);
          setReviewResult(result);
          updatePatentData('reviewSummary', result.feedback);
          updatePatentData('lastReviewScore', result.score);
          updatePatentData('status', 'editing');
          if (Array.isArray(result.detailedIssues) && result.detailedIssues.length > 0) {
              const mergedRisks = Array.from(new Set([...patentData.strategyRisks, ...result.detailedIssues.map((item) => item.issue)]));
              updatePatentData('strategyRisks', mergedRisks);
              updatePatentData('claimStrategyConfirmed', false);
          }
      } finally {
          setIsReviewing(false);
      }
  };

  const handleMarkAsReady = () => {
      if (reviewResult?.passed) {
          updatePatentData('status', 'ready_to_submit');
          updatePatentData('lastReviewScore', reviewResult.score);
          updatePatentData('reviewSummary', reviewResult.feedback);
          onSave();
          alert("恭喜！该专利已标记为“待提交”并保存。");
      }
  };

  const handleApplyFix = (issue: ReviewIssue, index: number) => {
      if (fixedIssueIndices.includes(index)) return;

      if (window.confirm(`确定要应用 AI 对【${getSectionLabel(issue.section)}】章节的修改建议吗？这将覆盖当前该章节的内容。`)) {
          // The suggestion from AI is usually Markdown/text. Format it.
          const htmlSuggestion = renderMarkdown(issue.suggestion);
          
          updatePatentData(issue.section, htmlSuggestion);
          setSelectedSection(issue.section);
          setFixedIssueIndices(prev => [...prev, index]);

          // Optional: Scroll to top of editor
          const editorArea = document.querySelector('.rich-text-editor-container');
          if (editorArea) editorArea.scrollTop = 0;
      }
  };

  const getSectionLabel = (key: string) => {
      const map: Record<string, string> = {
          'claims': '权利要求书',
          'abstract': '摘要',
          'detailedDescription': '具体实施方式',
          'backgroundArt': '背景技术',
          'descriptionOfDrawings': '附图说明',
          'technicalField': '技术领域',
          'inventionContent': '发明内容'
      };
      return map[key] || key;
  };

  // ---- Preview Generation Logic ----
  const PreviewContent = useMemo(() => {
      if (!showPreview) return null;

      let pCount = 1;
      const renderDescriptionSection = (title: string, content?: string) => {
          const res = formatTextWithNumbering(content, pCount);
          pCount = res.nextCount;
          return (
              <div className="mb-6">
                  <h4 className="font-bold text-slate-900 mb-2 text-base text-center">{title}</h4>
                  <div className="text-base leading-loose text-slate-800 font-serif">{res.html}</div>
              </div>
          );
      };

      return (
          <div className="font-serif text-black max-w-[210mm] mx-auto bg-white min-h-screen">
              {/* 1. Cover Page Mockup */}
              <div className="page-break-after pb-10 border-b-2 border-dashed border-slate-200 mb-10 print:border-none">
                  <div className="text-center border-b-2 border-black pb-4 mb-6 relative">
                      <div className="text-sm font-bold absolute left-0 top-0">(19)中华人民共和国国家知识产权局</div>
                      <h1 className="text-2xl font-bold tracking-widest mt-12">(12) 实用新型专利</h1>
                  </div>
                  
                  <div className="grid grid-cols-[140px_1fr] gap-y-6 text-sm mb-8">
                      <div className="font-bold text-right pr-6">(54) 实用新型名称</div>
                      <div className="font-bold text-lg">{patentData.title || "未命名"}</div>
                      
                      <div className="font-bold text-right pr-6">(57) 摘要</div>
                      <div className="text-justify leading-relaxed">
                          {/* Render HTML safely in abstract preview */}
                          <div dangerouslySetInnerHTML={{ __html: patentData.abstract || "暂无摘要" }} />
                      </div>
                  </div>
                  
                  {(patentData.drawings && patentData.drawings.length > 0) && (
                      <div className="flex justify-center mt-12 p-4">
                           <img src={`data:image/jpeg;base64,${patentData.drawings[0]}`} className="max-h-72 object-contain border border-slate-100" alt="Abstract Fig" />
                      </div>
                  )}
              </div>

              {/* 2. Claims */}
              <div className="page-break-after min-h-[297mm] relative p-12 pt-16 bg-white">
                  <div className="absolute top-8 right-12 text-xs text-slate-500">权利要求书 1/1 页</div>
                  <h2 className="text-xl font-bold text-center mb-10 tracking-[0.5em]">权利要求书</h2>
                  <div className="text-base leading-[2.5] text-justify font-serif">
                      <div dangerouslySetInnerHTML={{ __html: patentData.claims || "暂无权利要求" }} />
                  </div>
              </div>

              {/* 3. Description */}
              <div className="page-break-after min-h-[297mm] relative p-12 pt-16 bg-white mt-4">
                   <div className="absolute top-8 right-12 text-xs text-slate-500">说明书 1/X 页</div>
                   <h2 className="text-xl font-bold text-center mb-10 tracking-[0.5em]">说明书</h2>
                   
                   <div className="text-lg font-bold text-center mb-8">{patentData.title}</div>

                   <div className="text-justify font-serif">
                       {renderDescriptionSection("技术领域", patentData.technicalField)}
                       {renderDescriptionSection("背景技术", patentData.backgroundArt)}
                       {renderDescriptionSection("发明内容", patentData.inventionContent)}
                       {renderDescriptionSection("附图说明", patentData.descriptionOfDrawings)}
                       {renderDescriptionSection("具体实施方式", patentData.detailedDescription)}
                   </div>
              </div>

              {/* 4. Drawings */}
              {(patentData.drawings && patentData.drawings.length > 0) && (
                  <div className="page-break-after min-h-[297mm] relative p-12 pt-16 bg-white mt-4">
                      <div className="absolute top-8 right-12 text-xs text-slate-500">说明书附图 1/1 页</div>
                      <h2 className="text-xl font-bold text-center mb-12 tracking-[0.5em]">说明书附图</h2>
                      <div className="space-y-16 flex flex-col items-center">
                          {patentData.drawings.map((img, idx) => (
                              <div key={idx} className="flex flex-col items-center w-full">
                                  <img src={`data:image/jpeg;base64,${img}`} className="max-w-4/5 max-h-150 object-contain" alt={`Figure ${idx+1}`} />
                                  <div className="mt-6 font-bold text-lg">图 {idx + 1}</div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
          </div>
      );
  }, [showPreview, patentData]);

  return (
    <div className="h-full flex flex-col relative" onMouseUp={handleTextSelection} onMouseDown={() => setShowPolishToolbar(false)}>
       {/* Floating Polish Toolbar */}
       {showPolishToolbar && (
           <div
               className="fixed z-50 bg-white border border-blue-200 rounded-lg shadow-xl px-3 py-2 flex items-center gap-2 animate-fade-in"
               style={{ left: polishPosition.x, top: polishPosition.y, transform: 'translateX(-50%)' }}
           >
               <button
                   onClick={handlePolishSelection}
                   disabled={isPolishing}
                   className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
               >
                   {isPolishing ? (
                       <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                   ) : (
                       <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                   )}
                   AI 润色
               </button>
               <div className="text-xs text-slate-400">选中文字后出现</div>
           </div>
       )}

       <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-violet-600 mb-2">Flow</div>
                  <h2 className="text-xl font-bold text-slate-900">步骤 3：审校定稿与回写</h2>
                  <p className="text-sm text-slate-500 mt-2">这里不仅做章节润色，也把审查问题回写到交底摘要和保护策略，避免问题只停留在最终文稿层。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">1. 交底采集</span>
                  <button onClick={() => setView(AppView.DRAFTER)} className="px-3 py-1 rounded-full bg-sky-50 text-sky-700 hover:bg-sky-100">
                      2. 返回策略起草
                  </button>
                  <span className={`px-3 py-1 rounded-full ${patentData.status === 'ready_to_submit' ? 'bg-green-600 text-white' : 'bg-violet-50 text-violet-700'}`}>
                      3. {patentData.status === 'ready_to_submit' ? '已定稿待提交' : '审校定稿中'}
                  </span>
              </div>
          </div>
       </div>

       {/* Header Actions */}
    <div className="flex justify-between items-center mb-6 shrink-0">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="text-slate-500 hover:text-slate-800 flex items-center gap-2 font-medium">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                返回工作台
              </button>
          </div>
          
          <div className="flex items-center gap-3">
             <button onClick={() => setShowPreview(true)} className="bg-indigo-600 text-white border border-indigo-600 px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 flex items-center gap-2 shadow-sm transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                预览申请书
            </button>
             <button onClick={onSave} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                保存
            </button>
            <div className="relative group">
                <button className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg font-semibold hover:bg-blue-100 transition-all flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4-4m4 4h14" transform="rotate(90 12 12)" />
                    </svg>
                    导出 {isExporting ? '中...' : ''}
                </button>
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-35">
                    <button
                        onClick={handleExportDocx}
                        disabled={isExporting}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        导出 Word (.docx)
                    </button>
                    <button
                        onClick={handleExportPdf}
                        disabled={isExporting}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        导出 PDF (.pdf)
                    </button>
                </div>
            </div>
          </div>
        </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 lg:gap-6 overflow-hidden pb-2">
        {/* Left: Controls & Review Panel */}
        <div className="w-full lg:w-80 lg:shrink-0 flex flex-col gap-4 overflow-y-auto pr-2 pb-4 custom-scrollbar">
            {/* Editing Controls */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-6 shrink-0">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">选择章节</label>
                    <select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value as keyof PatentData)}
                    className="w-full p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
                    >
                    <option value="abstract">摘要 (Abstract)</option>
                    <option value="claims">权利要求书 (Claims)</option>
                    <option value="technicalField">技术领域 (Tech Field)</option>
                    <option value="backgroundArt">背景技术 (Background)</option>
                    <option value="inventionContent">发明内容 (Invention Content)</option>
                    <option value="descriptionOfDrawings">附图说明 (Drawings Desc)</option>
                    <option value="detailedDescription">具体实施方式 (Detailed Desc)</option>
                    </select>
                </div>

                <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-400 uppercase">AI 辅助工具</p>
                    <button
                    onClick={() => handleRefine('polish')}
                    disabled={!!processingType || selectedSection === 'drawings'}
                    className="w-full py-2.5 px-4 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 flex items-center gap-2 transition-all disabled:opacity-50 text-sm"
                    >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    语言润色
                    </button>

                    <button
                    onClick={() => handleRefine('expand')}
                    disabled={!!processingType || selectedSection === 'drawings'}
                    className="w-full py-2.5 px-4 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100 flex items-center gap-2 transition-all disabled:opacity-50 text-sm"
                    >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    智能扩充
                    </button>

                    <button
                    onClick={() => handleRefine('fix_legal')}
                    disabled={!!processingType || selectedSection === 'drawings'}
                    className="w-full py-2.5 px-4 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-100 flex items-center gap-2 transition-all disabled:opacity-50 text-sm"
                    >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                    </svg>
                    法言法语
                    </button>
                </div>
            </div>

            {/* Format Validation Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 shrink-0">
                <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    格式校验
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                    {validationIssues.length === 0 ? (
                        <div className="text-xs text-green-600 flex items-center gap-1 p-2 bg-green-50 rounded">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            所有检查项通过
                        </div>
                    ) : (
                        validationIssues.map((issue, idx) => (
                            <div
                                key={idx}
                                className={`text-xs p-2 rounded flex items-start gap-2 ${
                                    issue.severity === 'error'
                                        ? 'bg-red-50 text-red-700 border border-red-100'
                                        : issue.severity === 'warning'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                        : 'bg-blue-50 text-blue-700 border border-blue-100'
                                }`}
                            >
                                <span className="mt-0.5">
                                    {issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵'}
                                </span>
                                <div>
                                    <div className="font-semibold">{issue.section}</div>
                                    <div>{issue.issue}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Review Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 shrink-0 flex flex-col gap-2">
                 <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                     <span className="text-xl">⚖️</span> AI 审查员
                 </h3>

                 <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 shrink-0">
                    <div className="text-xs font-bold text-slate-500 mb-1">策略同步状态</div>
                    <div className="text-xs text-slate-700 leading-relaxed">
                        {patentData.claimStrategyConfirmed ? '保护策略已确认' : '保护策略待重新确认'}
                    </div>
                    {patentData.reviewSummary && (
                        <div className="mt-2 text-xs text-slate-600 leading-relaxed">
                            最近一次审查：{patentData.reviewSummary}
                        </div>
                    )}
                    <button
                        onClick={handleRegenerateStrategyAfterWriteBack}
                        disabled={isRegeneratingStrategy}
                        className="mt-3 w-full py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                    >
                        {isRegeneratingStrategy ? '正在重生保护策略...' : '根据回写结果自动重生保护策略'}
                    </button>
                 </div>
                 
                 {reviewResult ? (
                     <div className="flex flex-col gap-3">
                         <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg shrink-0">
                             <span className="text-sm text-slate-500 font-medium">预估得分</span>
                             <span className={`text-2xl font-bold ${reviewResult.score >= 80 ? 'text-green-600' : 'text-red-500'}`}>{reviewResult.score}</span>
                         </div>
                         
                         <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 shrink-0">
                             <p className="text-xs font-bold text-slate-500 mb-1">整体评价</p>
                             <p className="text-xs text-slate-700 leading-relaxed">{reviewResult.feedback}</p>
                         </div>

                         <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => handleWriteBackAllIssues('strategy')}
                                className="py-2 px-3 rounded-lg bg-sky-50 text-sky-700 text-xs font-semibold hover:bg-sky-100 border border-sky-100"
                            >
                                回写全部问题到保护策略
                            </button>
                            <button
                                onClick={() => handleWriteBackAllIssues('disclosure')}
                                className="py-2 px-3 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 border border-amber-100"
                            >
                                回写全部问题到交底摘要
                            </button>
                         </div>

                         {reviewResult.detailedIssues && Array.isArray(reviewResult.detailedIssues) && reviewResult.detailedIssues.length > 0 && (
                             <div className="space-y-3">
                                 <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">具体修改建议</div>
                                 {reviewResult.detailedIssues.map((issue, idx) => {
                                     const isFixed = fixedIssueIndices.includes(idx);
                                     return (
                                     <div key={idx} className={`border rounded-lg p-3 transition-all ${isFixed ? 'bg-green-50 border-green-200 opacity-80' : 'bg-red-50 border-red-100 hover:shadow-md'}`}>
                                         <div className="flex justify-between items-start mb-2">
                                            <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${isFixed ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white text-red-600 border-red-100'}`}>
                                                {getSectionLabel(issue.section)}
                                            </span>
                                            {isFixed && (
                                                <span className="text-green-600 text-xs font-bold flex items-center gap-1">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    已修复
                                                </span>
                                            )}
                                         </div>
                                         <p className={`text-xs mb-3 leading-relaxed ${isFixed ? 'text-green-800 line-through opacity-60' : 'text-red-800'}`}>
                                             {issue.issue}
                                         </p>
                                         {!isFixed ? (
                                             <div className="space-y-2">
                                                <button 
                                                    onClick={() => handleApplyFix(issue, idx)}
                                                    className="w-full py-2 bg-white border border-red-200 text-red-600 text-xs font-bold rounded hover:bg-red-600 hover:text-white transition-colors flex items-center justify-center gap-1"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    应用 AI 修正建议
                                                </button>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        onClick={() => handleWriteBackToStrategy(issue)}
                                                        className="py-1.5 bg-sky-50 border border-sky-100 text-sky-700 text-xs font-semibold rounded hover:bg-sky-100"
                                                    >
                                                        回写策略
                                                    </button>
                                                    <button
                                                        onClick={() => handleWriteBackToDisclosure(issue)}
                                                        className="py-1.5 bg-amber-50 border border-amber-100 text-amber-700 text-xs font-semibold rounded hover:bg-amber-100"
                                                    >
                                                        回写交底
                                                    </button>
                                                </div>
                                             </div>
                                         ) : (
                                             <button disabled className="w-full py-1.5 bg-green-100 text-green-700 text-xs font-semibold rounded cursor-default flex items-center justify-center gap-1">
                                                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                 ✅ 已成功应用
                                             </button>
                                         )}
                                     </div>
                                 )})}
                             </div>
                         )}

                         <div className="pt-2 border-t border-slate-100 shrink-0 pb-6">
                            {reviewResult.passed ? (
                                <button 
                                    onClick={handleMarkAsReady}
                                    disabled={patentData.status === 'ready_to_submit'}
                                    className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 disabled:bg-green-200 text-sm"
                                >
                                    {patentData.status === 'ready_to_submit' ? '已标记为待提交' : '确认合格，转为正式文稿'}
                                </button>
                            ) : (
                                <div className="text-xs text-center text-red-500 bg-red-50 p-2 rounded border border-red-100">
                                    请修正上述问题，使评分 &gt; 80。
                                </div>
                            )}
                            
                            <button 
                                onClick={handleStartReview}
                                className="w-full text-blue-600 text-xs hover:underline mt-3 text-center block"
                            >
                                重新运行审查
                            </button>
                         </div>
                     </div>
                 ) : (
                     <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-4">
                         <div className="text-slate-400 text-sm">
                             文书润色完成后，请运行模拟审查以验证质量。
                         </div>
                         <button
                            onClick={handleStartReview}
                            disabled={isReviewing}
                            className="w-full bg-slate-900 text-white py-3 rounded-lg font-semibold shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all disabled:opacity-50"
                        >
                            {isReviewing ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    审查中...
                                </span>
                            ) : '开始模拟实质审查'}
                        </button>
                     </div>
                 )}
            </div>
        </div>

        {/* Right: Rich Text Editor Area */}
        <div className="flex-1 min-w-0 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col rich-text-editor-container">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700">
              编辑内容: <span className="text-blue-600">{getSectionLabel(selectedSection)}</span>
            </h3>
            <span className="text-xs text-slate-400">支持 Markdown 和 LaTeX 公式</span>
          </div>
          {selectedSection === 'drawings' ? (
              <div className="flex-1 p-8 flex items-center justify-center text-slate-400">
                  请在“智能撰写”步骤中管理附图图片，此处仅支持文本编辑。
              </div>
          ) : (
            <RichTextEditor
                value={(patentData[selectedSection] as string) || ''}
                onChange={(newHtml) => updatePatentData(selectedSection, newHtml)}
                className="flex-1 border-0 rounded-none h-full"
                placeholder="在此处编辑..."
            />
          )}
        </div>
      </div>

      {/* PREVIEW MODAL */}
      {showPreview && (
          <div className="fixed inset-0 z-100 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-100 w-full h-full max-w-6xl rounded-xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="bg-white p-4 border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
                      <div className="flex items-center gap-3">
                          <h3 className="font-bold text-lg text-slate-800">申请书预览 (CNIPA 格式)</h3>
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">A4 打印视图</span>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={handleExportDocx} disabled={isExporting} className="text-blue-600 hover:bg-blue-50 px-3 py-2 rounded font-medium text-sm flex items-center gap-1 disabled:opacity-50">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                             Word
                        </button>
                        <button onClick={handleExportPdf} disabled={isExporting} className="text-red-600 hover:bg-red-50 px-3 py-2 rounded font-medium text-sm flex items-center gap-1 disabled:opacity-50">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                             PDF
                        </button>
                        <button
                          onClick={() => setShowPreview(false)}
                          className="bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-900 font-medium text-sm"
                        >
                          关闭预览
                        </button>
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8 bg-slate-200/50">
                      {PreviewContent}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Editor;
