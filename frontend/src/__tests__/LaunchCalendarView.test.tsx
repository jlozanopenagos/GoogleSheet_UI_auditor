import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LaunchCalendarView } from '../views/LaunchCalendarView';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  fetchCalendarEntries: vi.fn(),
  checkCalendarId: vi.fn(),
  scheduleCalendarId: vi.fn(),
  unscheduleCalendarId: vi.fn(),
  syncCalendarFromSheets: vi.fn(),
}));

const EMPTY_SUMMARY = {
  total: 1,
  by_language: { english: 1 },
  by_video_type: { expression: 1 },
  active_day_language_slots: 1,
  fun_fact_days: 0,
  triad_complete_days: 0,
  triad_partial_days: 1,
};

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('LaunchCalendarView', () => {
  const onOpenIdInTab = vi.fn();
  const onCalendarChanged = vi.fn();
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    const todayIso = todayIsoDate();
    vi.mocked(api.fetchCalendarEntries).mockResolvedValue({
      entries: [
        {
          id: 'EE01',
          launch_date: todayIso,
          sheet_date: '22/11/26',
          language: 'english',
          video_type: 'expression',
          expression: 'Break a leg',
          script_ready: true,
          video_ready: true,
          sheet_synced: true,
          scheduled_at: '2026-11-22T12:00:00Z',
        },
      ],
      summary: EMPTY_SUMMARY,
    });
  });

  it('renders uniform compact Month cells and opens/closes Day Detail Modal on click', async () => {
    const todayIso = todayIsoDate();
    vi.mocked(api.syncCalendarFromSheets).mockResolvedValueOnce({
      synced_added: 4,
      tabs_checked: 16,
      errors: [],
      entries: [],
      summary: { ...EMPTY_SUMMARY, total: 4 },
    });
    vi.mocked(api.unscheduleCalendarId).mockResolvedValueOnce({ removed: { id: 'EE01' }, sheet_cleared: true });

    render(
      <LaunchCalendarView
        onOpenIdInTab={onOpenIdInTab}
        onCalendarChanged={onCalendarChanged}
        onError={onError}
        onSuccess={onSuccess}
      />
    );

    const dayCell = await screen.findByTestId(`calendar-day-${todayIso}`);
    expect(dayCell).toHaveAccessibleName(/1 Short\. View day details/);
    expect(screen.getByTestId(`day-${todayIso}-lang-EN`)).toBeInTheDocument();
    // In compact Month mode, full ID is kept in tooltip/modal rather than inline text
    expect(screen.queryByText('EE01')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter by language' })).toBeInTheDocument();

    // Clicking the day card opens the Day Detail Modal showing full ID, expression, Open & Remove
    fireEvent.click(dayCell);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('EE01')).toBeInTheDocument();
    expect(screen.getByText('Break a leg')).toBeInTheDocument();

    // Unschedule from inside the modal
    fireEvent.click(screen.getByRole('button', { name: 'Remove EE01 from calendar' }));
    await waitFor(() => {
      expect(api.unscheduleCalendarId).toHaveBeenCalledWith('EE01');
    });

    // Escape key closes the modal cleanly
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Sync from Sheets button works
    fireEvent.click(screen.getByText('Sheet actions'));
    fireEvent.click(screen.getByRole('button', { name: /Sync from Sheets/i }));
    await waitFor(() => {
      expect(api.syncCalendarFromSheets).toHaveBeenCalledTimes(1);
    });
    expect(onSuccess).toHaveBeenCalledWith(expect.stringContaining('4 new entry(s) imported'));
  });

  it('groups multi-language triad entries into orthogonal compact rows and reveals full IDs in Week view', async () => {
    const todayIso = todayIsoDate();
    vi.mocked(api.fetchCalendarEntries).mockResolvedValue({
      entries: [
        { id: 'SE08', launch_date: todayIso, sheet_date: '22/11/26', language: 'spanish', video_type: 'expression', expression: 'Tirar la casa', script_ready: true, video_ready: true, sheet_synced: true, scheduled_at: '' },
        { id: 'IE07', launch_date: todayIso, sheet_date: '22/11/26', language: 'italian', video_type: 'roleplay', expression: 'Un caffè', script_ready: true, video_ready: true, sheet_synced: true, scheduled_at: '' },
        { id: 'FE06', launch_date: todayIso, sheet_date: '22/11/26', language: 'french', video_type: 'game', expression: 'Quiz', script_ready: true, video_ready: true, sheet_synced: true, scheduled_at: '' },
        { id: 'EE03', launch_date: todayIso, sheet_date: '22/11/26', language: 'english', video_type: 'expression', expression: 'Hit the sack', script_ready: true, video_ready: true, sheet_synced: true, scheduled_at: '' },
      ],
      summary: { ...EMPTY_SUMMARY, total: 4 },
    });

    render(
      <LaunchCalendarView
        onOpenIdInTab={onOpenIdInTab}
        onCalendarChanged={onCalendarChanged}
        onError={onError}
        onSuccess={onSuccess}
      />
    );

    const enGroup = await screen.findByTestId(`day-${todayIso}-lang-EN`);
    const frGroup = screen.getByTestId(`day-${todayIso}-lang-FR`);
    const esGroup = screen.getByTestId(`day-${todayIso}-lang-ES`);
    const itGroup = screen.getByTestId(`day-${todayIso}-lang-IT`);

    expect(enGroup.className).toContain('text-blue-300');
    expect(frGroup.className).toContain('text-violet-300');
    expect(esGroup.className).toContain('text-amber-300');
    expect(itGroup.className).toContain('text-emerald-300');

    // Switching to Week view reveals full inline IDs
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(await screen.findByRole('button', { name: 'EE03 · Expression' })).toBeInTheDocument();
    expect(screen.getByText('4 Shorts this week')).toBeInTheDocument();
  });

  it('checks readiness & displays 1-click Col E shortcut when only Col E is unchecked', async () => {
    vi.mocked(api.checkCalendarId).mockResolvedValueOnce({
      record: {
        ID: 'EF01',
        expression: 'Silent letters',
        script: 'Old',
        SCRIPT_CHANGED: 'Ready script',
        script_ready: false,
        script_date: '',
        video_ready: false,
        video_date: '',
        short_description: 'Desc #Shorts',
        short_title: '',
        language: 'english',
        video_type: 'fun_facts',
      },
      iso_date: '2026-11-22',
      sheet_date: '22/11/26',
      readiness: {
        readiness_ok: false,
        has_script_changed: true,
        script_ready: false,
        has_short_description: true,
        can_auto_check_col_e: true,
        missing_reasons: ['Column E is not checked'],
        recommended_action: 'auto_check_col_e',
      },
      cadence: {
        cadence_ok: true,
        warnings: [],
        day_slot_count: 0,
        existing_day_entries: [],
        already_scheduled_entry: null,
        is_same_date: false,
        move_note: '',
      },
    });

    render(
      <LaunchCalendarView
        onOpenIdInTab={onOpenIdInTab}
        onCalendarChanged={onCalendarChanged}
        onError={onError}
        onSuccess={onSuccess}
      />
    );

    const input = screen.getByPlaceholderText(/e\.g\. EF01/i);
    fireEvent.click(screen.getByRole('button', { name: 'Schedule a Short' }));
    fireEvent.change(input, { target: { value: 'ef01' } });
    fireEvent.click(screen.getByRole('button', { name: /Check ID/i }));

    expect(await screen.findByText('Check Column E & Add to Calendar')).toBeInTheDocument();
    expect(screen.getByText(/Col D Script Revision/i)).toBeInTheDocument();
  });
});
