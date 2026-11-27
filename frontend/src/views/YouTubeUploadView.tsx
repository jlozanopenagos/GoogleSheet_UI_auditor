import React, { useEffect, useMemo, useState } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  Link2,
  Unlink,
  Clock,
  Film,
  Image as ImageIcon,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  ActiveTab,
  ScriptRecord,
  YouTubeAuthStatusData,
  YouTubePreflightData,
  YouTubeUploadJob,
} from '../types';
import {
  disconnectYouTubeTarget,
  fetchYouTubeAuthStatus,
  fetchYouTubeJob,
  fetchYouTubePreflight,
  retryYouTubeThumbnail,
  startYouTubeOAuth,
  startYouTubeUpload,
} from '../services/api';

interface YouTubeUploadViewProps {
  script: ScriptRecord | null;
  onOpenTab: (tab: ActiveTab) => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

const TARGET_LABELS: { id: string; label: string; badge: string }[] = [
  { id: 'drive', label: 'Google Drive', badge: '📁' },
  { id: 'english', label: 'English Channel', badge: '🇬🇧' },
  { id: 'french', label: 'French Channel', badge: '🇫🇷' },
  { id: 'spanish', label: 'Spanish Channel', badge: '🇪🇸' },
  { id: 'italian', label: 'Italian Channel', badge: '🇮🇹' },
];

function computeBogotaToUtcPreview(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return '';
  const dMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tMatch = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!dMatch || !tMatch) return '';
  const [, y, m, d] = dMatch;
  const [, hh, mm] = tMatch;
  // America/Bogota is permanently UTC-05:00 -> add 5 hours to get UTC
  const utcMs = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh) + 5, Number(mm), 0);
  return new Date(utcMs).toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const YouTubeUploadView: React.FC<YouTubeUploadViewProps> = ({
  script,
  onOpenTab,
  onError,
  onSuccess,
}) => {
  const [authStatus, setAuthStatus] = useState<YouTubeAuthStatusData | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [connectingTarget, setConnectingTarget] = useState<string | null>(null);

  const [preflight, setPreflight] = useState<YouTubePreflightData | null>(null);
  const [isPreflightLoading, setIsPreflightLoading] = useState(false);

  const [selectedThumbId, setSelectedThumbId] = useState<string>('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  const [visibilityMode, setVisibilityMode] = useState<'scheduled' | 'public' | 'private'>('scheduled');
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>(''); // Intentionally empty by default

  const [activeJob, setActiveJob] = useState<YouTubeUploadJob | null>(null);
  const [isStartingUpload, setIsStartingUpload] = useState(false);
  const [isRetryingThumb, setIsRetryingThumb] = useState(false);

  const loadAuthStatus = async () => {
    setIsAuthLoading(true);
    try {
      const data = await fetchYouTubeAuthStatus();
      setAuthStatus(data);
    } catch (err: any) {
      onError(err.message || 'Failed to load YouTube/Drive connection status.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const loadPreflight = async (scriptId: string) => {
    setIsPreflightLoading(true);
    try {
      const data = await fetchYouTubePreflight(scriptId);
      setPreflight(data);

      // Auto-select ONLY when there is a single thumbnail; require explicit choice for multiple (e.g. Spanish LatAm vs Spain)
      const thumbs = data.drive_assets?.thumbnails || [];
      if (thumbs.length === 1) {
        setSelectedThumbId(thumbs[0].file_id);
      } else {
        setSelectedThumbId('');
      }

      setSelectedPlaylistId(data.recommended_playlist_id || '');

      if (data.suggested_launch_date) {
        setScheduledDate(data.suggested_launch_date);
      }
    } catch (err: any) {
      setPreflight(null);
      onError(err.message || `Failed to load preflight for ${scriptId}.`);
    } finally {
      setIsPreflightLoading(false);
    }
  };

  useEffect(() => {
    loadAuthStatus();
  }, []);

  useEffect(() => {
    const onOAuthMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'youtube-oauth-complete') {
        setConnectingTarget(null);
        if (event.data.success) {
          onSuccess(`Connected ${event.data.channel_title || event.data.target} successfully.`);
          loadAuthStatus().then(() => {
            if (script?.ID) loadPreflight(script.ID);
          });
        } else {
          onError(event.data.error || 'Google OAuth authorization failed.');
        }
      }
    };
    window.addEventListener('message', onOAuthMessage);
    return () => window.removeEventListener('message', onOAuthMessage);
  }, [script?.ID]);

  useEffect(() => {
    if (script?.ID) {
      setActiveJob(null);
      setScheduledTime(''); // User must explicitly choose launch hour for each script
      loadPreflight(script.ID);
    } else {
      setPreflight(null);
      setSelectedThumbId('');
      setSelectedPlaylistId('');
    }
  }, [script?.ID]);

  // Poll active upload job while in progress
  useEffect(() => {
    if (!activeJob || activeJob.stage === 'completed' || activeJob.stage === 'failed') {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const updated = await fetchYouTubeJob(activeJob.job_id);
        setActiveJob(updated);
        if (updated.stage === 'completed') {
          onSuccess(`Successfully uploaded ${updated.script_id} to YouTube (${updated.video_id}).`);
          if (script?.ID) loadPreflight(script.ID);
        } else if (updated.stage === 'failed') {
          onError(updated.error || 'YouTube upload failed.');
        }
      } catch (err: any) {
        onError(err.message || 'Failed polling upload job status.');
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeJob?.job_id, activeJob?.stage]);

  const handleConnect = async (target: string) => {
    setConnectingTarget(target);
    try {
      const { auth_url } = await startYouTubeOAuth(target);
      const popup = window.open(auth_url, 'youtube_oauth_popup', 'width=540,height=680');
      if (!popup) {
        onError('Popup was blocked by your browser. Please allow popups for localhost and try again.');
        setConnectingTarget(null);
      }
    } catch (err: any) {
      setConnectingTarget(null);
      onError(err.message || `Could not start OAuth for ${target}.`);
    }
  };

  const handleDisconnect = async (target: string) => {
    try {
      await disconnectYouTubeTarget(target);
      onSuccess(`Disconnected ${target}.`);
      await loadAuthStatus();
      if (script?.ID) await loadPreflight(script.ID);
    } catch (err: any) {
      onError(err.message || `Failed to disconnect ${target}.`);
    }
  };

  const utcPreview = useMemo(
    () => (visibilityMode === 'scheduled' ? computeBogotaToUtcPreview(scheduledDate, scheduledTime) : ''),
    [visibilityMode, scheduledDate, scheduledTime]
  );

  const thumbnails = preflight?.drive_assets?.thumbnails || [];
  const hasVideo = Boolean(preflight?.drive_assets?.video);
  const hasTitle = Boolean(preflight?.record?.short_title?.trim());
  const hasDescription = Boolean(preflight?.record?.short_description?.trim());
  const channelConnected = Boolean(preflight?.channel_status?.connected);
  const driveConnected = Boolean(preflight?.drive_status?.connected);
  const thumbnailReady = thumbnails.length === 0 || Boolean(selectedThumbId);
  const scheduleReady =
    visibilityMode !== 'scheduled' || (Boolean(scheduledDate) && Boolean(scheduledTime));

  const isUploadInProgress =
    isStartingUpload ||
    Boolean(activeJob && activeJob.stage !== 'completed' && activeJob.stage !== 'failed');

  const canUpload =
    Boolean(preflight) &&
    channelConnected &&
    driveConnected &&
    hasVideo &&
    hasTitle &&
    hasDescription &&
    thumbnailReady &&
    scheduleReady &&
    !isUploadInProgress;

  const handleStartUpload = async () => {
    if (!preflight || !canUpload) return;
    const chosenPlaylist = (preflight.playlists || []).find(
      (p) => p.playlist_id === selectedPlaylistId
    );
    setIsStartingUpload(true);
    try {
      const job = await startYouTubeUpload({
        script_id: preflight.record.ID,
        thumbnail_file_id: selectedThumbId,
        playlist_id: selectedPlaylistId,
        playlist_title: chosenPlaylist?.title || '',
        visibility_mode: visibilityMode,
        scheduled_date: visibilityMode === 'scheduled' ? scheduledDate : '',
        scheduled_time: visibilityMode === 'scheduled' ? scheduledTime : '',
        timezone_name: 'America/Bogota',
      });
      setActiveJob(job);
    } catch (err: any) {
      onError(err.message || 'Failed to start YouTube upload.');
    } finally {
      setIsStartingUpload(false);
    }
  };

  const handleRetryThumbnail = async () => {
    if (!activeJob?.video_id || !activeJob?.thumbnail_file_id || isRetryingThumb) return;
    setIsRetryingThumb(true);
    try {
      await retryYouTubeThumbnail({
        script_id: activeJob.script_id,
        video_id: activeJob.video_id,
        thumbnail_file_id: activeJob.thumbnail_file_id,
      });
      setActiveJob({
        ...activeJob,
        thumbnail_applied: true,
        thumbnail_warning: '',
        message: 'Custom thumbnail applied successfully!',
      });
      onSuccess(`Custom thumbnail applied to ${activeJob.video_id}.`);
    } catch (err: any) {
      onError(err.message || 'Failed to apply custom thumbnail.');
    } finally {
      setIsRetryingThumb(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Google Drive & 4 YouTube Channel OAuth Connections */}
      <div className="bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-sky" />
              <span>YouTube Channels & Google Drive OAuth</span>
            </h2>
            <p className="text-xs text-brand-ice/65 mt-0.5">
              Connect Google Drive (<span className="mono-font">_videos terminados</span>) and each language Brand Account channel once.
            </p>
          </div>
          <button
            type="button"
            onClick={loadAuthStatus}
            disabled={isAuthLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-card hover:bg-brand-surface border border-brand-border text-xs font-semibold text-brand-ice rounded-xl cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAuthLoading ? 'animate-spin text-brand-sky' : ''}`} />
            <span>Refresh status</span>
          </button>
        </div>

        {authStatus && !authStatus.client_secret_configured && (
          <div className="flex items-start gap-2.5 text-xs text-amber-200 bg-amber-500/15 border border-amber-500/40 px-4 py-3 rounded-xl">
            <AlertCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Google Cloud OAuth credentials not found yet</p>
              <p className="text-amber-200/85 mt-0.5">
                Place your downloaded OAuth file at <span className="mono-font">{authStatus.client_secret_path}</span> (see{' '}
                <span className="mono-font">backend/credentials/README.md</span> for setup steps).
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {TARGET_LABELS.map((item) => {
            const st = authStatus?.targets?.[item.id];
            const connected = Boolean(st?.connected);
            const isConnecting = connectingTarget === item.id;

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-3 flex flex-col justify-between gap-2.5 ${
                  connected
                    ? 'bg-emerald-500/10 border-emerald-500/40'
                    : 'bg-brand-card/60 border-brand-border'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{item.badge}</span>
                      <span className="truncate">{item.label}</span>
                    </div>
                    <div className="text-[11px] text-brand-ice/75 truncate mt-0.5">
                      {connected ? st?.channel_title || 'Connected' : 'Not connected'}
                    </div>
                    {connected && item.id !== 'drive' && st?.has_playlist_scope === false && (
                      <div className="text-[10px] text-amber-300 font-semibold mt-0.5">
                        Reconnect for playlists
                      </div>
                    )}
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                      connected ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                </div>

                {connected ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnect(item.id)}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-brand-dark/70 hover:bg-rose-500/20 border border-brand-border hover:border-rose-400/50 text-[11px] font-semibold text-brand-ice/80 hover:text-rose-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Unlink className="w-3 h-3" />
                    <span>Disconnect</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnect(item.id)}
                    disabled={isConnecting}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-brand-card hover:bg-brand-wine/70 border border-brand-border hover:border-brand-sky text-[11px] font-bold text-brand-sky hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isConnecting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Link2 className="w-3 h-3" />
                    )}
                    <span>{isConnecting ? 'Authorizing...' : 'Connect'}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Empty Script State */}
      {!script ? (
        <div className="flex flex-col items-center justify-center p-14 text-center bg-brand-surface/70 border border-brand-border rounded-2xl shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-brand-card flex items-center justify-center mb-4 border border-brand-border">
            <Upload className="w-7 h-7 text-brand-sky" />
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">Select a Short ID to Upload</h3>
          <p className="text-sm text-brand-ice/65 max-w-md mt-1">
            Use the search bar above with a script ID (such as <span className="mono-font text-brand-sky font-semibold">EE01</span> or{' '}
            <span className="mono-font text-brand-sky font-semibold">SE08</span>) to load its Google Drive assets, Sheet title & description, and schedule its YouTube launch.
          </p>
        </div>
      ) : isPreflightLoading && !preflight ? (
        <div className="flex flex-col items-center justify-center p-14 bg-brand-surface border border-brand-border rounded-2xl">
          <Loader2 className="w-7 h-7 text-brand-sky animate-spin mb-2" />
          <p className="text-sm font-semibold text-white">Loading Google Drive assets and Sheet metadata for {script.ID}...</p>
        </div>
      ) : preflight ? (
        <div className="space-y-6">
          {/* Header Banner + Prior Upload Warning */}
          <div className="bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-brand-card text-brand-sky border border-brand-border mono-font">
                  {preflight.record.language.toUpperCase()} · {preflight.record.video_type.replace('_', ' ')}
                </span>
                {preflight.channel_status.connected && (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Target Channel: {preflight.channel_status.channel_title}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-white mt-1.5">
                Uploading <span className="text-brand-sky mono-font">{preflight.record.ID}</span> ·{' '}
                <span className="text-slate-200 font-medium">"{preflight.record.expression}"</span>
              </h2>
            </div>

            {preflight.drive_assets?.folder_url && (
              <a
                href={preflight.drive_assets.folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-brand-sky hover:text-white bg-brand-card border border-brand-border px-3 py-1.5 rounded-xl font-semibold"
              >
                <span>Open Drive Folder</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {preflight.prior_upload && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-violet-500/15 border border-violet-400/40 rounded-xl px-4 py-3 text-xs text-violet-200">
              <span>
                Already uploaded on {preflight.prior_upload.uploaded_at.slice(0, 10)} (Video ID:{' '}
                <strong className="mono-font">{preflight.prior_upload.video_id}</strong>
                {preflight.prior_upload.publish_at_bogota
                  ? ` · Scheduled ${preflight.prior_upload.publish_at_bogota}`
                  : ''}
                ).
              </span>
              <a
                href={preflight.prior_upload.studio_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-bold text-white underline"
              >
                <span>Open in YouTube Studio</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Preflight Checklist */}
          <div className="bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white">Preflight Checks</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className={`p-3 rounded-xl border ${channelConnected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'}`}>
                <div className="font-bold flex items-center gap-1.5">
                  {channelConnected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  <span>Target Channel</span>
                </div>
                <p className="mt-1 opacity-85 truncate">{channelConnected ? preflight.channel_status.channel_title : 'Connect channel above'}</p>
              </div>

              <div className={`p-3 rounded-xl border ${driveConnected && hasVideo ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'}`}>
                <div className="font-bold flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5" />
                  <span>Drive Video (.mp4)</span>
                </div>
                <p className="mt-1 opacity-85 truncate">
                  {!driveConnected
                    ? 'Connect Google Drive'
                    : hasVideo
                    ? `${preflight.drive_assets!.video!.name} (${formatBytes(preflight.drive_assets!.video!.size_bytes)})`
                    : preflight.drive_error || 'Video not found'}
                </p>
              </div>

              <div className={`p-3 rounded-xl border ${thumbnailReady && thumbnails.length > 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-amber-500/10 border-amber-500/30 text-amber-200'}`}>
                <div className="font-bold flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Thumbnail</span>
                </div>
                <p className="mt-1 opacity-85 truncate">
                  {thumbnails.length === 0
                    ? 'No thumbnail in Drive'
                    : thumbnails.length > 1 && !selectedThumbId
                    ? 'Select LatAm or Spain below'
                    : `${thumbnails.find((t) => t.file_id === selectedThumbId)?.name || 'Ready'}`}
                </p>
              </div>

              <div className={`p-3 rounded-xl border ${hasTitle ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'}`}>
                <div className="font-bold flex items-center justify-between gap-1">
                  <span>Title (Col J)</span>
                  {!hasTitle && (
                    <button type="button" onClick={() => onOpenTab('description_creation')} className="underline text-brand-sky cursor-pointer">
                      Edit
                    </button>
                  )}
                </div>
                <p className="mt-1 opacity-85 truncate">{hasTitle ? preflight.record.short_title : 'Missing Column J title'}</p>
              </div>

              <div className={`p-3 rounded-xl border ${hasDescription ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'}`}>
                <div className="font-bold flex items-center justify-between gap-1">
                  <span>Description (Col I)</span>
                  {!hasDescription && (
                    <button type="button" onClick={() => onOpenTab('description_creation')} className="underline text-brand-sky cursor-pointer">
                      Edit
                    </button>
                  )}
                </div>
                <p className="mt-1 opacity-85 truncate">{hasDescription ? `${preflight.record.short_description.length} chars ready` : 'Missing Column I description'}</p>
              </div>
            </div>

            {preflight.drive_error && (
              <div className="text-xs text-rose-200 bg-rose-500/15 border border-rose-500/40 rounded-xl px-4 py-2.5">
                {preflight.drive_error}
              </div>
            )}
          </div>

          {/* Thumbnail Selection + Details Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Thumbnail Selector */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-brand-sky" />
                  <span>
                    {thumbnails.length > 1
                      ? 'Choose Thumbnail Version (Required)'
                      : 'Thumbnail Preview'}
                  </span>
                </h3>
                {thumbnails.length > 1 && !selectedThumbId && (
                  <span className="text-xs font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 rounded-lg">
                    Choose option for {preflight.record.ID}
                  </span>
                )}
              </div>

              {thumbnails.length === 0 ? (
                <p className="text-xs text-brand-ice/60">No thumbnail images found in Drive folder.</p>
              ) : (
                <div className={`grid gap-4 ${thumbnails.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-xs'}`}>
                  {thumbnails.map((thumb) => {
                    const isSelected = selectedThumbId === thumb.file_id;
                    const variantLabel =
                      thumb.variant === 'latam'
                        ? 'LatAm Version'
                        : thumb.variant === 'spain'
                        ? 'Spain Version'
                        : 'Default Thumbnail';

                    return (
                      <button
                        key={thumb.file_id}
                        type="button"
                        onClick={() => setSelectedThumbId(thumb.file_id)}
                        aria-pressed={isSelected}
                        className={`text-left rounded-xl border-2 p-3 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-brand-sky bg-brand-sky/10 shadow-lg shadow-brand-sky/15'
                            : 'border-brand-border bg-brand-card/50 hover:border-brand-amethyst/60'
                        }`}
                      >
                        <div className="aspect-[9/16] max-h-56 w-full bg-brand-dark rounded-lg overflow-hidden mb-2.5 flex items-center justify-center border border-brand-border">
                          <img
                            src={thumb.preview_url}
                            alt={thumb.name}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-bold text-white">{variantLabel}</div>
                            <div className="text-[11px] text-brand-ice/60 truncate max-w-[160px] mono-font">{thumb.name}</div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-sky shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Metadata Preview + Visibility & Bogota Schedule */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-xl space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">YouTube Details (Read-Only from Sheets)</h3>
                  <button
                    type="button"
                    onClick={() => onOpenTab('description_creation')}
                    className="text-xs font-semibold text-brand-sky hover:underline cursor-pointer"
                  >
                    Edit in Title &amp; description
                  </button>
                </div>

                <div className="bg-brand-input border border-brand-border rounded-xl p-3">
                  <div className="text-[11px] uppercase tracking-wider text-brand-ice/50 font-bold">Title · Column J</div>
                  <div className="text-sm font-semibold text-white mt-1">
                    {preflight.record.short_title || <span className="text-rose-300">(Empty)</span>}
                  </div>
                </div>

                <div className="bg-brand-input border border-brand-border rounded-xl p-3">
                  <div className="text-[11px] uppercase tracking-wider text-brand-ice/50 font-bold">Description · Column I</div>
                  <div className="text-xs text-brand-ice/85 mt-1 whitespace-pre-wrap max-h-28 overflow-y-auto">
                    {preflight.record.short_description || <span className="text-rose-300">(Empty)</span>}
                  </div>
                </div>

                <div className="bg-brand-input border border-brand-border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="yt-playlist"
                      className="text-[11px] uppercase tracking-wider text-brand-ice/50 font-bold"
                    >
                      Playlist
                    </label>
                    {selectedPlaylistId && selectedPlaylistId === preflight.recommended_playlist_id && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Auto-matched
                      </span>
                    )}
                  </div>
                  <select
                    id="yt-playlist"
                    value={selectedPlaylistId}
                    onChange={(e) => setSelectedPlaylistId(e.target.value)}
                    disabled={!channelConnected}
                    className="w-full px-3 py-2 bg-brand-card border border-brand-border focus:border-brand-sky rounded-lg text-xs text-white"
                  >
                    <option value="">None (do not add to a playlist)</option>
                    {(preflight.playlists || []).map((pl) => (
                      <option key={pl.playlist_id} value={pl.playlist_id}>
                        {pl.title}
                      </option>
                    ))}
                  </select>
                  {preflight.playlists_error && (
                    <p className="text-[11px] text-amber-300">{preflight.playlists_error}</p>
                  )}
                </div>

                <p className="text-[11px] text-brand-ice/60">
                  Video elements: None · Checks: YouTube default copyright checks
                </p>
              </div>

              {/* Visibility & Schedule */}
              <div className="pt-4 border-t border-brand-border space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand-sky" />
                  <span>Visibility & Launch Schedule</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'scheduled', label: 'Schedule for Public' },
                    { id: 'public', label: 'Publish Now (Public)' },
                    { id: 'private', label: 'Private Draft' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setVisibilityMode(opt.id as 'scheduled' | 'public' | 'private')}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                        visibilityMode === opt.id
                          ? 'border-brand-sky bg-brand-sky/15 text-white'
                          : 'border-brand-border bg-brand-card/50 text-brand-ice/75 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {visibilityMode === 'scheduled' && (
                  <div className="space-y-3 bg-brand-card/50 border border-brand-border rounded-xl p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="yt-launch-date" className="block text-xs font-bold text-brand-ice mb-1">
                          Launch Date
                        </label>
                        <input
                          id="yt-launch-date"
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          className="w-full px-3 py-2 bg-brand-input border border-brand-border focus:border-brand-sky rounded-lg text-xs text-white mono-font"
                        />
                      </div>

                      <div>
                        <label htmlFor="yt-launch-hour" className="block text-xs font-bold text-brand-ice mb-1">
                          Launch Hour (America/Bogota · UTC-05:00)
                        </label>
                        <input
                          id="yt-launch-hour"
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          className="w-full px-3 py-2 bg-brand-input border border-brand-border focus:border-brand-sky rounded-lg text-xs text-white mono-font"
                        />
                      </div>
                    </div>

                    <p className="text-[11px] text-brand-ice/70">
                      Choose your launch hour in Bogota time (UTC-05:00) — suggested hours: <span className="mono-font text-brand-sky">12:00</span>,{' '}
                      <span className="mono-font text-brand-sky">18:00</span>, or <span className="mono-font text-brand-sky">19:00</span>.
                    </p>

                    {utcPreview && (
                      <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 mono-font">
                        Bogota: {scheduledDate} {scheduledTime} COT → YouTube API publishAt: {utcPreview} (privacyStatus: private → auto-public)
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleStartUpload}
                  disabled={!canUpload}
                  className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition-all ${
                    canUpload
                      ? 'bg-gradient-to-r from-brand-sky via-brand-amethyst to-brand-mulberry hover:opacity-95 text-white cursor-pointer'
                      : 'bg-brand-card/60 text-brand-ice/50 cursor-not-allowed border border-brand-border'
                  }`}
                >
                  {isUploadInProgress ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>
                        {visibilityMode === 'scheduled'
                          ? `Upload & Schedule ${preflight.record.ID} to YouTube`
                          : `Upload ${preflight.record.ID} to YouTube`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 3. Live Upload Progress & Result Card */}
          {activeJob && (
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  {activeJob.stage === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : activeJob.stage === 'failed' ? (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-brand-sky animate-spin" />
                  )}
                  <span>{activeJob.message}</span>
                </div>
                <span className="text-xs font-bold mono-font text-brand-sky">{activeJob.progress_pct}%</span>
              </div>

              <div className="w-full h-2.5 bg-brand-dark rounded-full overflow-hidden border border-brand-border">
                <div
                  className={`h-full transition-all duration-300 ${
                    activeJob.stage === 'failed' ? 'bg-rose-500' : 'bg-gradient-to-r from-brand-sky to-brand-amethyst'
                  }`}
                  style={{ width: `${activeJob.progress_pct}%` }}
                />
              </div>

              {activeJob.video_id && (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <span className="text-xs text-brand-ice/80 mono-font">Video ID: {activeJob.video_id}</span>
                  <a
                    href={activeJob.studio_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-card border border-brand-border hover:border-brand-sky text-xs font-bold text-brand-sky"
                  >
                    <span>Open in YouTube Studio</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {activeJob.playlist_added && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-xs font-semibold text-emerald-300">
                      Added to playlist: {activeJob.playlist_title || activeJob.playlist_id}
                    </span>
                  )}
                  {activeJob.playlist_warning && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-xs font-semibold text-amber-200">
                      {activeJob.playlist_warning}
                    </span>
                  )}
                  {!activeJob.thumbnail_applied && activeJob.thumbnail_file_id && activeJob.stage === 'completed' && (
                    <button
                      type="button"
                      onClick={handleRetryThumbnail}
                      disabled={isRetryingThumb}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-xs font-bold text-amber-200 cursor-pointer"
                    >
                      {isRetryingThumb ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      <span>Retry Thumbnail</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
