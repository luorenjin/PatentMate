
export enum AppView {
  DASHBOARD = 'DASHBOARD',
  NOVELTY_SEARCH = 'NOVELTY_SEARCH',
  DRAFTER = 'DRAFTER',
  EDITOR = 'EDITOR'
}

export type PatentStatus = 'draft' | 'ready_to_submit';

export interface PatentData {
  id: string;
  title: string;
  status: PatentStatus;
  lastModified: number;
  createdAt: number;
  
  // Content fields
  technicalField: string;
  backgroundArt: string;
  inventionContent: string; // The core idea/solution
  descriptionOfDrawings?: string;
  drawings?: string[]; // Base64 strings of images
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
  role: 'user' | 'model';
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
  suggestion: string; // The full rewritten content for that section
}

export interface ReviewResult {
    score: number;
    feedback: string;
    passed: boolean;
    detailedIssues?: ReviewIssue[];
}
