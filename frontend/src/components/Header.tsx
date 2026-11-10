import React from 'react';
import { FileEdit, Sparkles, Sheet, ExternalLink } from 'lucide-react';
import { ActiveTab, ScriptRecord } from '../types';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  currentScript?: ScriptRecord | null;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, currentScript }) => {
  // Format language and video type for display with clean capitalization
  const formatSheetLabel = (record: ScriptRecord) => {
    const lang = record.language ? record.language.charAt(0).toUpperCase() + record.language.slice(1).toLowerCase() : '';
    const vtype = record.video_type ? record.video_type.replace('_', ' ').toLowerCase() : '';
    return `${lang} ${vtype}`;
  };

  return (
    <header className="border-b border-brand-border bg-brand-surface/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4 shadow-lg shadow-black/20">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand & Title */}
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-brand-mulberry via-brand-amethyst to-brand-sky flex items-center justify-center shadow-lg shadow-brand-mulberry/30 border border-brand-ice/20">
            <Sheet className="w-5 h-5 text-brand-ice" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>GoogleSheet UI Auditor</span>
            </h1>
            <p className="text-xs text-brand-ice/70 font-medium">
              Multi-language scripts and YouTube Shorts SEO studio
            </p>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex items-center gap-1.5 bg-brand-dark/90 p-1.5 rounded-2xl border border-brand-border shadow-inner">
          <button
            onClick={() => onTabChange('script_auditor')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
              activeTab === 'script_auditor'
                ? 'bg-gradient-to-r from-brand-sky via-brand-amethyst to-brand-mulberry text-white shadow-md shadow-brand-sky/20'
                : 'text-slate-300 hover:text-white hover:bg-brand-surface/80'
            }`}
          >
            <FileEdit className="w-4 h-4" />
            <span>Script auditor</span>
          </button>
          <button
            onClick={() => onTabChange('description_creation')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
              activeTab === 'description_creation'
                ? 'bg-gradient-to-r from-brand-sky via-brand-amethyst to-brand-mulberry text-white shadow-md shadow-brand-sky/20'
                : 'text-slate-300 hover:text-white hover:bg-brand-surface/80'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Description creator</span>
          </button>
        </div>

        {/* Current Active Sheet Link */}
        {currentScript?.sheet_url && (
          <a
            href={currentScript.sheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:flex items-center gap-2 text-xs font-semibold text-brand-sky bg-brand-card border border-brand-border px-3.5 py-2 rounded-xl hover:bg-brand-surface hover:border-brand-sky transition-all duration-150 shadow-sm"
          >
            <Sheet className="w-3.5 h-3.5 text-brand-sky" />
            <span>Open {formatSheetLabel(currentScript)} sheet</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        )}
      </div>
    </header>
  );
};

