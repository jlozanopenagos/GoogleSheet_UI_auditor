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
  };

  return (
    <div className="w-full bg-[#131b2e] border border-gray-800 rounded-2xl p-5 shadow-xl">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value.toUpperCase())}
            placeholder="Search by ID (e.g. EE01, FG03, SR12, EF01)..."
            disabled={isLoading}
            maxLength={6}
            className="w-full pl-12 pr-4 py-3.5 bg-[#0b0f19] border border-gray-700/80 rounded-xl text-base font-semibold text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all mono-font uppercase"
          />
        </div>

        <button
          type="submit"
          disabled={!inputVal.trim() || isLoading}
          className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all duration-150"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Fetching Sheet...</span>
            </>
          ) : (
            <>
              <span>Locate Script</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Prefix Discovery Helper */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span className="font-semibold text-gray-500">Fast Navigation:</span>
        <button
          type="button"
          onClick={() => handleQuickSelect('EE01')}
          className="px-2.5 py-1 bg-gray-800/70 hover:bg-gray-700 text-gray-300 rounded-md transition-colors mono-font"
        >
          EE01 (Eng Expression)
        </button>
        <button
          type="button"
          onClick={() => handleQuickSelect('EG03')}
          className="px-2.5 py-1 bg-gray-800/70 hover:bg-gray-700 text-gray-300 rounded-md transition-colors mono-font"
        >
          EG03 (Eng Game)
        </button>
        <button
          type="button"
          onClick={() => handleQuickSelect('FR02')}
          className="px-2.5 py-1 bg-gray-800/70 hover:bg-gray-700 text-gray-300 rounded-md transition-colors mono-font"
        >
          FR02 (French Roleplay)
        </button>
        <button
          type="button"
          onClick={() => handleQuickSelect('SF01')}
          className="px-2.5 py-1 bg-gray-800/70 hover:bg-gray-700 text-gray-300 rounded-md transition-colors mono-font"
        >
          SF01 (Spanish Fun Facts)
        </button>
      </div>
    </div>
  );
};

