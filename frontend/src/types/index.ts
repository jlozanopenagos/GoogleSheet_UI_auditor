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
  short_title: string;
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

export interface UpdateTitlePayload {
  script_id: string;
  short_title: string;
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

export interface GeminiTitleGeneratePayload {
  script_id: string;
  expression: string;
  script_changed: string;
  previous_titles?: string[];
}

export interface GeminiTitleGenerateResult {
  script_id: string;
  short_title: string;
  word_count: number;
  character_count: number;
  angle_used?: string;
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

export type ActiveTab = 'script_auditor' | 'description_creation' | 'id_checklist' | 'launch_calendar' | 'youtube_upload';

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
  short_title?: string;
  has_short_title?: boolean;
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

export interface YouTubeTargetStatus {
  target: string;
  connected: boolean;
  channel_id: string;
  channel_title: string;
  channel_thumbnail: string;
  account_email: string;
  connected_at: string;
  has_playlist_scope?: boolean;
}

export interface YouTubePlaylistItem {
  playlist_id: string;
  title: string;
}

export interface YouTubeAuthStatusData {
  client_secret_configured: boolean;
  client_secret_path: string;
  targets: Record<string, YouTubeTargetStatus>;
}

export interface DriveAssetItem {
  file_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  variant: string;
  preview_url: string;
}

export interface DriveScriptAssets {
  folder_id: string;
  folder_url: string;
  video: DriveAssetItem | null;
  thumbnails: DriveAssetItem[];
  requires_thumbnail_choice: boolean;
}

export interface YouTubeUploadHistoryRecord {
  script_id: string;
  video_id: string;
  studio_url: string;
  watch_url: string;
  language: string;
  channel_title: string;
  title: string;
  visibility_mode: string;
  publish_at_utc: string;
  publish_at_bogota: string;
  playlist_id?: string;
  playlist_title?: string;
  playlist_added?: boolean;
  thumbnail_file_id: string;
  thumbnail_variant: string;
  thumbnail_applied: boolean;
  uploaded_at: string;
}

export interface YouTubePreflightData {
  record: ScriptRecord;
  channel_status: YouTubeTargetStatus;
  drive_status: YouTubeTargetStatus;
  drive_assets: DriveScriptAssets | null;
  drive_error: string;
  playlists?: YouTubePlaylistItem[];
  recommended_playlist_id?: string;
  playlists_error?: string;
  suggested_launch_date: string;
  prior_upload: YouTubeUploadHistoryRecord | null;
}

export interface YouTubeUploadPayload {
  script_id: string;
  thumbnail_file_id: string;
  playlist_id?: string;
  playlist_title?: string;
  visibility_mode: 'scheduled' | 'public' | 'private';
  scheduled_date: string;
  scheduled_time: string;
  timezone_name: string;
}

export interface YouTubeUploadJob {
  job_id: string;
  script_id: string;
  language: string;
  channel_title: string;
  stage: 'queued' | 'downloading_drive' | 'uploading_video' | 'adding_to_playlist' | 'waiting_processing' | 'setting_thumbnail' | 'completed' | 'failed';
  progress_pct: number;
  message: string;
  video_id: string;
  studio_url: string;
  watch_url: string;
  visibility_mode: string;
  publish_at_utc: string;
  publish_at_bogota: string;
  playlist_id?: string;
  playlist_title?: string;
  playlist_added?: boolean;
  playlist_warning?: string;
  thumbnail_file_id: string;
  thumbnail_variant: string;
  thumbnail_applied: boolean;
  thumbnail_warning: string;
  error: string;
}

