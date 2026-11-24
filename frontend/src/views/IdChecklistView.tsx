import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Filter,
  ExternalLink,
  Layers,
  Sparkles,
  FileEdit,
  AlertCircle,
  Calendar,
  Rocket,
} from 'lucide-react';
import { MatrixItem, MatrixCategoryData, ActiveTab } from '../types';
import { fetchMatrixCategory } from '../services/api';

const LANGUAGES = [
  { id: 'english', label: 'English', flag: '🇬🇧' },
  { id: 'french', label: 'French', flag: '🇫🇷' },
  { id: 'spanish', label: 'Spanish', flag: '🇪🇸' },
  { id: 'italian', label: 'Italian', flag: '🇮🇹' },
] as const;

const VIDEO_TYPES = [
  { id: 'expression', label: 'Expression', code: 'E' },
  { id: 'game', label: 'Game', code: 'G' },
  { id: 'roleplay', label: 'Roleplay', code: 'R' },
  { id: 'fun_facts', label: 'Fun Facts', code: 'F' },
] as const;

interface IdChecklistViewProps {
  onSelectId: (id: string, targetTab?: ActiveTab) => void;
  onScheduleInCalendar?: (id: string) => void;
  calendarVersion?: number;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export const IdChecklistView: React.FC<IdChecklistViewProps> = ({
  onSelectId,
  onScheduleInCalendar,
  calendarVersion = 0,
  onError,
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>('english');
  const [selectedType, setSelectedType] = useState<string>('expression');

  // Matrix state & memory cache
  const [items, setItems] = useState<MatrixItem[]>([]);
  const [sheetUrl, setSheetUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [cache, setCache] = useState<Record<string, MatrixCategoryData>>({});

  // Active / Selected tile for quick inspection popover
  const [activeTileId, setActiveTileId] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'violet' | 'green' | 'yellow' | 'grey'>('all');

  // Fetch or load from cache
  const loadCategory = async (lang: string, vtype: string, forceRefresh = false) => {
    const key = `${lang}_${vtype}`;
    if (!forceRefresh && cache[key]) {
      setItems(cache[key].items);
      setSheetUrl(cache[key].sheet_url || '');
      setActiveTileId(null);
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchMatrixCategory(lang, vtype);
      setItems(data.items);
      setSheetUrl(data.sheet_url || '');
      setCache((prev) => ({ ...prev, [key]: data }));
      setActiveTileId(null);
    } catch (err: any) {
      onError(err.message || `Failed to load ${lang} ${vtype} matrix.`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCategory(selectedLanguage, selectedType);
  }, [selectedLanguage, selectedType]);

  // Invalidate cache and refresh active category whenever Launch Calendar changes
  useEffect(() => {
    if (calendarVersion > 0) {
      setCache({});
      loadCategory(selectedLanguage, selectedType, true);
    }
  }, [calendarVersion]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Status filter
      if (filterStatus === 'violet' && item.status !== 'violet') return false;
      if (filterStatus === 'green' && item.status !== 'green') return false;
      if (filterStatus === 'yellow' && item.status !== 'yellow') return false;
      if (filterStatus === 'grey' && item.status !== 'grey') return false;

      // Search query filter (matches ID e.g. "01" or "EE01" or expression name)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toUpperCase();
        const matchesId = item.id.toUpperCase().includes(q);
        const matchesExpr = item.expression.toUpperCase().includes(q);
        const matchesTitle = (item.short_title || '').toUpperCase().includes(q);
        if (!matchesId && !matchesExpr && !matchesTitle) return false;
      }

      return true;
    });
  }, [items, filterStatus, searchQuery]);

  // Summary statistics
  const stats = useMemo(() => {
    const total = items.length;
    const violetCount = items.filter((i) => i.status === 'violet').length;
    const greenCount = items.filter((i) => i.status === 'green').length;
    const yellowCount = items.filter((i) => i.status === 'yellow').length;
    const greyCount = items.filter((i) => i.status === 'grey').length;

    const violetPct = total > 0 ? Math.round((violetCount / total) * 1000) / 10 : 0;
    const greenPct = total > 0 ? Math.round((greenCount / total) * 1000) / 10 : 0;
    const yellowPct = total > 0 ? Math.round((yellowCount / total) * 1000) / 10 : 0;
    const greyPct = total > 0 ? Math.round((greyCount / total) * 1000) / 10 : 0;

    return {
      total,
      violetCount,
      greenCount,
      yellowCount,
      greyCount,
      violetPct,
      greenPct,
      yellowPct,
      greyPct,
    };
  }, [items]);

  // Click on tile: toggle selection / quick preview
  const handleTileClick = (item: MatrixItem) => {
    setActiveTileId(activeTileId === item.id ? null : item.id);
  };

  // Double click: smart open into appropriate tab
  const handleTileDoubleClick = (item: MatrixItem) => {
    // If yellow (script ready, description missing), jump straight into description creator
    if (item.status === 'yellow') {
      onSelectId(item.id, 'description_creation');
    } else {
      // If grey or green, jump into script auditor
      onSelectId(item.id, 'script_auditor');
    }
  };

  const activeItem = useMemo(() => {
    return items.find((i) => i.id === activeTileId) || null;
  }, [items, activeTileId]);

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      {/* Top Controls: Language & Format Pickers */}
      <div className="bg-brand-surface/90 border border-brand-border rounded-2xl p-5  backdrop-blur-sm flex flex-col gap-4">
        {/* Row 1: Language Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border/60 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-ice/60 mr-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-brand-sky" />
              Language:
            </span>
            <div className="flex items-center gap-1.5 bg-brand-dark/80 p-1 rounded-xl border border-brand-border">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setSelectedLanguage(lang.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    selectedLanguage === lang.id
                      ? 'bg-gradient-to-r from-brand-sky to-brand-amethyst text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-brand-surface'
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* External Google Sheet Link */}
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-brand-sky hover:text-white bg-brand-card hover:bg-brand-sky/20 border border-brand-border px-3 py-1.5 rounded-xl transition-all"
            >
              <span>Open Google Sheet</span>
              <ExternalLink className="w-3 h-3 text-brand-sky" />
            </a>
          )}
        </div>

        {/* Row 2: Video Format Buttons & Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-ice/60 mr-1">Format:</span>
            <div className="flex items-center gap-1.5 bg-brand-dark/80 p-1 rounded-xl border border-brand-border">
              {VIDEO_TYPES.map((vtype) => (
                <button
                  key={vtype.id}
                  type="button"
                  onClick={() => setSelectedType(vtype.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    selectedType === vtype.id
                      ? 'bg-brand-card text-white border border-brand-sky/50 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-brand-surface'
                  }`}
                >
                  <span className="text-brand-sky font-bold mr-1">[{vtype.code}]</span>
                  <span>{vtype.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadCategory(selectedLanguage, selectedType, true)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-card hover:bg-brand-surface border border-brand-border text-xs font-semibold text-brand-ice rounded-xl transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-brand-sky' : ''}`} />
            <span>Refresh Sheet</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-brand-surface border border-brand-border p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterStatus === 'all'
                ? 'bg-brand-card text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All IDs{!isLoading && ` (${stats.total})`}
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('violet')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterStatus === 'violet'
                ? 'bg-violet-600/35 text-violet-200 border border-violet-400/50 shadow-sm'
                : 'text-slate-400 hover:text-violet-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-violet-400" />
            <span>Launched{!isLoading && ` (${stats.violetCount})`}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('green')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterStatus === 'green'
                ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-emerald-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Ready{!isLoading && ` (${stats.greenCount})`}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('yellow')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterStatus === 'yellow'
                ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-amber-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Script only{!isLoading && ` (${stats.yellowCount})`}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('grey')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterStatus === 'grey'
                ? 'bg-brand-card text-slate-200 border border-brand-border shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            <span>No script{!isLoading && ` (${stats.greyCount})`}</span>
          </button>
        </div>

        {/* Quick Search */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-brand-ice/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, topic, or title..."
            className="w-full pl-9 pr-3 py-1.5 bg-brand-surface border border-brand-border focus:border-brand-sky rounded-xl text-xs text-white placeholder-brand-ice/30 focus:outline-none mono-font"
          />
        </div>
      </div>

      {/* Selected Tile Quick Action Banner (When a tile is clicked) */}
      {activeItem && (
        <div className="bg-brand-card border-2 border-brand-sky/60 rounded-2xl p-4  flex flex-wrap items-center justify-between gap-4 animate-slideDown">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center font-extrabold mono-font text-sm border ${
                activeItem.status === 'violet'
                  ? 'bg-violet-600/35 text-violet-200 border-violet-400/70'
                  : activeItem.status === 'green'
                  ? 'bg-emerald-600/30 text-emerald-200 border-emerald-500/60'
                  : activeItem.status === 'yellow'
                  ? 'bg-amber-500/30 text-amber-200 border-amber-500/60'
                  : 'bg-brand-surface text-slate-300 border-brand-border'
              }`}
            >
              {activeItem.id}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white">{activeItem.expression || 'No title'}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    activeItem.status === 'violet'
                      ? 'bg-violet-500/25 text-violet-200 border border-violet-400/50'
                      : activeItem.status === 'green'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : activeItem.status === 'yellow'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-700/40 text-slate-400 border border-slate-600/40'
                  }`}
                >
                  {activeItem.status === 'violet'
                    ? `Launched · ${activeItem.launch_date || 'On Calendar'}`
                    : activeItem.status === 'green'
                    ? 'Ready (Script + Description)'
                    : activeItem.status === 'yellow'
                    ? 'Script Ready · Needs Description'
                    : 'Needs Script'}
                </span>
              </div>
              <div className="text-xs text-brand-ice/60 mt-0.5 flex flex-wrap items-center gap-3">
                <span>Col D (Script): {activeItem.has_script_changed ? '✓ Filled' : '✗ Empty'}</span>
                <span>Col E (Checked): {activeItem.script_ready ? '✓ Ready' : '○ Pending'}</span>
                <span>Col I (Description): {activeItem.has_short_description ? '✓ Filled' : '✗ Empty'}</span>
                <span>Col J (Title): {activeItem.has_short_title ? '✓ Filled' : '✗ Empty'}</span>
                {activeItem.launch_date && (
                  <span className="text-violet-300 font-semibold">Launch: {activeItem.launch_date}</span>
                )}
              </div>
              {activeItem.short_title && (
                <div className="text-xs text-brand-sky/90 mt-1 truncate max-w-2xl">
                  Title: "{activeItem.short_title}"
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onScheduleInCalendar && (activeItem.status === 'green' || activeItem.status === 'violet') && (
              <button
                type="button"
                onClick={() => onScheduleInCalendar(activeItem.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-95 text-white rounded-xl text-xs font-bold shadow-md shadow-violet-600/25 transition-all cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{activeItem.status === 'violet' ? 'View / Move in Calendar' : 'Schedule in Calendar'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onSelectId(activeItem.id, 'script_auditor')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-surface hover:bg-brand-dark border border-brand-border hover:border-brand-sky text-xs font-semibold text-white rounded-xl transition-all cursor-pointer"
            >
              <FileEdit className="w-3.5 h-3.5 text-brand-sky" />
              <span>Open in Script Auditor</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectId(activeItem.id, 'description_creation')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeItem.status === 'yellow'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-yellow-400'
                  : 'bg-brand-surface hover:bg-brand-dark border border-brand-border text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Open in Title &amp; Description</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Bingo Matrix Grid */}
      <div className="bg-brand-surface/50 border border-brand-border rounded-2xl p-6 min-h-[300px]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <RefreshCw className="w-8 h-8 text-brand-sky animate-spin mb-3" />
            <p className="text-sm font-semibold text-white">Loading IDs from Google Sheets...</p>
            <p className="text-xs text-brand-ice/60 mt-1">Reading Column D, Column I, and YouTube Launch Calendar state</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center text-slate-400">
            <Filter className="w-8 h-8 text-brand-amethyst mb-3" />
            <p className="text-sm font-semibold text-white">No IDs match the current filter</p>
            <p className="text-xs text-brand-ice/50 mt-1">Try clearing the search query or switching filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2.5">
            {filteredItems.map((item) => {
              const isSelected = activeTileId === item.id;

              // Color styles per 4-state lifecycle
              let tileClass = '';
              let badgeColor = '';

              if (item.status === 'violet') {
                // VIOLET: Scheduled / Launched on YouTube Calendar
                tileClass = 'bg-violet-600/35 text-violet-200 border-violet-400/60 shadow-sm shadow-violet-500/20 hover:bg-violet-600/50 hover:border-violet-300 hover:scale-105';
                badgeColor = 'bg-violet-400';
              } else if (item.status === 'green') {
                // GREEN: Col D filled AND Col I filled
                tileClass = 'bg-emerald-600/30 text-emerald-200 border-emerald-500/50 shadow-sm shadow-emerald-500/15 hover:bg-emerald-600/45 hover:border-emerald-400 hover:scale-105';
                badgeColor = 'bg-emerald-400';
              } else if (item.status === 'yellow') {
                // YELLOW: Col D filled, Col I empty
                tileClass = 'bg-amber-500/25 text-amber-200 border-amber-500/50 shadow-sm shadow-amber-500/15 hover:bg-amber-500/40 hover:border-amber-400 hover:scale-105';
                badgeColor = 'bg-amber-400';
              } else {
                // GREY: Col D empty
                tileClass = 'bg-brand-card/75 text-slate-400 border-brand-border hover:border-brand-sky/60 hover:text-white hover:bg-brand-surface hover:scale-105';
                badgeColor = 'bg-slate-500/50';
              }

              return (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={isSelected}
                  aria-label={`${item.id} · ${{ violet: 'Launched', green: 'Ready', yellow: 'Script only', grey: 'No script' }[item.status]}`}
                  title={`${item.id}: ${item.expression || 'No title'}\nTitle (Col J): ${
                    item.short_title || 'Empty'
                  }\nStatus: ${
                    item.status === 'violet'
                      ? `Violet (Launched on ${item.launch_date || 'YouTube Calendar'})`
                      : item.status === 'green'
                      ? 'Green (Ready: Script + Description)'
                      : item.status === 'yellow'
                      ? 'Yellow (Script ready, Needs Description)'
                      : 'Grey (No Script Changed)'
                  }\n(Click to inspect · Double-click to open)`}
                  onClick={() => handleTileClick(item)}
                  onDoubleClick={() => handleTileDoubleClick(item)}
                  className={`
                    relative group h-12 w-full flex items-center justify-center rounded-xl font-bold mono-font text-sm
                    select-none transition-all duration-150 cursor-pointer border
                    ${tileClass}
                    ${isSelected ? 'ring-2 ring-brand-sky border-brand-sky scale-105  shadow-brand-sky/20 z-10' : ''}
                  `}
                >
                  {/* ID Code ONLY */}
                  <span className="tracking-tight">{item.id}</span>

                  {/* Status Indicator Dot */}
                  <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${badgeColor}`} />
                </button>
              );
            })}
          </div>
        )}

        {/* Footer Legend */}
        <div className="mt-6 pt-4 border-t border-brand-border/40 flex flex-wrap items-center justify-between text-xs text-brand-ice/60 gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-violet-500/40 border border-violet-400/70" />
              <strong className="text-violet-300">Launched:</strong> On the calendar
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500/30 border border-emerald-500/60" />
              <strong className="text-emerald-300">Green:</strong> Ready (Col D + Col I filled)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500/30 border border-amber-500/60" />
              <strong className="text-amber-300">Yellow:</strong> Script ready (Col D filled, Col I empty)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-brand-card border border-brand-border" />
              <strong className="text-slate-400">Grey:</strong> No script (Col D empty)
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-brand-sky font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Select an ID to inspect and open it</span>
          </div>
        </div>
      </div>
      {!isLoading && items.length > 0 && (
        <details className="border-t border-brand-border pt-3">
          <summary className="cursor-pointer py-2 text-sm font-semibold text-brand-ice">Production &amp; launch summary</summary>
      {/* Progress & 3-State Metrics Dashboard */}
      <div className="bg-brand-surface/80 border border-brand-border rounded-2xl p-5  flex flex-col lg:flex-row items-center justify-between gap-6">
        {/* Left: 4-State Metric Counters */}
        <div className="flex flex-wrap items-center gap-5 sm:gap-6 w-full lg:w-auto">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-brand-ice/50 font-bold">Total IDs</div>
            <div className="text-2xl font-extrabold text-white mono-font">{stats.total}</div>
          </div>

          <div className="h-8 w-[1px] bg-brand-border hidden sm:block" />

          {/* Violet Metric */}
          <div className="flex flex-col">
            <div className="text-[11px] uppercase tracking-wider text-violet-400 font-bold flex items-center gap-1">
              <Rocket className="w-3.5 h-3.5" />
              Launched
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-violet-300 mono-font">{stats.violetCount}</span>
              <span className="text-xs text-violet-400/70 font-semibold mono-font">({stats.violetPct}%)</span>
            </div>
            <span className="text-[10px] text-brand-ice/50">On Launch Calendar</span>
          </div>

          <div className="h-8 w-[1px] bg-brand-border hidden sm:block" />

          {/* Green Metric */}
          <div className="flex flex-col">
            <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Ready
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-emerald-300 mono-font">{stats.greenCount}</span>
              <span className="text-xs text-emerald-400/70 font-semibold mono-font">({stats.greenPct}%)</span>
            </div>
            <span className="text-[10px] text-brand-ice/50">Script + Description ready</span>
          </div>

          <div className="h-8 w-[1px] bg-brand-border hidden sm:block" />

          {/* Yellow Metric */}
          <div className="flex flex-col">
            <div className="text-[11px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Script only
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-amber-300 mono-font">{stats.yellowCount}</span>
              <span className="text-xs text-amber-400/70 font-semibold mono-font">({stats.yellowPct}%)</span>
            </div>
            <span className="text-[10px] text-brand-ice/50">Col D ready · Col I missing</span>
          </div>

          <div className="h-8 w-[1px] bg-brand-border hidden sm:block" />

          {/* Grey Metric */}
          <div className="flex flex-col">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              No script
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-slate-300 mono-font">{stats.greyCount}</span>
              <span className="text-xs text-slate-400/70 font-semibold mono-font">({stats.greyPct}%)</span>
            </div>
            <span className="text-[10px] text-brand-ice/50">Col D empty</span>
          </div>
        </div>

        {/* Right: Multi-Segmented Progress Bar */}
        <div className="flex-1 max-w-lg w-full flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-brand-ice/70">Production & Launch Readiness</span>
            <div className="flex items-center gap-3 text-[11px] mono-font">
              <span className="text-violet-400 font-bold">{stats.violetPct}% Launched</span>
              <span className="text-emerald-400 font-bold">{stats.greenPct}% Ready</span>
              <span className="text-amber-400 font-bold">{stats.yellowPct}% Scripted</span>
            </div>
          </div>

          {/* Multi-segmented Bar */}
          <div className="w-full h-3.5 bg-brand-dark rounded-full overflow-hidden border border-brand-border/80 flex">
            {/* Violet Segment */}
            <div
              className="h-full bg-gradient-to-r from-violet-600 via-purple-500 to-fuchsia-500 transition-all duration-300 shadow-sm"
              style={{ width: `${stats.violetPct}%` }}
              title={`Launched: ${stats.violetCount} (${stats.violetPct}%)`}
            />
            {/* Green Segment */}
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 shadow-sm"
              style={{ width: `${stats.greenPct}%` }}
              title={`Ready: ${stats.greenCount} (${stats.greenPct}%)`}
            />
            {/* Yellow Segment */}
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-300 shadow-sm"
              style={{ width: `${stats.yellowPct}%` }}
              title={`Yellow: ${stats.yellowCount} (${stats.yellowPct}%)`}
            />
            {/* Grey Segment */}
            <div
              className="h-full bg-slate-700/60 transition-all duration-300"
              style={{ width: `${stats.greyPct}%` }}
              title={`Grey: ${stats.greyCount} (${stats.greyPct}%)`}
            />
          </div>
        </div>
      </div>

        </details>
      )}
    </div>
  );
};
