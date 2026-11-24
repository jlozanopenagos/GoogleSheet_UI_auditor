import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IdChecklistView } from '../views/IdChecklistView';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  fetchMatrixCategory: vi.fn(),
}));

describe('IdChecklistView', () => {
  const onSelectId = vi.fn();
  const onScheduleInCalendar = vi.fn();
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchMatrixCategory).mockResolvedValue({
      language: 'english',
      video_type: 'expression',
      sheet_url: 'https://docs.google.com/spreadsheets/d/test',
      count: 4,
      items: [
        {
          id: 'EE01',
          status: 'violet',
          script_ready: true,
          video_ready: true,
          expression: 'Launched expr',
          script_date: '01/11/26',
          launch_date: '20/11/26',
          has_script_changed: true,
          has_short_description: true,
        },
        {
          id: 'EE02',
          status: 'green',
          script_ready: true,
          video_ready: false,
          expression: 'Ready expr',
          script_date: '02/11/26',
          has_script_changed: true,
          has_short_description: true,
          short_title: 'Ready Short Title',
          has_short_title: true,
        },
        {
          id: 'EE03',
          status: 'yellow',
          script_ready: true,
          video_ready: false,
          expression: 'Script only expr',
          script_date: '03/11/26',
          has_script_changed: true,
          has_short_description: false,
          short_title: '',
          has_short_title: false,
        },
        {
          id: 'EE04',
          status: 'grey',
          script_ready: false,
          video_ready: false,
          expression: 'Empty expr',
          script_date: '',
          has_script_changed: false,
          has_short_description: false,
        },
      ],
    });
  });

  it('renders 4-state Violet/Green/Yellow/Grey Bingo counters and routes ready tiles to Calendar', async () => {
    render(
      <IdChecklistView
        onSelectId={onSelectId}
        onScheduleInCalendar={onScheduleInCalendar}
        onError={onError}
        onSuccess={onSuccess}
      />
    );

    expect(await screen.findByText('EE01')).toBeInTheDocument();
    expect(screen.getByText('Launched (1)')).toBeInTheDocument();
    expect(screen.getByText('Ready (1)')).toBeInTheDocument();
    expect(screen.getByText('Script only (1)')).toBeInTheDocument();
    expect(screen.getByText('No script (1)')).toBeInTheDocument();

    // Clicking green tile EE02 shows inspection banner with Schedule in Calendar button & Col J title status
    fireEvent.click(screen.getByText('EE02'));
    expect(await screen.findByText(/Col J \(Title\): ✓ Filled/)).toBeInTheDocument();
    expect(screen.getByText(/Title: "Ready Short Title"/)).toBeInTheDocument();
    const scheduleBtn = await screen.findByRole('button', { name: /Schedule in Calendar/i });
    fireEvent.click(scheduleBtn);
    expect(onScheduleInCalendar).toHaveBeenCalledWith('EE02');

    // Clicking yellow tile EE03 shows Col J empty status
    fireEvent.click(screen.getByText('EE03'));
    expect(await screen.findByText(/Col J \(Title\): ✗ Empty/)).toBeInTheDocument();
  });
});
