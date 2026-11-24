import React, { useState } from 'react';
import { Search, Loader2, ArrowRight } from 'lucide-react';

interface IdSearchBarProps {
  onSearch: (id: string) => Promise<boolean>;
  isLoading: boolean;
  activeId?: string;
}

export const IdSearchBar: React.FC<IdSearchBarProps> = ({ onSearch, isLoading, activeId = '' }) => {
  const [inputVal, setInputVal] = useState(activeId);
  const [changingId, setChangingId] = useState<string | null>(null);
  const searchOpen = !activeId || changingId === activeId;

  if (!searchOpen && !isLoading) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-brand-border pb-2">
        <span className="text-sm">Script <strong className="mono-font text-white">{activeId}</strong></span>
        <button type="button" className="px-3 py-2 text-sm font-semibold text-brand-sky" onClick={() => {
          setInputVal(activeId);
          setChangingId(activeId);
        }}>Change script</button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || isLoading) return;
    if (await onSearch(inputVal.trim())) setChangingId(null);
  };

  const handleQuickSelect = async (prefix: string) => {
    setInputVal(prefix);
    if (await onSearch(prefix)) setChangingId(null);
  };

  return (
    <div className="w-full bg-brand-surface border border-brand-border rounded-xl p-4">
      <label htmlFor="script-lookup" className="mb-2 block text-sm font-semibold">Script ID</label>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-amethyst">
            <Search className="w-5 h-5" />
          </div>
          <input
            id="script-lookup"
            type="text"
            autoFocus={Boolean(activeId)}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value.toUpperCase())}
            placeholder="e.g. EE01"
            disabled={isLoading}
            maxLength={6}
            className="w-full pl-12 pr-4 py-3.5 bg-brand-input border border-brand-border rounded-xl text-base font-semibold text-white placeholder-brand-ice/70 focus:outline-none focus:ring-2 focus:ring-brand-sky/40 focus:border-brand-sky transition-all mono-font uppercase"
          />
        </div>

        <button
          type="submit"
          disabled={!inputVal.trim() || isLoading}
          className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-brand-sky via-brand-amethyst to-brand-mulberry hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-brand-mulberry/30 flex items-center justify-center gap-2 transition-all duration-200"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-brand-ice" />
              <span>Loading script...</span>
            </>
          ) : (
            <>
              <span>Locate script</span>
              <ArrowRight className="w-4 h-4 text-brand-ice" />
            </>
          )}
        </button>
        {activeId && <button type="button" disabled={isLoading} onClick={() => setChangingId(null)} className="px-3 py-2 text-sm text-brand-ice">Cancel</button>}
      </form>

      {/* Prefix Discovery Helper */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="font-semibold text-brand-ice/80">Try an example</span>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleQuickSelect('EE01')}
          className="px-2.5 py-1 bg-brand-card hover:bg-brand-card/80 border border-brand-border hover:border-brand-sky/60 text-slate-200 rounded-lg transition-colors mono-font text-xs"
        >
          EE01 (English expression)
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleQuickSelect('EG03')}
          className="px-2.5 py-1 bg-brand-card hover:bg-brand-card/80 border border-brand-border hover:border-brand-sky/60 text-slate-200 rounded-lg transition-colors mono-font text-xs"
        >
          EG03 (English game)
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleQuickSelect('FR02')}
          className="px-2.5 py-1 bg-brand-card hover:bg-brand-card/80 border border-brand-border hover:border-brand-sky/60 text-slate-200 rounded-lg transition-colors mono-font text-xs"
        >
          FR02 (French roleplay)
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleQuickSelect('SF01')}
          className="px-2.5 py-1 bg-brand-card hover:bg-brand-card/80 border border-brand-border hover:border-brand-sky/60 text-slate-200 rounded-lg transition-colors mono-font text-xs"
        >
          SF01 (Spanish fun facts)
        </button>
      </div>
    </div>
  );
};

