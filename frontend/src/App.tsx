import React, { useState } from 'react';
import { Header } from './components/Header';
import { IdSearchBar } from './components/IdSearchBar';
import { NotificationToast } from './components/NotificationToast';
import { ScriptAuditorView } from './views/ScriptAuditorView';
import { DescriptionCreationView } from './views/DescriptionCreationView';
import { IdChecklistView } from './views/IdChecklistView';
import { LaunchCalendarView } from './views/LaunchCalendarView';
import { ActiveTab, ScriptRecord } from './types';
import { fetchScriptById } from './services/api';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('script_auditor');
  const [currentScript, setCurrentScript] = useState<ScriptRecord | null>(null);
  const [calendarTargetId, setCalendarTargetId] = useState<string | null>(null);
  const [calendarVersion, setCalendarVersion] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSearch = async (id: string) => {
    setIsLoading(true);
    setNotification(null);

    try {
      const record = await fetchScriptById(id);
      setCurrentScript(record);
      const lang = record.language ? record.language.charAt(0).toUpperCase() + record.language.slice(1).toLowerCase() : '';
      const vtype = record.video_type ? record.video_type.replace('_', ' ').toLowerCase() : '';
      setNotification({
        type: 'success',
        message: `Successfully loaded ${record.ID} (${lang} · ${vtype}) from Google Sheets.`,
      });
      return true;
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || `Could not find script ID '${id}'.`,
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectIdFromMatrix = async (id: string, targetTab?: ActiveTab) => {
    setActiveTab(targetTab || 'script_auditor');
    await handleSearch(id);
  };

  const handleScheduleInCalendar = (id: string) => {
    setCalendarTargetId(id.trim().toUpperCase());
    setNotification(null);
    setActiveTab('launch_calendar');
  };

  const handleOpenIdFromCalendar = async (id: string, targetTab: ActiveTab) => {
    setActiveTab(targetTab);
    await handleSearch(id);
  };

  const handleScriptUpdated = (updated: ScriptRecord) => {
    setCurrentScript(updated);
  };

  const handleError = (message: string) => {
    setNotification({ type: 'error', message });
  };

  const handleSuccess = (message: string) => {
    setNotification({ type: 'success', message });
  };

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col text-brand-ice">
      {/* Top Application Header with Modular Navigation */}
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setNotification(null);
        }}
        currentScript={currentScript}
      />

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-4">
        {/* Universal ID Search Bar: shown on Script Auditor & Description Creator tabs */}
        {activeTab !== 'id_checklist' && activeTab !== 'launch_calendar' && (
          <IdSearchBar
            onSearch={handleSearch}
            isLoading={isLoading}
            activeId={currentScript?.ID}
          />
        )}

        {/* Global Notifications */}
        {notification && (
          <NotificationToast
            type={notification.type}
            message={notification.message}
            onClose={() => setNotification(null)}
          />
        )}

        {/* Dynamic Tab Views */}
        {activeTab === 'script_auditor' && (
          <ScriptAuditorView
            script={currentScript}
            onScriptUpdated={handleScriptUpdated}
            onError={handleError}
            onSuccess={handleSuccess}
          />
        )}

        {activeTab === 'description_creation' && (
          <DescriptionCreationView
            script={currentScript}
            onScriptUpdated={handleScriptUpdated}
            onError={handleError}
            onSuccess={handleSuccess}
          />
        )}

        {activeTab === 'id_checklist' && (
          <IdChecklistView
            onSelectId={handleSelectIdFromMatrix}
            onScheduleInCalendar={handleScheduleInCalendar}
            calendarVersion={calendarVersion}
            onError={handleError}
            onSuccess={handleSuccess}
          />
        )}

        {activeTab === 'launch_calendar' && (
          <LaunchCalendarView
            initialScriptId={calendarTargetId}
            onConsumeInitialId={() => setCalendarTargetId(null)}
            onOpenIdInTab={handleOpenIdFromCalendar}
            onCalendarChanged={() => setCalendarVersion((v) => v + 1)}
            onError={handleError}
            onSuccess={handleSuccess}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-brand-border bg-brand-dark py-4 text-center text-xs text-brand-ice/50">
        GoogleSheet UI Auditor · Multi-language studio for YouTube Shorts spreadsheets
      </footer>
    </div>
  );
};

export default App;
