import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { YouTubeUploadView } from '../views/YouTubeUploadView';
import { ScriptRecord } from '../types';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  fetchYouTubeAuthStatus: vi.fn(),
  startYouTubeOAuth: vi.fn(),
  disconnectYouTubeTarget: vi.fn(),
  fetchYouTubePreflight: vi.fn(),
  startYouTubeUpload: vi.fn(),
  fetchYouTubeJob: vi.fn(),
  retryYouTubeThumbnail: vi.fn(),
}));

const makeSpanishScript = (): ScriptRecord => ({
  ID: 'SE08',
  expression: 'embarazada',
  script: 'Old',
  SCRIPT_CHANGED: 'Final script',
  script_ready: true,
  script_date: '01/12/26',
  video_ready: false,
  video_date: '',
  short_description: 'Spanish Short description #Shorts',
  short_title: '¿Nueva madre o sonrojada?',
  language: 'spanish',
  video_type: 'expression',
});

describe('YouTubeUploadView', () => {
  const onOpenTab = vi.fn();
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchYouTubeAuthStatus).mockResolvedValue({
      client_secret_configured: true,
      client_secret_path: 'backend/credentials/client_secret.json',
      targets: {
        drive: { target: 'drive', connected: true, channel_id: '', channel_title: 'Drive User', channel_thumbnail: '', account_email: 'u@example.com', connected_at: '' },
        english: { target: 'english', connected: false, channel_id: '', channel_title: '', channel_thumbnail: '', account_email: '', connected_at: '' },
        french: { target: 'french', connected: false, channel_id: '', channel_title: '', channel_thumbnail: '', account_email: '', connected_at: '' },
        spanish: { target: 'spanish', connected: true, channel_id: 'UC_ES', channel_title: 'Tito Español', channel_thumbnail: '', account_email: '', connected_at: '' },
        italian: { target: 'italian', connected: false, channel_id: '', channel_title: '', channel_thumbnail: '', account_email: '', connected_at: '' },
      },
    });
    vi.mocked(api.fetchYouTubePreflight).mockResolvedValue({
      record: makeSpanishScript(),
      channel_status: { target: 'spanish', connected: true, channel_id: 'UC_ES', channel_title: 'Tito Español', channel_thumbnail: '', account_email: '', connected_at: '' },
      drive_status: { target: 'drive', connected: true, channel_id: '', channel_title: 'Drive User', channel_thumbnail: '', account_email: 'u@example.com', connected_at: '' },
      drive_assets: {
        folder_id: 'fld_se08',
        folder_url: 'https://drive.google.com/drive/folders/fld_se08',
        video: { file_id: 'vid_1', name: 'SE08.mp4', mime_type: 'video/mp4', size_bytes: 5242880, variant: 'video', preview_url: '' },
        thumbnails: [
          { file_id: 'th_latam', name: 'SE08_thumbnail_latam.png', mime_type: 'image/png', size_bytes: 102400, variant: "latam", preview_url: '/api/youtube/drive-preview/th_latam' },
          { file_id: 'th_spain', name: 'SE08_thumbnail_spain.png', mime_type: 'image/png', size_bytes: 102400, variant: "spain", preview_url: '/api/youtube/drive-preview/th_spain' },
        ],
        requires_thumbnail_choice: true,
      },
      drive_error: '',
      playlists: [
        { playlist_id: 'PLWtmw6s7JZKE', title: 'Expresiones en acción' },
        { playlist_id: 'PLTqmUDYWor7c', title: 'Expresiones comunes y modismos del día a día' },
      ],
      recommended_playlist_id: 'PLTqmUDYWor7c',
      playlists_error: '',
      suggested_launch_date: '2026-12-15',
      prior_upload: null,
    });
  });

  it('requires explicit Spanish thumbnail choice and user-entered Bogota hour before enabling upload', async () => {
    vi.mocked(api.startYouTubeUpload).mockResolvedValueOnce({
      job_id: 'job-99',
      script_id: 'SE08',
      language: 'spanish',
      channel_title: 'Tito Español',
      stage: 'completed',
      progress_pct: 100,
      message: 'Upload complete!',
      video_id: 'yt_99',
      studio_url: 'https://studio.youtube.com/video/yt_99/edit',
      watch_url: 'https://youtube.com/shorts/yt_99',
      visibility_mode: 'scheduled',
      publish_at_utc: '2026-12-15T19:00:00.000Z',
      publish_at_bogota: '2026-12-15 14:00 America/Bogota (UTC-05:00)',
      thumbnail_file_id: 'th_spain',
      thumbnail_variant: 'spain',
      thumbnail_applied: true,
      thumbnail_warning: '',
      error: '',
    });

    render(
      <YouTubeUploadView
        script={makeSpanishScript()}
        onOpenTab={onOpenTab}
        onError={onError}
        onSuccess={onSuccess}
      />
    );

    // Wait for preflight to load
    expect(await screen.findByText('Choose Thumbnail Version (Required)')).toBeInTheDocument();
    expect(screen.getByText('LatAm Version')).toBeInTheDocument();
    expect(screen.getByText('Spain Version')).toBeInTheDocument();

    // Launch hour is intentionally empty by default (with helpful suggestion text)
    const hourInput = screen.getByLabelText(/Launch Hour \(America\/Bogota/i) as HTMLInputElement;
    expect(hourInput.value).toBe('');
    expect(screen.getByText(/Suggested hours:/i)).toBeInTheDocument();

    const uploadBtn = screen.getByRole('button', { name: /Upload & Schedule SE08 to YouTube/i });
    expect(uploadBtn).toBeDisabled();

    // Select Spain thumbnail -> still disabled until Bogota hour is entered
    fireEvent.click(screen.getByRole('button', { name: /Spain Version/i }));
    expect(uploadBtn).toBeDisabled();

    // Enter Bogota hour 14:00 -> converts to 19:00:00.000Z and enables Upload button
    fireEvent.change(hourInput, { target: { value: '14:00' } });
    expect(screen.getByText(/2026-12-15T19:00:00\.000Z/)).toBeInTheDocument();
    expect(uploadBtn).not.toBeDisabled();

    // Playlist dropdown auto-matches the Spanish expression playlist
    const playlistSelect = screen.getByLabelText(/Playlist/i) as HTMLSelectElement;
    expect(playlistSelect.value).toBe('PLTqmUDYWor7c');

    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(api.startYouTubeUpload).toHaveBeenCalledWith({
        script_id: 'SE08',
        thumbnail_file_id: 'th_spain',
        playlist_id: 'PLTqmUDYWor7c',
        playlist_title: 'Expresiones comunes y modismos del día a día',
        visibility_mode: 'scheduled',
        scheduled_date: '2026-12-15',
        scheduled_time: '14:00',
        timezone_name: 'America/Bogota',
      });
    });
  });
});
