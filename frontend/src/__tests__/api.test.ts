import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchScriptById,
  updateTitleField,
  scheduleCalendarId,
  syncCalendarFromSheets,
} from '../services/api';

describe('API service client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('fetchScriptById uppercases/trims ID and throws on error responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: 'OK',
        data: { ID: 'EE01', expression: 'Break a leg' },
      }),
    });

    const rec = await fetchScriptById('  ee01 ');
    expect(fetchMock).toHaveBeenCalledWith('/api/sheets/script/EE01');
    expect(rec.ID).toBe('EE01');

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, message: 'Not found' }),
    });
    await expect(fetchScriptById('EE99')).rejects.toThrow('Not found');
  });

  it('scheduleCalendarId normalizes script_id and sends POST JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Scheduled EE01',
        data: { entry: { id: 'EE01' }, sheet_synced: true },
      }),
    });

    const res = await scheduleCalendarId({
      script_id: ' ee01 ',
      launch_date: '2026-11-22',
      force_override: true,
    });
    expect(res.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/calendar/schedule');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({
      script_id: 'EE01',
      launch_date: '2026-11-22',
      force_override: true,
    });
  });

  it('syncCalendarFromSheets builds query string properly', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Synced',
        data: {
          synced_added: 3,
          tabs_checked: 16,
          errors: [],
          entries: [],
          summary: {
            total: 3,
            by_language: {},
            by_video_type: {},
            active_day_language_slots: 1,
            fun_fact_days: 0,
            triad_complete_days: 1,
            triad_partial_days: 0,
          },
        },
      }),
    });

    const data = await syncCalendarFromSheets('2026-11', 'spanish');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/calendar/sync?month=2026-11&language=spanish',
      { method: 'POST' }
    );
    expect(data.synced_added).toBe(3);
    expect(data.tabs_checked).toBe(16);
  });

  it('updateTitleField posts to update-title endpoint and throws on error responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Updated title',
        data: { id: 'EE01', short_title: 'My Short Title' },
      }),
    });

    const data = await updateTitleField({ script_id: 'EE01', short_title: 'My Short Title' });
    expect(fetchMock).toHaveBeenCalledWith('/api/sheets/script/EE01/update-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script_id: 'EE01', short_title: 'My Short Title' }),
    });
    expect(data.short_title).toBe('My Short Title');

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Short title cannot be empty.' }),
    });
    await expect(updateTitleField({ script_id: 'EE01', short_title: '' })).rejects.toThrow(
      'Short title cannot be empty.'
    );
  });
});
