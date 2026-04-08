export enum AppView {
  DASHBOARD = "DASHBOARD",
  DISCLOSURE = "DISCLOSURE",
  NOVELTY_SEARCH = "NOVELTY_SEARCH",
  DRAFTER = "DRAFTER",
  EDITOR = "EDITOR",
  SETTINGS = "SETTINGS",
}

export type AuthView =
  | "LOGIN"
  | "REGISTER"
  | "PASSWORD_RESET"
  | "PASSWORD_UPDATE";

export interface AuthNotice {
  tone: "success" | "error" | "info";
  message: string;
}

export type PatentStatus =
  | "disclosure_collecting"
  | "disclosure_review"
  | "drafting"
  | "editing"
  | "ready_to_submit";

// New types for Step 3-4
export type PatentType = "invention" | "utility";

export type TechnicalField =
  | "AI"
  | "新能源"
  | "医疗器械"
  | "软件"
  | "机械"
  | "化工"
  | "电子"
  | "通信"
  | "生物"
  | "材料";

export interface TemplateQuestion {
  id: string;
  question: string;
  helpText: string;
  exampleAnswer: string;
  placeholder?: string;
}

export interface Template {
  id: string;
  type: PatentType;
  category: TechnicalField;
  questions: TemplateQuestion[];
}

export interface DisclosureAnswer {
  questionId: string;
  answer: string;
  lastModified: number;
}

export interface DisclosureData {
  type: PatentType;
  field: TechnicalField;
  title: string;
  answers: DisclosureAnswer[];
  completedAt?: number;
}

// Drafting stages
export type DraftingStage =
  | "abstract"
  | "claims"
  | "description"
  | "embodiment"
  | "drawings";

export interface StageData {
  content: string;
  previousVersion?: string;
  generatedAt?: number;
  isConfirmed: boolean;
}

export interface DraftingProgress {
  abstract: StageData;
  claims: StageData;
  description: StageData;
  embodiment: StageData;
  drawings: StageData;
  currentStage: DraftingStage;
}

// Existing types
export interface TechnicalDisclosureSummary {
  summary: string;
  technicalHighlights: string[];
  embodiments: string[];
  advantages: string[];
  alternativeSolutions: string[];
  evidenceMaterials: string[];
  risks: string[];
}

export interface ClaimStrategyPackage {
  claimStrategy: string;
  independentClaimSkeleton: string;
  dependentClaimOptions: string[];
  strategyRisks: string[];
}

export interface DisclosureInterviewTurn {
  role: "user" | "model";
  text: string;
  timestamp: number;
}

export interface PatentData {
  id: string;
  title: string;
  status: PatentStatus;
  lastModified: number;
  createdAt: number;

  // User association
  userId?: string;
  organizationId?: string;

  // New: Type and field selection (Step 3)
  patentType?: PatentType;
  selectedTechnicalField?: TechnicalField;

  // New: Disclosure data structure (Step 3)
  disclosureData?: DisclosureData;

  // New: Drafting progress (Step 4)
  draftingProgress?: DraftingProgress;

  // Disclosure stage fields (existing)
  disclosureNotes: string;
  disclosureSummary: string;
  disclosureInterview: DisclosureInterviewTurn[];
  disclosurePendingQuestions: string[];
  technicalProblem: string;
  existingSolutionIssues: string;
  technicalHighlights: string[];
  embodiments: string[];
  advantages: string[];
  alternativeSolutions: string[];
  evidenceMaterials: string[];
  claimStrategy: string;
  independentClaimSkeleton: string;
  dependentClaimOptions: string[];
  claimStrategyConfirmed: boolean;
  strategyRisks: string[];
  draftReadiness: number;
  reviewSummary: string;
  lastReviewScore: number;

  // Content fields
  technicalField: string;
  backgroundArt: string;
  inventionContent: string;
  descriptionOfDrawings?: string;
  drawings?: string[];
  mermaidDiagrams?: string[];   // Mermaid diagram code, one per figure
  detailedDescription?: string;
  claims?: string;
  abstract?: string;
}

export interface NoveltyReport {
  score: number;
  analysis: string;
  priorArtLinks: Array<{ title: string; uri: string }>;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
  timestamp: number;
}

export interface PatentSection {
  id: keyof PatentData;
  title: string;
  content: string;
  isGenerating: boolean;
}

export interface ReviewIssue {
  section: keyof PatentData;
  issue: string;
  suggestion: string;
}

export interface ReviewResult {
  score: number;
  feedback: string;
  passed: boolean;
  detailedIssues?: ReviewIssue[];
}
