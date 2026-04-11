import React, { useEffect, useMemo, useState } from "react";

import {
  extractStructuredDisclosureFromDocument,
  type DocumentDisclosureExtractionResult,
} from "../../services/aiService";
import {
  getSupportedDisclosureFileAccept,
  ingestDisclosureDocument,
  type DocumentIngestionProgress,
} from "../../services/fileIngestionService";
import { generateDeepQuestionnaire } from "../../services/disclosureTemplateService";
import type { DisclosureData, PatentType, TechnicalField } from "../../types";

const CORE_QUESTION_IDS = new Set(["q1", "q2", "q3", "q4"]);

const joinLines = (items: string[], maxItems?: number): string => {
  const normalizedItems = items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems ?? items.length);

  return normalizedItems.join("\n");
};

const dedupeAnswerList = (answers: DisclosureData["answers"]): DisclosureData["answers"] => {
  const latestAnswers = new Map<string, DisclosureData["answers"][number]>();

  answers.forEach((answer) => {
    if (!answer.answer.trim()) {
      return;
    }

    latestAnswers.set(answer.questionId, answer);
  });

  return Array.from(latestAnswers.values());
};

const findMatchingItems = (items: string[], pattern: RegExp): string[] => {
  return items.filter((item) => pattern.test(item));
};

const buildFallbackAnswer = (
  questionId: string,
  structured: DocumentDisclosureExtractionResult,
): string => {
  const allNarrativeItems = [
    ...structured.keyPoints,
    ...structured.technicalHighlights,
    ...structured.embodiments,
    ...structured.advantages,
    ...structured.alternativeSolutions,
    ...structured.evidenceMaterials,
  ];

  if (questionId === "q1") {
    return structured.technicalProblem || structured.keyPoints[0] || "";
  }

  if (questionId === "q2") {
    return structured.existingSolutionIssues || structured.risks[0] || "";
  }

  if (questionId === "q3") {
    return [
      structured.sourceSummary,
      joinLines(structured.embodiments, 3),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (questionId === "q4") {
    return joinLines(
      structured.technicalHighlights.length > 0
        ? structured.technicalHighlights
        : structured.keyPoints,
      5,
    );
  }

  if (questionId.startsWith("q_evidence_")) {
    const index = Number(questionId.split("_").pop()) - 1;
    return structured.evidenceMaterials[index] || "";
  }

  if (questionId === "q_mech_1") {
    return joinLines(
      findMatchingItems(
        allNarrativeItems,
        /结构|部件|组件|机构|连接|装配|传动|定位|运动|真空|吸附|密封|夹持/,
      ).length > 0
        ? findMatchingItems(
            allNarrativeItems,
            /结构|部件|组件|机构|连接|装配|传动|定位|运动|真空|吸附|密封|夹持/,
          )
        : structured.embodiments,
      4,
    );
  }

  if (questionId === "q_mech_2") {
    return joinLines(
      findMatchingItems(
        [...structured.evidenceMaterials, ...allNarrativeItems],
        /材料|钢|铝|铜|硬度|强度|应力|屈服|刚性|耐磨|承载|模量|热处理/,
      ),
      3,
    );
  }

  if (questionId === "q_mech_3") {
    return joinLines(
      findMatchingItems(
        allNarrativeItems,
        /加工|制造|装配|焊接|切割|铣削|车削|热处理|表面|公差|工艺|成型/,
      ),
      4,
    );
  }

  return "";
};

const mergeStructuredAnswers = (
  questions: ReturnType<typeof generateDeepQuestionnaire>,
  structured: DocumentDisclosureExtractionResult,
): DisclosureData["answers"] => {
  const timestamp = Date.now();
  const answerMap = new Map(
    structured.answers.map((answer) => [answer.questionId, answer]),
  );

  questions.forEach((question) => {
    const existingAnswer = answerMap.get(question.id);
    if (existingAnswer?.answer.trim()) {
      return;
    }

    const fallbackAnswer = buildFallbackAnswer(question.id, structured).trim();
    if (!fallbackAnswer) {
      return;
    }

    answerMap.set(question.id, {
      questionId: question.id,
      answer: fallbackAnswer,
      lastModified: timestamp,
    });
  });

  return dedupeAnswerList(Array.from(answerMap.values()));
};

const getProgressPercentByStage = (
  progress: DocumentIngestionProgress | null,
): number => {
  if (!progress) {
    return 0;
  }

  const normalizedTotal = Math.max(progress.total, 1);
  const ratio = Math.min(progress.current / normalizedTotal, 1);

  switch (progress.stage) {
    case "reading":
      return Math.max(6, Math.round(ratio * 12));
    case "extracting":
      return 12 + Math.round(ratio * 40);
    case "ocr":
      return 22 + Math.round(ratio * 38);
    case "structuring":
      return 72;
    case "completed":
      return 100;
    default:
      return 0;
  }
};

const getProgressHelperText = (
  progress: DocumentIngestionProgress | null,
): string => {
  if (!progress) {
    return "";
  }

  switch (progress.stage) {
    case "reading":
      return "正在读取文件并准备解析任务。";
    case "extracting":
      return "正在抽取文档正文内容，页数越多耗时越长。";
    case "ocr":
      return "检测到扫描页，正在逐页 OCR，这一步通常比普通 PDF 更慢。";
    case "structuring":
      return "AI 正在整理交底、提炼创新点并评估优化方向，通常需要 10-30 秒。";
    case "completed":
      return "资料整理已完成，可以继续下一步。";
    default:
      return "";
  }
};

interface DocumentUploadProps {
  patentType: PatentType;
  technicalField: TechnicalField;
  title: string;
  disclosureData: DisclosureData | null;
  onApplyImport: (data: DisclosureData) => void;
  onContinueToSummary: () => void;
  onContinueToWizard: () => void;
  onBack: () => void;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({
  patentType,
  technicalField,
  title,
  disclosureData,
  onApplyImport,
  onContinueToSummary,
  onContinueToWizard,
  onBack,
}) => {
  const questions = useMemo(
    () => generateDeepQuestionnaire(patentType, technicalField),
    [patentType, technicalField],
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<DocumentIngestionProgress | null>(null);
  const [structuringProgress, setStructuringProgress] = useState<number>(72);
  const [structuredPreview, setStructuredPreview] =
    useState<DocumentDisclosureExtractionResult | null>(null);
  const [importedDisclosure, setImportedDisclosure] = useState<DisclosureData | null>(
    disclosureData?.mode === "upload" &&
      ((disclosureData.importSnapshot?.source.fileName?.trim().length || 0) > 0 ||
        disclosureData.answers.some((item) => item.answer.trim().length > 0))
      ? disclosureData
      : null,
  );

  const activeDisclosure = importedDisclosure ?? (selectedFile ? null : disclosureData);
  const activeSnapshot = activeDisclosure?.importSnapshot;
  const answeredCount = activeDisclosure?.answers.filter(
    (item) => item.answer.trim().length > 0,
  ).length || 0;
  const hasParsedImport = Boolean(importedDisclosure?.importSnapshot);
  const evidenceQuestionIds = questions
    .filter((question) => question.id.startsWith("q_evidence_"))
    .map((question) => question.id);
  const fieldQuestionIds = questions
    .filter(
      (question) =>
        !CORE_QUESTION_IDS.has(question.id) &&
        !question.id.startsWith("q_evidence_"),
    )
    .map((question) => question.id);
  const answeredQuestionIds = new Set(
    (importedDisclosure?.answers || [])
      .filter((item) => item.answer.trim().length > 0)
      .map((item) => item.questionId),
  );
  const coreAnswered = Array.from(CORE_QUESTION_IDS).filter((id) => answeredQuestionIds.has(id)).length;
  const fieldAnswered = fieldQuestionIds.filter((id) => answeredQuestionIds.has(id)).length;
  const evidenceAnswered = evidenceQuestionIds.filter((id) => answeredQuestionIds.has(id)).length;
  const minimumSummaryAnswers = Math.max(4, Math.ceil(questions.length * 0.6));
  const canGoToSummary =
    hasParsedImport &&
    answeredCount >= minimumSummaryAnswers &&
    coreAnswered >= Math.min(4, questions.length) &&
    (fieldQuestionIds.length === 0 || fieldAnswered >= 1) &&
    (evidenceQuestionIds.length === 0 || evidenceAnswered >= 1);

  useEffect(() => {
    if (progress?.stage !== "structuring" || !isProcessing) {
      setStructuringProgress(72);
      return;
    }

    const timer = window.setInterval(() => {
      setStructuringProgress((current) => {
        if (current >= 94) {
          return current;
        }

        if (current < 82) {
          return current + 4;
        }

        if (current < 90) {
          return current + 2;
        }

        return current + 1;
      });
    }, 1200);

    return () => {
      window.clearInterval(timer);
    };
  }, [progress?.stage, isProcessing]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setImportedDisclosure(null);
    setStructuredPreview(null);
    setProgress(null);
    setError(null);
  };

  const handleProcessFile = async () => {
    if (!title.trim()) {
      setError("请先填写发明名称，再上传资料进行整理。");
      return;
    }

    if (!selectedFile) {
      setError("请先选择一份 DOCX 或 PDF 技术资料。");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStructuredPreview(null);

    try {
      const ingested = await ingestDisclosureDocument(selectedFile, {
        userId: disclosureData?.userId,
        onProgress: setProgress,
      });

      if (!ingested.extractedText.trim()) {
        setError(ingested.warnings[0] || "未能从资料中提取可用文本，请更换文件后重试。");
        return;
      }

      setProgress({
        stage: "structuring",
        current: 0,
        total: 1,
        message: "正在生成结构化交底和创新点评估…",
      });

      const structured = await extractStructuredDisclosureFromDocument(
        title,
        patentType,
        technicalField,
        ingested.extractedText,
        { userId: disclosureData?.userId },
      );
      const mergedAnswers = mergeStructuredAnswers(questions, structured);

      const nextDisclosureData: DisclosureData = {
        type: patentType,
        field: technicalField,
        title,
        userId: disclosureData?.userId,
        mode: "upload",
        answers: mergedAnswers,
        importSnapshot: {
          source: {
            fileName: selectedFile.name,
            fileType: ingested.fileType,
            fileSize: selectedFile.size,
            pageCount: ingested.pageCount,
            usedOcr: ingested.usedOcr,
            extractedAt: Date.now(),
            extractedSummary:
              structured.sourceSummary || ingested.extractedText.slice(0, 260),
            warnings: ingested.warnings,
          },
          keyPoints: structured.keyPoints,
          innovationAssessment: structured.innovationAssessment,
        },
      };

      setImportedDisclosure(nextDisclosureData);
      setStructuredPreview(structured);
      setProgress({
        stage: "completed",
        current: 1,
        total: 1,
        message: "资料整理完成，可写入技术交底。",
      });

      if (!mergedAnswers.length && !structured.sourceSummary.trim()) {
        setError("资料已读取，但未识别出足够的交底内容，建议切换到问卷继续补充。");
      }
    } catch (processingError) {
      console.error("Document upload processing failed:", processingError);
      setError("资料整理失败，请稍后重试。");
    } finally {
      setIsProcessing(false);
    }
  };

  const applyAndContinue = (target: "summary" | "wizard") => {
    if (!importedDisclosure) {
      return;
    }

    onApplyImport(importedDisclosure);
    if (target === "summary") {
      onContinueToSummary();
      return;
    }
    onContinueToWizard();
  };

  const progressPercent = progress
    ? progress.stage === "structuring"
      ? structuringProgress
      : getProgressPercentByStage(progress)
    : 0;
  const progressHelperText = getProgressHelperText(progress);
  const processingButtonLabel =
    progress?.stage === "ocr"
      ? "正在执行 OCR…"
      : progress?.stage === "extracting"
        ? "正在提取文本…"
        : progress?.stage === "structuring"
          ? "AI 正在整理交底…"
          : "正在整理资料…";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">上传研发资料</h2>
          <p className="text-slate-500">
            支持 DOCX 与 PDF。系统会自动提取交底内容，并从新颖性、创造性、实用性角度给出优化建议。
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
        >
          返回选择方式
        </button>
      </div>

      <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 items-start">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              选择资料文件
            </label>
            <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
              <span className="text-lg font-semibold text-slate-900 mb-2">
                {selectedFile ? selectedFile.name : "点击选择 DOCX / PDF 资料"}
              </span>
              <span className="text-sm text-slate-500 leading-6 max-w-xl">
                建议上传研发交底模板、机械结构说明、测试报告或评审资料。扫描 PDF 会自动进入 OCR，耗时可能更长。
              </span>
              <input
                type="file"
                accept={getSupportedDisclosureFileAccept()}
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
            {selectedFile && (
              <div className="mt-3 text-sm text-slate-500">
                文件大小：{(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </div>
            )}

            {progress && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                  <span>{progress.message}</span>
                  <span>
                    {progress.stage === "structuring" && isProcessing
                      ? `${progressPercent}%+`
                      : `${progressPercent}%`}
                  </span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500 ${
                      progress.stage === "structuring" && isProcessing
                        ? "animate-pulse"
                        : ""
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500 leading-5">
                  {progressHelperText}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleProcessFile}
                disabled={!selectedFile || isProcessing}
                className={`px-6 py-3 rounded-xl font-medium transition-colors ${
                  !selectedFile || isProcessing
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200"
                }`}
              >
                {isProcessing ? processingButtonLabel : "开始解析并优化"}
              </button>
              <button
                type="button"
                onClick={() => applyAndContinue("summary")}
                disabled={!canGoToSummary}
                className={`px-6 py-3 rounded-xl font-medium transition-colors ${
                  canGoToSummary
                    ? "bg-slate-900 text-white hover:bg-slate-700"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
              >
                写入交底并进入确认
              </button>
              <button
                type="button"
                onClick={() => applyAndContinue("wizard")}
                disabled={!hasParsedImport}
                className={`px-6 py-3 rounded-xl font-medium transition-colors ${
                  hasParsedImport
                    ? "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
              >
                写入后继续问卷补充（推荐）
              </button>
            </div>

            <div className="mt-4 text-sm text-slate-500 leading-6">
              上传资料更适合作为交底初稿。系统会先自动预填问卷，但研发资料通常仍缺少专利视角下的发明目的、现有技术缺陷、对比数据和保护边界。
              建议先进入问卷补充；只有当自动回填覆盖较完整时，再直接进入确认页。
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-sm font-semibold text-slate-700 mb-3">本次将回填的问卷范围</div>
            <div className="text-sm text-slate-600 leading-6 mb-4">
              当前技术领域为 {technicalField}，系统会尝试将资料内容映射到 {questions.length} 个交底问题中。
            </div>
            <div className="space-y-2">
              {questions.slice(0, 6).map((question) => (
                <div key={question.id} className="text-sm text-slate-500">
                  {question.id} · {question.question}
                </div>
              ))}
              {questions.length > 6 && (
                <div className="text-sm text-slate-400">还有 {questions.length - 6} 个问题将自动尝试回填。</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {activeSnapshot && (
        <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900">自动整理结果</h3>
              <p className="text-sm text-slate-500 mt-1">
                来源文件：{activeSnapshot.source.fileName}
                {activeSnapshot.source.pageCount
                  ? ` · ${activeSnapshot.source.pageCount} 页`
                  : ""}
                {activeSnapshot.source.usedOcr ? " · 含 OCR 识别" : ""}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 px-4 py-3 bg-slate-50 text-sm text-slate-600">
              已回填 {answeredCount} / {questions.length} 个问题
            </div>
          </div>

          <div className={`rounded-2xl border px-4 py-3 text-sm ${
            canGoToSummary
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}>
            {canGoToSummary
              ? "自动回填已覆盖核心交底项，你可以直接进入确认页，但仍建议先抽查并补齐量化证据。"
              : "当前自动回填还不足以直接确认，建议先写入并继续问卷补充，重点补充发明目的、现有技术缺陷和量化证据。"}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-2">资料摘要</div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 leading-6 whitespace-pre-wrap">
                  {activeSnapshot.source.extractedSummary || "暂无摘要。"}
                </div>
              </div>

              {structuredPreview && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-700 mb-2">自动提炼的技术问题</div>
                    <div className="text-sm text-slate-600 leading-6 whitespace-pre-wrap">
                      {structuredPreview.technicalProblem || "未稳定识别，建议人工补充。"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-700 mb-2">自动提炼的现有技术不足</div>
                    <div className="text-sm text-slate-600 leading-6 whitespace-pre-wrap">
                      {structuredPreview.existingSolutionIssues || "未稳定识别，建议人工补充。"}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="text-sm font-semibold text-slate-700 mb-2">建议优先保护/补强的要点</div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-sm text-slate-700">
                  {activeSnapshot.keyPoints.length > 0 ? (
                    activeSnapshot.keyPoints.map((point) => (
                      <div key={point} className="flex items-start gap-2">
                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-cyan-500" />
                        <span>{point}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400">暂无要点提炼。</div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div>
                  <div className="text-sm font-semibold text-slate-700">新颖性</div>
                  <div className="mt-1 text-sm text-slate-600 leading-6">
                    {activeSnapshot.innovationAssessment.novelty || "暂无评估。"}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-700">创造性</div>
                  <div className="mt-1 text-sm text-slate-600 leading-6">
                    {activeSnapshot.innovationAssessment.creativity || "暂无评估。"}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-700">实用性</div>
                  <div className="mt-1 text-sm text-slate-600 leading-6">
                    {activeSnapshot.innovationAssessment.utility || "暂无评估。"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-700 mb-2">补强建议</div>
                <div className="space-y-2 text-sm text-slate-600">
                  {activeSnapshot.innovationAssessment.optimizationSuggestions.length > 0 ? (
                    activeSnapshot.innovationAssessment.optimizationSuggestions.map(
                      (item) => (
                        <div key={item} className="flex items-start gap-2">
                          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>{item}</span>
                        </div>
                      ),
                    )
                  ) : (
                    <div className="text-slate-400">暂无补强建议。</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {structuredPreview && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-700 mb-2">关键技术特征</div>
                <div className="space-y-2 text-sm text-slate-600">
                  {structuredPreview.technicalHighlights.length > 0 ? (
                    structuredPreview.technicalHighlights.map((item) => (
                      <div key={item}>{item}</div>
                    ))
                  ) : (
                    <div className="text-slate-400">暂无提炼结果。</div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-700 mb-2">风险提示</div>
                <div className="space-y-2 text-sm text-slate-600">
                  {structuredPreview.risks.length > 0 ? (
                    structuredPreview.risks.map((item) => <div key={item}>{item}</div>)
                  ) : (
                    <div className="text-slate-400">暂无风险提示。</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSnapshot.source.warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
              <div className="font-semibold">解析提醒</div>
              {activeSnapshot.source.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default DocumentUpload;