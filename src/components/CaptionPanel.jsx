import React, { useState, useCallback } from 'react';

/**
 * CaptionPanel — Local Auto-Caption Workflow
 * Fully local speech-to-text + translation pipeline:
 *   1. Extract audio from video (FFmpeg.wasm)
 *   2. Transcribe with Whisper (Transformers.js Web Worker)
 *   3. Translate to Khmer (NLLB-200 Transformers.js Web Worker)
 * No API keys needed. CSP-compatible via importScripts in blob workers.
 */
export default function CaptionPanel({ videoFile, onCaptionsGenerated, disabled }) {
  var [sourceLanguage, setSourceLanguage] = useState('');
  var [modelSize, setModelSize] = useState('small');
  var [isProcessing, setIsProcessing] = useState(false);
  var [progress, setProgress] = useState(0);
  var [log, setLog] = useState('');
  var [error, setError] = useState('');
  var [generatedSegments, setGeneratedSegments] = useState(null);

  var addLog = useCallback(function (msg) {
    setLog(function (prev) { return prev + '\n' + msg; });
  }, []);

  var handleStart = useCallback(async function () {
    if (!videoFile) {
      console.warn('CaptionPanel: No video file available — cannot start transcription.');
      return;
    }
    setIsProcessing(true);
    setProgress(0);
    setLog('');
    setError('');
    setGeneratedSegments(null);
    try {
      var { transcribeAndTranslateToKhmer } = await import('../services/transcriptionService.js');
      var segments = await transcribeAndTranslateToKhmer(videoFile, {
        sourceLanguage: sourceLanguage,
        modelSize: modelSize,
        onProgress: function (pct) { setProgress(pct); },
        onLog: addLog,
      });
      setGeneratedSegments(segments);
      onCaptionsGenerated(segments);
    } catch (err) {
      console.error('Auto-Caption failed:', err);
      setError(err.message || 'Auto-Caption failed');
      addLog('Error: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  }, [videoFile, sourceLanguage, modelSize, onCaptionsGenerated, addLog]);

  var progressPct = Math.round(progress * 100);

  if (!videoFile) {
    return (
      <div className="caption-panel caption-panel-disabled">
        <div className="caption-row">
          <label className="caption-label">Source Language</label>
          <select className="caption-select" disabled>
            <option value="">Auto-detect</option>
          </select>
        </div>
        <div className="caption-row">
          <label className="caption-label">Whisper Model</label>
          <select className="caption-select" disabled>
            <option value="small">Small (Best accuracy)</option>
          </select>
        </div>
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
      <div className="caption-row">
        <label className="caption-label">Source Language</label>
        <select className="caption-select" value={sourceLanguage} onChange={function (e) { setSourceLanguage(e.target.value); }} disabled={isProcessing}>
          <option value="">Auto-detect</option>
          <option value="en">English</option>
          <option value="zh">Chinese</option>
          <option value="th">Thai</option>
          <option value="vi">Vietnamese</option>
          <option value="ja">Japanese</option>
          <option value="ko">Korean</option>
          <option value="km">Khmer (no translation)</option>
        </select>
      </div>
      <div className="caption-row">
        <label className="caption-label">Whisper Model</label>
        <select className="caption-select" value={modelSize} onChange={function (e) { setModelSize(e.target.value); }} disabled={isProcessing}>
          <option value="tiny">Tiny (Fastest)</option>
          <option value="base">Base (Balanced)</option>
          <option value="small">Small (Best accuracy)</option>
        </select>
      </div>
      <div className="caption-local-info">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        <span>Fully local. No API keys. Works offline after caching.</span>
      </div>
      <div className="caption-actions">
        <button className="caption-transcribe-btn" onClick={handleStart} disabled={isProcessing || disabled}>
          {isProcessing ? (
            <><div className="btn-spinner" /><span>{progressPct < 25 ? 'Extracting audio...' : progressPct < 60 ? 'Transcribing... ' + progressPct + '%' : progressPct < 95 ? 'Translating to Khmer... ' + progressPct + '%' : 'Finalizing...'}</span></>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg><span>Transcribe &amp; Translate to Khmer</span></>
          )}
        </button>
      </div>
      {isProcessing && progress > 0 && (
        <div className="caption-progress-bar">
          <div className="caption-progress-fill" style={{ width: progressPct + '%' }} />
        </div>
      )}
    </div>
  );
}


