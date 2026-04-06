// Type definitions for Disclosure Templates and AI Generation

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
export type DraftingStage = "abstract" | "claims" | "description" | "embodiment" | "drawings";

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