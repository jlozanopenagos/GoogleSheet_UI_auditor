import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  X,
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
  syncCalendarFromSheets,
  unscheduleCalendarId,
} from '../services/api';

const LANGUAGE_ORDER = ['english', 'french', 'spanish', 'italian'] as const;
const TYPE_ORDER = ['fun_facts', 'expression', 'game', 'roleplay'] as const;

const LANG_META: Record<
  string,
  {
    code: string;
    label: string;
    flag: string;
    rowClass: string;
    codeClass: string;
    dotClass: string;
    filterActiveClass: string;
  }
> = {
  english: {
    code: 'EN',
    label: 'English',
    flag: '🇬🇧',
    rowClass: 'bg-blue-500/10 border-l-[3px] border-l-blue-400 border-y border-r border-blue-500/20',
    codeClass: 'text-blue-300',
    dotClass: 'bg-blue-400',
    filterActiveClass: 'bg-blue-600/80 text-white border border-blue-400/60 shadow-sm',
  },
  french: {
    code: 'FR',
    label: 'French',
    flag: '🇫🇷',
    rowClass: 'bg-violet-500/10 border-l-[3px] border-l-violet-400 border-y border-r border-violet-500/20',
    codeClass: 'text-violet-300',
    dotClass: 'bg-violet-400',
    filterActiveClass: 'bg-violet-600/80 text-white border border-violet-400/60 shadow-sm',
  },
  spanish: {
    code: 'ES',
    label: 'Spanish',
    flag: '🇪🇸',
    rowClass: 'bg-amber-500/10 border-l-[3px] border-l-amber-400 border-y border-r border-amber-500/20',
    codeClass: 'text-amber-300',
    dotClass: 'bg-amber-400',
    filterActiveClass: 'bg-amber-600/80 text-white border border-amber-400/60 shadow-sm',
  },
  italian: {
    code: 'IT',
    label: 'Italian',
    flag: '🇮🇹',
    rowClass: 'bg-emerald-500/10 border-l-[3px] border-l-emerald-400 border-y border-r border-emerald-500/20',
    codeClass: 'text-emerald-300',
    dotClass: 'bg-emerald-400',
    filterActiveClass: 'bg-emerald-600/80 text-white border border-emerald-400/60 shadow-sm',
  },
};

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
  { code: string; label: string; badgeClass: string; dotClass: string }
> = {
  fun_facts: {
    code: 'F',
    label: 'Fun Facts',
    badgeClass: 'bg-fuchsia-500/25 text-fuchsia-300 border-fuchsia-400/60',
    dotClass: 'bg-fuchsia-400',
  },
  expression: {
    code: 'E',
    label: 'Expression',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-400/50',
    dotClass: 'bg-sky-400',
  },
  game: {
    code: 'G',
    label: 'Game',
    badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/50',
    dotClass: 'bg-yellow-400',
  },
  roleplay: {
    code: 'R',
    label: 'Roleplay',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/50',
    dotClass: 'bg-rose-400',
  },
};

function groupDayEntriesByLanguage(dayItems: CalendarEntry[]) {
  const byLang: Record<string, CalendarEntry[]> = {};
  for (const item of dayItems) {
    const langKey = (item.language || '').toLowerCase();
    if (!byLang[langKey]) byLang[langKey] = [];
    byLang[langKey].push(item);
  }

  const orderedLangs = [
    ...LANGUAGE_ORDER.filter((l) => byLang[l]?.length),
    ...Object.keys(byLang).filter((l) => !(LANGUAGE_ORDER as readonly string[]).includes(l)),
  ];

  return orderedLangs.map((lang) => {
    const sortedItems = [...byLang[lang]].sort((a, b) => {
      const idxA = (TYPE_ORDER as readonly string[]).indexOf(a.video_type);
      const idxB = (TYPE_ORDER as readonly string[]).indexOf(b.video_type);
      const rankA = idxA === -1 ? 99 : idxA;
      const rankB = idxB === -1 ? 99 : idxB;
      return rankA !== rankB ? rankA - rankB : a.id.localeCompare(b.id);
    });
    return {
      lang,
      meta: LANG_META[lang] || {
        code: lang.slice(0, 2).toUpperCase(),
        label: lang,
        flag: '🌐',
        rowClass: 'bg-slate-500/10 border-l-[3px] border-l-slate-400 border-y border-r border-slate-500/20',
        codeClass: 'text-slate-300',
        dotClass: 'bg-slate-400',
        filterActiveClass: 'bg-slate-600 text-white',
      },
      items: sortedItems,
    };
  });
}

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

function formatFullDateHeading(isoDate: string): string {
  const dt = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return `${dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} · ${formatShortDateLabel(isoDate)}`;
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
  const scriptIdInputRef = useRef<HTMLInputElement>(null);
  const [scriptIdInput, setScriptIdInput] = useState<string>('');
  const [selectedIsoDate, setSelectedIsoDate] = useState<string>(() => toIsoDate(new Date()));
  const [inspectedIsoDate, setInspectedIsoDate] = useState<string | null>(null);
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
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);

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

  const handleSyncFromSheets = async () => {
    setIsSyncingSheets(true);
    try {
      const monthParam = viewMode === 'month' ? activeMonthKey : undefined;
      const data = await syncCalendarFromSheets(monthParam, selectedLanguage);
      setEntries(data.entries || []);
      setSummary(data.summary);
      onCalendarChanged?.();
      if (data.errors && data.errors.length > 0) {
        onError(`Synced ${data.synced_added} new entry(s), with ${data.errors.length} tab warning(s).`);
      } else {
        onSuccess(`Synced from Google Sheets: ${data.synced_added} new entry(s) imported.`);
      }
    } catch (err: any) {
      onError(err.message || 'Failed to sync Launch Calendar from Google Sheets.');
    } finally {
      setIsSyncingSheets(false);
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

  const inspectedDayItems = useMemo(
    () => (inspectedIsoDate ? entriesByDate[inspectedIsoDate] || [] : []),
    [entriesByDate, inspectedIsoDate]
  );

  const inspectedDayGroups = useMemo(
    () => groupDayEntriesByLanguage(inspectedDayItems),
    [inspectedDayItems]
  );

  useEffect(() => {
    if (!inspectedIsoDate) return;
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setInspectedIsoDate(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectedIsoDate]);

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
              ref={scriptIdInputRef}
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
              {LANGUAGES.map((lang) => {
                const lmeta = lang.id !== 'all' ? LANG_META[lang.id] : null;
                const activeClass = lmeta
                  ? lmeta.filterActiveClass
                  : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm';
                return (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => setSelectedLanguage(lang.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      selectedLanguage === lang.id
                        ? activeClass
                        : 'text-slate-300 hover:text-white hover:bg-brand-surface'
                    }`}
                  >
                    {lmeta && <span className={`w-2 h-2 rounded-full ${lmeta.dotClass}`} />}
                    <span>{lang.flag}</span>
                    <span>{lang.label}</span>
                  </button>
                );
              })}
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
              onClick={handleSyncFromSheets}
              disabled={isSyncingSheets || isLoadingEntries}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-400/50 text-xs font-semibold text-violet-100 rounded-xl cursor-pointer disabled:opacity-50"
              title="Pull scheduled IDs from all 16 Google Sheet tabs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-spin text-violet-300' : ''}`} />
              <span>{isSyncingSheets ? 'Syncing...' : 'Sync from Sheets'}</span>
            </button>

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
      <div className="bg-brand-surface/60 border border-brand-border rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col gap-3">
        {/* Orthogonal Language & Format Color Legend Bar */}
        <div
          aria-label="Calendar Color Legend"
          className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-xl bg-brand-dark/70 border border-brand-border/60 text-[11px]"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold uppercase tracking-wider text-brand-ice/50 text-[10px]">Languages:</span>
            {LANGUAGE_ORDER.map((lang) => {
              const lmeta = LANG_META[lang];
              return (
                <span key={lang} className="inline-flex items-center gap-1.5 font-semibold text-slate-200">
                  <span className={`w-2 h-2 rounded-full ${lmeta.dotClass}`} />
                  <span className={`mono-font font-bold ${lmeta.codeClass}`}>{lmeta.code}</span>
                  <span className="text-brand-ice/60 hidden sm:inline">{lmeta.label}</span>
                </span>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-bold uppercase tracking-wider text-brand-ice/50 text-[10px]">Types:</span>
            {(['expression', 'game', 'roleplay', 'fun_facts'] as const).map((vt) => {
              const tmeta = TYPE_META[vt];
              return (
                <span key={vt} className="inline-flex items-center gap-1 text-slate-200 font-semibold">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border mono-font ${tmeta.badgeClass}`}>
                    {tmeta.code}
                  </span>
                  <span className="text-brand-ice/70">{tmeta.label}</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Weekday Column Headers */}
        <div className="grid grid-cols-7 gap-2">
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
            const langGroups = groupDayEntriesByLanguage(dayItems);
            const isCompactMonth = viewMode === 'month';

            return (
              <div
                key={iso}
                data-testid={`calendar-day-${iso}`}
                onClick={() => {
                  setSelectedIsoDate(iso);
                  setInspectedIsoDate(iso);
                }}
                className={`group/day ${isCompactMonth ? 'h-[144px] overflow-hidden' : 'min-h-[160px]'} rounded-xl p-2 border transition-all flex flex-col gap-1.5 cursor-pointer ${
                  !inCurrentMonth
                    ? 'bg-brand-dark/30 border-brand-border/30 opacity-45'
                    : isSelectedDay
                    ? 'bg-brand-card border-brand-sky/80 ring-1 ring-brand-sky/40 shadow-lg shadow-sky-500/10'
                    : 'bg-brand-card/75 border-brand-border hover:border-brand-sky/50'
                }`}
              >
                {/* Compact Day Header: Day # + Total Count + Quick Schedule Focus */}
                <div className="flex items-center justify-between gap-1 shrink-0">
                  <span
                    className={`text-xs font-bold mono-font px-1.5 py-0.5 rounded-md leading-none ${
                      isToday
                        ? 'bg-violet-600 text-white shadow-sm'
                        : isSelectedDay
                        ? 'text-brand-sky'
                        : 'text-slate-300'
                    }`}
                  >
                    {date.getDate()}
                  </span>

                  <div className="flex items-center gap-1">
                    {dayItems.length > 0 && (
                      <span
                        title={`${dayItems.length} scheduled short(s) — click day to inspect`}
                        className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold mono-font bg-brand-dark/80 text-brand-ice/80 border border-brand-border/70 leading-none"
                      >
                        {dayItems.length}
                      </span>
                    )}
                    <button
                      type="button"
                      title={`Select ${formatShortDateLabel(iso)} to schedule`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIsoDate(iso);
                        scriptIdInputRef.current?.focus();
                      }}
                      className="p-0.5 rounded-md text-brand-ice/35 opacity-70 group-hover/day:opacity-100 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Day Body: Ultra-compact single-line micro-rows in Month, full chips in Week */}
                {isCompactMonth ? (
                  <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                    {langGroups.map(({ lang, meta: lmeta, items }) => (
                      <div
                        key={lang}
                        data-testid={`day-${iso}-lang-${lmeta.code}`}
                        title={`${lmeta.label}: ${items
                          .map((it) => `${it.id} (${TYPE_META[it.video_type]?.label || it.video_type})`)
                          .join(', ')}`}
                        className={`rounded-md px-1.5 py-0.5 flex items-center justify-between gap-1 shrink-0 ${lmeta.rowClass}`}
                      >
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-extrabold mono-font leading-none shrink-0 ${lmeta.codeClass}`}
                        >
                          <span className="text-[9px]">{lmeta.flag}</span>
                          <span>{lmeta.code}</span>
                        </span>

                        <div className="flex items-center gap-0.5 shrink-0">
                          {items.map((item) => {
                            const tmeta = TYPE_META[item.video_type] || {
                              code: '?',
                              label: item.video_type,
                              badgeClass: 'bg-slate-600/30 text-slate-200 border-slate-400/40',
                              dotClass: 'bg-slate-400',
                            };
                            return (
                              <span
                                key={item.id}
                                title={`${item.id}: ${item.expression || 'No title'}`}
                                className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-extrabold border mono-font leading-none ${tmeta.badgeClass}`}
                              >
                                {tmeta.code}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-1">
                    {langGroups.map(({ lang, meta: lmeta, items }) => (
                      <div
                        key={lang}
                        data-testid={`day-${iso}-lang-${lmeta.code}`}
                        className={`rounded-lg px-1.5 py-1 flex flex-col gap-1 ${lmeta.rowClass}`}
                      >
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-extrabold mono-font leading-none ${lmeta.codeClass}`}
                        >
                          <span>{lmeta.flag}</span>
                          <span>{lmeta.code}</span>
                        </span>

                        <div className="flex flex-wrap items-center gap-1">
                          {items.map((item) => {
                            const tmeta = TYPE_META[item.video_type] || {
                              code: '?',
                              label: item.video_type,
                              badgeClass: 'bg-slate-600/30 text-slate-200 border-slate-400/40',
                              dotClass: 'bg-slate-400',
                            };
                            return (
                              <div
                                key={item.id}
                                title={`${item.id}: ${item.expression || 'No title'}\n${lmeta.label} · ${tmeta.label}\nClick chip to open in Script Auditor`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenIdInTab(item.id, 'script_auditor');
                                }}
                                className="group/chip inline-flex items-center gap-1 px-1 py-0.5 rounded-md bg-brand-dark/85 border border-white/10 hover:border-white/30 text-[10px] font-bold text-slate-100 transition-colors cursor-pointer"
                              >
                                <span
                                  className={`px-1 rounded text-[9px] font-extrabold border leading-tight ${tmeta.badgeClass}`}
                                >
                                  {tmeta.code}
                                </span>
                                <span className="mono-font tracking-tight">{item.id}</span>
                                <button
                                  type="button"
                                  aria-label={`Unschedule ${item.id}`}
                                  title={`Unschedule ${item.id} (reverts Bingo card to Green)`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnschedule(item);
                                  }}
                                  className="opacity-0 group-hover/chip:opacity-100 focus:opacity-100 hover:text-rose-300 text-slate-400 transition-opacity cursor-pointer"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Centered Click-to-Inspect Day Detail Pop-up Modal */}
      {inspectedIsoDate && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setInspectedIsoDate(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Day details for ${formatShortDateLabel(inspectedIsoDate)}`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-2xl flex flex-col gap-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border/60 pb-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-base font-extrabold text-white">
                  {formatFullDateHeading(inspectedIsoDate)}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold mono-font bg-brand-card text-brand-sky border border-brand-border">
                  {inspectedDayItems.length} scheduled
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIsoDate(inspectedIsoDate);
                    setInspectedIsoDate(null);
                    setTimeout(() => scriptIdInputRef.current?.focus(), 0);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-95 text-white text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Schedule ID on this day</span>
                </button>
                <button
                  type="button"
                  aria-label="Close day details"
                  onClick={() => setInspectedIsoDate(null)}
                  className="p-1.5 rounded-xl bg-brand-card hover:bg-brand-dark border border-brand-border text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {inspectedDayGroups.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center gap-2">
                <p className="text-sm font-semibold text-brand-ice/70">
                  No videos scheduled for this day yet.
                </p>
                <p className="text-xs text-brand-ice/45">
                  Click "Schedule ID on this day" above to add a script to this date.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {inspectedDayGroups.map(({ lang, meta: lmeta, items }) => (
                  <div key={lang} className={`rounded-xl p-3 flex flex-col gap-2 ${lmeta.rowClass}`}>
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-extrabold mono-font ${lmeta.codeClass}`}
                      >
                        <span>{lmeta.flag}</span>
                        <span>
                          {lmeta.label} ({items.length})
                        </span>
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {items.map((item) => {
                        const tmeta = TYPE_META[item.video_type] || {
                          code: '?',
                          label: item.video_type,
                          badgeClass: 'bg-slate-600/30 text-slate-200 border-slate-400/40',
                          dotClass: 'bg-slate-400',
                        };
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-brand-dark/85 border border-white/10"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border mono-font shrink-0 ${tmeta.badgeClass}`}
                              >
                                {tmeta.code}
                              </span>
                              <span className="text-xs font-extrabold mono-font text-white shrink-0">
                                {item.id}
                              </span>
                              <span className="text-xs text-brand-ice/75 truncate">
                                {item.expression || 'Untitled script'}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectedIsoDate(null);
                                  onOpenIdInTab(item.id, 'script_auditor');
                                }}
                                className="px-2 py-1 rounded-lg bg-brand-surface hover:bg-brand-card border border-brand-border text-[11px] font-semibold text-brand-sky cursor-pointer"
                              >
                                Open
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove ${item.id} from calendar`}
                                title={`Unschedule ${item.id} (reverts Bingo card to Green)`}
                                onClick={() => handleUnschedule(item)}
                                className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
