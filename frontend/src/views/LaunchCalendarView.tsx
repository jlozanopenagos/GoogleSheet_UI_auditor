import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  FileEdit,
  Loader2,
  RefreshCw,
  Trash2,
  Rocket,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import {
  ActiveTab,
  CalendarEntry,
  CalendarPreflightResult,
  CalendarScheduleResult,
  CalendarSummary,
} from '../types';
import {
  checkCalendarId,
  fetchCalendarEntries,
  scheduleCalendarId,
  unscheduleCalendarId,
} from '../services/api';

const LANGUAGES = [
  { id: 'all', label: 'All languages', flag: '🌐' },
  { id: 'english', label: 'English', flag: '🇬🇧' },
  { id: 'french', label: 'French', flag: '🇫🇷' },
  { id: 'spanish', label: 'Spanish', flag: '🇪🇸' },
  { id: 'italian', label: 'Italian', flag: '🇮🇹' },
] as const;

const LANG_FLAGS: Record<string, string> = {
  english: '🇬🇧',
  french: '🇫🇷',
  spanish: '🇪🇸',
  italian: '🇮🇹',
};

const TYPE_META: Record<
  string,
  { code: string; label: string; pillClass: string; badgeClass: string }
> = {
  fun_facts: {
    code: 'F',
    label: 'Fun Facts',
    pillClass: 'bg-violet-600/35 text-violet-100 border-violet-400/60 hover:bg-violet-600/50',
    badgeClass: 'bg-fuchsia-500/30 text-fuchsia-200 border-fuchsia-400/40',
  },
  expression: {
    code: 'E',
    label: 'Expression',
    pillClass: 'bg-violet-600/30 text-violet-100 border-violet-400/55 hover:bg-violet-600/45',
    badgeClass: 'bg-sky-500/25 text-sky-200 border-sky-400/40',
  },
  game: {
    code: 'G',
    label: 'Game',
    pillClass: 'bg-purple-600/30 text-purple-100 border-purple-400/55 hover:bg-purple-600/45',
    badgeClass: 'bg-amber-500/25 text-amber-200 border-amber-400/40',
  },
  roleplay: {
    code: 'R',
    label: 'Roleplay',
    pillClass: 'bg-indigo-600/35 text-indigo-100 border-indigo-400/55 hover:bg-indigo-600/50',
    badgeClass: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40',
  },
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatShortDateLabel(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
}

interface LaunchCalendarViewProps {
  initialScriptId?: string | null;
  onConsumeInitialId?: () => void;
  onOpenIdInTab: (id: string, tab: ActiveTab) => void;
  onCalendarChanged?: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export const LaunchCalendarView: React.FC<LaunchCalendarViewProps> = ({
  initialScriptId,
  onConsumeInitialId,
  onOpenIdInTab,
  onCalendarChanged,
  onError,
  onSuccess,
}) => {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');

  // Form / Scheduler state
  const [scriptIdInput, setScriptIdInput] = useState<string>('');
  const [selectedIsoDate, setSelectedIsoDate] = useState<string>(() => toIsoDate(new Date()));
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isScheduling, setIsScheduling] = useState<boolean>(false);
  const [preflight, setPreflight] = useState<(CalendarPreflightResult | CalendarScheduleResult) & { requires_override?: boolean; requires_readiness?: boolean } | null>(null);

  // Calendar entries state
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [summary, setSummary] = useState<CalendarSummary>({
    total: 0,
    by_language: {},
    by_video_type: {},
    active_day_language_slots: 0,
    fun_fact_days: 0,
    triad_complete_days: 0,
    triad_partial_days: 0,
  });
  const [isLoadingEntries, setIsLoadingEntries] = useState<boolean>(false);

  const activeMonthKey = useMemo(() => toMonthKey(viewDate), [viewDate]);

  const loadCalendar = async () => {
    setIsLoadingEntries(true);
    try {
      const monthParam = viewMode === 'month' ? activeMonthKey : undefined;
      const data = await fetchCalendarEntries(monthParam, selectedLanguage);
      setEntries(data.entries || []);
      setSummary(data.summary);
    } catch (err: any) {
      onError(err.message || 'Failed to load Launch Calendar.');
    } finally {
      setIsLoadingEntries(false);
    }
  };

  useEffect(() => {
    loadCalendar();
  }, [activeMonthKey, viewMode, selectedLanguage]);

  // Accept incoming ID routed from Bingo green/violet cards
  useEffect(() => {
    if (initialScriptId && initialScriptId.trim()) {
      const clean = initialScriptId.trim().toUpperCase();
      setScriptIdInput(clean);
      setPreflight(null);
      runCheck(clean, selectedIsoDate);
      onConsumeInitialId?.();
    }
  }, [initialScriptId]);

  const runCheck = async (rawId: string, targetDate: string) => {
    const clean = rawId.trim().toUpperCase();
    if (!clean) {
      onError('Enter a script ID (e.g. EF01, SE02, IG04) to check readiness.');
      return;
    }
    setIsChecking(true);
    try {
      const res = await checkCalendarId(clean, targetDate);
      setPreflight(res);
      setScriptIdInput(res.record.ID);
    } catch (err: any) {
      setPreflight(null);
      onError(err.message || `Could not verify ${clean}.`);
    } finally {
      setIsChecking(false);
    }
  };

  const runSchedule = async (opts?: {
    autoCheckColE?: boolean;
    forceOverride?: boolean;
    overrideDate?: string;
    overrideId?: string;
  }) => {
    const clean = (opts?.overrideId ?? scriptIdInput).trim().toUpperCase();
    const targetDate = opts?.overrideDate ?? selectedIsoDate;
    if (!clean) {
      onError('Enter a script ID (e.g. EF01, SE02) before scheduling.');
      return;
    }

    setIsScheduling(true);
    try {
      const resp = await scheduleCalendarId({
        script_id: clean,
        launch_date: targetDate,
        auto_check_script_ready: Boolean(opts?.autoCheckColE),
        force_override: Boolean(opts?.forceOverride),
        allow_move: true,
      });

      if (!resp.success) {
        if (resp.data) {
          setPreflight(resp.data);
        }
        onError(resp.message || `Could not schedule ${clean}.`);
        return;
      }

      onSuccess(resp.message || `Scheduled ${clean} on ${formatShortDateLabel(targetDate)}.`);
      setPreflight(null);
      setScriptIdInput('');
      await loadCalendar();
      onCalendarChanged?.();
    } catch (err: any) {
      onError(err.message || `Failed to schedule ${clean}.`);
    } finally {
      setIsScheduling(false);
    }
  };

  const handleUnschedule = async (entry: CalendarEntry) => {
    try {
      await unscheduleCalendarId(entry.id);
      onSuccess(`Removed ${entry.id} from ${entry.sheet_date}. Its Bingo card is back to Green.`);
      await loadCalendar();
      onCalendarChanged?.();
    } catch (err: any) {
      onError(err.message || `Failed to remove ${entry.id}.`);
    }
  };

  // Group entries by YYYY-MM-DD
  const entriesByDate = useMemo(() => {
    const map: Record<string, CalendarEntry[]> = {};
    for (const ent of entries) {
      if (!map[ent.launch_date]) map[ent.launch_date] = [];
      map[ent.launch_date].push(ent);
    }
    return map;
  }, [entries]);

  // Build calendar cells for Month or Week grid
  const calendarDays = useMemo(() => {
    if (viewMode === 'week') {
      const anchor = new Date(selectedIsoDate + 'T12:00:00');
      const dayOfWeek = (anchor.getDay() + 6) % 7; // Mon=0 .. Sun=6
      const monday = new Date(anchor);
      monday.setDate(anchor.getDate() - dayOfWeek);
      const out: { date: Date; iso: string; inCurrentMonth: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        out.push({ date: d, iso: toIsoDate(d), inCurrentMonth: true });
      }
      return out;
    }

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0 .. Sun=6
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const cells: { date: Date; iso: string; inCurrentMonth: boolean }[] = [];
    for (let idx = 0; idx < totalCells; idx++) {
      const d = new Date(year, month, 1 - startOffset + idx);
      cells.push({
        date: d,
        iso: toIsoDate(d),
        inCurrentMonth: d.getMonth() === month,
      });
    }
    return cells;
  }, [viewDate, viewMode, selectedIsoDate]);

  const monthTitle = useMemo(() => {
    if (viewMode === 'week' && calendarDays.length === 7) {
      const first = calendarDays[0].date;
      const last = calendarDays[6].date;
      return `Week of ${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [viewDate, viewMode, calendarDays]);

  const navigatePrev = () => {
    if (viewMode === 'week') {
      const d = new Date(selectedIsoDate + 'T12:00:00');
      d.setDate(d.getDate() - 7);
      setSelectedIsoDate(toIsoDate(d));
      setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    }
  };

  const navigateNext = () => {
    if (viewMode === 'week') {
      const d = new Date(selectedIsoDate + 'T12:00:00');
      d.setDate(d.getDate() + 7);
      setSelectedIsoDate(toIsoDate(d));
      setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    }
  };

  const navigateToday = () => {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedIsoDate(toIsoDate(now));
  };

  const todayIso = toIsoDate(today);

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {/* Scheduler & Readiness Verification Panel */}
      <div className="bg-brand-surface/90 border border-brand-border rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border/60 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-600/30 border border-violet-400/50 flex items-center justify-center text-violet-200 shadow-sm">
              <Rocket className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                YouTube Launch Calendar & Readiness Gate
              </h2>
              <p className="text-xs text-brand-ice/60">
                Log launched IDs after verifying <span className="text-emerald-300 font-semibold">Col D + Col E (script checked)</span> and{' '}
                <span className="text-emerald-300 font-semibold">Col I (SEO description)</span> · Cadence: 1 Fun Fact OR max 3 (E + G + R) per day per language
              </p>
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-violet-500/20 text-violet-200 border border-violet-400/40">
            Scheduled IDs turn Violet in Bingo
          </span>
        </div>

        {/* Input Controls */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSchedule();
          }}
          className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
        >
          <div className="md:col-span-4 flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-brand-ice/60">
              Script ID to Launch
            </label>
            <input
              type="text"
              value={scriptIdInput}
              onChange={(e) => setScriptIdInput(e.target.value.toUpperCase())}
              placeholder="e.g. EF01, EE12, SR05..."
              className="w-full px-3.5 py-2.5 bg-brand-input border border-brand-border focus:border-violet-400 rounded-xl text-sm font-bold text-white placeholder-brand-ice/30 focus:outline-none focus:ring-2 focus:ring-violet-500/30 mono-font uppercase"
            />
          </div>

          <div className="md:col-span-3 flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-brand-ice/60 flex items-center justify-between">
              <span>Launch Date</span>
              <span className="mono-font text-violet-300">{formatShortDateLabel(selectedIsoDate)}</span>
            </label>
            <input
              type="date"
              value={selectedIsoDate}
              onChange={(e) => {
                setSelectedIsoDate(e.target.value);
                if (scriptIdInput.trim()) {
                  runCheck(scriptIdInput, e.target.value);
                }
              }}
              className="w-full px-3.5 py-2.5 bg-brand-input border border-brand-border focus:border-violet-400 rounded-xl text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 mono-font"
            />
          </div>

          <div className="md:col-span-5 flex flex-wrap sm:flex-nowrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => runCheck(scriptIdInput, selectedIsoDate)}
              disabled={isChecking || isScheduling || !scriptIdInput.trim()}
              className="flex-1 py-2.5 px-4 bg-brand-card hover:bg-brand-dark border border-brand-border hover:border-brand-sky disabled:opacity-40 rounded-xl text-xs font-bold text-brand-ice flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              {isChecking ? <Loader2 className="w-4 h-4 animate-spin text-brand-sky" /> : <ShieldCheck className="w-4 h-4 text-brand-sky" />}
              <span>Check ID</span>
            </button>

            <button
              type="submit"
              disabled={isScheduling || isChecking || !scriptIdInput.trim()}
              className="flex-1 py-2.5 px-4 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 hover:opacity-95 disabled:opacity-40 rounded-xl text-xs font-bold text-white shadow-lg shadow-violet-600/25 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              {isScheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>Add to Calendar</span>
            </button>
          </div>
        </form>

        {/* Live Readiness & Daily Cadence Diagnostic Panel */}
        {preflight && (
          <div className="mt-1 bg-brand-card/90 border border-brand-border rounded-2xl p-4 flex flex-col gap-3 animate-slideDown">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-extrabold mono-font bg-violet-500/25 text-violet-200 border border-violet-400/40">
                  {preflight.record.ID}
                </span>
                <span className="text-xs font-bold text-white">
                  {LANG_FLAGS[preflight.record.language] || ''} {preflight.record.language} ·{' '}
                  {preflight.record.video_type.replace('_', ' ')}
                </span>
                {preflight.record.expression && (
                  <span className="text-xs text-brand-ice/70 truncate max-w-md">
                    "{preflight.record.expression}"
                  </span>
                )}
              </div>

              <span className="text-xs mono-font text-violet-300 font-semibold">
                Target: {preflight.sheet_date || formatShortDateLabel(selectedIsoDate)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Check 1: Column D */}
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  preflight.readiness.has_script_changed
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  {preflight.readiness.has_script_changed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>Col D Script Revision</span>
                </div>
                {!preflight.readiness.has_script_changed && (
                  <button
                    type="button"
                    onClick={() => onOpenIdInTab(preflight.record.ID, 'script_auditor')}
                    className="px-2 py-1 bg-rose-500/30 hover:bg-rose-500/50 rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1"
                  >
                    <FileEdit className="w-3 h-3" />
                    Fix
                  </button>
                )}
              </div>

              {/* Check 2: Column E */}
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  preflight.readiness.script_ready
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  {preflight.readiness.script_ready ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span>Col E Script Checked</span>
                </div>
                {!preflight.readiness.script_ready && !preflight.readiness.can_auto_check_col_e && (
                  <button
                    type="button"
                    onClick={() => onOpenIdInTab(preflight.record.ID, 'script_auditor')}
                    className="px-2 py-1 bg-amber-500/30 hover:bg-amber-500/50 rounded-lg text-[10px] font-bold cursor-pointer"
                  >
                    Check
                  </button>
                )}
              </div>

              {/* Check 3: Column I */}
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  preflight.readiness.has_short_description
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  {preflight.readiness.has_short_description ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>Col I SEO Description</span>
                </div>
                {!preflight.readiness.has_short_description && (
                  <button
                    type="button"
                    onClick={() => onOpenIdInTab(preflight.record.ID, 'description_creation')}
                    className="px-2 py-1 bg-rose-500/30 hover:bg-rose-500/50 rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    Create
                  </button>
                )}
              </div>

              {/* Check 4: Per-language daily cadence */}
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-center gap-1.5 font-semibold ${
                  preflight.cadence.cadence_ok
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                }`}
              >
                {preflight.cadence.cadence_ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span>
                  {preflight.cadence.cadence_ok
                    ? `Cadence OK (${preflight.record.language})`
                    : 'Daily Cadence Warning'}
                </span>
              </div>
            </div>

            {/* Actionable Resolution Shortcuts */}
            {(preflight.cadence.warnings.length > 0 ||
              preflight.cadence.move_note ||
              preflight.readiness.can_auto_check_col_e) && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-brand-border/60">
                <div className="flex flex-col gap-1 text-xs">
                  {preflight.cadence.move_note && (
                    <span className="text-violet-200 font-semibold">{preflight.cadence.move_note}</span>
                  )}
                  {preflight.cadence.warnings.map((w, i) => (
                    <span key={i} className="text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {w}
                    </span>
                  ))}
                  {preflight.readiness.can_auto_check_col_e && (
                    <span className="text-amber-200">
                      Column D script and Column I description are both ready — only Column E (`script_ready`) is unchecked.
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {preflight.readiness.can_auto_check_col_e && (
                    <button
                      type="button"
                      disabled={isScheduling}
                      onClick={() => runSchedule({ autoCheckColE: true })}
                      className="px-3.5 py-2 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Check Column E & Add to Calendar</span>
                    </button>
                  )}

                  {!preflight.cadence.cadence_ok &&
                    (preflight.readiness.readiness_ok || preflight.readiness.can_auto_check_col_e) && (
                      <button
                        type="button"
                        disabled={isScheduling}
                        onClick={() =>
                          runSchedule({
                            autoCheckColE: preflight.readiness.can_auto_check_col_e,
                            forceOverride: true,
                          })
                        }
                        className="px-3.5 py-2 bg-amber-500/80 hover:bg-amber-400 text-black rounded-xl text-xs font-bold shadow cursor-pointer flex items-center gap-1.5"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Force schedule anyway</span>
                      </button>
                    )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters, Month/Week Navigation & KPI Summary */}
      <div className="bg-brand-surface/80 border border-brand-border rounded-2xl p-5 shadow-lg flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Language Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-ice/60 mr-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-violet-400" />
              Language:
            </span>
            <div className="flex flex-wrap items-center gap-1.5 bg-brand-dark/80 p-1 rounded-xl border border-brand-border">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setSelectedLanguage(lang.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    selectedLanguage === lang.id
                      ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-brand-surface'
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Month / Week Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-brand-dark/80 p-1 rounded-xl border border-brand-border">
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  viewMode === 'month' ? 'bg-brand-card text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  viewMode === 'week' ? 'bg-brand-card text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Week
              </button>
            </div>

            <div className="flex items-center gap-1 bg-brand-dark/80 p-1 rounded-xl border border-brand-border">
              <button
                type="button"
                onClick={navigatePrev}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-brand-surface cursor-pointer"
                title="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={navigateToday}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-violet-300 hover:bg-brand-surface cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={navigateNext}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-brand-surface cursor-pointer"
                title="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <span className="text-sm font-extrabold text-white px-2">{monthTitle}</span>

            <button
              type="button"
              onClick={loadCalendar}
              disabled={isLoadingEntries}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-card hover:bg-brand-surface border border-brand-border text-xs font-semibold text-brand-ice rounded-xl cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEntries ? 'animate-spin text-violet-400' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-brand-border/50">
          <div className="bg-brand-dark/60 border border-violet-500/30 rounded-xl p-3">
            <div className="text-[11px] uppercase tracking-wider text-violet-300 font-bold">
              Launched ({viewMode === 'month' ? 'Month' : 'Total'})
            </div>
            <div className="text-2xl font-extrabold text-white mono-font mt-0.5">{summary.total}</div>
            <div className="text-[10px] text-brand-ice/50">Violet in Bingo Checklist</div>
          </div>

          <div className="bg-brand-dark/60 border border-brand-border rounded-xl p-3">
            <div className="text-[11px] uppercase tracking-wider text-fuchsia-300 font-bold">
              Fun Fact Days
            </div>
            <div className="text-2xl font-extrabold text-fuchsia-200 mono-font mt-0.5">
              {summary.fun_fact_days}
            </div>
            <div className="text-[10px] text-brand-ice/50">1 Fun Fact / day / lang</div>
          </div>

          <div className="bg-brand-dark/60 border border-brand-border rounded-xl p-3">
            <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-bold">
              Full 3-Short Triads
            </div>
            <div className="text-2xl font-extrabold text-emerald-200 mono-font mt-0.5">
              {summary.triad_complete_days}
            </div>
            <div className="text-[10px] text-brand-ice/50">1 Expr + 1 Game + 1 Role</div>
          </div>

          <div className="bg-brand-dark/60 border border-brand-border rounded-xl p-3">
            <div className="text-[11px] uppercase tracking-wider text-sky-300 font-bold">
              Partial Triad Days
            </div>
            <div className="text-2xl font-extrabold text-sky-200 mono-font mt-0.5">
              {summary.triad_partial_days}
            </div>
            <div className="text-[10px] text-brand-ice/50">Remaining E/G/R slots open</div>
          </div>
        </div>
      </div>

      {/* Dynamic Monthly / Weekly Calendar Grid */}
      <div className="bg-brand-surface/60 border border-brand-border rounded-2xl p-4 sm:p-5 shadow-xl">
        {/* Weekday Column Headers */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-center text-[11px] font-bold uppercase tracking-wider text-brand-ice/50 py-1"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day Cells */}
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {calendarDays.map(({ date, iso, inCurrentMonth }) => {
            const dayItems = entriesByDate[iso] || [];
            const isToday = iso === todayIso;
            const isSelectedDay = iso === selectedIsoDate;

            // Group per language for clean slot badges (e.g. EN 3/3 E·G·R or ES 1/1 F)
            const langSummaries = Object.entries(
              dayItems.reduce<Record<string, Set<string>>>((acc, item) => {
                if (!acc[item.language]) acc[item.language] = new Set();
                acc[item.language].add(item.video_type);
                return acc;
              }, {})
            );

            return (
              <div
                key={iso}
                onClick={() => setSelectedIsoDate(iso)}
                className={`min-h-[128px] rounded-xl p-2 border transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                  !inCurrentMonth
                    ? 'bg-brand-dark/30 border-brand-border/30 opacity-45'
                    : isSelectedDay
                    ? 'bg-brand-card border-violet-400/80 ring-1 ring-violet-400/40 shadow-lg shadow-violet-500/10'
                    : 'bg-brand-card/75 border-brand-border hover:border-brand-sky/50'
                }`}
              >
                {/* Day Header */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold mono-font px-1.5 py-0.5 rounded-md ${
                      isToday
                        ? 'bg-violet-600 text-white shadow-sm'
                        : isSelectedDay
                        ? 'text-violet-300'
                        : 'text-slate-300'
                    }`}
                  >
                    {date.getDate()}
                  </span>

                  <button
                    type="button"
                    title={`Select ${formatShortDateLabel(iso)} to schedule`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIsoDate(iso);
                    }}
                    className="p-1 rounded-md text-brand-ice/40 hover:text-violet-200 hover:bg-violet-500/20 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Scheduled ID Pills */}
                <div className="flex-1 flex flex-col gap-1">
                  {dayItems.map((item) => {
                    const tmeta = TYPE_META[item.video_type] || {
                      code: '?',
                      label: item.video_type,
                      pillClass: 'bg-violet-600/30 text-violet-100 border-violet-400/50',
                      badgeClass: 'bg-slate-600/30 text-slate-200 border-slate-400/40',
                    };
                    return (
                      <div
                        key={item.id}
                        title={`${item.id}: ${item.expression || 'No title'}\n${item.language} · ${tmeta.label}\nLaunched ${item.sheet_date}\nClick ID to open in Script Auditor`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenIdInTab(item.id, 'script_auditor');
                        }}
                        className={`group flex items-center justify-between gap-1 px-1.5 py-1 rounded-lg border text-[11px] font-bold transition-all ${tmeta.pillClass}`}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-[10px]">{LANG_FLAGS[item.language] || ''}</span>
                          <span className="mono-font truncate">{item.id}</span>
                          <span className={`px-1 rounded text-[9px] border ${tmeta.badgeClass}`}>
                            {tmeta.code}
                          </span>
                        </div>

                        <button
                          type="button"
                          title={`Unschedule ${item.id} (reverts Bingo card to Green)`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnschedule(item);
                          }}
                          className="opacity-60 group-hover:opacity-100 hover:text-rose-300 p-0.5 rounded transition-opacity cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Day Per-Language Slot Footer */}
                {langSummaries.length > 0 && (
                  <div className="pt-1 border-t border-brand-border/40 flex flex-wrap gap-1">
                    {langSummaries.map(([lang, typesSet]) => {
                      const hasF = typesSet.has('fun_facts');
                      const triadCodes = ['expression', 'game', 'roleplay']
                        .filter((t) => typesSet.has(t))
                        .map((t) => TYPE_META[t].code);
                      return (
                        <span
                          key={lang}
                          className="text-[9px] mono-font px-1.5 py-0.5 rounded bg-brand-dark/80 text-violet-200/80 border border-violet-500/25"
                        >
                          {LANG_FLAGS[lang]}{' '}
                          {hasF ? `1/1 F${triadCodes.length ? `+${triadCodes.join('·')}` : ''}` : `${triadCodes.length}/3 ${triadCodes.join('·')}`}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
