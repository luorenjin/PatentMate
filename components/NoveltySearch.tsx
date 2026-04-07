
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzePatentBasics,
  generateClaimStrategyPackage,
  generateInventionIdea,
  optimizeInventionContent,
  performNoveltySearch,
  runDisclosureInterviewTurn,
  summarizeTechnicalDisclosure,
} from '../services/aiService';
import { RichTextEditor } from './RichTextEditor';
import { AppView, DisclosureInterviewTurn, NoveltyReport, PatentData } from '../types';
import { renderMarkdown } from '../services/markdownService';

interface NoveltySearchProps {
  patentData: PatentData;
  updatePatentData: (key: keyof PatentData, value: any) => void;
  setView: (view: AppView) => void;
  onSave: () => void;
  onBack: () => void;
}

const stripHtml = (html: string) => {
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

const splitLines = (value: string): string[] =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

const joinLines = (items: string[]): string => items.join('\n');

const appendMarkdownBullet = (current: string, text: string) =>
  [current.trim(), `- ${text}`].filter(Boolean).join('\n');

const normalizeMarkdownLine = (line: string) =>
  line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/[*_`>#]/g, '')
    .trim();

const buildLocalDisclosureDraft = (markdown: string) => {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const sections: Record<string, string[]> = {
    problem: [],
    issues: [],
    highlights: [],
    embodiments: [],
    advantages: [],
    alternatives: [],
    evidence: [],
    summary: [],
  };

  let currentSection: keyof typeof sections = 'summary';

  lines.forEach((line) => {
    const normalized = normalizeMarkdownLine(line);
    if (!normalized) {
      return;
    }

    if (/技术问题|待解决问题|问题定义/.test(normalized)) {
      currentSection = 'problem';
      return;
    }
    if (/现有方案缺陷|现有缺陷|背景问题|痛点/.test(normalized)) {
      currentSection = 'issues';
      return;
    }
    if (/关键技术特征|技术特征|核心方案|核心模块/.test(normalized)) {
      currentSection = 'highlights';
      return;
    }
    if (/实施方式|实施例|实现步骤|流程步骤/.test(normalized)) {
      currentSection = 'embodiments';
      return;
    }
    if (/技术效果|效果|收益|优势/.test(normalized)) {
      currentSection = 'advantages';
      return;
    }
    if (/替代方案|扩展方案|变形方案/.test(normalized)) {
      currentSection = 'alternatives';
      return;
    }
    if (/证据|实验|测试|参数|数据/.test(normalized)) {
      currentSection = 'evidence';
      return;
    }

    sections[currentSection].push(normalized);
  });

  const summaryLines = sections.summary.slice(0, 4);

  return {
    technicalProblem: sections.problem[0] || '',
    existingSolutionIssues: sections.issues[0] || '',
    technicalHighlights: sections.highlights.slice(0, 8),
    embodiments: sections.embodiments.slice(0, 8),
    advantages: sections.advantages.slice(0, 8),
    alternativeSolutions: sections.alternatives.slice(0, 8),
    evidenceMaterials: sections.evidence.slice(0, 8),
    disclosureSummary: summaryLines.join('；'),
  };
};

const disclosureTemplates = [
  {
    id: 'software',
    name: '软件/算法方案',
    hint: '适合识别、推荐、调度、控制、预测类发明。',
    notes: [
      '现有系统在什么场景下效果不稳定，具体表现为哪些误差、时延或资源浪费？',
      '你的核心改进模块是什么，输入输出分别是什么？',
      '关键算法流程如何拆成 3 到 5 个步骤，每一步解决什么问题？',
      '相比现有方法，精度、召回率、时延、算力或稳定性提升了多少？',
      '是否有可替代模型、参数配置或部署方式？',
    ].join('\n'),
    prompt: '我们在现有算法/软件方案上做了新的流程和模块设计，重点想保护核心处理流程、关键判断逻辑以及效果提升。',
  },
  {
    id: 'mechanical',
    name: '机械/结构方案',
    hint: '适合装置、结构件、工装夹具、传动机构类发明。',
    notes: [
      '现有结构的卡点是什么，例如精度不足、磨损快、装配复杂或维护成本高？',
      '新的结构由哪些关键部件构成，彼此连接关系是什么？',
      '运动路径、受力路径或配合方式与现有方案有何不同？',
      '实施时的关键尺寸、材料、角度或安装顺序是什么？',
      '带来了哪些效果，例如稳定性提升、加工效率提升或故障率下降？',
    ].join('\n'),
    prompt: '我们在机械结构和部件配合关系上有明确改进，重点想保护关键构件、连接关系和动作过程。',
  },
  {
    id: 'process',
    name: '工艺/流程方案',
    hint: '适合制造流程、检测流程、处理工艺、控制方法类发明。',
    notes: [
      '现有工艺或流程在哪个环节最容易造成成本、良率或质量问题？',
      '新方案的流程顺序是什么，每一步输入、处理动作和输出是什么？',
      '哪些工艺参数、阈值或条件控制是关键？',
      '不同步骤之间如何联动，如何避免现有方案的问题？',
      '最终在良率、能耗、稳定性或周期上实现了什么改善？',
    ].join('\n'),
    prompt: '我们在处理流程、步骤顺序和关键工艺参数上有创新，重点想保护关键步骤组合和参数控制逻辑。',
  },
];

const NoveltySearch: React.FC<NoveltySearchProps> = ({ patentData, updatePatentData, setView, onSave, onBack }) => {
  const [isSearching, setIsSearching] = useState(false);
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [isStructuring, setIsStructuring] = useState(false);
  const [isPreparingDraft, setIsPreparingDraft] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedContent, setOptimizedContent] = useState<string | null>(null);
  const [optimizedContentMarkdown, setOptimizedContentMarkdown] = useState<string | null>(null);
  const [report, setReport] = useState<NoveltyReport | null>(null);
  const [riskTips, setRiskTips] = useState<string[]>([]);
  const [interviewInput, setInterviewInput] = useState('');
  const [isInterviewing, setIsInterviewing] = useState(false);
  const [localParseTips, setLocalParseTips] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ id: string; tick: number } | null>(null);
  const [showRiskPanel, setShowRiskPanel] = useState(false);
  const [showStrategyPanel, setShowStrategyPanel] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const disclosureNotesRef = useRef<HTMLDivElement>(null);
  const technicalProblemRef = useRef<HTMLDivElement>(null);
  const existingSolutionIssuesRef = useRef<HTMLDivElement>(null);
  const disclosureSummaryRef = useRef<HTMLDivElement>(null);
  const technicalHighlightsRef = useRef<HTMLDivElement>(null);
  const embodimentsRef = useRef<HTMLDivElement>(null);
  const advantagesRef = useRef<HTMLDivElement>(null);
  const evidenceMaterialsRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const claimStrategyDraft = patentData.claimStrategy;

  const fieldRefs = {
    title: titleInputRef,
    disclosureNotes: disclosureNotesRef,
    technicalProblem: technicalProblemRef,
    existingSolutionIssues: existingSolutionIssuesRef,
    disclosureSummary: disclosureSummaryRef,
    technicalHighlights: technicalHighlightsRef,
    embodiments: embodimentsRef,
    advantages: advantagesRef,
    evidenceMaterials: evidenceMaterialsRef,
  } as const;

  const readinessItems = useMemo(
    () => [
      { label: '发明名称已定义', completed: Boolean(patentData.title?.trim()), weight: 10, target: 'title' },
      { label: '已记录原始技术口述', completed: Boolean(patentData.disclosureNotes?.trim()), weight: 20, target: 'disclosureNotes' },
      { label: '技术问题已明确', completed: Boolean(patentData.technicalProblem?.trim()), weight: 15, target: 'technicalProblem' },
      { label: '现有方案缺陷已说明', completed: Boolean(patentData.existingSolutionIssues?.trim()), weight: 15, target: 'existingSolutionIssues' },
      { label: '关键技术特征不少于 3 条', completed: patentData.technicalHighlights.length >= 3, weight: 15, target: 'technicalHighlights' },
      { label: '实施方式已有初稿', completed: patentData.embodiments.length >= 1, weight: 10, target: 'embodiments' },
      { label: '技术效果已量化或可描述', completed: patentData.advantages.length >= 1, weight: 10, target: 'advantages' },
      { label: '证据或实验材料已补充', completed: patentData.evidenceMaterials.length >= 1, weight: 5, target: 'evidenceMaterials' },
    ],
    [patentData],
  );

  const draftReadiness = useMemo(
    () => readinessItems.reduce((sum, item) => (item.completed ? sum + item.weight : sum), 0),
    [readinessItems],
  );

  useEffect(() => {
    if (patentData.draftReadiness !== draftReadiness) {
      updatePatentData('draftReadiness', draftReadiness);
    }
  }, [draftReadiness, patentData.draftReadiness, updatePatentData]);

  // Auto-scroll chat to bottom when new messages arrive or AI starts thinking
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [patentData.disclosureInterview, isInterviewing]);

  useEffect(() => {
    if (patentData.claimStrategy.trim()) {
      setShowStrategyPanel(true);
    }
  }, [patentData.claimStrategy]);

  const focusField = (target: keyof typeof fieldRefs) => {
    const targetRef = fieldRefs[target];
    const current = targetRef.current;

    current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (target === 'title') {
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
      });
      return;
    }

    setFocusTarget({ id: target, tick: Date.now() });
  };

  const disclosurePayload = useMemo(() => {
    const sections = [
      `发明名称：${patentData.title}`,
      `原始技术口述：${patentData.disclosureNotes}`,
      `要解决的技术问题：${patentData.technicalProblem}`,
      `现有方案缺陷：${patentData.existingSolutionIssues}`,
      `结构化交底摘要：${patentData.disclosureSummary}`,
      `关键技术特征：${patentData.technicalHighlights.join('；')}`,
      `实施方式：${patentData.embodiments.join('；')}`,
      `技术效果：${patentData.advantages.join('；')}`,
      `替代方案：${patentData.alternativeSolutions.join('；')}`,
      `证据材料：${patentData.evidenceMaterials.join('；')}`,
    ];

    return sections.filter((item) => !item.endsWith('：')).join('\n');
  }, [patentData]);

  const updateListField = (
    key:
      | 'technicalHighlights'
      | 'embodiments'
      | 'advantages'
      | 'alternativeSolutions'
      | 'evidenceMaterials',
    value: string,
  ) => {
    updatePatentData(key, splitLines(value).map((item) => normalizeMarkdownLine(item)).filter(Boolean));
    updatePatentData('claimStrategyConfirmed', false);
  };

  const applyStrategyPackage = async (nextData?: PatentData) => {
    const strategyPackage = await generateClaimStrategyPackage(nextData || patentData);
    updatePatentData('claimStrategy', strategyPackage.claimStrategy);
    updatePatentData('independentClaimSkeleton', strategyPackage.independentClaimSkeleton);
    updatePatentData('dependentClaimOptions', strategyPackage.dependentClaimOptions);
    updatePatentData('strategyRisks', strategyPackage.strategyRisks);
    updatePatentData('claimStrategyConfirmed', false);
  };

  const appendInterviewTurn = (turn: DisclosureInterviewTurn) => {
    updatePatentData('disclosureInterview', [...patentData.disclosureInterview, turn]);
  };

  const handleInterviewSend = async () => {
    if (!interviewInput.trim()) return;

    const userText = interviewInput.trim();
    const userTurn: DisclosureInterviewTurn = {
      role: 'user',
      text: userText,
      timestamp: Date.now(),
    };

    appendInterviewTurn(userTurn);
    updatePatentData(
      'disclosureNotes',
      [patentData.disclosureNotes, `工程师：${userText}`].filter(Boolean).join('\n\n'),
    );
    setInterviewInput('');
    setIsInterviewing(true);
    setError(null);

    try {
      const nextPatentData = {
        ...patentData,
        disclosureInterview: [...patentData.disclosureInterview, userTurn],
      };
      const result = await runDisclosureInterviewTurn(nextPatentData, userText);
      const assistantTurn: DisclosureInterviewTurn = {
        role: 'model',
        text: result.assistantReply,
        timestamp: Date.now(),
      };

      updatePatentData('disclosureInterview', [...nextPatentData.disclosureInterview, assistantTurn]);
      updatePatentData(
        'disclosureNotes',
        [
          [patentData.disclosureNotes, `工程师：${userText}`].filter(Boolean).join('\n\n'),
          `AI：${result.assistantReply}`,
        ].join('\n\n'),
      );
      updatePatentData('disclosureSummary', result.summary);
      updatePatentData('technicalProblem', result.technicalProblem);
      updatePatentData('existingSolutionIssues', result.existingSolutionIssues);
      updatePatentData('technicalHighlights', result.technicalHighlights);
      updatePatentData('embodiments', result.embodiments);
      updatePatentData('advantages', result.advantages);
      updatePatentData('alternativeSolutions', result.alternativeSolutions);
      // 合并证据材料：保留前端已有条目，追加 AI 本轮新提取的条目，去重
      const mergedEvidence = Array.from(
        new Set([...patentData.evidenceMaterials, ...result.evidenceMaterials]),
      );
      updatePatentData('evidenceMaterials', mergedEvidence);
      updatePatentData('disclosurePendingQuestions', result.pendingQuestions);
      updatePatentData('strategyRisks', result.risks);
      updatePatentData('status', 'disclosure_review');
      setRiskTips(result.risks);
      if (result.risks.length > 0) setShowRiskPanel(true);

      const mergedPatentData = {
        ...nextPatentData,
        disclosureSummary: result.summary,
        technicalProblem: result.technicalProblem,
        existingSolutionIssues: result.existingSolutionIssues,
        technicalHighlights: result.technicalHighlights,
        embodiments: result.embodiments,
        advantages: result.advantages,
        alternativeSolutions: result.alternativeSolutions,
        evidenceMaterials: mergedEvidence,
        strategyRisks: result.risks,
        disclosurePendingQuestions: result.pendingQuestions,
      };

      // 策略包更新独立运行，不阻塞访谈显示，失败不影响用户体验
      applyStrategyPackage(mergedPatentData).catch((e) =>
        console.error('Strategy package update failed (non-critical):', e),
      );
    } catch (err) {
      setError('交底访谈失败，请重试。');
    } finally {
      setIsInterviewing(false);
    }
  };

  const handleGenerateInterviewDraft = async () => {
    if (!patentData.title.trim()) {
      setError('请先输入发明名称，系统再为你生成访谈草稿。');
      return;
    }

    setError(null);
    setIsGeneratingIdea(true);

    try {
      const idea = await generateInventionIdea(patentData.title);
      updatePatentData('disclosureNotes', idea);

      const structured = await summarizeTechnicalDisclosure(patentData.title, idea);
      updatePatentData('disclosureSummary', structured.summary);
      updatePatentData('technicalHighlights', structured.technicalHighlights);
      updatePatentData('embodiments', structured.embodiments);
      updatePatentData('advantages', structured.advantages);
      updatePatentData('alternativeSolutions', structured.alternativeSolutions);
      updatePatentData('evidenceMaterials', structured.evidenceMaterials);
      updatePatentData('strategyRisks', structured.risks);
      updatePatentData('status', 'disclosure_review');
      setRiskTips(structured.risks);
      if (structured.risks.length > 0) setShowRiskPanel(true);
      await applyStrategyPackage({
        ...patentData,
        disclosureNotes: idea,
        disclosureSummary: structured.summary,
        technicalHighlights: structured.technicalHighlights,
        embodiments: structured.embodiments,
        advantages: structured.advantages,
        alternativeSolutions: structured.alternativeSolutions,
        evidenceMaterials: structured.evidenceMaterials,
        strategyRisks: structured.risks,
      });
    } catch (err) {
      setError('AI 生成交底草稿失败，请重试。');
    } finally {
      setIsGeneratingIdea(false);
    }
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = disclosureTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    updatePatentData(
      'disclosureNotes',
      [patentData.disclosureNotes.trim(), template.notes].filter(Boolean).join('\n\n'),
    );
    updatePatentData(
      'disclosurePendingQuestions',
      splitLines(template.notes),
    );
    updatePatentData('claimStrategyConfirmed', false);
    setInterviewInput(template.prompt);
    setError(null);
  };

  const handleStructureDisclosure = async () => {
    if (!patentData.title.trim() || !patentData.disclosureNotes.trim()) {
      setError('请先填写发明名称和原始技术口述，再让 AI 帮你整理。');
      return;
    }

    setError(null);
    setIsStructuring(true);

    try {
      const structured = await summarizeTechnicalDisclosure(patentData.title, patentData.disclosureNotes);
      updatePatentData('disclosureSummary', structured.summary);
      updatePatentData('technicalHighlights', structured.technicalHighlights);
      updatePatentData('embodiments', structured.embodiments);
      updatePatentData('advantages', structured.advantages);
      updatePatentData('alternativeSolutions', structured.alternativeSolutions);
      updatePatentData('evidenceMaterials', structured.evidenceMaterials);
      updatePatentData('strategyRisks', structured.risks);
      updatePatentData('status', 'disclosure_review');
      setRiskTips(structured.risks);
      if (structured.risks.length > 0) setShowRiskPanel(true);
      await applyStrategyPackage({
        ...patentData,
        disclosureSummary: structured.summary,
        technicalHighlights: structured.technicalHighlights,
        embodiments: structured.embodiments,
        advantages: structured.advantages,
        alternativeSolutions: structured.alternativeSolutions,
        evidenceMaterials: structured.evidenceMaterials,
        strategyRisks: structured.risks,
      });
    } catch (err) {
      setError('AI 整理交底书失败，请重试。');
    } finally {
      setIsStructuring(false);
    }
  };

  const handleApplyPendingQuestion = (question: string) => {
    setInterviewInput((current) => appendMarkdownBullet(current, question));
  };

  const handleExtractMarkdown = () => {
    if (!patentData.disclosureNotes.trim()) {
      setError('请先在原始技术口述中输入 Markdown 内容，再执行本地提取。');
      return;
    }

    const extracted = buildLocalDisclosureDraft(patentData.disclosureNotes);
    updatePatentData('technicalProblem', extracted.technicalProblem || patentData.technicalProblem);
    updatePatentData('existingSolutionIssues', extracted.existingSolutionIssues || patentData.existingSolutionIssues);
    updatePatentData(
      'technicalHighlights',
      extracted.technicalHighlights.length > 0 ? extracted.technicalHighlights : patentData.technicalHighlights,
    );
    updatePatentData(
      'embodiments',
      extracted.embodiments.length > 0 ? extracted.embodiments : patentData.embodiments,
    );
    updatePatentData(
      'advantages',
      extracted.advantages.length > 0 ? extracted.advantages : patentData.advantages,
    );
    updatePatentData(
      'alternativeSolutions',
      extracted.alternativeSolutions.length > 0 ? extracted.alternativeSolutions : patentData.alternativeSolutions,
    );
    updatePatentData(
      'evidenceMaterials',
      extracted.evidenceMaterials.length > 0 ? extracted.evidenceMaterials : patentData.evidenceMaterials,
    );
    if (extracted.disclosureSummary) {
      updatePatentData('disclosureSummary', extracted.disclosureSummary);
    }
    updatePatentData('claimStrategyConfirmed', false);
    setLocalParseTips([
      extracted.technicalProblem ? '已识别技术问题' : '未识别出明确的技术问题标题，可手动补充',
      extracted.technicalHighlights.length > 0 ? `提取出 ${extracted.technicalHighlights.length} 条关键技术特征` : '未提取到关键技术特征列表',
      extracted.embodiments.length > 0 ? `提取出 ${extracted.embodiments.length} 条实施方式` : '未提取到实施方式列表',
    ]);
    setError(null);
  };

  const handleSearch = async () => {
    if (draftReadiness < 40) {
      setError('当前交底信息过少，建议至少补齐技术问题、现有缺陷和关键技术特征后再做挑战式检索。');
      return;
    }

    setError(null);
    setIsSearching(true);
    setReport(null);
    setOptimizedContent(null);

    try {
      const result = await performNoveltySearch(patentData.title, disclosurePayload);
      setReport(result);
      setIsSearchModalOpen(true);
      updatePatentData('status', 'disclosure_review');
    } catch (err) {
      setError('挑战式检索失败，请检查网络或 API Key 设置。');
    } finally {
      setIsSearching(false);
    }
  };

  const handleOptimize = async () => {
    if (!report) return;

    setIsOptimizing(true);
    setError(null);

    try {
      const optimizedContentRaw = await optimizeInventionContent(disclosurePayload, report.analysis);
      setOptimizedContentMarkdown(optimizedContentRaw);
      setOptimizedContent(renderMarkdown(optimizedContentRaw));
    } catch (err) {
      setError('AI 补强建议生成失败，请重试。');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleAcceptOptimization = () => {
    if (!optimizedContent || !optimizedContentMarkdown) return;

    const mergedSummary = [patentData.disclosureSummary, optimizedContentMarkdown]
      .filter(Boolean)
      .join('\n\n');

    updatePatentData('disclosureSummary', mergedSummary);
    updatePatentData('inventionContent', `${patentData.inventionContent}\n\n<h3>挑战式补强建议</h3>\n${optimizedContent}`.trim());
    void applyStrategyPackage({
      ...patentData,
      disclosureSummary: mergedSummary,
    });
    setOptimizedContent(null);
    setOptimizedContentMarkdown(null);
  };

  const handleProceedToDraft = async () => {
    if (draftReadiness < 60) {
      setError('交底完整度不足，建议先补齐关键信息后再进入起草。');
      return;
    }

    setIsPreparingDraft(true);
    setError(null);

    const mergedMarkdown = [
      `## 技术问题\n${patentData.technicalProblem || patentData.disclosureSummary || '待补充'}`,
      `## 现有方案缺陷\n${patentData.existingSolutionIssues || patentData.backgroundArt || '待补充'}`,
      `## 核心技术方案\n${patentData.disclosureSummary || patentData.disclosureNotes}`,
      patentData.technicalHighlights.length > 0
        ? `## 关键技术特征\n${patentData.technicalHighlights.map((item) => `- ${item}`).join('\n')}`
        : '',
      patentData.embodiments.length > 0
        ? `## 实施方式\n${patentData.embodiments.map((item) => `- ${item}`).join('\n')}`
        : '',
      patentData.advantages.length > 0
        ? `## 技术效果\n${patentData.advantages.map((item) => `- ${item}`).join('\n')}`
        : '',
      patentData.alternativeSolutions.length > 0
        ? `## 可替代方案\n${patentData.alternativeSolutions.map((item) => `- ${item}`).join('\n')}`
        : '',
      patentData.evidenceMaterials.length > 0
        ? `## 证据与实验材料\n${patentData.evidenceMaterials.map((item) => `- ${item}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const basics = await analyzePatentBasics(patentData.title, disclosurePayload);
      updatePatentData('technicalField', basics.technicalField);
      updatePatentData('backgroundArt', patentData.existingSolutionIssues || basics.backgroundArt);
      updatePatentData('inventionContent', renderMarkdown(mergedMarkdown));
      updatePatentData('status', 'drafting');
      if (!patentData.claimStrategy.trim()) {
        await applyStrategyPackage({
          ...patentData,
          backgroundArt: patentData.existingSolutionIssues || basics.backgroundArt,
          inventionContent: renderMarkdown(mergedMarkdown),
        });
      }
      setView(AppView.DRAFTER);
    } catch (err) {
      updatePatentData('inventionContent', renderMarkdown(mergedMarkdown));
      updatePatentData('status', 'drafting');
      if (!patentData.claimStrategy.trim()) {
        await applyStrategyPackage({
          ...patentData,
          inventionContent: renderMarkdown(mergedMarkdown),
        });
      }
      setView(AppView.DRAFTER);
    } finally {
      setIsPreparingDraft(false);
    }
  };

  return (
    <>
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-800 flex items-center gap-2 font-medium">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          返回工作台
        </button>
        <button onClick={onSave} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
          保存项目
        </button>
      </div>

      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-8 py-7 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950 text-white">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <div className="text-cyan-300 text-sm font-semibold tracking-[0.2em] uppercase mb-3">Disclosure First</div>
              <h2 className="text-3xl font-bold mb-3">步骤 1：访谈式技术交底采集</h2>
              <p className="text-slate-300 max-w-3xl leading-relaxed">
                先把技术讲清楚，再生成专利。你只需要用工程语言描述问题、方案、实施例和效果，系统会帮你整理成可起草的交底书骨架。
              </p>
            </div>
            <div className="min-w-[240px] bg-white/10 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between text-sm text-slate-200 mb-2">
                <span>交底完整度</span>
                <span className="text-xl font-bold text-white">{draftReadiness}%</span>
              </div>
              <div className="h-3 bg-white/10 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300 rounded-full" style={{ width: `${Math.max(8, draftReadiness)}%` }} />
              </div>
              <div className="text-xs text-slate-300">
                {draftReadiness >= 60 ? '已满足起草前最小完整度，可进入专利起草。' : '建议先补齐技术问题、关键特征和实施方式。'}
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-8">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">发明名称</label>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={patentData.title}
                  onChange={(e) => updatePatentData('title', e.target.value)}
                  placeholder="例如：一种面向工业视觉的缺陷自适应检测方法"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white text-slate-900 placeholder-slate-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">当前阶段</label>
                <div className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                  {patentData.status === 'drafting' ? '已进入专利起草' : patentData.status === 'disclosure_review' ? '待确认交底书' : '交底采集中'}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-900">原始技术口述</h3>
                <p className="text-sm text-slate-500 mt-1">像和专利工程师开会一样，把背景、改进点、关键结构、流程和效果先说出来。</p>
              </div>

              {/* 三个操作按钮：保留紧凑按钮形态，按钮内含一行说明文字 */}
              <div className="flex flex-wrap gap-2 mb-5">
                <button
                  type="button"
                  onClick={handleGenerateInterviewDraft}
                  disabled={isGeneratingIdea || isStructuring}
                  className="inline-flex items-start gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {isGeneratingIdea ? (
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0 animate-spin text-slate-300" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  )}
                  <div className="text-left">
                    <div className="text-sm font-semibold leading-tight cursor-pointer">
                      {isGeneratingIdea ? 'AI 生成中…' : 'AI 生成访谈草稿'}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 leading-tight font-normal">没有素材？填完名称直接点这里</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleStructureDisclosure}
                  disabled={isStructuring || isGeneratingIdea}
                  className="inline-flex items-start gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {isStructuring ? (
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  )}
                  <div className="text-left">
                    <div className="text-sm font-semibold leading-tight cursor-pointer">
                      {isStructuring ? 'AI 整理中…' : 'AI 整理成交底书'}
                    </div>
                    <div className="text-xs text-cyan-200 mt-0.5 leading-tight font-normal">有口述内容？让 AI 提炼成结构化字段</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExtractMarkdown}
                  disabled={isGeneratingIdea || isStructuring}
                  className="inline-flex items-start gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  <div className="text-left">
                    <div className="text-sm font-semibold leading-tight cursor-pointer">本地 Markdown 提取</div>
                    <div className="text-xs text-slate-400 mt-0.5 leading-tight font-normal">已有 Markdown 文档？不调 AI，即时离线解析</div>
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                {disclosureTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleApplyTemplate(template.id)}
                    className="text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-cyan-300 hover:bg-cyan-50 transition-all cursor-pointer shadow-sm"
                  >
                    <div className="text-sm font-semibold text-slate-900 mb-1">{template.name}</div>
                    <div className="text-xs text-slate-500 leading-relaxed">{template.hint}</div>
                    <div className="mt-3 text-xs font-medium text-cyan-700">一键填入访谈提纲</div>
                  </button>
                ))}
              </div>

              <div ref={disclosureNotesRef}>
                <RichTextEditor
                  value={patentData.disclosureNotes}
                  onChange={(value) => {
                    updatePatentData('disclosureNotes', value);
                    updatePatentData('claimStrategyConfirmed', false);
                  }}
                  format="markdown"
                  editorId="disclosureNotes"
                  focusSignal={focusTarget?.id === 'disclosureNotes' ? focusTarget.tick : 0}
                  placeholder={'建议至少回答这些问题：\n1. 现有方案哪里不好？\n2. 你的核心改进是什么？\n3. 关键结构/算法/步骤是什么？\n4. 如何实施？\n5. 效果如何证明？'}
                  className="min-h-[300px]"
                />
              </div>
              <div className="mt-3 text-xs text-slate-500 leading-relaxed">
                支持 Markdown 语法，可直接使用标题、列表、加粗、公式等格式整理交底内容。
              </div>
              {localParseTips.length > 0 && (
                <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="text-sm font-semibold text-emerald-800 mb-2">本地提取结果</div>
                  <div className="space-y-1 text-sm text-emerald-700">
                    {localParseTips.map((item) => (
                      <div key={item}>• {item}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4 gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">多轮交底访谈</h3>
                  <p className="text-sm text-slate-500 mt-1">让 AI 像专利代理师一样持续追问，把技术信息一轮轮问完整。</p>
                </div>
                <div className="text-xs text-slate-400">最近 8 轮会作为上下文</div>
              </div>

              <div ref={chatContainerRef} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 max-h-[360px] overflow-y-auto space-y-3 mb-4">
                {patentData.disclosureInterview.length > 0 ? (
                  patentData.disclosureInterview.map((turn, index) => (
                    <div key={`${turn.timestamp}-${index}`} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${turn.role === 'user' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
                        <div
                          className={`prose prose-sm max-w-none ${turn.role === 'user' ? 'prose-invert' : 'prose-slate'}`}
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.text) }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500 leading-relaxed">
                    可以直接输入一句技术说明开始访谈，例如“现有方案在低照度下误检率很高，我们加了温漂补偿和双阶段检测”。
                  </div>
                )}
                {isInterviewing && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm bg-white text-slate-400 border border-slate-200 italic flex items-center gap-2">
                      <span className="inline-flex gap-1">
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                      AI 正在分析并整理交底信息…
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 mb-4">
                <RichTextEditor
                  value={interviewInput}
                  onChange={setInterviewInput}
                  format="markdown"
                  placeholder="输入本轮补充说明，AI 会自动追问缺失信息并更新交底结构。"
                  className="min-h-[220px]"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleInterviewSend}
                    disabled={isInterviewing || !interviewInput.trim()}
                    className="px-5 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    {isInterviewing ? '访谈中...' : '发送并继续访谈'}
                  </button>
                </div>
              </div>

              {patentData.disclosurePendingQuestions.length > 0 && (
                <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-100">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-sm font-semibold text-cyan-800">下一轮建议追问</div>
                    <div className="text-xs text-cyan-700">点击即可回填到当前访谈输入框</div>
                  </div>
                  <ul className="space-y-2 text-sm text-cyan-700">
                    {patentData.disclosurePendingQuestions.map((question) => (
                      <li key={question}>
                        <button
                          type="button"
                          onClick={() => handleApplyPendingQuestion(question)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/80 transition-colors"
                        >
                          • {question}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <label className="block text-sm font-semibold text-slate-800 mb-2">要解决的技术问题</label>
                <div ref={technicalProblemRef}>
                  <RichTextEditor
                    value={patentData.technicalProblem}
                    onChange={(value) => {
                      updatePatentData('technicalProblem', value);
                      updatePatentData('claimStrategyConfirmed', false);
                    }}
                    format="markdown"
                    editorId="technicalProblem"
                    focusSignal={focusTarget?.id === 'technicalProblem' ? focusTarget.tick : 0}
                    placeholder="一句话说清楚：为什么非做这个方案不可？"
                    className="min-h-[180px]"
                  />
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <label className="block text-sm font-semibold text-slate-800 mb-2">现有方案缺陷</label>
                <div ref={existingSolutionIssuesRef}>
                  <RichTextEditor
                    value={patentData.existingSolutionIssues}
                    onChange={(value) => {
                      updatePatentData('existingSolutionIssues', value);
                      updatePatentData('claimStrategyConfirmed', false);
                    }}
                    format="markdown"
                    editorId="existingSolutionIssues"
                    focusSignal={focusTarget?.id === 'existingSolutionIssues' ? focusTarget.tick : 0}
                    placeholder="从成本、精度、稳定性、效率、维护复杂度等维度写现有痛点。"
                    className="min-h-[180px]"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <label className="block text-sm font-semibold text-slate-800 mb-2">结构化交底摘要</label>
              <div ref={disclosureSummaryRef}>
                <RichTextEditor
                  value={patentData.disclosureSummary}
                  onChange={(value) => {
                    updatePatentData('disclosureSummary', value);
                    updatePatentData('claimStrategyConfirmed', false);
                  }}
                  format="markdown"
                  editorId="disclosureSummary"
                  focusSignal={focusTarget?.id === 'disclosureSummary' ? focusTarget.tick : 0}
                  placeholder="这里保存 AI 整理后的技术交底书摘要，后续会作为专利起草主输入。"
                  className="min-h-[220px]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5">
              <h3 className="text-lg font-bold text-slate-900 mb-4">结构化交底卡片</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">关键技术特征</label>
                  <div ref={technicalHighlightsRef}>
                    <RichTextEditor
                      value={joinLines(patentData.technicalHighlights.map((item) => `- ${item}`))}
                      onChange={(value) => updateListField('technicalHighlights', value)}
                      format="markdown"
                      editorId="technicalHighlights"
                      focusSignal={focusTarget?.id === 'technicalHighlights' ? focusTarget.tick : 0}
                      placeholder={'每行一条，例如：\n采用双阶段检测网络过滤背景噪声\n引入温漂补偿模块修正传感误差'}
                      className="min-h-[220px]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">实施方式/实施步骤</label>
                  <div ref={embodimentsRef}>
                    <RichTextEditor
                      value={joinLines(patentData.embodiments.map((item) => `- ${item}`))}
                      onChange={(value) => updateListField('embodiments', value)}
                      format="markdown"
                      editorId="embodiments"
                      focusSignal={focusTarget?.id === 'embodiments' ? focusTarget.tick : 0}
                      placeholder={'每行一条，例如：\n实施例1：在产线边缘节点部署轻量模型\n实施例2：通过标定模板自动生成补偿参数'}
                      className="min-h-[220px]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">技术效果</label>
                  <div ref={advantagesRef}>
                    <RichTextEditor
                      value={joinLines(patentData.advantages.map((item) => `- ${item}`))}
                      onChange={(value) => updateListField('advantages', value)}
                      format="markdown"
                      editorId="advantages"
                      focusSignal={focusTarget?.id === 'advantages' ? focusTarget.tick : 0}
                      placeholder={'每行一条，例如：\n误检率降低 18%\n在低照度环境下仍保持稳定检测'}
                      className="min-h-[200px]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">替代方案与扩展点</label>
                  <RichTextEditor
                    value={joinLines(patentData.alternativeSolutions.map((item) => `- ${item}`))}
                    onChange={(value) => updateListField('alternativeSolutions', value)}
                    format="markdown"
                    placeholder={'每行一条，例如：\n检测模块可替换为 Transformer 架构\n结构件可从金属改为复合材料'}
                    className="min-h-[200px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">证据/实验/参数材料</label>
                  <div ref={evidenceMaterialsRef}>
                    <RichTextEditor
                      value={joinLines(patentData.evidenceMaterials.map((item) => `- ${item}`))}
                      onChange={(value) => updateListField('evidenceMaterials', value)}
                      format="markdown"
                      editorId="evidenceMaterials"
                      focusSignal={focusTarget?.id === 'evidenceMaterials' ? focusTarget.tick : 0}
                      placeholder={'每行一条，例如：\n对比实验：与传统方法相比处理时延降低 35%\n关键参数：采样频率为 200Hz'}
                      className="min-h-[200px]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-lg font-bold text-slate-900 mb-4">起草前检查</h3>
              <div className="space-y-3 mb-4">
                {readinessItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => focusField(item.target as keyof typeof fieldRefs)}
                    className={`w-full flex items-center justify-between gap-3 text-sm rounded-xl px-3 py-2 transition-colors ${item.completed ? 'hover:bg-slate-50' : 'bg-amber-50 hover:bg-amber-100/70'}`}
                  >
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${item.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {item.completed ? '✓' : '·'}
                      </span>
                      {item.label}
                    </div>
                    <span className="text-xs text-slate-400">{item.completed ? `+${item.weight}` : '点击去补充'}</span>
                  </button>
                ))}
              </div>

              {riskTips.length > 0 && (
                <div className="mb-4 rounded-xl border border-amber-100 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowRiskPanel(!showRiskPanel)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 hover:bg-amber-100/70 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                      <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                      AI 识别的缺口
                      <span className="text-xs font-normal text-amber-600">（{riskTips.length} 条）</span>
                    </span>
                    <svg className={`w-4 h-4 text-amber-500 transition-transform duration-200 ${showRiskPanel ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showRiskPanel && (
                    <div className="px-4 py-3 bg-amber-50/50 border-t border-amber-100">
                      <ul className="space-y-1.5 text-sm text-amber-700">
                        {riskTips.map((risk) => (
                          <li key={risk}>• {risk}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-amber-600/80 mt-2.5 pt-2 border-t border-amber-100">可通过下方「挑战式新颖性检索」进一步补强差异点</p>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowStrategyPanel(!showStrategyPanel)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${patentData.claimStrategy ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    建议的保护骨架
                    {patentData.claimStrategy && (
                      <span className="text-xs font-normal text-emerald-600">已生成</span>
                    )}
                  </span>
                  <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${showStrategyPanel ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showStrategyPanel && (
                  <div className="p-4 bg-white border-t border-slate-200">
                    <pre className="whitespace-pre-wrap text-sm text-slate-600 leading-relaxed font-sans">
                      {patentData.claimStrategy || claimStrategyDraft || '当关键技术特征整理完成后，这里会自动生成起草建议。'}
                    </pre>
                    {patentData.independentClaimSkeleton && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <div className="text-sm font-semibold text-slate-800 mb-2">独立权利要求骨架</div>
                        <pre className="whitespace-pre-wrap text-sm text-slate-600 leading-relaxed font-sans">{patentData.independentClaimSkeleton}</pre>
                      </div>
                    )}
                    {patentData.dependentClaimOptions.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <div className="text-sm font-semibold text-slate-800 mb-2">从属层级建议</div>
                        <ul className="space-y-2 text-sm text-slate-600">
                          {patentData.dependentClaimOptions.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 挑战式新颖性检索 — 精简状态栏，操作入口统一在底部固定栏 */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm px-8 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">挑战式新颖性检索</h3>
            <p className="text-sm text-slate-500 mt-0.5">用现有技术反向挑战方案，在起草前补强差异点和保护边界。</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {isSearching && (
              <span className="flex items-center gap-1.5 text-sm text-blue-600">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                正在检索…
              </span>
            )}
            {report && !isSearching && (
              <>
                <span className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${
                  report.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  预估通过率 {report.score}%
                </span>
                <button
                  type="button"
                  onClick={() => setIsSearchModalOpen(true)}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800 underline underline-offset-2"
                >
                  查看详细报告
                </button>
              </>
            )}
            {!report && !isSearching && (
              <span className="text-sm text-slate-400">尚未检索 · 点击底部按钮开始</span>
            )}
          </div>
        </div>
        {error && <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">{error}</div>}
      </section>
    </div>

    {/* ───── 新颖性检索结果模态框 ───── */}
    {isSearchModalOpen && report && (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
        onClick={(e) => { if (e.target === e.currentTarget) setIsSearchModalOpen(false); }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl mb-10">
          {/* 模态头部 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-slate-900">新颖性检索报告</h3>
              <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
                report.score >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                预估授权通过率 {report.score}%
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSearchModalOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* 综合评分说明 */}
            <div className={`rounded-xl p-4 flex items-start gap-3 ${
              report.score >= 80 ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-100'
            }`}>
              <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 ${report.score >= 80 ? 'text-emerald-500' : 'text-amber-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {report.score >= 80
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />}
              </svg>
              <p className={`text-sm leading-relaxed ${report.score >= 80 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {report.score >= 80
                  ? '当前方案与现有技术差异较明显，可以进入专利起草阶段。建议参考下方分析进一步巩固保护范围。'
                  : '当前方案与现有技术存在较多重叠，建议先阅读下方 AI 分析，通过「基于检索结果补强交底」功能差异化后再起草。'}
              </p>
            </div>

            {/* AI 对抗分析 */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">AI 对抗分析</h4>
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 leading-relaxed prose prose-sm max-w-none prose-slate" dangerouslySetInnerHTML={{ __html: renderMarkdown(report.analysis) }} />
            </div>

            {/* 基于检索结果补强交底 */}
            {report.score < 90 && !optimizedContent && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-indigo-800 mb-1">基于检索结果补强交底</div>
                    <p className="text-xs text-indigo-600 leading-relaxed">AI 将结合上方对抗分析，针对性地提出如何扩展或差异化你的技术方案，生成补充建议并直接写入交底摘要。</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOptimize}
                    disabled={isOptimizing}
                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isOptimizing ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        AI 补强中…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        开始补强
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* 补强结果 */}
            {optimizedContent && (
              <div className="rounded-xl border border-indigo-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-indigo-100">
                  <span className="text-sm font-semibold text-indigo-800">AI 补强建议</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { handleAcceptOptimization(); setIsSearchModalOpen(false); }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      采纳并写入交底摘要
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOptimizedContent(null); setOptimizedContentMarkdown(null); }}
                      className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-lg transition-colors"
                    >
                      忽略
                    </button>
                  </div>
                </div>
                <div className="p-5 bg-white max-h-72 overflow-y-auto">
                  <div className="text-slate-700 leading-relaxed prose prose-sm max-w-none prose-indigo" dangerouslySetInnerHTML={{ __html: optimizedContent }} />
                </div>
              </div>
            )}

            {/* 相关现有技术 */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">相关现有技术参考</h4>
              <div className="space-y-2">
                {Array.isArray(report.priorArtLinks) && report.priorArtLinks.length > 0 ? (
                  report.priorArtLinks.map((link, index) => (
                    <a
                      key={index}
                      href={link.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all group"
                    >
                      <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-700 group-hover:text-blue-700 truncate">{link.title || '未知标题'}</div>
                        <div className="text-xs text-slate-400 group-hover:text-blue-500 truncate mt-0.5">{link.uri}</div>
                      </div>
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-slate-400 italic">未找到明确的现有技术链接。</p>
                )}
              </div>
            </div>
          </div>

          {/* 模态底部操作 */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
            <button
              type="button"
              onClick={() => setIsSearchModalOpen(false)}
              className="text-sm text-slate-500 hover:text-slate-800 font-medium"
            >
              关闭报告
            </button>
            <button
              type="button"
              onClick={() => { setIsSearchModalOpen(false); handleProceedToDraft(); }}
              disabled={isPreparingDraft}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
            >
              {isPreparingDraft ? '准备中…' : '进入专利起草'}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )}

    {/* 固定底部操作栏：始终可见，无需滚动到页面底部 */}
    <div className="fixed bottom-0 left-64 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      <div className="max-w-7xl mx-auto px-8 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 hidden sm:inline">交底完整度</span>
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full transition-all"
                style={{ width: `${Math.max(4, draftReadiness)}%` }}
              />
            </div>
            <span className="text-sm font-bold text-slate-800">{draftReadiness}%</span>
          </div>
          {draftReadiness >= 60 ? (
            <span className="text-xs text-emerald-600 font-medium hidden md:inline">可进入起草</span>
          ) : (
            <span className="text-xs text-amber-500 hidden md:inline">建议先补齐关键字段</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <button
              type="button"
              onClick={() => setIsSearchModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              查看检索报告
            </button>
          )}
          <button
            onClick={handleSearch}
            disabled={isSearching || isPreparingDraft || isOptimizing}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {isSearching ? '检索中…' : '新颖性检索'}
          </button>
          <button
            onClick={handleProceedToDraft}
            disabled={isPreparingDraft}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5"
          >
            {isPreparingDraft ? '准备中…' : '进入专利起草'}
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
    </>
  );
};

export default NoveltySearch;
