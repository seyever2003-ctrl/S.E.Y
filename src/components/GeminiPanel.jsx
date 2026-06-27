import React, { useState, useCallback, useRef } from 'react';
import { rewriteAllSegments, GEMINI_MODELS } from '../services/geminiService.js';

/**
 * GeminiPanel – Gemini AI Integration UI
 *
 * Props:
 *  - segments: Array of parsed SRT segments
 *  - onSegmentsUpdated: (updatedSegments) => void
 *  - disabled: boolean
 */
export default function GeminiPanel({ segments, onSegmentsUpdated, disabled }) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [mode, setMode] = useState('rewrite');
  const [selectedModel, setSelectedModel] = useState(GEMINI_MODELS[0].id);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [keyValidated, setKeyValidated] = useState(false);

  const abortRef = useRef(null);
  const progressPct = progress
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;


  // ── API Key Validation ──────────────────────────────────────────────────

  const handleValidateKey = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('Please enter a Gemini API key');
      return;
    }
    setError('');
    setSuccessMessage('');
    setIsProcessing(true);
    try {
      const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(testUrl);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API error (${res.status})`);
      }
      setKeyValidated(true);
      setSuccessMessage('API key validated successfully!');
    } catch (err) {
      setError(err.message);
      setKeyValidated(false);
    } finally {
      setIsProcessing(false);
    }
  }, [apiKey, selectedModel]);

  // ── Main Processing ─────────────────────────────────────────────────────

  const handleApplyAI = useCallback(async () => {
    if (!segments?.length) return;
    if (!apiKey.trim()) {
      setError('Please enter your Gemini API key first');
      return;
    }
    setError('');
    setSuccessMessage('');
    setIsProcessing(true);
    setProgress({ completed: 0, total: segments.length });

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const updated = await rewriteAllSegments(segments, apiKey.trim(), {
        mode,
        customPrompt: customPrompt.trim(),
        signal: controller.signal,
        onProgress: (completed, total) => {
          setProgress({ completed, total });
        },
      });
      onSegmentsUpdated(updated);
      setKeyValidated(true);
      setSuccessMessage(
        `AI ${mode === 'rewrite' ? 'rewrite' : 'summarize'} complete! ${segments.length} segments processed.`
      );
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  }, [segments, apiKey, mode, customPrompt, onSegmentsUpdated]);


  // ── Reset / Clear ───────────────────────────────────────────────────────

  const handleResetSegments = useCallback(() => {
    if (!segments?.length) return;
    const reverted = segments.map(seg => {
      if (seg.originalText) {
        return { ...seg, text: seg.originalText, rewritten: false, geminiError: undefined, originalText: undefined };
      }
      return seg;
    });
    onSegmentsUpdated(reverted);
    setSuccessMessage('Reverted to original text');
  }, [segments, onSegmentsUpdated]);

  const hasRewrittenSegments = segments?.some(s => s.rewritten);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="gemini-panel">

      <div className="gemini-field">
        <label className="gemini-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          Gemini API Key
        </label>
        <div className="gemini-input-row">
          <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => { setApiKey(e.target.value); setKeyValidated(false); }} placeholder="Enter your Gemini API key..." disabled={isProcessing} className="gemini-input" />
          <button className="gemini-key-toggle" onClick={() => setShowKey(!showKey)} title={showKey ? 'Hide key' : 'Show key'} type="button">
            {showKey ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {apiKey && !keyValidated && !isProcessing && (
        <button className="gemini-validate-btn" onClick={handleValidateKey} type="button">Validate Key</button>
      )}

      <div className="gemini-select-row">
        <label className="gemini-label">Model</label>
        <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} disabled={isProcessing} className="gemini-select">
          {GEMINI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div className="gemini-mode-row">
        <label className="gemini-label">Mode</label>
        <div className="gemini-mode-toggle">
          <button className={`gemini-mode-btn ${mode === 'rewrite' ? 'active' : ''}`} onClick={() => setMode('rewrite')} disabled={isProcessing} type="button">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg> Rewrite
          </button>
          <button className={`gemini-mode-btn ${mode === 'summarize' ? 'active' : ''}`} onClick={() => setMode('summarize')} disabled={isProcessing} type="button">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg> Summarize
          </button>
        </div>
      </div>

      <button className="gemini-prompt-toggle" onClick={() => setShowPrompt(!showPrompt)} type="button">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {showPrompt ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
        </svg>{showPrompt ? 'Hide' : 'Edit'} custom prompt
      </button>

      {showPrompt && <textarea className="gemini-prompt-textarea" value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="Leave empty to use the default prompt..." disabled={isProcessing} rows={4} />}

      <div className="gemini-actions">
        <button className="gemini-apply-btn" onClick={handleApplyAI} disabled={disabled || isProcessing || !apiKey.trim()} type="button">
          {isProcessing ? (
            <><div className="gemini-spinner" /><span>{mode === 'rewrite' ? 'Rewriting' : 'Summarizing'} {progress?.completed || 0}/{progress?.total || segments?.length || 0}...</span></>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg><span>Apply {mode === 'rewrite' ? 'Rewrite' : 'Summarize'}</span></>
          )}
        </button>
        {hasRewrittenSegments && !isProcessing && (
          <button className="gemini-reset-btn" onClick={handleResetSegments} type="button" title="Revert to original text">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg> Revert
          </button>
        )}
      </div>

      {isProcessing && (
        <div className="gemini-progress-bar"><div className="gemini-progress-fill" style={{ width: `${progressPct}%` }} /></div>
      )}

      {error && <p className="gemini-error">{error}</p>}
      {successMessage && <p className="gemini-success">{successMessage}</p>}

      <p className="gemini-hint">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
        Get a free API key at <strong>aistudio.google.com/apikey</strong>
      </p>

    </div>
  );
}



