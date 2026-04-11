import {
  DisclosureImportSnapshot,
  DisclosureInnovationAssessment,
  DisclosureMode,
  DisclosureAnswer,
  DisclosureData,
  DisclosureInterviewTurn,
  DraftingProgress,
  ImportedDocumentType,
  PatentData,
  PatentType,
  PatentStatus,
  StageData,
  TechnicalField,
} from "../types";
import { generateUuid } from "./idService";
import { supabase } from "./supabaseService";

const STORAGE_KEY = "patent_pro_data";
const SUPABASE_PATENTS_TABLE = "patent_projects";
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
const DRAFTING_STAGES = [
  "abstract",
  "claims",
  "description",
  "embodiment",
  "drawings",
] as const;

interface PatentProjectRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  title: string;
  status: PatentStatus;
  patent_type: PatentType | null;
  technical_field: string | null;
  created_at: number;
  last_modified: number;
  payload: PatentData;
}

interface PatentScopeFilters {
  userId?: string | null;
  organizationId?: string | null;
}

const normalizeString = (value: unknown): string => {
  return typeof value === "string" ? value : "";
};

const isSupabaseRelationMissingError = (
  error: { code?: string; message?: string } | null | undefined,
): boolean => {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    /relation .* does not exist/i.test(error.message ?? "") ||
    /Could not find the table/i.test(error.message ?? "")
  );
};

const isSupabaseColumnMissingError = (
  error: { code?: string; message?: string } | null | undefined,
  columnName?: string,
): boolean => {
  if (!error) {
    return false;
  }

  const message = error.message ?? "";
  const missingColumn =
    error.code === "42703" ||
    /column .* does not exist/i.test(message) ||
    /Could not find the .* column/i.test(message);

  if (!missingColumn) {
    return false;
  }

  return columnName ? message.includes(columnName) : true;
};

const createSupabaseMutationMissError = (
  action: "save" | "delete" | "restore",
): Error => {
  return new Error(`Patent ${action} did not match any remote rows`);
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
};

const normalizeDisclosureMode = (
  value: unknown,
): DisclosureMode | undefined => {
  return value === "questionnaire" || value === "upload" ? value : undefined;
};

const normalizeImportedDocumentType = (
  value: unknown,
): ImportedDocumentType => {
  return value === "docx" || value === "pdf" ? value : "unknown";
};

const normalizeDisclosureInnovationAssessment = (
  value: unknown,
): DisclosureInnovationAssessment | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const assessment = value as Record<string, unknown>;

  return {
    novelty: typeof assessment.novelty === "string" ? assessment.novelty : "",
    creativity:
      typeof assessment.creativity === "string" ? assessment.creativity : "",
    utility: typeof assessment.utility === "string" ? assessment.utility : "",
    optimizationSuggestions: normalizeStringArray(
      assessment.optimizationSuggestions,
    ),
    recommendedFocus: normalizeStringArray(assessment.recommendedFocus),
  };
};

const normalizeDisclosureImportSnapshot = (
  value: unknown,
): DisclosureImportSnapshot | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const snapshot = value as Record<string, unknown>;
  const sourceValue = snapshot.source;
  const innovationAssessment = normalizeDisclosureInnovationAssessment(
    snapshot.innovationAssessment,
  );

  if (!sourceValue || typeof sourceValue !== "object" || !innovationAssessment) {
    return undefined;
  }

  const source = sourceValue as Record<string, unknown>;

  return {
    source: {
      fileName:
        typeof source.fileName === "string" ? source.fileName : "未命名资料",
      fileType: normalizeImportedDocumentType(source.fileType),
      fileSize: typeof source.fileSize === "number" ? source.fileSize : 0,
      pageCount:
        typeof source.pageCount === "number" ? source.pageCount : undefined,
      usedOcr: source.usedOcr === true,
      extractedAt:
        typeof source.extractedAt === "number" ? source.extractedAt : Date.now(),
      extractedSummary:
        typeof source.extractedSummary === "string"
          ? source.extractedSummary
          : "",
      warnings: normalizeStringArray(source.warnings),
    },
    keyPoints: normalizeStringArray(snapshot.keyPoints),
    innovationAssessment,
  };
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
    userId: typeof data.userId === "string" ? data.userId : undefined,
    mode: normalizeDisclosureMode(data.mode),
    answers,
    importSnapshot: normalizeDisclosureImportSnapshot(data.importSnapshot),
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

const createEmptyDraftingStageData = (): StageData => {
  return {
    content: "",
    previousVersion: undefined,
    generatedAt: undefined,
    isConfirmed: false,
  };
};

const normalizeDraftingStageData = (value: unknown): StageData => {
  if (!value || typeof value !== "object") {
    return createEmptyDraftingStageData();
  }

  const stageData = value as Record<string, unknown>;

  return {
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
};

const normalizeDraftingCurrentStage = (
  value: unknown,
): DraftingProgress["currentStage"] => {
  return DRAFTING_STAGES.includes(value as DraftingProgress["currentStage"])
    ? (value as DraftingProgress["currentStage"])
    : "abstract";
};

const normalizeDraftingProgress = (
  value: unknown,
): DraftingProgress | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const progress = value as Record<string, unknown>;

  const hasCurrentStage = typeof progress.currentStage === "string";
  const hasAnyStageData = DRAFTING_STAGES.some(
    (stage) => progress[stage] && typeof progress[stage] === "object",
  );

  if (!hasCurrentStage && !hasAnyStageData) {
    return undefined;
  }

  return {
    abstract: normalizeDraftingStageData(progress.abstract),
    claims: normalizeDraftingStageData(progress.claims),
    description: normalizeDraftingStageData(progress.description),
    embodiment: normalizeDraftingStageData(progress.embodiment),
    drawings: normalizeDraftingStageData(progress.drawings),
    currentStage: normalizeDraftingCurrentStage(progress.currentStage),
  };
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
    version: typeof patent.version === "number" ? patent.version : 1,
    deletedAt: patent.deletedAt ?? null,
    userId: normalizeString(patent.userId),
    organizationId: normalizeString(patent.organizationId),
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

const matchesPatentScope = (
  patent: PatentData,
  filters: PatentScopeFilters = {},
): boolean => {
  if (filters.organizationId) {
    return patent.organizationId === filters.organizationId;
  }

  if (filters.userId) {
    return patent.userId === filters.userId;
  }

  return true;
};

const filterPatentsByScope = (
  patents: PatentData[],
  filters: PatentScopeFilters = {},
): PatentData[] => {
  return patents.filter((patent) => matchesPatentScope(patent, filters));
};

const filterActivePatents = (patents: PatentData[]): PatentData[] => {
  return patents.filter((patent) => !patent.deletedAt);
};

const sortPatentsByModified = (patents: PatentData[]): PatentData[] => {
  return [...patents].sort((left, right) => right.lastModified - left.lastModified);
};

const writePatentsToCache = (patents: PatentData[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patents));
};

const upsertPatentInCache = (patent: PatentData): PatentData[] => {
  const patents = getPatents(true);
  const index = patents.findIndex((item) => item.id === patent.id);

  if (index >= 0) {
    patents[index] = patent;
  } else {
    patents.push(patent);
  }

  writePatentsToCache(patents);
  return patents;
};

const removePatentFromCache = (id: string): PatentData[] => {
  const patents = getPatents(true).filter((patent) => patent.id !== id);
  writePatentsToCache(patents);
  return patents;
};

const mapPatentToRow = (patent: PatentData): PatentProjectRow => {
  const normalizedPatent = normalizePatentData(patent);

  return {
    id: normalizedPatent.id,
    user_id: normalizedPatent.userId || "",
    organization_id: normalizedPatent.organizationId || null,
    title: normalizedPatent.title,
    status: normalizedPatent.status,
    patent_type: normalizedPatent.patentType ?? null,
    technical_field:
      normalizedPatent.selectedTechnicalField ??
      normalizedPatent.technicalField ??
      null,
    created_at: normalizedPatent.createdAt,
    last_modified: normalizedPatent.lastModified,
    payload: normalizedPatent,
  };
};

const mapRowToPatent = (row: Partial<PatentProjectRow>): PatentData => {
  const payload = row.payload && typeof row.payload === "object"
    ? (row.payload as Partial<PatentData>)
    : {};

  return normalizePatentData({
    ...payload,
    id: normalizeString(row.id) || payload.id,
    userId: normalizeString(row.user_id) || payload.userId,
    organizationId:
      normalizeString(row.organization_id) || payload.organizationId,
    title: normalizeString(row.title) || payload.title,
    status: (row.status as PatentStatus) || payload.status,
    patentType: (row.patent_type as PatentType | null) ?? payload.patentType,
    technicalField:
      normalizeString(row.technical_field) || payload.technicalField,
    selectedTechnicalField:
      normalizeSelectedTechnicalField(row.technical_field) ??
      payload.selectedTechnicalField,
    createdAt:
      typeof row.created_at === "number" ? row.created_at : payload.createdAt,
    lastModified:
      typeof row.last_modified === "number"
        ? row.last_modified
        : payload.lastModified,
  });
};

const mergeRemotePatentsIntoCache = (
  remotePatents: PatentData[],
  filters: PatentScopeFilters = {},
): PatentData[] => {
  const remotePatentIds = new Set(remotePatents.map((patent) => patent.id));
  const nextPatentsById = new Map<string, PatentData>();

  getPatents(true).forEach((patent) => {
    const shouldKeepPatent =
      !matchesPatentScope(patent, filters) ||
      Boolean(patent.deletedAt) ||
      remotePatentIds.has(patent.id);

    if (shouldKeepPatent) {
      nextPatentsById.set(patent.id, patent);
    }
  });

  remotePatents.forEach((patent) => {
    nextPatentsById.set(patent.id, patent);
  });

  const mergedPatents = Array.from(nextPatentsById.values());
  writePatentsToCache(mergedPatents);
  return mergedPatents;
};

const persistPatentToSupabase = async (patent: PatentData): Promise<Error | null> => {
  if (!supabase) {
    return null;
  }

  const row = mapPatentToRow(patent);
  if (!row.user_id) {
    return new Error("Patent user is required for Supabase persistence");
  }

  const { error } = await supabase
    .from(SUPABASE_PATENTS_TABLE)
    .upsert(row, { onConflict: "id" });

  if (!error) {
    return null;
  }

  if (isSupabaseRelationMissingError(error)) {
    console.error(
      "Supabase table patent_projects is missing. Run the SQL migration before enabling cloud persistence.",
      error,
    );
  } else {
    console.error("persistPatentToSupabase failed:", error);
  }

  return error;
};

const syncPatentPayloadToSupabase = async (
  patent: PatentData,
  action: "delete" | "restore",
): Promise<Error | null> => {
  if (!supabase) {
    return null;
  }

  const primaryPayload = {
    deleted_at: patent.deletedAt ?? null,
    last_modified: patent.lastModified,
    payload: patent,
  };

  const { data, error } = await supabase
    .from(SUPABASE_PATENTS_TABLE)
    .update(primaryPayload)
    .eq("id", patent.id)
    .select("id");

  if (!error && Array.isArray(data) && data.length > 0) {
    return null;
  }

  if (!error) {
    return createSupabaseMutationMissError(action);
  }

  if (!isSupabaseColumnMissingError(error, "deleted_at")) {
    return error;
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from(SUPABASE_PATENTS_TABLE)
    .update({
      last_modified: patent.lastModified,
      payload: patent,
    })
    .eq("id", patent.id)
    .select("id");

  if (!fallbackError && Array.isArray(fallbackData) && fallbackData.length > 0) {
    return null;
  }

  return fallbackError ?? createSupabaseMutationMissError(action);
};

const loadPatentsFromSupabase = async (
  filters: PatentScopeFilters = {},
): Promise<PatentData[] | null> => {
  if (!supabase) {
    return null;
  }

  let query = supabase.from(SUPABASE_PATENTS_TABLE).select("*");

  if (filters.organizationId) {
    query = query.eq("organization_id", filters.organizationId);
  } else if (filters.userId) {
    query = query.eq("user_id", filters.userId);
  }

  const { data, error } = await query.order("last_modified", { ascending: false });

  if (error) {
    if (isSupabaseRelationMissingError(error)) {
      console.error(
        "Supabase table patent_projects is missing. Falling back to local patent cache.",
        error,
      );
    } else {
      console.error("loadPatentsFromSupabase failed:", error);
    }

    return null;
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return filterActivePatents(
    data.map((row) => mapRowToPatent(row as Partial<PatentProjectRow>)),
  );
};

/**
 * 从 Supabase 拉取当前用户或组织范围内的项目，并刷新本地缓存。
 * @param filters 可选的用户或组织过滤条件。
 * @returns 远端可用时返回远端项目，否则回退到本地缓存结果。
 */
export const loadPatents = async (
  filters: PatentScopeFilters = {},
): Promise<PatentData[]> => {
  const remotePatents = await loadPatentsFromSupabase(filters);
  if (!remotePatents) {
    return sortPatentsByModified(filterPatentsByScope(getPatents(), filters));
  }

  mergeRemotePatentsIntoCache(remotePatents, filters);
  return sortPatentsByModified(filterPatentsByScope(remotePatents, filters));
};

/**
 * 将当前用户范围内的本地项目同步到 Supabase，常用于登录后补齐历史草稿。
 * @param userId 当前用户 ID。
 * @param organizationId 当前组织 ID。
 * @returns 成功写入远端的项目数量。
 */
export const syncPatentsToSupabase = async (
  userId: string,
  organizationId?: string | null,
): Promise<number> => {
  if (!supabase) {
    return 0;
  }

  const patents = getPatents();
  let syncedCount = 0;

  for (const patent of patents) {
    const nextPatent = normalizePatentData({
      ...patent,
      userId: patent.userId || userId,
      organizationId: patent.organizationId || organizationId || "",
    });

    upsertPatentInCache(nextPatent);
    const error = await persistPatentToSupabase(nextPatent);
    if (!error) {
      syncedCount += 1;
    }
  }

  return syncedCount;
};

/**
 * 从 localStorage 读取并规范化所有专利项目数据。
 * 默认过滤掉已软删除的项目。
 * @param includeDeleted 是否包含已删除的项目（默认为 false）。
 * @returns 已兼容旧版本字段的专利数据列表；读取失败时返回空数组。
 */
export const getPatents = (includeDeleted = false): PatentData[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    const parsed = JSON.parse(data) as Array<Partial<PatentData>>;
    const normalized = Array.isArray(parsed) ? parsed.map(normalizePatentData) : [];

    // Filter out soft-deleted patents by default
    if (!includeDeleted) {
      return normalized.filter(patent => !patent.deletedAt);
    }

    return normalized;
  } catch (e) {
    console.error("Failed to load patents", e);
    return [];
  }
};

/**
 * 根据项目 ID 获取单个专利数据。
 * @param id 项目唯一标识。
 * @param includeDeleted 是否包含已删除的项目（默认为 true，单项查询时允许访问已删除数据）。
 * @returns 找到时返回规范化后的项目，否则返回 undefined。
 */
export const getPatentById = (id: string, includeDeleted = true): PatentData | undefined => {
  const patents = getPatents(includeDeleted);
  return patents.find((p) => p.id === id);
};

/**
 * 将单个专利项目保存到本地缓存，并在可用时同步写入 Supabase。
 * 包含冲突解决策略：最新写入优先 + 版本号递增。
 * @param patent 待保存的专利项目数据。
 */
export const savePatentToStorage = async (
  patent: PatentData,
): Promise<{ patent: PatentData; error: Error | null }> => {
  const existingPatent = getPatentById(patent.id);

  if (existingPatent?.deletedAt && !patent.deletedAt) {
    return {
      patent: existingPatent,
      error: new Error("Patent has been deleted and cannot be saved"),
    };
  }

  const currentVersion = existingPatent?.version ?? 0;

  // Conflict resolution: increment version on each save
  const updatedPatent = normalizePatentData({
    ...patent,
    lastModified: Date.now(),
    version: currentVersion + 1,
  });

  upsertPatentInCache(updatedPatent);
  const error = await persistPatentToSupabase(updatedPatent);

  return {
    patent: updatedPatent,
    error,
  };
};

/**
 * 软删除指定 ID 的专利项目（标记为已删除，不立即清除数据）。
 * 保留 30 天以供恢复，之后需手动清理。
 * @param id 项目唯一标识。
 */
export const deletePatentFromStorage = async (id: string): Promise<Error | null> => {
  const patent = getPatentById(id);
  if (!patent) {
    return new Error("Patent not found");
  }

  // Soft delete: mark as deleted instead of removing
  const softDeletedPatent = normalizePatentData({
    ...patent,
    deletedAt: Date.now(),
    lastModified: Date.now(),
    version: (patent.version ?? 1) + 1,
  });

  upsertPatentInCache(softDeletedPatent);

  if (!supabase) {
    return null;
  }

  const error = await syncPatentPayloadToSupabase(softDeletedPatent, "delete");

  if (!error) {
    return null;
  }

  if (isSupabaseRelationMissingError(error)) {
    console.error(
      "Supabase table patent_projects is missing. Run the SQL migration before enabling cloud persistence.",
      error,
    );
  } else {
    console.error("deletePatentFromStorage failed:", error);
  }

  return error;
};

/**
 * 恢复已软删除的专利项目。
 * @param id 项目唯一标识。
 */
export const restorePatentFromStorage = async (id: string): Promise<Error | null> => {
  const patent = getPatentById(id);
  if (!patent) {
    return new Error("Patent not found");
  }

  if (!patent.deletedAt) {
    return new Error("Patent is not deleted");
  }

  // Restore: clear deletedAt timestamp
  const restoredPatent = normalizePatentData({
    ...patent,
    deletedAt: null,
    lastModified: Date.now(),
    version: (patent.version ?? 1) + 1,
  });

  upsertPatentInCache(restoredPatent);

  if (!supabase) {
    return null;
  }

  const error = await syncPatentPayloadToSupabase(restoredPatent, "restore");

  if (!error) {
    return null;
  }

  if (isSupabaseRelationMissingError(error)) {
    console.error(
      "Supabase table patent_projects is missing. Run the SQL migration before enabling cloud persistence.",
      error,
    );
  } else {
    console.error("restorePatentFromStorage failed:", error);
  }

  return error;
};

/**
 * 永久删除已软删除超过指定天数的专利项目（清理旧数据）。
 * @param daysOld 软删除后保留的天数，默认 30 天。
 * @returns 成功清理的项目数量。
 */
export const purgeOldDeletedPatents = async (daysOld = 30): Promise<number> => {
  const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  const allPatents = getPatents(true); // Include deleted
  const toPurge = allPatents.filter(
    patent => patent.deletedAt && patent.deletedAt < cutoffTime
  );

  if (toPurge.length === 0) {
    return 0;
  }

  // Remove from local cache
  const remainingPatents = allPatents.filter(
    patent => !patent.deletedAt || patent.deletedAt >= cutoffTime
  );
  writePatentsToCache(remainingPatents);

  // Remove from Supabase
  if (supabase) {
    for (const patent of toPurge) {
      const { error } = await supabase
        .from(SUPABASE_PATENTS_TABLE)
        .delete()
        .eq("id", patent.id);

      if (error) {
        console.error(`Failed to purge patent ${patent.id} from Supabase:`, error);
      }
    }
  }

  return toPurge.length;
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
