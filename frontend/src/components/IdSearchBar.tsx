import React, { useState } from 'react';
import { Search, Loader2, ArrowRight } from 'lucide-react';

interface IdSearchBarProps {
  onSearch: (id: string) => Promise<void>;
  isLoading: boolean;
  activeId?: string;
}

export const IdSearchBar: React.FC<IdSearchBarProps> = ({ onSearch, isLoading, activeId = '' }) => {
  const [inputVal, setInputVal] = useState(activeId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || isLoading) return;
    onSearch(inputVal.trim());
  };

  const handleQuickSelect = (prefix: string) => {
    setInputVal(prefix);
    onSearch(prefix);
  };

  return (
    <div className="w-full bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-xl">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-brand-amethyst">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value.toUpperCase())}
            placeholder="Enter script ID (e.g. EE01, FG03, SR12, EF01)..."
            disabled={isLoading}
            maxLength={6}
            className="w-full pl-12 pr-4 py-3.5 bg-brand-input border border-brand-border rounded-xl text-base font-semibold text-white placeholder-brand-ice/35 focus:outline-none focus:ring-2 focus:ring-brand-sky/40 focus:border-brand-sky transition-all mono-font uppercase"
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
      </form>

      {/* Prefix Discovery Helper */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs text-brand-ice/70">
        <span className="font-semibold text-brand-ice/50">Quick test:</span>
        <button
          type="button"
          onClick={() => handleQuickSelect('EE01')}
          className="px-2.5 py-1 bg-brand-card hover:bg-brand-wine/70 border border-brand-border/60 hover:border-brand-amethyst/60 text-brand-ice rounded-lg transition-colors mono-font text-xs"
        >
          EE01 (English expression)
        </button>
        <button
          type="button"
          onClick={() => handleQuickSelect('EG03')}
          className="px-2.5 py-1 bg-brand-card hover:bg-brand-wine/70 border border-brand-border/60 hover:border-brand-amethyst/60 text-brand-ice rounded-lg transition-colors mono-font text-xs"
        >
          EG03 (English game)
        </button>
        <button
          type="button"
          onClick={() => handleQuickSelect('FR02')}
          className="px-2.5 py-1 bg-brand-card hover:bg-brand-wine/70 border border-brand-border/60 hover:border-brand-amethyst/60 text-brand-ice rounded-lg transition-colors mono-font text-xs"
        >
          FR02 (French roleplay)
        </button>
        <button
          type="button"
          onClick={() => handleQuickSelect('SF01')}
          className="px-2.5 py-1 bg-brand-card hover:bg-brand-wine/70 border border-brand-border/60 hover:border-brand-amethyst/60 text-brand-ice rounded-lg transition-colors mono-font text-xs"
        >
          SF01 (Spanish fun facts)
        </button>
      </div>
    </div>
  );
};

