
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { AppView, PatentData, ReviewResult, ReviewIssue } from '../types';
import { refineText, regenerateClaimStrategyFromReview, runFinalPatentReview, generateMermaidDiagrams, type RefineTextOptions } from '../services/aiService';
import MermaidRenderer from './MermaidRenderer';
import { renderMarkdown } from '../services/markdownService';
import { RichTextEditor } from './RichTextEditor';
import { exportToDocx, exportToPdf, downloadBlob } from '../services/exportService';
import { savePatentToStorage } from '../services/storageService';
import { checkTerminologyConsistency, fixProhibitedTerms, type TerminologyReport } from '../services/terminologyChecker';

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

// Smart HTML → plain text that preserves ordered/unordered list numbering.
// Required because AI content is stored as rendered HTML (<ol><li>…</li></ol>),
// and a naive stripHtml() would drop the "1. 2. 3." numbering needed for
// patent format validation and readable AI prompts.
const htmlToPlainText = (html?: string): string => {
    if (!html) return '';
    let processed = html;
    // Convert ordered list items to "N. text" before stripping tags
    processed = processed.replace(/<ol[^>]*>([\/\s\S]*?)<\/ol>/gi, (_m, inner) => {
        let n = 1;
        return inner.replace(/<li[^>]*>([\/\s\S]*?)<\/li>/gi, (_li: string, content: string) => {
            const num = n++;
            // Strip any inner tags from the li content for readability
            const tmp = document.createElement('DIV');
            tmp.innerHTML = content;
            return `\n${num}. ${tmp.textContent || tmp.innerText || ''}\n`;
        });
    });
    // Convert unordered list items to "- text"
    processed = processed.replace(/<ul[^>]*>([\/\s\S]*?)<\/ul>/gi, (_m, inner) => {
        return inner.replace(/<li[^>]*>([\/\s\S]*?)<\/li>/gi, (_li: string, content: string) => {
            const tmp = document.createElement('DIV');
            tmp.innerHTML = content;
            return `\n- ${tmp.textContent || tmp.innerText || ''}\n`;
        });
    });
    // Block-level elements add newlines
    processed = processed.replace(/<\/(p|div|h[1-6])>/gi, '\n');
    processed = processed.replace(/<br\s*\/?>/gi, '\n');
    const tmp = document.createElement('DIV');
    tmp.innerHTML = processed;
    return (tmp.textContent || tmp.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
};

type RefinableSection = NonNullable<RefineTextOptions['section']>;

const REFINABLE_SECTIONS: RefinableSection[] = [
    'abstract',
    'claims',
    'technicalField',
    'backgroundArt',
    'inventionContent',
    'descriptionOfDrawings',
    'detailedDescription',
];

const isRefinableSection = (section: keyof PatentData): section is RefinableSection => {
    return REFINABLE_SECTIONS.includes(section as RefinableSection);
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
                <div key={index} className="mb-2 flex items-start gap-1 text-justify leading-relaxed text-base">
                    <span className="font-mono text-sm text-slate-500 select-none shrink-0 w-14">[{numStr}]</span>
                    <span dangerouslySetInnerHTML={{ __html: block.content }} />
                </div>
            );
        } else {
            return <div key={index} dangerouslySetInnerHTML={{ __html: block.content }} className="mb-2" />;
        }
    });

    return { html: <div>{elements}</div>, nextCount: currentCount };
};

const Editor: React.FC<EditorProps> = ({ patentData, updatePatentData, setView, onSave, onBack }) => {
  const [selectedSection, setSelectedSection] = useState<keyof PatentData>('claims');
  const [processingType, setProcessingType] = useState<string | null>(null);
    const [writeBackNotice, setWriteBackNotice] = useState<{ tone: 'success' | 'info'; message: string } | null>(null);
  
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

  // Terminology Checking State
  const [terminologyReport, setTerminologyReport] = useState<TerminologyReport | null>(null);
  const [showTerminologyPanel, setShowTerminologyPanel] = useState(false);

  // Export State
  const [isExporting, setIsExporting] = useState(false);

  // Mermaid diagram generation state
  const [isGeneratingDiagrams, setIsGeneratingDiagrams] = useState(false);
  const [zoomedDiagramIdx, setZoomedDiagramIdx] = useState<number | null>(null);
    const editorContainerRef = useRef<HTMLDivElement>(null);
  // Cache raw SVG strings from successfully rendered list items, keyed by diagram index.
  // The zoom modal reuses these directly instead of calling mermaid.render() again,
  // which avoids React StrictMode double-effect / ID-collision issues.
  const [diagramSvgCache, setDiagramSvgCache] = useState<Record<number, string>>({});

  // Clear SVG cache when the diagram list changes (regenerated or deleted)
  useEffect(() => {
    setDiagramSvgCache({});
  }, [patentData.mermaidDiagrams]);

    useEffect(() => {
            if (!writeBackNotice) return;
            const timeoutId = window.setTimeout(() => setWriteBackNotice(null), 3000);
            return () => window.clearTimeout(timeoutId);
    }, [writeBackNotice]);

  const buildRefineOptions = (
      section: keyof PatentData,
      operationScope: 'section' | 'selection',
  ): RefineTextOptions => ({
      section: isRefinableSection(section) ? section : undefined,
      title: patentData.title,
      patentType: patentData.patentType,
      operationScope,
      technicalField: htmlToPlainText(patentData.technicalField),
      technicalProblem: patentData.technicalProblem,
      backgroundArt: htmlToPlainText(patentData.backgroundArt),
      inventionContent: htmlToPlainText(patentData.inventionContent),
      descriptionOfDrawings: htmlToPlainText(patentData.descriptionOfDrawings),
      claimStrategy: patentData.claimStrategy,
  });

  const isSelectionInsideEditor = (selection: Selection) => {
      if (!editorContainerRef.current || selection.rangeCount === 0) {
          return false;
      }

      return editorContainerRef.current.contains(selection.getRangeAt(0).commonAncestorContainer);
  };

  const renderInlineReplacementHtml = (markdownText: string) => {
      const container = document.createElement('DIV');
      container.innerHTML = renderMarkdown(markdownText);

      if (container.childElementCount === 1 && container.firstElementChild?.tagName === 'P') {
          return container.firstElementChild.innerHTML;
      }

      return container.innerHTML;
  };

  const appendTextBlock = (current: string, title: string, content: string) => {
      const block = `${title}\n- ${content}`;
      if (current.includes(content)) return current;
      return [current, block].filter(Boolean).join('\n\n');
  };

  const mergeStrategyRisks = (currentRisks: string[], newRisks: string[]) => {
      return Array.from(new Set([...currentRisks, ...newRisks.filter(Boolean)]));
  };

  const buildWriteBackPatentData = (basePatentData: PatentData, issues: ReviewIssue[], target: 'strategy' | 'disclosure') => {
      const nextPatentData = {
          ...basePatentData,
          claimStrategy: basePatentData.claimStrategy,
          disclosureSummary: basePatentData.disclosureSummary,
          strategyRisks: [...basePatentData.strategyRisks],
          claimStrategyConfirmed: basePatentData.claimStrategyConfirmed,
      };

      issues.forEach((issue) => {
          if (target === 'strategy') {
              nextPatentData.claimStrategy = appendTextBlock(
                  nextPatentData.claimStrategy,
                  `【审查回写 - ${getSectionLabel(issue.section)}】`,
                  `${issue.issue}；修改方向：${stripHtml(renderMarkdown(issue.suggestion))}`,
              );
              nextPatentData.claimStrategyConfirmed = false;
          } else {
              nextPatentData.disclosureSummary = appendTextBlock(
                  nextPatentData.disclosureSummary,
                  `【审查回写 - ${getSectionLabel(issue.section)}】`,
                  issue.issue,
              );
          }
      });

      nextPatentData.strategyRisks = mergeStrategyRisks(
          nextPatentData.strategyRisks,
          issues.map((issue) => issue.issue),
      );

      return nextPatentData;
  };

  const applyWriteBackPatentData = (nextPatentData: PatentData, target: 'strategy' | 'disclosure') => {
      if (target === 'strategy') {
          updatePatentData('claimStrategy', nextPatentData.claimStrategy);
          updatePatentData('claimStrategyConfirmed', nextPatentData.claimStrategyConfirmed);
      } else {
          updatePatentData('disclosureSummary', nextPatentData.disclosureSummary);
      }

      updatePatentData('strategyRisks', nextPatentData.strategyRisks);
  };

  const hasWriteBackChanges = (basePatentData: PatentData, nextPatentData: PatentData, target: 'strategy' | 'disclosure') => {
      const risksChanged = JSON.stringify(basePatentData.strategyRisks) !== JSON.stringify(nextPatentData.strategyRisks);

      if (target === 'strategy') {
          return (
              basePatentData.claimStrategy !== nextPatentData.claimStrategy ||
              basePatentData.claimStrategyConfirmed !== nextPatentData.claimStrategyConfirmed ||
              risksChanged
          );
      }

      return basePatentData.disclosureSummary !== nextPatentData.disclosureSummary || risksChanged;
  };

  const commitWriteBack = (
      basePatentData: PatentData,
      nextPatentData: PatentData,
      target: 'strategy' | 'disclosure',
      successMessage: string,
      noChangeMessage: string,
  ) => {
      if (!hasWriteBackChanges(basePatentData, nextPatentData, target)) {
          setWriteBackNotice({ tone: 'info', message: noChangeMessage });
          return;
      }

      applyWriteBackPatentData(nextPatentData, target);
      void savePatentToStorage(nextPatentData);
      setWriteBackNotice({ tone: 'success', message: successMessage });
  };

  // Validation Checker
  const validatePatent = () => {
      const issues: typeof validationIssues = [];

      // Abstract validation: 200-300 characters
      // Use htmlToPlainText so length check counts actual characters, not HTML tags
      const abstractText = htmlToPlainText(patentData.abstract);
      if (!abstractText) {
          issues.push({ section: '摘要', issue: '摘要为空', severity: 'error' });
      } else if (abstractText.length < 50) {
          issues.push({ section: '摘要', issue: `摘要过短 (${abstractText.length}字符)，建议50-300字符`, severity: 'warning' });
      } else if (abstractText.length > 300) {
          issues.push({ section: '摘要', issue: `摘要过长 (${abstractText.length}字符)，建议控制在300字符以内`, severity: 'warning' });
      }

      // Claims validation
      // AI output is stored as HTML <ol><li>…</li></ol>; use htmlToPlainText to
      // restore "1. 2. 3." numbering before running the regex check.
      const claimsText = htmlToPlainText(patentData.claims);
      if (!claimsText) {
          issues.push({ section: '权利要求书', issue: '权利要求书为空', severity: 'error' });
      } else if (!/^1\./m.test(claimsText)) {
          issues.push({ section: '权利要求书', issue: '独立权利要求应从"1."开始', severity: 'error' });
      }

      // Description validation
      const hasBackground = htmlToPlainText(patentData.backgroundArt).length > 20;
      const hasPurpose = htmlToPlainText(patentData.inventionContent).length > 20;
      const hasSolution = htmlToPlainText(patentData.inventionContent).includes('解决') || htmlToPlainText(patentData.inventionContent).includes('方案');
      const hasEmbodiments = htmlToPlainText(patentData.detailedDescription).length > 50;

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

  // Check terminology consistency
  const handleCheckTerminology = () => {
    const report = checkTerminologyConsistency(patentData);
    setTerminologyReport(report);
    setShowTerminologyPanel(true);
  };

  // Auto-fix prohibited terms in selected section
  const handleAutoFixProhibitedTerms = () => {
    const currentContent = patentData[selectedSection];
    if (typeof currentContent !== 'string' || !currentContent) return;

    const plainText = htmlToPlainText(currentContent);
    const fixedText = fixProhibitedTerms(plainText);
    const fixedHtml = renderMarkdown(fixedText);
    updatePatentData(selectedSection, fixedHtml);

    // Re-check terminology
    handleCheckTerminology();
  };

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
      if (selection && selection.toString().trim().length > 10 && isSelectionInsideEditor(selection)) {
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
      if (!selection || selection.toString().trim().length < 10 || !isSelectionInsideEditor(selection)) return;

      const editorSurface = editorContainerRef.current?.querySelector('[contenteditable="true"]') as HTMLDivElement | null;
      if (!editorSurface) return;

      const selectedText = selection.toString().trim();
      setIsPolishing(true);
      try {
          const polished = await refineText(selectedText, 'polish', buildRefineOptions(selectedSection, 'selection'));
          const polishedHtml = renderInlineReplacementHtml(polished);
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const fragment = range.createContextualFragment(polishedHtml);
          const lastNode = fragment.lastChild;
          range.insertNode(fragment);

          if (lastNode) {
              range.setStartAfter(lastNode);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
          } else {
              selection.removeAllRanges();
          }

          updatePatentData(selectedSection, editorSurface.innerHTML);
          setShowPolishToolbar(false);
      } catch (err) {
          console.error('Polish failed:', err);
      } finally {
          setIsPolishing(false);
      }
  };

  const handleWriteBackToStrategy = (issue: ReviewIssue) => {
      const nextPatentData = buildWriteBackPatentData(patentData, [issue], 'strategy');
      commitWriteBack(
          patentData,
          nextPatentData,
          'strategy',
          `已将 1 条问题回写到保护策略，并同步保存。`,
          '这条问题已经回写到保护策略，无需重复写入。',
      );
  };

  const handleWriteBackToDisclosure = (issue: ReviewIssue) => {
      const nextPatentData = buildWriteBackPatentData(patentData, [issue], 'disclosure');
      commitWriteBack(
          patentData,
          nextPatentData,
          'disclosure',
          `已将 1 条问题回写到交底摘要，并同步保存。`,
          '这条问题已经回写到交底摘要，无需重复写入。',
      );
  };

  const handleWriteBackAllIssues = (target: 'strategy' | 'disclosure') => {
      if (!reviewResult?.detailedIssues || reviewResult.detailedIssues.length === 0) {
          setWriteBackNotice({ tone: 'info', message: '当前没有可回写的问题。' });
          return;
      }

      const nextPatentData = buildWriteBackPatentData(patentData, reviewResult.detailedIssues, target);
      commitWriteBack(
          patentData,
          nextPatentData,
          target,
          target === 'strategy'
              ? `已将 ${reviewResult.detailedIssues.length} 条问题回写到保护策略，并同步保存。`
              : `已将 ${reviewResult.detailedIssues.length} 条问题回写到交底摘要，并同步保存。`,
          target === 'strategy'
              ? '这些问题已经全部回写到保护策略，无需重复写入。'
              : '这些问题已经全部回写到交底摘要，无需重复写入。',
      );
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

    // Use htmlToPlainText so AI receives clean numbered text (claims: "1. … 2. …")
    const plainText = htmlToPlainText(currentContent);
        if (!plainText.trim()) {
            alert(`当前${getSectionLabel(selectedSection)}为空，无法执行 AI 处理。`);
            return;
        }

    setProcessingType(type);
    try {
            const newText = await refineText(plainText, type, buildRefineOptions(selectedSection, 'section'));
      // 2. Convert result (likely Markdown) to HTML
      const newHtml = renderMarkdown(newText);
      updatePatentData(selectedSection, newHtml);
    } finally {
      setProcessingType(null);
    }
  };

  const handleGenerateDiagrams = async () => {
    const descText = stripHtml(patentData.descriptionOfDrawings);
    const inventionText = stripHtml(patentData.inventionContent);
    const embodimentText = stripHtml(patentData.detailedDescription);
    if (!descText) {
      alert('请先填写【附图说明】章节，描述每幅图的内容（如：图1为系统整体架构图），AI 将严格按照附图说明逐图生成示意图。');
      return;
    }
    if (!inventionText) {
      alert('请先填写【发明内容】，以便 AI 理解技术方案并生成准确的示意图。');
      return;
    }
    setIsGeneratingDiagrams(true);
    try {
      const diagrams = await generateMermaidDiagrams(
        patentData.title || '',
        inventionText,
        embodimentText,
        descText,
      );
      if (diagrams.length > 0) {
        updatePatentData('mermaidDiagrams', diagrams);
      }
    } catch (err) {
      console.error('Failed to generate diagrams:', err);
    } finally {
      setIsGeneratingDiagrams(false);
    }
  };

  const handleExportDocx = async () => {
    setIsExporting(true);
    try {
        const blob = await exportToDocx(patentData, diagramSvgCache);
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
        await exportToPdf(patentData, diagramSvgCache);
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
      
      // Pass a clean copy of data to review to avoid HTML tag noise in prompt.
      // Use htmlToPlainText (not plain stripHtml) so claims keep their "1. 2." numbering
      // which is essential for the AI to understand the claim structure.
      const cleanData = { ...patentData };
      (Object.keys(cleanData) as Array<keyof PatentData>).forEach(key => {
          if (typeof cleanData[key] === 'string') {
              (cleanData as any)[key] = htmlToPlainText(cleanData[key] as string);
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

      // Dynamic labels based on patent type
      const isInvention = patentData.patentType === 'invention';
      const docTypeLabel = isInvention ? '发明专利申请' : '实用新型专利申请';
      const nameLabel = isInvention ? '发明名称' : '实用新型名称';
      const inventionSectionLabel = isInvention ? '发明内容' : '实用新型内容';

      let pCount = 1;
      const renderDescriptionSection = (title: string, content?: string) => {
          const res = formatTextWithNumbering(content, pCount);
          pCount = res.nextCount;
          return (
              <div className="mb-5">
                  <h4 className="font-bold text-base mb-2">{title}</h4>
                  <div className="text-base leading-8 text-justify">{res.html}</div>
              </div>
          );
      };

      const pageStyle: React.CSSProperties = {
          padding: '20mm 25mm',
          minHeight: '297mm',
          boxSizing: 'border-box',
          fontFamily: "'SimSun', 'STSong', serif",
          fontSize: '14px',
          lineHeight: '1.8',
      };

      return (
          <div className="text-black max-w-[210mm] mx-auto space-y-6">

              {/* ---- 第1页：摘要页（封面） ---- */}
              <div className="bg-white shadow-md" style={pageStyle}>
                  {/* CNIPA 页眉：两端对齐，无绝对定位 */}
                  <div className="flex justify-between items-center border-b-2 border-black pb-3 mb-5 text-sm font-bold">
                      <span>(19) 中华人民共和国国家知识产权局</span>
                      <span>(12) {docTypeLabel}</span>
                  </div>

                  {/* 著录项目 */}
                  <table className="w-full text-sm mb-5" style={{ borderCollapse: 'collapse' }}>
                      <tbody>
                          <tr>
                              <td className="pr-5 py-2 text-slate-600 font-semibold whitespace-nowrap align-top w-40">(54) {nameLabel}</td>
                              <td className="py-2 font-bold text-base align-top">{patentData.title || '未命名'}</td>
                          </tr>
                          {patentData.selectedTechnicalField && (
                              <tr>
                                  <td className="pr-5 py-2 text-slate-600 font-semibold whitespace-nowrap align-top">(51) 分类号</td>
                                  <td className="py-2 align-top">{patentData.selectedTechnicalField}</td>
                              </tr>
                          )}
                          <tr>
                              <td className="pr-5 py-2 text-slate-600 font-semibold whitespace-nowrap align-top">(22) 申请日</td>
                              <td className="py-2 align-top">
                                  {new Date(patentData.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                              </td>
                          </tr>
                      </tbody>
                  </table>

                  {/* 摘要 */}
                  <div className="border-t border-slate-200 pt-4 mb-4">
                      <div className="text-sm font-bold mb-2">(57) 摘　要</div>
                      <div className="text-sm leading-7 text-justify"
                          dangerouslySetInnerHTML={{ __html: patentData.abstract || '暂无摘要' }}
                      />
                  </div>

                  {/* 摘要附图 */}
                  {patentData.drawings && patentData.drawings.length > 0 && (
                      <div className="flex flex-col items-center mt-6">
                          <img
                              src={`data:image/jpeg;base64,${patentData.drawings[0]}`}
                              className="max-h-60 object-contain"
                              alt="摘要附图"
                          />
                          <div className="text-xs text-slate-500 mt-2">图 1</div>
                      </div>
                  )}
              </div>

              {/* ---- 第2页+：权利要求书 ---- */}
              <div className="bg-white shadow-md" style={pageStyle}>
                  <div className="text-xs text-right text-slate-400 mb-4">权利要求书 第1页</div>
                  <h2 className="text-lg font-bold text-center mb-8 tracking-widest">权　利　要　求　书</h2>
                  <div className="text-base leading-8 text-justify"
                      dangerouslySetInnerHTML={{ __html: patentData.claims || '<p>暂无权利要求</p>' }}
                  />
              </div>

              {/* ---- 第3页+：说明书 ---- */}
              <div className="bg-white shadow-md" style={pageStyle}>
                  <div className="text-xs text-right text-slate-400 mb-4">说明书 第1页</div>
                  <h2 className="text-lg font-bold text-center mb-6 tracking-widest">说　　明　　书</h2>
                  <div className="text-base font-bold text-center mb-8">{patentData.title || '未命名'}</div>
                  <div className="text-base text-justify">
                      {renderDescriptionSection('技术领域', patentData.technicalField)}
                      {renderDescriptionSection('背景技术', patentData.backgroundArt)}
                      {renderDescriptionSection(inventionSectionLabel, patentData.inventionContent)}
                      {patentData.descriptionOfDrawings && renderDescriptionSection('附图说明', patentData.descriptionOfDrawings)}
                      {renderDescriptionSection('具体实施方式', patentData.detailedDescription)}
                  </div>
              </div>

              {/* ---- 第4页+：说明书附图 ---- */}
              {((patentData.drawings && patentData.drawings.length > 0) || (patentData.mermaidDiagrams && patentData.mermaidDiagrams.length > 0)) && (
                  <div className="bg-white shadow-md" style={pageStyle}>
                      <div className="text-xs text-right text-slate-400 mb-4">说明书附图 第1页</div>
                      <h2 className="text-lg font-bold text-center mb-8 tracking-widest">说　明　书　附　图</h2>

                      {/* 2-column grid for figures */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px 20px', alignItems: 'start' }}>
                          {/* Mermaid 生成的示意图 */}
                          {patentData.mermaidDiagrams && patentData.mermaidDiagrams.map((code, idx) => (
                              <div key={`mermaid-${idx}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                  <div style={{
                                      border: '1px solid #ccc',
                                      borderRadius: '2px',
                                      padding: '8px',
                                      background: '#fff',
                                      width: '100%',
                                      boxSizing: 'border-box',
                                  }}>
                                      <MermaidRenderer
                                          code={code}
                                          id={`preview-${idx}`}
                                          maxHeight={200}
                                      />
                                  </div>
                                  <div style={{ marginTop: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>
                                      图 {idx + 1}
                                  </div>
                              </div>
                          ))}
                          {/* 用户上传的实体图片 */}
                          {patentData.drawings && patentData.drawings.map((img, idx) => {
                              const figNum = (patentData.mermaidDiagrams?.length || 0) + idx + 1;
                              return (
                                  <div key={`img-${idx}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                      <div style={{
                                          border: '1px solid #ccc',
                                          borderRadius: '2px',
                                          padding: '8px',
                                          background: '#fff',
                                          width: '100%',
                                          boxSizing: 'border-box',
                                      }}>
                                          <img
                                              src={`data:image/jpeg;base64,${img}`}
                                              style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                                              alt={`图${figNum}`}
                                          />
                                      </div>
                                      <div style={{ marginTop: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>
                                          图 {figNum}
                                      </div>
                                  </div>
                              );
                          })}
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
               onMouseDown={(event) => event.stopPropagation()}
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
                  <div className="text-xs uppercase tracking-[0.2em] text-violet-600 mb-2">Stage 4 / 4</div>
                  <h2 className="text-xl font-bold text-slate-900">步骤 4：审校定稿与交底回写</h2>
                  <p className="text-sm text-slate-500 mt-2">对申请文本做最终润色、审查模拟，并把关键问题回写到交底和保护策略，确保前后口径一致。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">1. 技术交底</span>
                  <span className="px-3 py-1 rounded-full bg-sky-50 text-sky-700">2. 方案评估</span>
                  <button onClick={() => setView(AppView.DRAFTER)} className="px-3 py-1 rounded-full bg-sky-50 text-sky-700 hover:bg-sky-100">
                      3. 返回申请撰写
                  </button>
                  <span className={`px-3 py-1 rounded-full ${patentData.status === 'ready_to_submit' ? 'bg-green-600 text-white' : 'bg-violet-50 text-violet-700'}`}>
                      4. {patentData.status === 'ready_to_submit' ? '已定稿待提交' : '审校定稿中'}
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
                    {processingType === 'polish' ? '语言润色中...' : '语言润色'}
                    </button>

                    <button
                    onClick={() => handleRefine('expand')}
                    disabled={!!processingType || selectedSection === 'drawings'}
                    className="w-full py-2.5 px-4 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100 flex items-center gap-2 transition-all disabled:opacity-50 text-sm"
                    >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    {processingType === 'expand' ? '智能扩充中...' : '智能扩充'}
                    </button>

                    <button
                    onClick={handleGenerateDiagrams}
                    disabled={isGeneratingDiagrams}
                    className="w-full py-2.5 px-4 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-100 flex items-center gap-2 transition-all disabled:opacity-50 text-sm"
                    >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 002-2V7" />
                    </svg>
                    {isGeneratingDiagrams ? 'AI 生成示意图...' : '生成示意图'}
                    </button>

                    <button
                    onClick={() => handleRefine('fix_legal')}
                    disabled={!!processingType || selectedSection === 'drawings'}
                    className="w-full py-2.5 px-4 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-100 flex items-center gap-2 transition-all disabled:opacity-50 text-sm"
                    >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                    </svg>
                    {processingType === 'fix_legal' ? '法言法语处理中...' : '法言法语'}
                    </button>

                    <button
                    onClick={handleCheckTerminology}
                    className="w-full py-2.5 px-4 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-100 flex items-center gap-2 transition-all text-sm"
                    >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    术语一致性检查
                    </button>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
                        <p>当前章节：<span className="font-semibold text-slate-700">{getSectionLabel(selectedSection)}</span></p>
                        <p>语言润色：保留技术事实和结构，只优化行文与术语。</p>
                        <p>智能扩充：结合现有交底补足披露细节，不虚构数据。</p>
                        <p>法言法语：改写为更符合中国专利申请习惯的正式表述。</p>
                        <p>术语检查：识别核心术语、不一致和禁用词。</p>
                    </div>
                </div>
            </div>

            {/* Mermaid Diagrams Preview Panel */}
            {patentData.mermaidDiagrams && patentData.mermaidDiagrams.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-violet-200 p-4 shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 002-2V7" />
                            </svg>
                            生成的示意图
                        </h3>
                        <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                            {patentData.mermaidDiagrams.length} 张
                        </span>
                    </div>
                    <div className="space-y-3">
                        {patentData.mermaidDiagrams.map((code, idx) => (
                            <div key={idx} className="border border-slate-200 rounded-lg overflow-hidden">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-200">
                                    <span className="text-xs font-semibold text-slate-500">图 {idx + 1}</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setZoomedDiagramIdx(idx)}
                                            className="text-xs text-violet-400 hover:text-violet-600 transition-colors"
                                            title="放大查看"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => {
                                                const updated = patentData.mermaidDiagrams!.filter((_, i) => i !== idx);
                                                updatePatentData('mermaidDiagrams', updated);
                                            }}
                                            className="text-xs text-red-400 hover:text-red-600 transition-colors"
                                            title="删除此图"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <div
                                    className="p-2 bg-white cursor-zoom-in"
                                    onClick={() => setZoomedDiagramIdx(idx)}
                                    title="点击放大查看"
                                >
                                    <MermaidRenderer
                                        code={code}
                                        id={`editor-preview-${idx}`}
                                        maxHeight={180}
                                        className="w-full"
                                        onSvgReady={(svg) => setDiagramSvgCache(prev => ({ ...prev, [idx]: svg }))}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

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

            {/* Terminology Consistency Panel */}
            {showTerminologyPanel && terminologyReport && (
                <div className="bg-white rounded-xl shadow-sm border border-purple-200 p-4 shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                            术语一致性
                        </h3>
                        <button
                            onClick={() => setShowTerminologyPanel(false)}
                            className="text-slate-400 hover:text-slate-700"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="text-xs text-slate-600 mb-3 p-2 bg-slate-50 rounded border border-slate-100">
                        {terminologyReport.summary}
                    </div>

                    {/* Prohibited Terms Section */}
                    {terminologyReport.prohibitedTerms.length > 0 && (
                        <div className="mb-3">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-bold text-red-700 flex items-center gap-1">
                                    <span>🚫</span> 禁用词 ({terminologyReport.prohibitedTerms.length})
                                </h4>
                                <button
                                    onClick={handleAutoFixProhibitedTerms}
                                    className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 font-medium"
                                >
                                    一键修正
                                </button>
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {terminologyReport.prohibitedTerms.slice(0, 5).map((prohibited, idx) => (
                                    <div key={idx} className="text-xs p-2 bg-red-50 border border-red-100 rounded">
                                        <div className="font-semibold text-red-800 mb-1">
                                            "{prohibited.term}" - {prohibited.sectionName}
                                        </div>
                                        <div className="text-red-600 text-[11px] mb-1">{prohibited.context}</div>
                                        <div className="text-red-700 text-[11px]">
                                            <span className="font-semibold">原因：</span>{prohibited.reason}
                                        </div>
                                        <div className="text-red-700 text-[11px]">
                                            <span className="font-semibold">建议：</span>{prohibited.suggestion}
                                        </div>
                                    </div>
                                ))}
                                {terminologyReport.prohibitedTerms.length > 5 && (
                                    <div className="text-xs text-slate-500 text-center py-1">
                                        还有 {terminologyReport.prohibitedTerms.length - 5} 处禁用词...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Inconsistencies Section */}
                    {terminologyReport.inconsistencies.length > 0 && (
                        <div className="mb-3">
                            <h4 className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1">
                                <span>⚠️</span> 术语不一致 ({terminologyReport.inconsistencies.length})
                            </h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {terminologyReport.inconsistencies.slice(0, 3).map((inconsistency, idx) => (
                                    <div key={idx} className="text-xs p-2 bg-amber-50 border border-amber-100 rounded">
                                        <div className="font-semibold text-amber-800 mb-1">
                                            "{inconsistency.baseForm}" 有变体
                                        </div>
                                        <div className="text-amber-700 text-[11px] mb-1">
                                            变体：{inconsistency.variants.join('、')}
                                        </div>
                                        <div className="text-amber-700 text-[11px]">
                                            {inconsistency.suggestion}
                                        </div>
                                    </div>
                                ))}
                                {terminologyReport.inconsistencies.length > 3 && (
                                    <div className="text-xs text-slate-500 text-center py-1">
                                        还有 {terminologyReport.inconsistencies.length - 3} 处不一致...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Core Terms Section */}
                    {terminologyReport.coreTerms.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1">
                                <span>📌</span> 核心术语 (Top {Math.min(5, terminologyReport.coreTerms.length)})
                            </h4>
                            <div className="space-y-1.5">
                                {terminologyReport.coreTerms.slice(0, 5).map((term, idx) => (
                                    <div key={idx} className="text-xs p-2 bg-blue-50 border border-blue-100 rounded flex justify-between items-center">
                                        <span className="font-semibold text-blue-800">{term.term}</span>
                                        <span className="text-blue-600 text-[11px]">×{term.totalCount}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {terminologyReport.prohibitedTerms.length === 0 &&
                     terminologyReport.inconsistencies.length === 0 &&
                     terminologyReport.coreTerms.length === 0 && (
                        <div className="text-xs text-green-600 flex items-center gap-1 p-2 bg-green-50 rounded">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            术语使用规范，未发现问题
                        </div>
                    )}
                </div>
            )}

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

                         {writeBackNotice && (
                             <div
                                 className={`rounded-lg border px-3 py-2 text-xs font-medium leading-relaxed ${
                                     writeBackNotice.tone === 'success'
                                         ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                         : 'border-slate-200 bg-slate-50 text-slate-600'
                                 }`}
                             >
                                 {writeBackNotice.message}
                             </div>
                         )}

                         {reviewResult.detailedIssues && Array.isArray(reviewResult.detailedIssues) && reviewResult.detailedIssues.length > 0 && (
                             <div className="space-y-3">
                                 <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">具体修改建议</div>
                                 {reviewResult.detailedIssues.map((issue, idx) => {
                                     const isFixed = fixedIssueIndices.includes(idx);
                                     const severityColor = issue.severity === 'critical' ? 'red' : issue.severity === 'major' ? 'orange' : 'yellow';
                                     const borderColor = isFixed ? 'border-green-200' : `border-${severityColor}-200`;
                                     const bgColor = isFixed ? 'bg-green-50' : `bg-${severityColor}-50`;

                                     return (
                                     <div key={idx} className={`border rounded-lg p-3 transition-all ${isFixed ? 'bg-green-50 border-green-200 opacity-80' : `bg-${severityColor}-50 border-${severityColor}-100 hover:shadow-md`}`}>
                                         <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                                            <div className="flex gap-2 flex-wrap">
                                                <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${isFixed ? 'bg-green-100 text-green-700 border-green-200' : `bg-white text-${severityColor}-600 border-${severityColor}-100`}`}>
                                                    {getSectionLabel(issue.section)}
                                                </span>
                                                {issue.severity && (
                                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                                        issue.severity === 'critical' ? 'bg-red-100 text-red-700' :
                                                        issue.severity === 'major' ? 'bg-orange-100 text-orange-700' :
                                                        'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                        {issue.severity === 'critical' ? '严重' : issue.severity === 'major' ? '重要' : '一般'}
                                                    </span>
                                                )}
                                                {issue.category && (
                                                    <span className="inline-block px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-bold">
                                                        {issue.category}
                                                    </span>
                                                )}
                                            </div>
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
                                                    className={`w-full py-2 bg-white border text-xs font-bold rounded hover:text-white transition-colors flex items-center justify-center gap-1 ${
                                                        issue.severity === 'critical' ? 'border-red-200 text-red-600 hover:bg-red-600' :
                                                        issue.severity === 'major' ? 'border-orange-200 text-orange-600 hover:bg-orange-600' :
                                                        'border-yellow-200 text-yellow-700 hover:bg-yellow-600'
                                                    }`}
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    一键采纳 AI 修正建议
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
                <div ref={editorContainerRef} className="flex-1 min-w-0 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col rich-text-editor-container">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700">
              编辑内容: <span className="text-blue-600">{getSectionLabel(selectedSection)}</span>
            </h3>
            <span className="text-xs text-slate-400">富文本编辑器，支持 LaTeX 公式（Σ）</span>
          </div>
          {selectedSection === 'drawings' ? (
              <div className="flex-1 p-8 flex items-center justify-center text-slate-400">
                  请在“智能撰写”步骤中管理附图图片，此处仅支持文本编辑。
              </div>
          ) : (
            <RichTextEditor
                value={(patentData[selectedSection] as string) || ''}
                onChange={(newHtml) => updatePatentData(selectedSection, newHtml)}
                format="html"
                editorId="patent-editor-main"
                className="flex-1 border-0 rounded-none h-full"
                placeholder="在此处编辑..."
            />
          )}
        </div>
      </div>

      {/* MERMAID ZOOM MODAL */}
      {zoomedDiagramIdx !== null && patentData.mermaidDiagrams && patentData.mermaidDiagrams[zoomedDiagramIdx] && (
          <div
              className="fixed inset-0 z-200 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6"
              onClick={() => setZoomedDiagramIdx(null)}
          >
              <div
                  className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                  style={{ maxWidth: '90vw', maxHeight: '90vh', minWidth: '400px' }}
                  onClick={(e) => e.stopPropagation()}
              >
                  <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
                      <span className="font-bold text-slate-700">
                          图 {zoomedDiagramIdx + 1}
                          <span className="ml-2 text-xs font-normal text-slate-400">点击外部区域关闭</span>
                      </span>
                      <button
                          onClick={() => setZoomedDiagramIdx(null)}
                          className="text-slate-400 hover:text-slate-700 transition-colors"
                      >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                      </button>
                  </div>
                  <div className="p-6 overflow-auto flex items-center justify-center" style={{ maxHeight: 'calc(90vh - 60px)', minHeight: '200px' }}>
                      {diagramSvgCache[zoomedDiagramIdx] ? (
                          /* Reuse the already-rendered SVG from the list — avoids re-calling
                             mermaid.render() which can fail in React StrictMode (double effect). */
                          <div
                              ref={(el) => {
                                  if (!el || !diagramSvgCache[zoomedDiagramIdx!]) return;
                                  el.innerHTML = diagramSvgCache[zoomedDiagramIdx!];
                                  const svgEl = el.querySelector('svg');
                                  if (svgEl) {
                                      svgEl.removeAttribute('width');
                                      svgEl.removeAttribute('height');
                                      svgEl.style.maxWidth = '100%';
                                      svgEl.style.width = '100%';
                                      svgEl.style.height = 'auto';
                                      svgEl.style.maxHeight = 'none';
                                      svgEl.style.display = 'block';
                                      svgEl.style.margin = '0 auto';
                                  }
                              }}
                              style={{ width: '100%' }}
                          />
                      ) : (
                          <div className="text-slate-400 text-sm animate-pulse">图表加载中，请稍候…</div>
                      )}
                  </div>
              </div>
          </div>
      )}

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
