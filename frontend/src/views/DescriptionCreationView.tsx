import React, { useState, useEffect } from 'react';
import { Sparkles, PenTool, Copy, Check, Save, Loader2, AlertCircle, RefreshCw, FileText, ExternalLink } from 'lucide-react';
import { ScriptRecord } from '../types';
import { updateDescriptionField, generateGeminiDescription } from '../services/api';

interface DescriptionCreationViewProps {
  script: ScriptRecord | null;
  onScriptUpdated: (updated: ScriptRecord) => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export const DescriptionCreationView: React.FC<DescriptionCreationViewProps> = ({
  script,
  onScriptUpdated,
  onError,
  onSuccess,
}) => {
  const [copied, setCopied] = useState(false);
  const [initialDescription, setInitialDescription] = useState('');
  const [description, setDescription] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [manualModeActive, setManualModeActive] = useState(false);
  const [geminiResult, setGeminiResult] = useState<string | null>(null);

  // Sync state when script changes
  useEffect(() => {
    if (script) {
      const initialVal = script.short_description || '';
      setInitialDescription(initialVal);
      setDescription(initialVal);
      setManualModeActive(false);
      setGeminiResult(null);
    }
  }, [script?.ID]);

  if (!script) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center bg-[#131b2e]/50 border border-gray-800/80 rounded-2xl">
        <Sparkles className="w-12 h-12 text-gray-600 mb-3" />
        <h3 className="text-lg font-bold text-gray-300">No Script Selected</h3>
        <p className="text-sm text-gray-500 max-w-md mt-1">
          Use the search bar above with a canonical ID (e.g. <span className="mono-font text-indigo-400 font-semibold">EE01</span>, <span className="mono-font text-indigo-400 font-semibold">FG03</span>) to inspect or create its YouTube Shorts description.
        </p>
      </div>
    );
  }

  // Check if existing Column I has content
  const hasExistingDescription = Boolean(initialDescription && initialDescription.trim().length > 0);
  const hasChanged = description !== initialDescription && description.trim().length > 0;
  const isSaveEnabled = (hasChanged || (geminiResult !== null && description.trim().length > 0)) && !isUpdating;

  const handleCopy = async (textToCopy: string) => {
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError('Failed to copy description to clipboard.');
    }
  };

  const handleSaveDescription = async () => {
    if (!description.trim() || isUpdating) return;
    setIsUpdating(true);

    try {
      await updateDescriptionField({
        script_id: script.ID,
        short_description: description.trim(),
      });

      const updated: ScriptRecord = {
        ...script,
        short_description: description.trim(),
      };
      setInitialDescription(description.trim());
      onScriptUpdated(updated);
      onSuccess(`Successfully saved Column I (short_description) for ${script.ID} in Google Sheet!`);
    } catch (err: any) {
      onError(err.message || 'Failed to update description in Google Sheet.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleGeminiGenerate = async () => {
    // Column D check: must not be empty
    if (!script.SCRIPT_CHANGED || !script.SCRIPT_CHANGED.trim()) {
      onError(
        'Column D (SCRIPT_CHANGED) is required to generate a description. Please finalize the script first in the Script Auditor tab before using Gemini.'
      );
      return;
    }

    setIsGenerating(true);
    try {
      const res = await generateGeminiDescription({
        script_id: script.ID,
        expression: script.expression,
        script_changed: script.SCRIPT_CHANGED,
      });

      setGeminiResult(res.short_description);
      setDescription(res.short_description);
      onSuccess(`Gemini generated SEO description (${res.word_count} words, ${res.hashtags.length} hashtags)`);
    } catch (err: any) {
      onError(err.message || 'Gemini generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Determine which UI mode to render
  const showInitialEmptyChoice = !hasExistingDescription && !manualModeActive && geminiResult === null;

  return (
    <div className="space-y-6">
      {/* Target Expression & ID Header Label */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#131b2e] border border-gray-800 p-4 rounded-xl shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold uppercase bg-indigo-950 text-indigo-400 border border-indigo-800 mono-font">
              {script.language} • {script.video_type}
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/80">
              YouTube Shorts SEO
            </span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1">
            Editing <span className="text-indigo-400 mono-font font-extrabold">{script.ID}</span>: <span className="text-gray-200">"{script.expression || 'No Expression Label'}"</span>
          </h2>
        </div>

        {script.sheet_url && (
          <a
            href={script.sheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
          >
            <span>View in Google Sheet</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* CASE A: Column I is Empty & No Choice made yet */}
      {showInitialEmptyChoice ? (
        <div className="bg-[#131b2e] border border-gray-800 rounded-2xl p-10 shadow-2xl flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center text-indigo-400 mb-4 shadow-lg shadow-indigo-950/50">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white">No Short Description Found in Column I</h3>
          <p className="text-sm text-gray-400 max-w-lg mt-2 mb-8">
            This script has no YouTube Shorts description yet. Choose an option below to create an authentic, high-CTR description:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-xl">
            {/* Option 1: Manual Creation */}
            <button
              onClick={() => setManualModeActive(true)}
              className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-gray-900 to-[#111827] hover:from-gray-800 hover:to-[#162032] border border-gray-700/80 hover:border-indigo-500/60 rounded-2xl transition-all duration-150 group shadow-lg"
            >
              <div className="w-12 h-12 rounded-xl bg-gray-800 group-hover:bg-indigo-950/80 text-gray-300 group-hover:text-indigo-400 flex items-center justify-center mb-3 transition-colors">
                <PenTool className="w-6 h-6" />
              </div>
              <span className="font-bold text-sm text-white">Create a New Description</span>
              <span className="text-xs text-gray-400 mt-1">Write your own custom SEO copy</span>
            </button>

            {/* Option 2: Gemini AI Creation */}
            <button
              onClick={handleGeminiGenerate}
              disabled={isGenerating}
              className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-indigo-950/60 to-[#1e1b4b]/60 hover:from-indigo-900/70 hover:to-[#2e1065]/70 border border-indigo-700/80 hover:border-indigo-400 rounded-2xl transition-all duration-150 group shadow-lg shadow-indigo-950/40 relative overflow-hidden"
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-900/80 group-hover:bg-indigo-600 text-indigo-300 group-hover:text-white flex items-center justify-center mb-3 transition-colors shadow-md">
                {isGenerating ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Sparkles className="w-6 h-6" />
                )}
              </div>
              <span className="font-bold text-sm text-white">Gemini Creation</span>
              <span className="text-xs text-indigo-300/80 mt-1">
                {isGenerating ? 'Synthesizing with AI...' : 'Format-specific, zero spoilers & 3-5 tags'}
              </span>
            </button>
          </div>

          {!script.SCRIPT_CHANGED && (
            <div className="mt-6 flex items-center gap-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 px-4 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Note: Column D (SCRIPT_CHANGED) is currently empty. Gemini creation requires a finalized script.</span>
            </div>
          )}
        </div>
      ) : (
        /* CASE B: Column I has content OR Gemini just created output OR Manual Mode Active */
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Read-Only Version (Existing Column I or Gemini Raw Output) */}
            <div className="flex flex-col bg-[#131b2e] border border-gray-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span>
                  <h3 className="font-bold text-sm text-gray-300">
                    {geminiResult ? 'Gemini Generated Description' : 'Column I: Current Description'}{' '}
                    <span className="text-xs text-gray-500 font-normal">(Read-Only)</span>
                  </h3>
                </div>
                <button
                  onClick={() => handleCopy(geminiResult || initialDescription)}
                  disabled={!(geminiResult || initialDescription)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-xs font-semibold text-gray-300 rounded-lg transition-colors"
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

              <div className="relative flex-1 min-h-[260px]">
                <textarea
                  readOnly
                  value={geminiResult || initialDescription || '(No description previously saved)'}
                  className="w-full h-full min-h-[260px] p-4 bg-[#0b0f19] border border-gray-800 rounded-xl text-gray-300 text-sm leading-relaxed resize-none focus:outline-none mono-font selection:bg-purple-500/30 cursor-text"
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>
                  Word count: {(geminiResult || initialDescription || '').trim().split(/\s+/).filter(Boolean).length} words
                </span>
                <span>Character count: {(geminiResult || initialDescription || '').length}</span>
              </div>
            </div>

            {/* Right Column: Editable Column I Description */}
            <div className="flex flex-col bg-[#131b2e] border border-gray-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${hasChanged ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                  <h3 className="font-bold text-sm text-gray-200">
                    Column I: Description to Save <span className="text-xs text-indigo-400 font-normal">(Editable)</span>
                  </h3>
                </div>
                {hasChanged && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                    Unsaved Edits
                  </span>
                )}
              </div>

              <div className="relative flex-1 min-h-[260px]">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isUpdating}
                  placeholder="Enter or refine the YouTube Shorts description for Column I..."
                  className="w-full h-full min-h-[260px] p-4 bg-[#0b0f19] border border-gray-700/80 rounded-xl text-white text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 mono-font transition-all"
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>Word count: {description.trim().split(/\s+/).filter(Boolean).length} words</span>
                <span>Character count: {description.length}</span>
              </div>

              {/* Action Buttons under right box */}
              <div className="mt-5 pt-4 border-t border-gray-800 flex flex-col sm:flex-row items-center gap-3">
                {/* Re-Generate with Gemini Button */}
                <button
                  type="button"
                  onClick={handleGeminiGenerate}
                  disabled={isGenerating || isUpdating || !script.SCRIPT_CHANGED}
                  className="w-full sm:w-auto px-4 py-3 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                  title="Generate a new description with Gemini"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-300" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-indigo-300" />
                  )}
                  <span>Re-run Gemini</span>
                </button>

                {/* Save to Column I Button */}
                <button
                  type="button"
                  onClick={handleSaveDescription}
                  disabled={!isSaveEnabled}
                  className={`flex-1 w-full py-3 px-6 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition-all duration-150 ${
                    isSaveEnabled
                      ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white cursor-pointer shadow-indigo-950/50'
                      : 'bg-gray-800/60 text-gray-500 cursor-not-allowed border border-gray-800'
                  }`}
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Saving to Column I in Google Sheet...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>
                        {hasChanged || geminiResult !== null
                          ? `Send Description to Column I (${script.ID})`
                          : 'No Changes to Save'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
