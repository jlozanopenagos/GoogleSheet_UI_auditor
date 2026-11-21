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

export interface DoctorScriptPayload {
  script_id: string;
  expression: string;
  original_script: string;
}

export interface DoctorScriptResult {
  script_id: string;
  expression: string;
  doctored_script: string;
  word_count: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export type ActiveTab = 'script_auditor' | 'description_creation' | 'id_checklist' | 'launch_calendar';

export type MatrixStatus = 'violet' | 'green' | 'yellow' | 'grey';

export interface MatrixItem {
  id: string;
  script_ready: boolean;
  video_ready: boolean;
  expression: string;
  script_date: string;
  launch_date?: string;
  launch_date_iso?: string;
  has_script_changed: boolean;
  has_short_description: boolean;
  status: MatrixStatus;
}

export interface MatrixCategoryData {
  language: string;
  video_type: string;
  sheet_url?: string;
  count: number;
  items: MatrixItem[];
}

export interface BatchUpdateReadyItem {
  id: string;
  script_ready: boolean;
  script_date?: string;
}

export interface BatchUpdateReadyPayload {
  language: string;
  video_type: string;
  updates: BatchUpdateReadyItem[];
}

export interface CalendarEntry {
  id: string;
  launch_date: string;      // YYYY-MM-DD
  sheet_date: string;       // DD/MM/YY
  language: string;
  video_type: string;
  expression: string;
  script_ready: boolean;
  video_ready: boolean;
  sheet_synced: boolean;
  scheduled_at: string;
}

export interface CalendarSummary {
  total: number;
  by_language: Record<string, number>;
  by_video_type: Record<string, number>;
  active_day_language_slots: number;
  fun_fact_days: number;
  triad_complete_days: number;
  triad_partial_days: number;
}

export interface CalendarEntriesData {
  entries: CalendarEntry[];
  summary: CalendarSummary;
}

export interface CalendarReadinessEvaluation {
  readiness_ok: boolean;
  has_script_changed: boolean;
  script_ready: boolean;
  has_short_description: boolean;
  can_auto_check_col_e: boolean;
  missing_reasons: string[];
  recommended_action?: 'script_auditor' | 'description_creation' | 'auto_check_col_e' | null;
}

export interface CalendarCadenceEvaluation {
  cadence_ok: boolean;
  warnings: string[];
  day_slot_count: number;
  existing_day_entries: CalendarEntry[];
  already_scheduled_entry?: CalendarEntry | null;
  is_same_date: boolean;
  move_note: string;
}

export interface CalendarPreflightResult {
  record: ScriptRecord;
  iso_date: string;
  sheet_date: string;
  readiness: CalendarReadinessEvaluation;
  cadence: CalendarCadenceEvaluation;
}

export interface CalendarSchedulePayload {
  script_id: string;
  launch_date: string;
  auto_check_script_ready?: boolean;
  force_override?: boolean;
  allow_move?: boolean;
}

export interface CalendarScheduleResult {
  entry?: CalendarEntry;
  sheet_synced?: boolean;
  sheet_sync_warning?: string;
  requires_readiness?: boolean;
  requires_override?: boolean;
  iso_date?: string;
  sheet_date?: string;
  readiness: CalendarReadinessEvaluation;
  cadence: CalendarCadenceEvaluation;
  record: ScriptRecord;
}

