import React from 'react';
import { FileEdit, Sparkles, Sheet, ExternalLink } from 'lucide-react';
import { ActiveTab, ScriptRecord } from '../types';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  currentScript?: ScriptRecord | null;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, currentScript }) => {
  return (
    <header className="border-b border-gray-800 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand & Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sheet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-transparent">
              GoogleSheet UI Auditor
            </h1>
            <p className="text-xs text-gray-400 font-medium">
              Multi-Language Script & YouTube Shorts SEO Studio
            </p>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex items-center gap-1 bg-[#1e293b]/70 p-1 rounded-xl border border-gray-700/60 shadow-inner">
          <button
            onClick={() => onTabChange('script_auditor')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
              activeTab === 'script_auditor'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-900/40'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <FileEdit className="w-4 h-4" />
            Script Auditor
          </button>
          <button
            onClick={() => onTabChange('description_creation')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
              activeTab === 'description_creation'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-900/40'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Description Creation
          </button>
        </div>

        {/* Current Active Sheet Link */}
        {currentScript?.sheet_url && (
          <a
            href={currentScript.sheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-3 py-1.5 rounded-lg hover:bg-emerald-900/50 transition-colors"
          >
            <Sheet className="w-3.5 h-3.5" />
            Open {currentScript.language.toUpperCase()} {currentScript.video_type.toUpperCase()} Sheet
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </header>
  );
};

