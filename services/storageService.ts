import {
  DisclosureAnswer,
  DisclosureData,
  DisclosureInterviewTurn,
  DraftingProgress,
  PatentData,
  PatentType,
  TechnicalField,
} from "../types";
import { generateUuid } from "./idService";

const STORAGE_KEY = "patent_pro_data";
const TECHNICAL_FIELDS: readonly TechnicalField[] = [
  "AI",
  "新能源",
  "医疗器械",
  "软件",
  "机械",
  "化工",
  "电子",
  "通信",
  "生物",
  "材料",
];

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
};

const normalizeInterviewTurns = (value: unknown): DisclosureInterviewTurn[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is DisclosureInterviewTurn =>
        typeof item === "object" &&
        item !== null &&
        ((item as DisclosureInterviewTurn).role === "user" ||
          (item as DisclosureInterviewTurn).role === "model") &&
        typeof (item as DisclosureInterviewTurn).text === "string" &&
        typeof (item as DisclosureInterviewTurn).timestamp === "number",
    )
    .map((item) => ({
      role: item.role,
      text: item.text,
      timestamp: item.timestamp,
    }));
};

const normalizeDisclosureData = (
  value: unknown,
): DisclosureData | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  if (!data.type || !data.field || !data.title) return undefined;

  const answers: DisclosureAnswer[] = Array.isArray(data.answers)
    ? (data.answers as DisclosureAnswer[]).filter(
        (a): a is DisclosureAnswer =>
          typeof a === "object" &&
          a !== null &&
          typeof a.questionId === "string" &&
          typeof a.answer === "string",
      )
    : [];

  return {
    type: data.type as PatentType,
    field: data.field as TechnicalField,
    title: data.title as string,
    answers,
    completedAt:
      typeof data.completedAt === "number" ? data.completedAt : undefined,
  };
};

const normalizeSelectedTechnicalField = (
  value: unknown,
): TechnicalField | undefined => {
  return typeof value === "string" &&
    TECHNICAL_FIELDS.includes(value as TechnicalField)
    ? (value as TechnicalField)
    : undefined;
};

const normalizeDraftingProgress = (
  value: unknown,
): DraftingProgress | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const progress = value as Record<string, unknown>;
  const stages = [
    "abstract",
    "claims",
    "description",
    "embodiment",
    "drawings",
  ] as const;

  const result: Partial<DraftingProgress> = {};

  for (const stage of stages) {
    if (progress[stage] && typeof progress[stage] === "object") {
      const stageData = progress[stage] as Record<string, unknown>;
      result[stage] = {
        content: typeof stageData.content === "string" ? stageData.content : "",
        previousVersion:
          typeof stageData.previousVersion === "string"
            ? stageData.previousVersion
            : undefined,
        generatedAt:
          typeof stageData.generatedAt === "number"
            ? stageData.generatedAt
            : undefined,
        isConfirmed: stageData.isConfirmed === true,
      };
    }
  }

  if (progress.currentStage && typeof progress.currentStage === "string") {
    result.currentStage =
      progress.currentStage as DraftingProgress["currentStage"];
  }

  return Object.keys(result).length > 0
    ? (result as DraftingProgress)
    : undefined;
};

const normalizePatentData = (patent: Partial<PatentData>): PatentData => {
  const now = Date.now();

  return {
    id: patent.id || generateUuid(),
    title: patent.title || "未命名专利",
    status:
      patent.status === "ready_to_submit" ||
      patent.status === "editing" ||
      patent.status === "drafting" ||
      patent.status === "disclosure_review" ||
      patent.status === "disclosure_collecting"
        ? patent.status
        : "disclosure_collecting",
    createdAt: typeof patent.createdAt === "number" ? patent.createdAt : now,
    lastModified:
      typeof patent.lastModified === "number" ? patent.lastModified : now,
    // New fields for Step 3-4
    patentType: patent.patentType,
    selectedTechnicalField: normalizeSelectedTechnicalField(
      patent.selectedTechnicalField ??
        patent.disclosureData?.field ??
        patent.technicalField,
    ),
    disclosureData: normalizeDisclosureData(patent.disclosureData),
    draftingProgress: normalizeDraftingProgress(patent.draftingProgress),
    // Existing fields
    disclosureNotes: patent.disclosureNotes || "",
    disclosureSummary: patent.disclosureSummary || "",
    disclosureInterview: normalizeInterviewTurns(patent.disclosureInterview),
    disclosurePendingQuestions: normalizeStringArray(
      patent.disclosurePendingQuestions,
    ),
    technicalProblem: patent.technicalProblem || "",
    existingSolutionIssues: patent.existingSolutionIssues || "",
    technicalHighlights: normalizeStringArray(patent.technicalHighlights),
    embodiments: normalizeStringArray(patent.embodiments),
    advantages: normalizeStringArray(patent.advantages),
    alternativeSolutions: normalizeStringArray(patent.alternativeSolutions),
    evidenceMaterials: normalizeStringArray(patent.evidenceMaterials),
    claimStrategy: patent.claimStrategy || "",
    independentClaimSkeleton: patent.independentClaimSkeleton || "",
    dependentClaimOptions: normalizeStringArray(patent.dependentClaimOptions),
    claimStrategyConfirmed: patent.claimStrategyConfirmed === true,
    strategyRisks: normalizeStringArray(patent.strategyRisks),
    draftReadiness:
      typeof patent.draftReadiness === "number" ? patent.draftReadiness : 0,
    reviewSummary: patent.reviewSummary || "",
    lastReviewScore:
      typeof patent.lastReviewScore === "number" ? patent.lastReviewScore : 0,
    technicalField:
      typeof patent.technicalField === "string" ? patent.technicalField : "",
    backgroundArt: patent.backgroundArt || "",
    inventionContent: patent.inventionContent || "",
    descriptionOfDrawings: patent.descriptionOfDrawings || "",
    drawings: normalizeStringArray(patent.drawings),
    mermaidDiagrams: normalizeStringArray(patent.mermaidDiagrams),
    detailedDescription: patent.detailedDescription || "",
    claims: patent.claims || "",
    abstract: patent.abstract || "",
  };
};

/**
 * 从 localStorage 读取并规范化所有专利项目数据。
 * @returns 已兼容旧版本字段的专利数据列表；读取失败时返回空数组。
 */
export const getPatents = (): PatentData[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    const parsed = JSON.parse(data) as Array<Partial<PatentData>>;
    return Array.isArray(parsed) ? parsed.map(normalizePatentData) : [];
  } catch (e) {
    console.error("Failed to load patents", e);
    return [];
  }
};

/**
 * 根据项目 ID 获取单个专利数据。
 * @param id 项目唯一标识。
 * @returns 找到时返回规范化后的项目，否则返回 undefined。
 */
export const getPatentById = (id: string): PatentData | undefined => {
  const patents = getPatents();
  return patents.find((p) => p.id === id);
};

/**
 * 将单个专利项目保存到 localStorage，并自动更新时间戳。
 * @param patent 待保存的专利项目数据。
 */
export const savePatentToStorage = (patent: PatentData): void => {
  const patents = getPatents();
  const index = patents.findIndex((p) => p.id === patent.id);

  const updatedPatent = {
    ...normalizePatentData(patent),
    lastModified: Date.now(),
  };

  if (index >= 0) {
    patents[index] = updatedPatent;
  } else {
    patents.push(updatedPatent);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(patents));
};

/**
 * 删除指定 ID 的专利项目。
 * @param id 项目唯一标识。
 */
export const deletePatentFromStorage = (id: string): void => {
  const patents = getPatents();
  const newPatents = patents.filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newPatents));
};

/**
 * 创建一个新的技术交底书项目默认数据。
 * @returns 带默认阶段和空白中间态字段的新项目对象。
 */
export const createNewPatentData = (): PatentData => {
  return {
    id: generateUuid(),
    title: "未命名专利",
    status: "disclosure_collecting",
    createdAt: Date.now(),
    lastModified: Date.now(),
    disclosureNotes: "",
    disclosureSummary: "",
    disclosureInterview: [],
    disclosurePendingQuestions: [],
    technicalProblem: "",
    existingSolutionIssues: "",
    technicalHighlights: [],
    embodiments: [],
    advantages: [],
    alternativeSolutions: [],
    evidenceMaterials: [],
    claimStrategy: "",
    independentClaimSkeleton: "",
    dependentClaimOptions: [],
    claimStrategyConfirmed: false,
    strategyRisks: [],
    draftReadiness: 0,
    reviewSummary: "",
    lastReviewScore: 0,
    selectedTechnicalField: undefined,
    technicalField: "",
    backgroundArt: "",
    inventionContent: "",
    descriptionOfDrawings: "",
    drawings: [],
    detailedDescription: "",
    claims: "",
    abstract: "",
  };
};
