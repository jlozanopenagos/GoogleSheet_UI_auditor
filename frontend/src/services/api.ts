import {
  ScriptRecord,
  UpdateScriptPayload,
  UpdateDescriptionPayload,
  UpdateTitlePayload,
  GeminiGeneratePayload,
  GeminiGenerateResult,
  GeminiTitleGeneratePayload,
  GeminiTitleGenerateResult,
  DoctorScriptPayload,
  DoctorScriptResult,
  MatrixCategoryData,
  BatchUpdateReadyPayload,
  CalendarEntriesData,
  CalendarPreflightResult,
  CalendarSchedulePayload,
  CalendarScheduleResult,
  ApiResponse,
} from '../types';

const API_BASE = '/api';

export async function fetchScriptById(scriptId: string): Promise<ScriptRecord> {
  const cleanId = scriptId.trim().toUpperCase();
  const resp = await fetch(`${API_BASE}/sheets/script/${encodeURIComponent(cleanId)}`);
  const json: ApiResponse<ScriptRecord> = await resp.json();

  if (!resp.ok || !json.success || !json.data) {
    throw new Error(json.message || json.error || `Script ID '${cleanId}' not found.`);
  }

  return json.data;
}

export async function updateScriptFields(payload: UpdateScriptPayload): Promise<any> {
  const resp = await fetch(`${API_BASE}/sheets/script/${encodeURIComponent(payload.script_id)}/update-script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json: ApiResponse = await resp.json();
  if (!resp.ok || !json.success) {
    throw new Error(json.message || json.error || 'Failed to update script.');
  }

  return json.data;
}

export async function updateDescriptionField(payload: UpdateDescriptionPayload): Promise<any> {
  const resp = await fetch(`${API_BASE}/sheets/script/${encodeURIComponent(payload.script_id)}/update-description`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json: ApiResponse = await resp.json();
  if (!resp.ok || !json.success) {
    throw new Error(json.message || json.error || 'Failed to update description.');
  }

  return json.data;
}

export async function updateTitleField(payload: UpdateTitlePayload): Promise<any> {
  const resp = await fetch(`${API_BASE}/sheets/script/${encodeURIComponent(payload.script_id)}/update-title`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      script_id: payload.script_id,
      short_title: payload.short_title,
    }),
  });

  const json: ApiResponse & { detail?: string } = await resp.json();
  if (!resp.ok || !json.success) {
    throw new Error(json.detail || json.message || json.error || 'Failed to update title.');
  }

  return json.data;
}

export async function generateGeminiDescription(payload: GeminiGeneratePayload): Promise<GeminiGenerateResult> {
  const resp = await fetch(`${API_BASE}/gemini/generate-description`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<GeminiGenerateResult> = await resp.json();
  if (!resp.ok || !json.success || !json.data) {
    throw new Error(json.message || json.error || 'Gemini generation failed.');
  }

  return json.data;
}

export async function generateGeminiTitle(payload: GeminiTitleGeneratePayload): Promise<GeminiTitleGenerateResult> {
  const resp = await fetch(`${API_BASE}/gemini/generate-title`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<GeminiTitleGenerateResult> & { detail?: string } = await resp.json();
  if (!resp.ok || !json.success || !json.data) {
    throw new Error(json.detail || json.message || json.error || 'Gemini title generation failed.');
  }

  return json.data;
}

export async function doctorScriptWithGemini(payload: DoctorScriptPayload): Promise<DoctorScriptResult> {
  const resp = await fetch(`${API_BASE}/gemini/doctor-script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<DoctorScriptResult> = await resp.json();
  if (!resp.ok || !json.success || !json.data) {
    throw new Error(json.message || json.error || 'Gemini script doctoring failed.');
  }

  return json.data;
}

export async function fetchMatrixCategory(language: string, videoType: string): Promise<MatrixCategoryData> {
  const resp = await fetch(`${API_BASE}/sheets/matrix/${encodeURIComponent(language.toLowerCase())}/${encodeURIComponent(videoType.toLowerCase())}`);
  const json: ApiResponse<MatrixCategoryData> = await resp.json();

  if (!resp.ok || !json.success || !json.data) {
    throw new Error(json.message || json.error || `Failed to fetch matrix for ${language} ${videoType}.`);
  }

  return json.data;
}

export async function batchUpdateReady(payload: BatchUpdateReadyPayload): Promise<any> {
  const resp = await fetch(`${API_BASE}/sheets/matrix/batch-update-ready`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json: ApiResponse = await resp.json();
  if (!resp.ok || !json.success) {
    throw new Error(json.message || json.error || 'Failed to update ready state in Google Sheet.');
  }

  return json.data;
}

export async function fetchCalendarEntries(
  month?: string,
  language?: string
): Promise<CalendarEntriesData> {
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (language && language !== 'all') params.set('language', language);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const resp = await fetch(`${API_BASE}/calendar/entries${qs}`);
  const json: ApiResponse<CalendarEntriesData> = await resp.json();

  if (!resp.ok || !json.success || !json.data) {
    throw new Error(json.message || json.error || 'Failed to fetch launch calendar.');
  }

  return json.data;
}

export async function checkCalendarId(
  scriptId: string,
  launchDate: string
): Promise<CalendarPreflightResult> {
  const resp = await fetch(`${API_BASE}/calendar/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script_id: scriptId.trim().toUpperCase(), launch_date: launchDate }),
  });

  const json: ApiResponse<CalendarPreflightResult> & { detail?: string } = await resp.json();
  if (!resp.ok || !json.success || !json.data) {
    throw new Error(json.detail || json.message || json.error || `Failed to check ID '${scriptId}'.`);
  }

  return json.data;
}

export async function scheduleCalendarId(
  payload: CalendarSchedulePayload
): Promise<ApiResponse<CalendarScheduleResult>> {
  const resp = await fetch(`${API_BASE}/calendar/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      script_id: payload.script_id.trim().toUpperCase(),
    }),
  });

  const json: ApiResponse<CalendarScheduleResult> & { detail?: string } = await resp.json();
  if (!resp.ok) {
    throw new Error(json.detail || json.message || json.error || 'Failed to schedule script on Launch Calendar.');
  }

  return json;
}

export async function unscheduleCalendarId(scriptId: string): Promise<any> {
  const cleanId = scriptId.trim().toUpperCase();
  const resp = await fetch(`${API_BASE}/calendar/entries/${encodeURIComponent(cleanId)}`, {
    method: 'DELETE',
  });

  const json: ApiResponse & { detail?: string } = await resp.json();
  if (!resp.ok || !json.success) {
    throw new Error(json.detail || json.message || json.error || `Failed to remove '${cleanId}' from calendar.`);
  }

  return json.data;
}

export async function syncCalendarFromSheets(
  month?: string,
  language?: string
): Promise<
  CalendarEntriesData & {
    synced_added: number;
    tabs_checked: number;
    errors: string[];
  }
> {
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (language && language !== 'all') params.set('language', language);
  const qs = params.toString();

  const resp = await fetch(`${API_BASE}/calendar/sync${qs ? `?${qs}` : ''}`, {
    method: 'POST',
  });
  const json: ApiResponse & { detail?: string } = await resp.json();
  if (!resp.ok || !json.success) {
    throw new Error(json.detail || json.message || json.error || 'Failed to sync Launch Calendar from Google Sheets.');
  }
  return json.data;
}
