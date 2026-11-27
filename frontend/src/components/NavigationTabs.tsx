import React from 'react';
import { FileEdit, Sparkles, LayoutGrid, Calendar, Upload } from 'lucide-react';
import { ActiveTab } from '../types';

export interface NavTabItem {
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: NavTabItem[] = [
  {
    id: 'script_auditor',
    label: 'Script auditor',
    icon: FileEdit,
  },
  {
    id: 'description_creation',
    label: 'Title & description',
    icon: Sparkles,
  },
  {
    id: 'id_checklist',
    label: 'ID checklist',
    icon: LayoutGrid,
  },
  {
    id: 'launch_calendar',
    label: 'Launch calendar',
    icon: Calendar,
  },
  {
    id: 'youtube_upload',
    label: 'YouTube upload',
    icon: Upload,
  },
];

interface NavigationTabsProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({ activeTab, onTabChange }) => {
  return (
    <nav
      aria-label="Application Tabs"
      className="grid w-full min-w-0 grid-cols-2 gap-1 sm:flex sm:w-auto sm:items-center sm:gap-1.5 bg-brand-dark/95 p-1.5 rounded-2xl border border-brand-border shadow-inner"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onTabChange(tab.id)}
            className={`flex min-w-0 items-center justify-center gap-2 px-2 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer select-none ${
              isActive
                ? 'bg-gradient-to-r from-brand-sky via-brand-amethyst to-brand-mulberry text-white shadow-md shadow-brand-sky/25 border border-brand-ice/20'
                : 'text-slate-300 hover:text-white hover:bg-brand-surface/90'
            }`}
          >
            <Icon className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isActive ? 'scale-110 text-white' : 'text-brand-ice/70'}`} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
