import React, { useState, useCallback } from 'react';

/**
 * CaptionPanel — DeepSeek-Powered Auto-Caption
 * Uses browser-native SpeechRecognition + DeepSeek API for transcription & Khmer translation.
 * API key is managed by the Settings panel in App.jsx and received via props.
 */
export default function CaptionPanel({ videoFile, onCaptionsGenerated, disabled, deepSeekApiKey, deepgramApiKey }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState('');
  const [error, setError] = useState('');
  const [generatedSegments, setGeneratedSegments] = useState(null);

  const apiKey = deepSeekApiKey || '';

  const addLog = useCallback((msg) => {
    setLog((prev) => prev + '\n' + msg);
  }, []);

  const handleStart = useCallback(async () => {
    console.log('[CaptionPanel] Button clicked — handleStart invoked');
    if (!videoFile) {
      console.warn('[CaptionPanel] No video file available — cannot start transcription.');
      return;
    }
    if (!apiKey || !apiKey.trim()) {
      setError('Please enter your DeepSeek API key in the Settings panel above.');
      return;
    }
    console.log('[CaptionPanel] Starting transcription pipeline for:', videoFile.name, '(' + (videoFile.size / 1024 / 1024).toFixed(1) + ' MB)');
    setIsProcessing(true);
    setProgress(0);
    setLog('');
    setError('');
    setGeneratedSegments(null);
    try {
      console.log('[CaptionPanel] Dynamically importing transcriptionService...');
      const { transcribeAndTranslateToKhmer } = await import('../services/transcriptionService.js');
      console.log('[CaptionPanel] Calling transcribeAndTranslateToKhmer...');
      const segments = await transcribeAndTranslateToKhmer(videoFile, {
        apiKey: apiKey.trim(),
        deepgramApiKey: (deepgramApiKey || '').trim(),
        sourceLanguage: '',   // auto-detect
        onProgress: (pct) => setProgress(pct),
        onLog: addLog,
      });
      console.log('[CaptionPanel] Pipeline complete —', segments.length, 'segments generated');
      setGeneratedSegments(segments);
      onCaptionsGenerated(segments);
    } catch (err) {
      console.error('[CaptionPanel] Pipeline failed:', err);
      setError(err.message || 'Auto-Caption failed');
      addLog('Error: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
      console.log('[CaptionPanel] Processing finished (isProcessing = false)');
    }
  }, [videoFile, onCaptionsGenerated, addLog, apiKey]);

  var progressPct = Math.round(progress * 100);

  if (!videoFile) {
    return (
      <div className="caption-panel caption-panel-disabled">
        <div className="caption-local-info">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          <span>Upload a video to enable auto-captioning.</span>
        </div>
        <div className="caption-actions">
          <button className="caption-transcribe-btn" disabled>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg><span>Transcribe &amp; Translate to Khmer</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="caption-panel">
      {/* API Key status — managed in Settings panel above */}
      <div className="caption-api-key-status">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><line x1="7" y1="11" x2="7" y2="7" /><line x1="17" y1="11" x2="17" y2="7" /><line x1="12" y1="11" x2="12" y2="7" />
        </svg>
        <span>
          API Key: {apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : 'Not set — configure in Settings above'}
        </span>
      </div>

      <div className="caption-actions">
        <button className="caption-transcribe-btn" onClick={handleStart}
          disabled={isProcessing || disabled || !apiKey.trim()}>
          {isProcessing ? (
            <><div className="btn-spinner" /><span>{progressPct < 20 ? 'Extracting audio...' : progressPct < 60 ? 'Transcribing... ' + progressPct + '%' : progressPct < 95 ? 'Translating to Khmer... ' + progressPct + '%' : 'Finalizing...'}</span></>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg><span>Transcribe &amp; Translate to Khmer</span></>
          )}
        </button>
      </div>

      {error && (
        <div className="caption-error">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      {isProcessing && progress > 0 && (
        <div className="caption-progress-bar">
          <div className="caption-progress-fill" style={{ width: progressPct + '%' }} />
        </div>
      )}
    </div>
  );
}


