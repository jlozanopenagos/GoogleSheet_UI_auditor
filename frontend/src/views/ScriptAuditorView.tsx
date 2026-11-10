import React, { useState, useEffect } from 'react';
import { Copy, Check, Save, Loader2, Calendar, FileText, Sparkles, ExternalLink } from 'lucide-react';
import { ScriptRecord } from '../types';
import { updateScriptFields, doctorScriptWithGemini } from '../services/api';

interface ScriptAuditorViewProps {
  script: ScriptRecord | null;
  onScriptUpdated: (updated: ScriptRecord) => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export const ScriptAuditorView: React.FC<ScriptAuditorViewProps> = ({
  script,
  onScriptUpdated,
  onError,
  onSuccess,
}) => {
  const [copied, setCopied] = useState(false);
  const [initialScriptChanged, setInitialScriptChanged] = useState('');
  const [scriptChanged, setScriptChanged] = useState('');
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptDate, setScriptDate] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDoctoring, setIsDoctoring] = useState(false);

  // Sync state when script changes
  useEffect(() => {
    if (script) {
      const initialVal = script.SCRIPT_CHANGED || '';
      setInitialScriptChanged(initialVal);
      setScriptChanged(initialVal);
      setScriptReady(script.script_ready || false);
      setScriptDate(script.script_date || '');
    }
  }, [script?.ID]);

  if (!script) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center bg-brand-surface/70 border border-brand-border rounded-2xl shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-brand-card flex items-center justify-center mb-4 border border-brand-border">
          <FileText className="w-8 h-8 text-brand-amethyst" />
        </div>
        <h3 className="text-lg font-bold text-white tracking-tight">No script selected</h3>
        <p className="text-sm text-brand-ice/60 max-w-md mt-1">
          Use the search bar above with a script ID (such as <span className="mono-font text-brand-sky font-semibold">EE01</span> or <span className="mono-font text-brand-sky font-semibold">FG03</span>) to locate and audit a script.
        </p>
      </div>
    );
  }

  // Format language and video type for display
  const formatTag = (record: ScriptRecord) => {
    const lang = record.language ? record.language.charAt(0).toUpperCase() + record.language.slice(1).toLowerCase() : '';
    const vtype = record.video_type ? record.video_type.replace('_', ' ').toLowerCase() : '';
    return `${lang} · ${vtype}`;
  };

  // Check if content has been modified by the user
  const hasScriptChanged = scriptChanged !== initialScriptChanged;
  const isSaveEnabled = hasScriptChanged && !isUpdating && !isDoctoring;

  // Natural placeholder text when Column D is empty
  const placeholderText = `Write or doctor the new version of the script for "${script.expression || script.ID}" here...`;

  const handleCopyOriginal = async () => {
    if (!script.script) return;
    try {
      await navigator.clipboard.writeText(script.script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError('Failed to copy text to clipboard.');
    }
  };

  const handleDoctorScript = async () => {
    if (!script.script || !script.script.trim()) {
      onError('Cannot doctor script: Original script in Column C is empty.');
      return;
    }

    setIsDoctoring(true);
    try {
      const res = await doctorScriptWithGemini({
        script_id: script.ID,
        expression: script.expression,
        original_script: script.script,
      });

      setScriptChanged(res.doctored_script);
      onSuccess(`Script doctored with Gemini (${res.word_count} words). Click 'Save revisions' to push to Google Sheets.`);
    } catch (err: any) {
      onError(err.message || 'Failed to doctor script with Gemini.');
    } finally {
      setIsDoctoring(false);
    }
  };

  const handleSave = async () => {
    if (!isSaveEnabled) return;
    setIsUpdating(true);

    try {
      await updateScriptFields({
        script_id: script.ID,
        SCRIPT_CHANGED: scriptChanged,
        script_ready: scriptReady,
        script_date: scriptDate,
      });

      // Update parent record
      const updated: ScriptRecord = {
        ...script,
        SCRIPT_CHANGED: scriptChanged,
        script_ready: scriptReady,
        script_date: scriptDate,
      };
      setInitialScriptChanged(scriptChanged);
      onScriptUpdated(updated);
      onSuccess(`Successfully updated script revisions and status for ${script.ID} in Google Sheets.`);
    } catch (err: any) {
      onError(err.message || 'Failed to update Google Sheet.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Target Expression & ID Header Label */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-brand-surface border border-brand-border p-4.5 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-brand-wine/80 text-brand-ice border border-brand-mulberry/60 mono-font">
              {formatTag(script)}
            </span>
            {script.row_number && (
              <span className="text-xs text-brand-ice/50 mono-font font-medium">
                Row #{script.row_number}
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-white mt-1.5 tracking-tight">
            Editing <span className="text-brand-sky mono-font font-extrabold">{script.ID}</span> · <span className="text-brand-ice font-medium">"{script.expression || 'No expression label'}"</span>
          </h2>
        </div>

        {script.sheet_url && (
          <a
            href={script.sheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-brand-sky hover:text-brand-ice font-semibold transition-colors"
          >
            <span>Open in Google Sheet</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Side-by-Side Dual Script Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Column C (Original Script - Read Only) */}
        <div className="flex flex-col bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-brand-border mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-amethyst"></span>
              <h3 className="font-bold text-sm text-brand-ice">
                Original script · Column C <span className="text-xs text-brand-ice/50 font-normal">(read-only)</span>
              </h3>
            </div>
            <button
              onClick={handleCopyOriginal}
              disabled={!script.script}
              className="flex items-center gap-1.5 px-3 py-1 bg-brand-card hover:bg-brand-wine/70 border border-brand-border/60 hover:border-brand-amethyst/60 disabled:opacity-40 text-xs font-semibold text-brand-ice rounded-lg transition-colors"
              title="Copy original script"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-brand-sky" />
                  <span className="text-brand-sky">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <div className="relative flex-1 min-h-[320px]">
            <textarea
              readOnly
              value={script.script || ''}
              placeholder="(Original script in Column C is empty)"
              className="w-full h-full min-h-[320px] p-4 bg-brand-input border border-brand-border rounded-xl text-brand-ice/90 text-sm leading-relaxed resize-none focus:outline-none mono-font selection:bg-brand-amethyst/40 cursor-text"
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-brand-ice/50">
            <span>Word count: {script.script ? script.script.trim().split(/\s+/).length : 0} words</span>
            <span>Character count: {script.script.length}</span>
          </div>
        </div>

        {/* Right Column: Column D (SCRIPT_CHANGED - Editable) */}
        <div className="flex flex-col bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-brand-border mb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${hasScriptChanged ? 'bg-brand-sky animate-pulse' : 'bg-brand-amethyst'}`}></span>
              <h3 className="font-bold text-sm text-white">
                Script revision · Column D <span className="text-xs text-brand-sky font-normal">(editable)</span>
              </h3>
            </div>
            {hasScriptChanged && (
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-brand-wine text-brand-ice border border-brand-mulberry">
                Unsaved edits
              </span>
            )}
          </div>

          <div className="relative flex-1 min-h-[320px]">
            <textarea
              value={scriptChanged}
              onChange={(e) => setScriptChanged(e.target.value)}
              disabled={isUpdating || isDoctoring}
              placeholder={placeholderText}
              className="w-full h-full min-h-[320px] p-4 pr-12 bg-brand-input border border-brand-border focus:border-brand-sky rounded-xl text-white text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-brand-sky/40 mono-font transition-all"
            />
            {/* Gemini Script Doctor button in the top right corner */}
            <button
              onClick={handleDoctorScript}
              disabled={isDoctoring || isUpdating || !script.script}
              title="change the script with Gemini"
              className="absolute top-3 right-3 p-2 bg-gradient-to-br from-brand-mulberry/60 via-brand-amethyst/60 to-brand-sky/60 hover:from-brand-mulberry hover:to-brand-amethyst border border-brand-amethyst/70 hover:border-brand-sky rounded-xl text-brand-ice hover:text-white shadow-lg shadow-black/30 backdrop-blur-sm transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed group z-10"
            >
              {isDoctoring ? (
                <Loader2 className="w-4 h-4 animate-spin text-brand-ice" />
              ) : (
                <Sparkles className="w-4 h-4 text-brand-ice group-hover:rotate-12 group-hover:scale-110 transition-transform duration-200" />
              )}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-brand-ice/50">
            <span>Word count: {scriptChanged ? scriptChanged.trim().split(/\s+/).length : 0} words</span>
            <span>Character count: {scriptChanged.length}</span>
          </div>

          {/* Under-the-box Controls: Column E, Column F and Update Button */}
          <div className="mt-5 pt-4 border-t border-brand-border flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Column E Checkbox: script_ready */}
              <label
                className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                  hasScriptChanged || scriptChanged.trim().length > 0
                    ? 'bg-brand-card border-brand-border hover:border-brand-amethyst/60 cursor-pointer'
                    : 'bg-brand-card/40 border-brand-border/40 opacity-40 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  checked={scriptReady}
                  onChange={(e) => setScriptReady(e.target.checked)}
                  disabled={isUpdating || (!hasScriptChanged && scriptChanged.trim().length === 0)}
                  className="w-4 h-4 rounded text-brand-mulberry bg-brand-dark border-brand-border focus:ring-brand-amethyst focus:ring-offset-brand-dark"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-brand-ice">
                    Ready for production · Column E
                  </span>
                  <span className="text-[11px] text-brand-ice/60">
                    Mark script finalized for production
                  </span>
                </div>
              </label>

              {/* Column F Date Input: script_date (DD/MM/YY) */}
              <div
                className={`flex flex-col p-3.5 rounded-xl border transition-all ${
                  hasScriptChanged || scriptChanged.trim().length > 0
                    ? 'bg-brand-card border-brand-border'
                    : 'bg-brand-card/40 border-brand-border/40 opacity-40'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-brand-ice flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-brand-sky" />
                    Scheduled date · Column F
                  </span>
                  <span className="text-[10px] text-brand-ice/50 mono-font">DD/MM/YY</span>
                </div>
                <input
                  type="text"
                  value={scriptDate}
                  onChange={(e) => setScriptDate(e.target.value)}
                  placeholder="31/01/26"
                  maxLength={10}
                  disabled={isUpdating || (!hasScriptChanged && scriptChanged.trim().length === 0)}
                  className="w-full px-2.5 py-1.5 bg-brand-input border border-brand-border focus:border-brand-sky rounded-lg text-xs font-semibold text-white placeholder-brand-ice/30 focus:outline-none focus:ring-1 focus:ring-brand-sky mono-font"
                />
              </div>
            </div>

            {/* Submit Update Button */}
            <button
              onClick={handleSave}
              disabled={!isSaveEnabled}
              className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition-all duration-200 ${
                isSaveEnabled
                  ? 'bg-gradient-to-r from-brand-sky via-brand-amethyst to-brand-mulberry hover:opacity-95 text-white cursor-pointer shadow-brand-mulberry/30'
                  : 'bg-brand-card/60 text-brand-ice/30 cursor-not-allowed border border-brand-border'
              }`}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Saving changes to Google Sheets...</span>
                </>
              ) : isDoctoring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-brand-ice" />
                  <span>Doctoring script with Gemini...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>
                    {hasScriptChanged
                      ? `Save revisions to Google Sheets (${script.ID})`
                      : 'No changes to save'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

