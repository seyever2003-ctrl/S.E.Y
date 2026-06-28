import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';

/**
 * CaptionPanel — Auto-Caption with Two Modes:
 *   1. DeepSeek + Translation (requires DeepSeek API key)
 *   2. Local Whisper (no API key — runs 100% in browser via Transformers.js)
 *
 * When "Local Whisper" is used, the extracted audio is fed into a Web Worker
 * that runs the 'openai/whisper-tiny' (or 'base'/'small') model ONNX model
 * entirely on the client. No data leaves the browser.
 */
const CaptionPanel = forwardRef(function CaptionPanel({ videoFile, onCaptionsGenerated, disabled, deepSeekApiKey, deepgramApiKey }, ref) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState('');
  const [error, setError] = useState('');
  const [generatedSegments, setGeneratedSegments] = useState(null);

  const apiKey = deepSeekApiKey || '';

  const addLog = useCallback((msg) => {
    setLog((prev) => prev + '\n' + msg);
  }, []);

  // ── DeepSeek Pipeline (original) ─────────────────────────────────
  const handleDeepSeekTranscribe = useCallback(async () => {
    console.log('[CaptionPanel] DeepSeek pipeline — handleStart invoked');
    if (!videoFile) {
      console.warn('[CaptionPanel] No video file available — cannot start transcription.');
      return;
    }
    if (!apiKey || !apiKey.trim()) {
      setError('Please enter your DeepSeek API key in the Settings panel above.');
      return;
    }
    console.log('[CaptionPanel] Starting DeepSeek pipeline for:', videoFile.name, '(' + (videoFile.size / 1024 / 1024).toFixed(1) + ' MB)');
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
      console.log('[CaptionPanel] DeepSeek pipeline complete —', segments.length, 'segments generated');
      setGeneratedSegments(segments);
      onCaptionsGenerated(segments);
    } catch (err) {
      console.error('[CaptionPanel] DeepSeek pipeline failed:', err);
      setError(err.message || 'Auto-Caption failed');
      addLog('Error: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
      console.log('[CaptionPanel] DeepSeek processing finished');
    }
  }, [videoFile, onCaptionsGenerated, addLog, apiKey, deepgramApiKey]);

  // ── Local Whisper Pipeline (new — no API key needed) ─────────────
  const handleLocalWhisper = useCallback(async () => {
    console.log('[CaptionPanel] Local Whisper pipeline started');
    if (!videoFile) {
      console.warn('[CaptionPanel] No video file available.');
      return;
    }
    setIsProcessing(true);
    setProgress(0);
    setLog('');
    setError('');
    setGeneratedSegments(null);
    addLog('═══════════════════════════════════════════');
    addLog('  Local Whisper — 100% Browser STT');
    addLog('  Model: openai/whisper-tiny');
    addLog('  No API key required.');
    addLog('═══════════════════════════════════════════');

    try {
      // Step 1: Extract audio via OfflineAudioContext (fast, no real-time)
      addLog(''); addLog('Step 1/3: Extracting audio from video...');
      var { extractAudio } = await import('../services/transcriptionService.js');
      var audioBlob = await extractAudio(videoFile, {
        onLog: addLog,
        onProgress: function (pct) {
          // extractAudio reports 0–0.15; map to 0–0.25
          setProgress(pct * 1.67);
        },
      });
      setProgress(0.25);
      addLog('Audio extracted: ' + (audioBlob.size / 1024 / 1024).toFixed(1) + ' MB');

      // Step 2: Transcribe locally with Whisper (tiny model)
      addLog(''); addLog('Step 2/3: Transcribing with Whisper (tiny model)...');
      addLog('  ⏳ First run downloads the model (~150 MB).');
      addLog('  ⏳ Subsequent runs are instant (cached).');
      var { transcribeLocallyToSegments } = await import('../services/localTranscriptionService.js');
      var segments = await transcribeLocallyToSegments(audioBlob, {
        modelSize: 'tiny',
        language: '',  // auto-detect language
        onLog: addLog,
        onProgress: function (pct) {
          // Worker reports 0–1; map to 0.25–0.95
          setProgress(0.25 + pct * 0.7);
        },
      });
      setProgress(0.95);
      addLog(''); addLog('Step 3/3: Finalizing segments...');

      // Step 3: Validate and pass segments to parent
      if (!segments || segments.length === 0) {
        throw new Error('Whisper returned no segments. The audio may be silent or empty.');
      }
      addLog('✓ ' + segments.length + ' segments generated via Local Whisper!');
      addLog('═══════════════════════════════════════');
      setGeneratedSegments(segments);
      onCaptionsGenerated(segments);
      setProgress(1.0);
    } catch (err) {
      console.error('[CaptionPanel] Local Whisper failed:', err);
      setError(err.message || 'Local transcription failed');
      addLog('Error: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
      console.log('[CaptionPanel] Local Whisper processing finished');
    }
  }, [videoFile, onCaptionsGenerated, addLog]);

  // Expose startCaptions() so parent can auto-trigger on video drop
  useImperativeHandle(ref, () => ({
    startCaptions: () => {
      if (!isProcessing && videoFile) handleDeepSeekTranscribe();
    },
  }), [isProcessing, videoFile, handleDeepSeekTranscribe]);

  var progressPct = Math.round(progress * 100);

  return (
    <div className="caption-panel">
      {/* Two modes */}
      <div className="caption-mode-row">
        <button className="caption-mode-btn caption-mode-local"
          onClick={handleLocalWhisper}
          disabled={isProcessing || disabled}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <span>Local Whisper (No API Key)</span>
        </button>
      </div>

      {isProcessing && (
        <div className="caption-warning">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>First run downloads the Whisper model (~150 MB, one-time).</span>
        </div>
      )}

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
});

export default CaptionPanel;