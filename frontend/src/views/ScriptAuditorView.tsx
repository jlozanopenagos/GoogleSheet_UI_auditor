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
      <div className="flex flex-col items-center justify-center p-16 text-center bg-[#131b2e]/50 border border-gray-800/80 rounded-2xl">
        <FileText className="w-12 h-12 text-gray-600 mb-3" />
        <h3 className="text-lg font-bold text-gray-300">No Script Selected</h3>
        <p className="text-sm text-gray-500 max-w-md mt-1">
          Use the search bar above with a canonical ID (e.g. <span className="mono-font text-indigo-400 font-semibold">EE01</span>, <span className="mono-font text-indigo-400 font-semibold">FG03</span>) to locate and audit a Google Sheet script.
        </p>
      </div>
    );
  }

  // Check if content has been modified by the user
  const hasScriptChanged = scriptChanged !== initialScriptChanged;
  const isSaveEnabled = hasScriptChanged && !isUpdating && !isDoctoring;

  // Placeholder text when Column D is empty
  const placeholderText = `you can edit here the new version of the script ${script.expression || script.ID}`;

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
      onSuccess(`Script doctored with Gemini (${res.word_count} words)! Click 'Send Update' to save to Google Sheets.`);
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
      onSuccess(`Successfully updated Column D, E & F for ${script.ID} in Google Sheet!`);
    } catch (err: any) {
      onError(err.message || 'Failed to update Google Sheet.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Target Expression & ID Header Label */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#131b2e] border border-gray-800 p-4 rounded-xl shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold uppercase bg-emerald-950 text-emerald-400 border border-emerald-800 mono-font">
              {script.language} • {script.video_type}
            </span>
            {script.row_number && (
              <span className="text-xs text-gray-500 mono-font font-medium">
                Row #{script.row_number}
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-white mt-1">
            Editing <span className="text-emerald-400 mono-font font-extrabold">{script.ID}</span>: <span className="text-gray-200">"{script.expression || 'No Expression Label'}"</span>
          </h2>
        </div>

        {script.sheet_url && (
          <a
            href={script.sheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
          >
            <span>View Row in Google Sheet</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Side-by-Side Dual Script Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Column C (Original Script - Read Only) */}
        <div className="flex flex-col bg-[#131b2e] border border-gray-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              <h3 className="font-bold text-sm text-gray-300">
                Column C: Original Script <span className="text-xs text-gray-500 font-normal">(Read-Only)</span>
              </h3>
            </div>
            <button
              onClick={handleCopyOriginal}
              disabled={!script.script}
              className="flex items-center gap-1.5 px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-xs font-semibold text-gray-300 rounded-lg transition-colors"
              title="Copy original script"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
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
              className="w-full h-full min-h-[320px] p-4 bg-[#0b0f19] border border-gray-800 rounded-xl text-gray-300 text-sm leading-relaxed resize-none focus:outline-none mono-font selection:bg-amber-500/30 cursor-text"
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>Word count: {script.script ? script.script.trim().split(/\s+/).length : 0} words</span>
            <span>Character count: {script.script.length}</span>
          </div>
        </div>

        {/* Right Column: Column D (SCRIPT_CHANGED - Editable) */}
        <div className="flex flex-col bg-[#131b2e] border border-gray-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${hasScriptChanged ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400'}`}></span>
              <h3 className="font-bold text-sm text-gray-200">
                Column D: SCRIPT_CHANGED <span className="text-xs text-indigo-400 font-normal">(Editable)</span>
              </h3>
            </div>
            {hasScriptChanged && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                Unsaved Edits
              </span>
            )}
          </div>

          <div className="relative flex-1 min-h-[320px]">
            <textarea
              value={scriptChanged}
              onChange={(e) => setScriptChanged(e.target.value)}
              disabled={isUpdating || isDoctoring}
              placeholder={placeholderText}
              className="w-full h-full min-h-[320px] p-4 pr-12 bg-[#0b0f19] border border-gray-700/80 rounded-xl text-white text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 mono-font transition-all"
            />
            {/* Gemini Script Doctor button in the top right corner */}
            <button
              onClick={handleDoctorScript}
              disabled={isDoctoring || isUpdating || !script.script}
              title="change the script with Gemini"
              className="absolute top-3 right-3 p-2 bg-gradient-to-br from-purple-600/30 via-indigo-600/30 to-blue-600/30 hover:from-purple-600/60 hover:to-indigo-600/60 border border-purple-500/40 hover:border-purple-400/80 rounded-lg text-purple-200 hover:text-white shadow-lg backdrop-blur-sm transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed group z-10"
            >
              {isDoctoring ? (
                <Loader2 className="w-4 h-4 animate-spin text-purple-300" />
              ) : (
                <Sparkles className="w-4 h-4 text-purple-300 group-hover:rotate-12 group-hover:scale-110 transition-transform duration-200" />
              )}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>Word count: {scriptChanged ? scriptChanged.trim().split(/\s+/).length : 0} words</span>
            <span>Character count: {scriptChanged.length}</span>
          </div>

          {/* Under-the-box Controls: Column E, Column F and Update Button */}
          <div className="mt-5 pt-4 border-t border-gray-800/80 flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Column E Checkbox: script_ready */}
              <label
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  hasScriptChanged || scriptChanged.trim().length > 0
                    ? 'bg-[#0b0f19] border-gray-700 hover:border-gray-600 cursor-pointer'
                    : 'bg-[#0b0f19]/40 border-gray-800/60 opacity-50 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  checked={scriptReady}
                  onChange={(e) => setScriptReady(e.target.checked)}
                  disabled={isUpdating || (!hasScriptChanged && scriptChanged.trim().length === 0)}
                  className="w-4 h-4 rounded text-emerald-600 bg-gray-900 border-gray-700 focus:ring-emerald-500 focus:ring-offset-gray-900"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-200">
                    Column E: script_ready
                  </span>
                  <span className="text-[11px] text-gray-400">
                    Mark script finalized for production
                  </span>
                </div>
              </label>

              {/* Column F Date Input: script_date (DD/MM/YY) */}
              <div
                className={`flex flex-col p-3 rounded-xl border transition-all ${
                  hasScriptChanged || scriptChanged.trim().length > 0
                    ? 'bg-[#0b0f19] border-gray-700'
                    : 'bg-[#0b0f19]/40 border-gray-800/60 opacity-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    Column F: script_date
                  </span>
                  <span className="text-[10px] text-gray-500 mono-font">DD/MM/YY</span>
                </div>
                <input
                  type="text"
                  value={scriptDate}
                  onChange={(e) => setScriptDate(e.target.value)}
                  placeholder="31/01/26"
                  maxLength={10}
                  disabled={isUpdating || (!hasScriptChanged && scriptChanged.trim().length === 0)}
                  className="w-full px-2 py-1 bg-gray-900/90 border border-gray-700 rounded-lg text-xs font-semibold text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 mono-font"
                />
              </div>
            </div>

            {/* Submit Update Button */}
            <button
              onClick={handleSave}
              disabled={!isSaveEnabled}
              className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition-all duration-150 ${
                isSaveEnabled
                  ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white cursor-pointer shadow-emerald-950/50'
                  : 'bg-gray-800/60 text-gray-500 cursor-not-allowed border border-gray-800'
              }`}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Updating Google Sheet in place...</span>
                </>
              ) : isDoctoring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-300" />
                  <span>Doctoring script with Gemini...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>
                    {hasScriptChanged
                      ? `Send Update to Column D (${script.ID})`
                      : 'No Changes to Save (Button Inactive)'}
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

