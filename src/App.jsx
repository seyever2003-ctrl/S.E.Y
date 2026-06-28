import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Sun, Moon, Settings as SettingsIcon } from 'lucide-react';
import Timeline from './components/Timeline.jsx';
import ApiKeyPanel from './components/ApiKeyPanel.jsx';
import GeminiPanel from './components/GeminiPanel.jsx';
import VideoUploader from './components/VideoUploader.jsx';
import CaptionPanel from './components/CaptionPanel.jsx';
import TranslatePanel from './components/TranslatePanel.jsx';
import LogoOverlay from './components/LogoOverlay.jsx';
import VideoPlayerWithLogo from './components/VideoPlayerWithLogo.jsx';

import SettingsModal from './components/SettingsModal.jsx';
import useLogoOverlay from './hooks/useLogoOverlay.js';
import { synthesizeAll, decodeAll, clearCache, speakAllSegments, stopBrowserSpeech, getProvider, PROVIDERS } from './services/ttsService.js';
import { mergeAudioVideo, isFFmpegLoaded, terminateFFmpeg } from './services/videoMerger.js';
import { audioBufferToWavBlob } from './utils/srtParser.js';

export default function App() {
  const [segments, setSegments] = useState([]);
  const [processedSegments, setProcessedSegments] = useState([]);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);
  const [ttsAudioBuffers, setTtsAudioBuffers] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [ttsProgress, setTtsProgress] = useState(null);
  const [ttsError, setTtsError] = useState('');
  const [ttsMode, setTtsMode] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState(PROVIDERS[0].id);

  // ── Theme state ──────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('appvro-theme');
    return saved !== null ? saved === 'dark' : true; // default to dark
  });

  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', !darkMode);
    localStorage.setItem('appvro-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const handleToggleTheme = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  // ── Settings modal state ─────────────────────────────────────────────
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const handleOpenSettings = useCallback(() => setShowSettingsModal(true), []);
  const handleCloseSettings = useCallback(() => setShowSettingsModal(false), []);

  // ── API Key state (persisted in localStorage) ────────────────────────
  const [deepSeekApiKey, setDeepSeekApiKey] = useState(() => {
    return localStorage.getItem('appvro-deepseek-key') || '';
  });

  const [deepgramApiKey, setDeepgramApiKey] = useState(() => {
    return localStorage.getItem('appvro-deepgram-key') || '';
  });

  const handleApiKeyChange = useCallback((key) => {
    setDeepSeekApiKey(key);
    localStorage.setItem('appvro-deepseek-key', key);
  }, []);

  const handleDeepgramKeyChange = useCallback((key) => {
    setDeepgramApiKey(key);
    localStorage.setItem('appvro-deepgram-key', key);
  }, []);

  // ── Text overlay state ───────────────────────────────────────────────
  const [showOverlaySettings, setShowOverlaySettings] = useState(false);
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [overlayText, setOverlayText] = useState('✦ AppVro Studio  ✦  សូមស្វាគមន៍');
  const [overlayFontSize, setOverlayFontSize] = useState(28); // px, default medium
  const [overlayColor, setOverlayColor] = useState('#ffffff');
  const [overlayDirection, setOverlayDirection] = useState('bottom-to-top'); // 'bottom-to-top' | 'top-to-bottom'
  const [overlaySpeed, setOverlaySpeed] = useState(5); // 1 (slow) – 10 (fast)
  const [overlayOpacity, setOverlayOpacity] = useState(1.0); // 0.1 – 1.0

  // ── Video state ──────────────────────────────────────────────────────
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [mergeLog, setMergeLog] = useState('');
  const [mergeResult, setMergeResult] = useState(null);
  const [mergeError, setMergeError] = useState('');

  const [currentTime, setCurrentTime] = useState(0);
  const seekToRef = useRef(null);
  const abortRef = useRef(null);

  // ── Logo / Image Overlay ──────────────────────────────────────────────────
  const {
    logoPreviewUrl,
    logoX,
    logoY,
    logoPosition,
    logoSize,
    logoVisible,
    logoOpacity,
    setLogoPosition,
    setLogoPositionCustom,
    setLogoSize,
    setLogoOpacity,
    handleLogoUpload,
    clearLogo,
    toggleLogoVisibility,
    cleanup: cleanupLogo,
  } = useLogoOverlay();

  useEffect(() => cleanupLogo, [cleanupLogo]);

  // ── Callbacks ───────────────────────────────────────────────────────────
  const handlePlaybackChange = useCallback((playing, index) => {
    setIsPlaying(playing);
    setCurrentSegmentIndex(index);
  }, []);

  const handleSegmentsProcessed = useCallback((processed) => {
    setProcessedSegments(processed);
    const total = processed.reduce((sum, s) => sum + s.paddedDuration, 0);
    setTotalDuration(total);
  }, []);

  // ── Gemini AI Integration ────────────────────────────────────────────────
  const handleGeminiUpdate = useCallback((updatedSegments) => {
    setSegments(updatedSegments);
    // Reset playback state since text content changed
    setCurrentSegmentIndex(-1);
    setIsPlaying(false);
    setProcessedSegments([]);
    setTotalDuration(0);
    setTtsAudioBuffers(null);
    setTtsMode(false);
  }, []);
  // ── Video Upload ───────────────────────────────────────────────────────
  const handleVideoLoaded = useCallback((file, previewUrl) => {
    if (file) {
      setVideoFile(file);
      setVideoPreviewUrl(previewUrl);
    } else {
      // Clear video
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      setVideoFile(null);
      setVideoPreviewUrl(null);
    }
    setMergeResult(null);
    setMergeError('');
    setMergeLog('');
    setMergeProgress(0);
  }, [videoPreviewUrl]);

  // ── Timeline (drag-and-drop video onto timeline) ──────────────────
  const captionPanelRef = useRef(null);

  const handleVideoDrop = useCallback((file) => {
    const url = URL.createObjectURL(file);
    handleVideoLoaded(file, url);

    // Probe video duration for immediate timeline display.
    // Use a SEPARATE blob URL for probing so we don't revoke the preview URL.
    const probeUrl = URL.createObjectURL(file);
    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';
    videoEl.onloadedmetadata = () => {
      setTotalDuration(videoEl.duration);
      videoEl.remove();
      URL.revokeObjectURL(probeUrl);
    };
    videoEl.onerror = () => {
      // Fallback: estimate duration from file size (rough)
      setTotalDuration(120);
      videoEl.remove();
      URL.revokeObjectURL(probeUrl);
    };
    videoEl.src = probeUrl;

    // Auto-trigger caption generation after a short delay (to let UI settle)
    setTimeout(() => {
      captionPanelRef.current?.startCaptions();
    }, 300);
  }, [handleVideoLoaded]);

  const handleTimelineTimeUpdate = useCallback((time) => {
    setCurrentTime(time);
  }, []);

  // ── Auto-Caption (Local STT + Translate to Khmer) ─────────────────────
  const handleCaptionsGenerated = useCallback((segments) => {
    console.log('[App] handleCaptionsGenerated called with', segments.length, 'segments');
    if (!segments || segments.length === 0) {
      console.warn('[App] No segments received from CaptionPanel');
      return;
    }
    setSegments(segments);
    setCurrentSegmentIndex(-1);
    setIsPlaying(false);
    setProcessedSegments([]);
    setTotalDuration(0);
    setTtsAudioBuffers(null);
    setTtsMode(false);
  }, []);

  // ── Auto-Translate ────────────────────────────────────────────────────
  const handleTranslateApplied = useCallback((updatedSegments) => {
    setSegments(updatedSegments);
    setCurrentSegmentIndex(-1);
    setIsPlaying(false);
    setProcessedSegments([]);
    setTtsAudioBuffers(null);
    setTtsMode(false);
  }, []);

  // ── Audio-Video Merge ─────────────────────────────────────────────────
  const handleMerge = useCallback(async () => {
    if (!videoFile || !ttsAudioBuffers) return;

    setIsMerging(true);
    setMergeProgress(0);
    setMergeLog('');
    setMergeError('');
    setMergeResult(null);

    try {
      // Convert the first TTS audio buffer to a WAV blob
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const sampleRate = ctx.sampleRate;

      // Concatenate all audio buffers into one
      let totalLength = 0;
      const validBuffers = ttsAudioBuffers.filter(Boolean);
      for (const buf of validBuffers) totalLength += buf.length;
      if (totalLength === 0) throw new Error('No audio data to merge');

      const combined = ctx.createBuffer(1, totalLength, sampleRate);
      const channelData = combined.getChannelData(0);
      let offset = 0;
      for (const buf of validBuffers) {
        channelData.set(buf.getChannelData(0), offset);
        offset += buf.length;
      }

      // Encode combined AudioBuffer to WAV blob
      const wavBlob = audioBufferToWavBlob(combined);

      setMergeLog('Loading ffmpeg engine...');

      // Merge video + audio using ffmpeg.wasm
      const merged = await mergeAudioVideo(videoFile, wavBlob, {
        onProgress: (pct) => setMergeProgress(pct),
        onLog: (msg) => setMergeLog((prev) => prev + '\n' + msg),
        replaceAudio: true,
      });

      setMergeResult(merged);
      setMergeLog((prev) => prev + '\n✓ Merge complete!');
    } catch (err) {
      console.error('Merge failed:', err);
      setMergeError(err.message || 'Merge failed');
      setMergeLog((prev) => prev + '\n✗ Error: ' + (err.message || 'Unknown error'));
    } finally {
      setIsMerging(false);
      if (abortRef.current) abortRef.current.abort();
    }
  }, [videoFile, ttsAudioBuffers]);

  const handleDownloadMerged = useCallback(() => {
    if (!mergeResult) return;
    const url = URL.createObjectURL(mergeResult);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'merged-video.mp4';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [mergeResult]);

  // ── TTS Generation ──────────────────────────────────────────────────────

  // ── TTS Generation ──────────────────────────────────────────────────────
  const handleTTSGenerate = useCallback(async (providerId, apiKey, voiceId, modelId, extraOpts = {}) => {
    if (!segments?.length) return;

    const provider = getProvider(providerId);

    // Abort any previous in-progress request for all provider types
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    // Browser TTS uses SpeechSynthesis -> direct playback, not AudioBuffers
    if (provider.isBrowserBased) {
      setIsGenerating(true);
      setTtsError('');
      setTtsMode(false);
      setTtsProgress({ completed: 0, total: segments.length });

      // Stop any previous in-progress speech
      stopBrowserSpeech();

      try {
        await speakAllSegments(segments, {
          providerId,
          voiceId,
          rate: extraOpts.rate || 1,
          pitch: extraOpts.pitch || 1,
          signal: abortRef.current?.signal,
          onProgress: (completed, total) => setTtsProgress({ completed, total }),
        });
        setTtsMode(true);
        setActiveProviderId(providerId);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setTtsError(err.message);
      } finally {
        setIsGenerating(false);
        setTtsProgress(null);
      }
      return;
    }

    // API-based providers (ElevenLabs, Google Cloud, Edge TTS, etc.)
    setIsGenerating(true);
    setTtsError('');
    setTtsProgress({ completed: 0, total: segments.length });
    setTtsMode(false);

    try {
      // Forward extraOpts (rate, pitch, etc.) along with standard params
      const results = await synthesizeAll(segments, apiKey, {
        providerId,
        voiceId,
        modelId,
        ...extraOpts,
        signal: abortRef.current.signal,
        onProgress: (completed, total) => setTtsProgress({ completed, total }),
      });

      // Check for errors
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        setTtsError(`${errors.length} segment(s) failed: ${errors[0].error}`);
      }

      // Decode MP3 → AudioBuffer
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await decodeAll(ctx, results);
      const buffers = decoded.map(d => d.audioBuffer);
      setTtsAudioBuffers(buffers);
      setTtsMode(true);
      setActiveProviderId(providerId);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setTtsError(err.message);
    } finally {
      setIsGenerating(false);
      setTtsProgress(null);
    }
  }, [segments]);

  const handleTimelineSegmentClick = useCallback((index) => {
    // Seek to segment in preview
    if (seekToRef.current) {
      seekToRef.current(index);
    }
  }, []);

  return (
    <div className="studio">
      {/* Top bar */}
      <header className="studio-topbar">
        <div className="topbar-left">
          <svg className="topbar-logo" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" />
          </svg>
          <h1 className="topbar-title">Movie Recap Studio</h1>
        </div>
        <div className="topbar-center">
          {segments.length > 0 && (
            <span className="topbar-info">
              {segments.length} segments &middot; {formatDuration(totalDuration)}
            </span>
          )}
        </div>
        <div className="topbar-right">
          <div className="topbar-actions">
            <button
              className="topbar-btn theme-toggle"
              onClick={() => setDarkMode(prev => !prev)}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
            </button>

            <button
              className="topbar-btn settings-btn"
              onClick={handleOpenSettings}
              title="Settings"
            >
              <SettingsIcon size={20} strokeWidth={1.75} />
            </button>
          </div>
          <span className="topbar-version">v1.0.0</span>
        </div>
      </header>



      {/* Main studio layout */}
      <div className="studio-main">
        {/* Left sidebar – control panels */}
        <aside className="studio-sidebar">
          {/* ── Video Upload ─────────────────────────────────────── */}
          <div className="sidebar-section">
            <h3 className="sidebar-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" />
              </svg>
              Video
            </h3>
            <VideoUploader onVideoLoaded={handleVideoLoaded} disabled={isMerging} hideVideoPreview={!!videoFile} />
          </div>

          {/* ── Auto-Caption Section ────────────────────────────── */}
          <div className="sidebar-section">
            <h3 className="sidebar-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              Auto-Caption
            </h3>
            <CaptionPanel
              ref={captionPanelRef}
              videoFile={videoFile}
              onCaptionsGenerated={handleCaptionsGenerated}
              disabled={!videoFile || isMerging}
              deepSeekApiKey={deepSeekApiKey}
              deepgramApiKey={deepgramApiKey}
            />
          </div>

          {/* ── Text Editor Section (below Auto-Caption) ──────────────── */}
          <div className="sidebar-section text-editor-section">
            <button
              className="text-editor-toggle-btn"
              onClick={() => setShowOverlaySettings(prev => !prev)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span>Text Editor</span>
              <svg
                className={`text-editor-chevron${showOverlaySettings ? ' open' : ''}`}
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            <div className={`text-editor-panel${showOverlaySettings ? ' open' : ''}`}>
              <div className="text-editor-input-row">
                <input
                  type="text"
                  className="text-editor-input"
                  value={overlayText}
                  onChange={e => setOverlayText(e.target.value)}
                  placeholder="Overlay text…"
                />
              </div>

              <div className="text-editor-row">
                <label className="text-editor-label">
                  <span>Size</span>
                  <input
                    type="range"
                    className="text-editor-slider"
                    min={12}
                    max={72}
                    value={overlayFontSize}
                    onChange={e => setOverlayFontSize(Number(e.target.value))}
                  />
                  <span className="text-editor-value">{overlayFontSize}px</span>
                </label>
                <label className="text-editor-label">
                  <span>Speed</span>
                  <input
                    type="range"
                    className="text-editor-slider"
                    min={1}
                    max={10}
                    value={overlaySpeed}
                    onChange={e => setOverlaySpeed(Number(e.target.value))}
                  />
                  <span className="text-editor-value">{['Slow','Moderate','Fast','V.Fast'][Math.min(Math.floor((overlaySpeed-1)/2.25),3)]}</span>
                </label>
              </div>

              <div className="text-editor-row">
                <label className="text-editor-label">
                  <span>Opacity</span>
                  <input
                    type="range"
                    className="text-editor-slider"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={overlayOpacity}
                    onChange={e => setOverlayOpacity(Number(e.target.value))}
                  />
                  <span className="text-editor-value">{Math.round(overlayOpacity * 100)}%</span>
                </label>
                <label className="text-editor-label">
                  <span>Direction</span>
                  <select
                    className="text-editor-select"
                    value={overlayDirection}
                    onChange={e => setOverlayDirection(e.target.value)}
                  >
                    <option value="bottom-to-top">↑ Bottom→Top</option>
                    <option value="top-to-bottom">↓ Top→Bottom</option>
                  </select>
                </label>
              </div>

              <div className="text-editor-inline-row">
                <label className="text-editor-inline-label">
                  <span>Color</span>
                  <input
                    type="color"
                    className="text-editor-color"
                    value={overlayColor}
                    onChange={e => setOverlayColor(e.target.value)}
                  />
                </label>
                <label className="text-editor-inline-label text-editor-check-label">
                  <input
                    type="checkbox"
                    checked={overlayEnabled}
                    onChange={e => setOverlayEnabled(e.target.checked)}
                  />
                  <span>Active</span>
                </label>
              </div>
            </div>
          </div>

          {/* ── Auto-Translate Section ──────────────────────────── */}
          {segments.length > 0 && (
            <div className="sidebar-section">
              <h3 className="sidebar-title">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                Auto-Translate
              </h3>
              <TranslatePanel
                segments={segments}
                onTranslateApplied={handleTranslateApplied}
                disabled={isMerging}
              />
            </div>
          )}

          {segments.length > 0 && (
            <div className="sidebar-section">
              <h3 className="sidebar-title">Text-to-Speech</h3>
              <ApiKeyPanel
                onGenerate={handleTTSGenerate}
                isGenerating={isGenerating}
                progress={ttsProgress}
                disabled={!segments.length}
              />
              {ttsError && <p className="tts-error">{ttsError}</p>}
              {ttsMode && activeProviderId && (
                <div className="tts-active-badge">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{getProvider(activeProviderId).name} audio ready</span>
                </div>
              )}
            </div>
          )}

          {segments.length > 0 && (
            <div className="sidebar-section">
              <h3 className="sidebar-title">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Gemini AI Integration
              </h3>
              <GeminiPanel
                segments={segments}
                onSegmentsUpdated={handleGeminiUpdate}
                disabled={!segments.length}
              />
            </div>
          )}

          {/* ── Logo / Image Overlay Section ──────────────────────────── */}
          <div className="sidebar-section">
            <LogoOverlay
              logoPreviewUrl={logoPreviewUrl}
              logoPosition={logoPosition}
              logoSize={logoSize}
              logoVisible={logoVisible}
              logoOpacity={logoOpacity}
              onUpload={handleLogoUpload}
              onClear={clearLogo}
              onToggleVisibility={toggleLogoVisibility}
              onPositionChange={setLogoPosition}
              onSizeChange={setLogoSize}
              onOpacityChange={setLogoOpacity}
              disabled={!videoFile || isMerging}
            />
          </div>

          {/* ── Audio-Video Merge Section ───────────────────────────── */}
          {videoFile && ttsMode && ttsAudioBuffers && (
            <div className="sidebar-section merge-section">
              <h3 className="sidebar-title">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                  <polygon points="11 5 6 9 2 8 14 2 18 2 22 6 22 10 16 22 15 18 19 13" />
                </svg>
                Merge &amp; Export
              </h3>

              <div className="merge-info">
                <div className="merge-info-row">
                  <span className="merge-label">Video:</span>
                  <span className="merge-value">{videoFile.name}</span>
                </div>
                <div className="merge-info-row">
                  <span className="merge-label">Audio:</span>
                  <span className="merge-value">{ttsAudioBuffers.length} segments</span>
                </div>
              </div>

              {!mergeResult && (
                <button
                  className="merge-btn"
                  onClick={handleMerge}
                  disabled={isMerging}
                >
                  {isMerging ? (
                    <>
                      <div className="btn-spinner" />
                      <span>Merging… {Math.round(mergeProgress * 100)}%</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="11 5 6 9 2 8 14 2 18 2 22 6 22 10 16 22 15 18 19 13" />
                      </svg>
                      <span>Merge Audio &amp; Video</span>
                    </>
                  )}
                </button>
              )}

              {isMerging && (
                <div className="merge-progress-bar">
                  <div className="merge-progress-fill" style={{ width: `${Math.round(mergeProgress * 100)}%` }} />
                </div>
              )}

              {mergeLog && (
                <pre className="merge-log">{mergeLog}</pre>
              )}

              {mergeError && (
                <p className="merge-error">{mergeError}</p>
              )}

              {mergeResult && (
                <div className="merge-success-actions">
                  <div className="tts-active-badge" style={{ marginBottom: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Merge complete!</span>
                  </div>
                  <button className="download-btn" onClick={handleDownloadMerged}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Download Merged Video</span>
                  </button>
                </div>
              )}
            </div>
          )}

        </aside>

        {/* Right content area – video player + timeline */}
        <div className="studio-main-content">
          {/* Video player with logo overlay — always visible */}
          <div className="main-video-section">
            <VideoPlayerWithLogo
              videoPreviewUrl={videoPreviewUrl}
              videoFile={videoFile}
              logoPreviewUrl={logoPreviewUrl}
              logoX={logoX}
              logoY={logoY}
              logoSize={logoSize}
              logoVisible={logoVisible}
              logoOpacity={logoOpacity}
              onLogoPositionChange={setLogoPositionCustom}
              onLogoSizeChange={setLogoSize}
              overlayText={overlayEnabled ? overlayText : ''}
              overlayFontSize={overlayFontSize}
              overlayColor={overlayColor}
              overlayDirection={overlayDirection}
              overlaySpeed={overlaySpeed}
              overlayOpacity={overlayOpacity}
              subtitles={processedSegments.length > 0 ? processedSegments : segments}
            />
          </div>

          {/* Timeline */}
          <div className="main-timeline-section">
            <Timeline
              segments={processedSegments.length > 0 ? processedSegments : segments}
              currentSegmentIndex={currentSegmentIndex}
              onSegmentClick={handleTimelineSegmentClick}
              totalDuration={totalDuration}
              videoFile={videoFile}
              videoPreviewUrl={videoPreviewUrl}
              ttsAudioBuffers={ttsAudioBuffers}
              currentTime={currentTime}
              onVideoDrop={handleVideoDrop}
              onTimeUpdate={handleTimelineTimeUpdate}
            />
          </div>
        </div>
      </div>

      {/* Bottom status bar — vertical scrolling marquee */}
      <footer className="studio-statusbar">
        <div className="marquee-vertical-track">
          {/* Duplicated content for seamless looping */}
          <div className="marquee-vertical-content">
            <span>
              {segments.length > 0
                ? `${segments.length} segments loaded`
                : 'No segments loaded'}
              &nbsp;&middot;&nbsp;
              {isPlaying && currentSegmentIndex >= 0
                ? `Playing segment ${currentSegmentIndex + 1}`
                : isPlaying
                ? 'Playing'
                : 'Ready'}
              &nbsp;&middot;&nbsp;
              {totalDuration > 0 ? `Audio: ${formatDuration(totalDuration)}` : ''}
              &nbsp;&middot;&nbsp;
              {darkMode ? 'Dark Mode' : 'Light Mode'}
            </span>
          </div>
          <div className="marquee-vertical-content" aria-hidden="true">
            <span>
              {segments.length > 0
                ? `${segments.length} segments loaded`
                : 'No segments loaded'}
              &nbsp;&middot;&nbsp;
              {isPlaying && currentSegmentIndex >= 0
                ? `Playing segment ${currentSegmentIndex + 1}`
                : isPlaying
                ? 'Playing'
                : 'Ready'}
              &nbsp;&middot;&nbsp;
              {totalDuration > 0 ? `Audio: ${formatDuration(totalDuration)}` : ''}
              &nbsp;&middot;&nbsp;
              {darkMode ? 'Dark Mode' : 'Light Mode'}
            </span>
          </div>
        </div>
      </footer>

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          deepSeekApiKey={deepSeekApiKey}
          onApiKeyChange={handleApiKeyChange}
          onClose={handleCloseSettings}
        />
      )}
    </div>
  );
}

// ── Helper ─────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
