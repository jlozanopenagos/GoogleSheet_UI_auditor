export interface ScriptRecord {
  ID: string;
  row_number?: number;
  expression: string;
  script: string;
  SCRIPT_CHANGED: string;
  script_ready: boolean;
  script_date: string;
  video_ready?: boolean;
  video_date?: string;
  short_description: string;
  language: string;
  video_type: string;
  sheet_url?: string;
}

export interface UpdateScriptPayload {
  script_id: string;
  SCRIPT_CHANGED: string;
  script_ready: boolean;
  script_date: string;
}

export interface UpdateDescriptionPayload {
  script_id: string;
  short_description: string;
}

export interface GeminiGeneratePayload {
  script_id: string;
  expression: string;
  script_changed: string;
}

export interface GeminiGenerateResult {
  script_id: string;
  short_description: string;
  word_count: number;
  character_count: number;
  hashtags: string[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export type ActiveTab = 'script_auditor' | 'description_creation';

