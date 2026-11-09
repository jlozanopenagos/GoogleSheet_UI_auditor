import {
  ScriptRecord,
  UpdateScriptPayload,
  UpdateDescriptionPayload,
  GeminiGeneratePayload,
  GeminiGenerateResult,
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

