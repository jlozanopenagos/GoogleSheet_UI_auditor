import React, { useState, useEffect } from 'react';
import { Sparkles, PenTool, Copy, Check, Save, Loader2, AlertCircle, RefreshCw, ExternalLink, Type } from 'lucide-react';
import { ScriptRecord } from '../types';
import { updateDescriptionField, updateTitleField, generateGeminiDescription } from '../services/api';

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
  const [showReference, setShowReference] = useState(false);
  const [copied, setCopied] = useState(false);
  const [initialDescription, setInitialDescription] = useState('');
  const [description, setDescription] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [manualModeActive, setManualModeActive] = useState(false);
  const [geminiResult, setGeminiResult] = useState<string | null>(null);
  const [initialTitle, setInitialTitle] = useState('');
  const [shortTitle, setShortTitle] = useState('');
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  const [titleCopied, setTitleCopied] = useState(false);

  // Reset transient mode flags when switching script ID
  useEffect(() => {
    if (script) {
      setManualModeActive(false);
      setGeminiResult(null);
      setTitleCopied(false);
    }
  }, [script?.ID]);

  // Sync Column I description when ID or fetched description changes
  useEffect(() => {
    if (script) {
      const initialVal = script.short_description || '';
      setInitialDescription(initialVal);
      setDescription(initialVal);
    }
  }, [script?.ID, script?.short_description]);

  // Sync Column J title when ID or fetched title changes
  useEffect(() => {
    if (script) {
      const initialTitleVal = script.short_title || '';
      setInitialTitle(initialTitleVal);
      setShortTitle(initialTitleVal);
    }
  }, [script?.ID, script?.short_title]);

  if (!script) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center bg-brand-surface/70 border border-brand-border rounded-2xl shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-brand-card flex items-center justify-center mb-4 border border-brand-border">
          <Sparkles className="w-8 h-8 text-brand-amethyst" />
        </div>
        <h3 className="text-lg font-bold text-white tracking-tight">No script selected</h3>
        <p className="text-sm text-brand-ice/60 max-w-md mt-1">
          Use the search bar above with a script ID (such as <span className="mono-font text-brand-sky font-semibold">EE01</span> or <span className="mono-font text-brand-sky font-semibold">FG03</span>) to inspect or edit its title and YouTube Shorts description.
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

  // Check if existing Column I has content
  const hasExistingDescription = Boolean(initialDescription && initialDescription.trim().length > 0);
  const hasChanged = description !== initialDescription && description.trim().length > 0;
  const isSaveEnabled = (hasChanged || (geminiResult !== null && description.trim().length > 0)) && !isUpdating;

  // Column J (Short Title) derived state
  const hasExistingTitle = initialTitle.trim().length > 0;
  const trimmedTitle = shortTitle.trim();
  const hasTitleChanged = trimmedTitle !== initialTitle.trim();
  const isTitleSaveEnabled = hasTitleChanged && trimmedTitle.length > 0 && !isUpdatingTitle;
  const titleCharCount = shortTitle.length;

  const handleCopyTitle = async () => {
    if (!trimmedTitle) return;
    try {
      await navigator.clipboard.writeText(trimmedTitle);
      setTitleCopied(true);
      setTimeout(() => setTitleCopied(false), 2000);
    } catch {
      onError('Failed to copy title to clipboard.');
    }
  };

  const handleSaveTitle = async () => {
    if (!trimmedTitle || !hasTitleChanged || isUpdatingTitle) return;
    setIsUpdatingTitle(true);

    try {
      await updateTitleField({
        script_id: script.ID,
        short_title: trimmedTitle,
      });

      const updated: ScriptRecord = {
        ...script,
        short_title: trimmedTitle,
      };
      setInitialTitle(trimmedTitle);
      setShortTitle(trimmedTitle);
      onScriptUpdated(updated);
      onSuccess(`Successfully saved YouTube Shorts title for ${script.ID} to Column J in Google Sheets.`);
    } catch (err: any) {
      onError(err.message || 'Failed to update title in Google Sheet.');
    } finally {
      setIsUpdatingTitle(false);
    }
  };

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
      onSuccess(`Successfully saved YouTube Shorts description for ${script.ID} to Column I in Google Sheets.`);
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
        'Column D (script revision) is required to generate a description. Please finalize the script first in the Script auditor tab before using Gemini.'
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
      onSuccess(`Gemini generated SEO description (${res.word_count} words, ${res.hashtags.length} hashtags). Click 'Save description' to apply.`);
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-brand-surface border border-brand-border p-4.5 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-brand-card text-brand-sky border border-brand-border mono-font">
              {formatTag(script)}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-brand-card text-brand-amethyst border border-brand-border">
              YouTube Shorts SEO
            </span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1.5 tracking-tight">
            Editing <span className="text-brand-sky mono-font font-extrabold">{script.ID}</span> · <span className="text-slate-200 font-medium">"{script.expression || 'No expression label'}"</span>
          </h2>
        </div>

        {script.sheet_url && (
          <a
            href={script.sheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-brand-sky hover:text-white bg-brand-card border border-brand-border px-3 py-1.5 rounded-xl hover:border-brand-sky transition-colors font-semibold"
          >
            <span>Open in Google Sheet</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Short Title · Column J Card */}
      <div className="bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-brand-border">
          <div className="flex flex-wrap items-center gap-2">
            <Type className="w-4 h-4 text-brand-sky" />
            <h3 className="font-bold text-sm text-white">
              Short title
            </h3>
            {hasExistingTitle ? (
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Title saved
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                No saved title
              </span>
            )}
            {hasTitleChanged && (
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-brand-wine text-brand-ice border border-brand-mulberry">
                Unsaved edits
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyTitle}
            disabled={!trimmedTitle}
            className="flex items-center gap-1.5 px-3 py-1 bg-brand-card hover:bg-brand-wine/70 border border-brand-border/60 hover:border-brand-amethyst/60 disabled:opacity-40 text-xs font-semibold text-brand-ice rounded-lg transition-colors"
          >
            {titleCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-brand-sky" />
                <span className="text-brand-sky">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy title</span>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="text"
            aria-label="Short title"
            value={shortTitle}
            onChange={(e) => setShortTitle(e.target.value)}
            disabled={isUpdatingTitle}
            placeholder="Enter a YouTube Shorts title"
            className="flex-1 px-4 py-2.5 bg-brand-input border border-brand-border focus:border-brand-sky rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky/40 transition-all"
          />
          <button
            type="button"
            onClick={handleSaveTitle}
            disabled={!isTitleSaveEnabled}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all duration-200 whitespace-nowrap ${
              isTitleSaveEnabled
                ? 'bg-gradient-to-r from-brand-sky via-brand-amethyst to-brand-mulberry hover:opacity-95 text-white cursor-pointer shadow-brand-mulberry/30'
                : 'bg-brand-card/60 text-brand-ice/65 cursor-not-allowed border border-brand-border'
            }`}
          >
            {isUpdatingTitle ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save title</span>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-brand-ice/60">
          <span className="truncate max-w-xl">
            {hasExistingTitle ? (
              <>Current in sheet: <span className="text-brand-ice/90 font-medium">"{initialTitle}"</span></>
            ) : (
              'Enter a title to save it.'
            )}
          </span>
          <span className={`mono-font font-semibold ${titleCharCount > 100 ? 'text-amber-400' : 'text-brand-ice/75'}`}>
            {titleCharCount} / 100 chars{titleCharCount > 100 ? ' (exceeds YouTube 100-char limit)' : ''}
          </span>
        </div>
      </div>

      {/* CASE A: Column I is Empty & No Choice made yet */}
      {showInitialEmptyChoice ? (
        <div className="bg-brand-surface border border-brand-border rounded-2xl p-10 shadow-2xl flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-card border border-brand-amethyst/50 flex items-center justify-center text-brand-sky mb-4 shadow-lg shadow-black/30">
            <Sparkles className="w-8 h-8 text-brand-ice" />
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">No saved description</h3>
          <p className="text-sm text-brand-ice/70 max-w-lg mt-2 mb-8">
            This script has no YouTube Shorts description yet. Choose an option below to create an authentic, high-retention description:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-xl">
            {/* Option 1: Manual Creation */}
            <button
              onClick={() => setManualModeActive(true)}
              className="flex flex-col items-center justify-center p-6 bg-brand-card hover:bg-brand-wine/60 border border-brand-border hover:border-brand-amethyst/80 rounded-2xl transition-all duration-200 group shadow-lg"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-surface group-hover:bg-brand-wine text-brand-ice flex items-center justify-center mb-3 transition-colors">
                <PenTool className="w-6 h-6 text-brand-sky" />
              </div>
              <span className="font-bold text-sm text-white">Write description manually</span>
              <span className="text-xs text-brand-ice/60 mt-1">Craft your own custom SEO copy</span>
            </button>

            {/* Option 2: Gemini AI Creation */}
            <button
              onClick={handleGeminiGenerate}
              disabled={isGenerating}
              className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-brand-wine/60 to-brand-card hover:from-brand-mulberry/50 hover:to-brand-card border border-brand-mulberry hover:border-brand-sky rounded-2xl transition-all duration-200 group shadow-lg shadow-brand-mulberry/25 relative overflow-hidden"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-wine text-brand-ice flex items-center justify-center mb-3 transition-colors shadow-md">
                {isGenerating ? (
                  <Loader2 className="w-6 h-6 animate-spin text-brand-sky" />
                ) : (
                  <Sparkles className="w-6 h-6 text-brand-sky" />
                )}
              </div>
              <span className="font-bold text-sm text-white">Generate with Gemini</span>
              <span className="text-xs text-brand-ice/70 mt-1">
                {isGenerating ? 'Synthesizing with Gemini...' : 'Format-specific, zero spoilers & 3-5 tags'}
              </span>
            </button>
          </div>

          {!script.SCRIPT_CHANGED && (
            <div className="mt-6 flex items-center gap-2.5 text-xs text-brand-ice bg-brand-wine/70 border border-brand-mulberry px-4 py-2.5 rounded-xl">
              <AlertCircle className="w-4 h-4 text-brand-sky shrink-0" />
              <span>Note: Column D (script revision) is currently empty. Gemini creation requires a finalized script.</span>
            </div>
          )}
        </div>
      ) : (
        /* CASE B: Column I has content OR Gemini just created output OR Manual Mode Active */
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
            {/* Left Column: Read-Only Version (Existing Column I or Gemini Raw Output) */}
            <button type="button" className="lg:hidden order-2 w-fit px-3 py-2 text-sm font-semibold text-brand-sky" aria-expanded={showReference} aria-controls="editor-reference" onClick={() => setShowReference(!showReference)}>
              {showReference ? 'Hide reference description' : 'Show reference description'}
            </button>
            <div id="editor-reference" className={`${showReference ? 'flex' : 'hidden'} lg:flex order-3 lg:order-none min-w-0 flex-col border border-brand-border rounded-xl p-4`}>
              <div className="flex items-center justify-between pb-3 border-b border-brand-border mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-amethyst"></span>
                  <h3 className="font-bold text-sm text-brand-ice">
                    {geminiResult ? 'Gemini generated description' : 'Current description'}{' '}
                    <span className="text-xs text-brand-ice/75 font-normal">(read-only)</span>
                  </h3>
                </div>
                <button
                  onClick={() => handleCopy(geminiResult || initialDescription)}
                  disabled={!(geminiResult || initialDescription)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-brand-card hover:bg-brand-wine/70 border border-brand-border/60 hover:border-brand-amethyst/60 disabled:opacity-40 text-xs font-semibold text-brand-ice rounded-lg transition-colors"
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

              <div className="relative flex-1 min-h-[220px]">
                <textarea
                  readOnly
                  value={geminiResult || initialDescription || '(No description previously saved)'}
                  className="w-full h-full min-h-[220px] p-4 bg-brand-input border border-brand-border rounded-xl text-brand-ice/90 text-sm leading-relaxed resize-y focus:outline-none selection:bg-brand-amethyst/40 cursor-text"
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-brand-ice/75">
                <span>
                  Word count: {(geminiResult || initialDescription || '').trim().split(/\s+/).filter(Boolean).length} words
                </span>
                <span>Character count: {(geminiResult || initialDescription || '').length}</span>
              </div>
            </div>

            {/* Right Column: Editable Column I Description */}
            <div className="flex min-w-0 flex-col bg-brand-surface border border-brand-border rounded-xl p-4">
              <div className="flex items-center justify-between pb-3 border-b border-brand-border mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${hasChanged ? 'bg-brand-sky animate-pulse' : 'bg-brand-amethyst'}`}></span>
                  <h3 className="font-bold text-sm text-white">
                    Description <span className="text-xs text-brand-sky font-normal">(editable)</span>
                  </h3>
                </div>
                {hasChanged && (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-brand-wine text-brand-ice border border-brand-mulberry">
                    Unsaved edits
                  </span>
                )}
              </div>

              <div className="relative flex-1 min-h-[220px]">
                <textarea
                  aria-label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isUpdating}
                  placeholder="Write a YouTube Shorts description…"
                  className="w-full h-full min-h-[220px] p-4 bg-brand-input border border-brand-border focus:border-brand-sky rounded-xl text-white text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand-sky/40 transition-all"
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-brand-ice/75">
                <span>Word count: {description.trim().split(/\s+/).filter(Boolean).length} words</span>
                <span>Character count: {description.length}</span>
              </div>

              {/* Action Buttons under right box */}
              <div className="editor-actions sticky bottom-0 z-20 mt-3 py-2 bg-brand-surface border-t border-brand-border flex flex-wrap items-center gap-2">
                <p role="status" className="w-full text-xs text-brand-ice/80">{hasChanged || geminiResult !== null ? 'Unsaved changes' : 'No unsaved changes'}</p>
                <button
                  type="button"
                  onClick={handleGeminiGenerate}
                  disabled={isGenerating || isUpdating || !script.SCRIPT_CHANGED}
                  className="w-full sm:w-auto px-4 py-3 bg-brand-card hover:bg-brand-wine/70 border border-brand-border hover:border-brand-amethyst text-brand-ice rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                  title="Generate a new description with Gemini"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin text-brand-sky" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-brand-sky" />
                  )}
                  <span>Regenerate with Gemini</span>
                </button>

                {/* Save to Column I Button */}
                <button
                  type="button"
                  onClick={handleSaveDescription}
                  disabled={!isSaveEnabled}
                  className={`flex-1 w-full py-3 px-6 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition-all duration-200 ${
                    isSaveEnabled
                      ? 'bg-gradient-to-r from-brand-sky via-brand-amethyst to-brand-mulberry hover:opacity-95 text-white cursor-pointer shadow-brand-mulberry/30'
                      : 'bg-brand-card/60 text-brand-ice/65 cursor-not-allowed border border-brand-border'
                  }`}
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Saving description to Google Sheets...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>
                        {hasChanged || geminiResult !== null
                          ? `Save description to Google Sheets (${script.ID})`
                          : 'No changes to save'}
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

