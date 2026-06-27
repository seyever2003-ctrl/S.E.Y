import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateAudioSegments, buildProcessedSegments, concatenateAudio, downloadAudioBuffer } from '../utils/srtParser.js';
import './LogoOverlay.css';

export default function Preview({
  segments,
  ttsAudioBuffers,
  onPlaybackChange,
  onSegmentsProcessed,
  seekToRef,
  // ── Logo / Image Overlay props ──────────────────────────────────────────────
  videoPreviewUrl,
  logoPreviewUrl,
  logoX = 90,
  logoY = 90,
  logoSize = 8,
  logoVisible = true,
  logoOpacity = 0.85,
  onLogoPositionChange,
  onLogoSizeChange,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [processedSegments, setProcessedSegments] = useState([]);
  const [status, setStatus] = useState('idle');
  const [mode, setMode] = useState('demo');

  const aCtx = useRef(null), masterSrc = useRef(null), startTime = useRef(0);
  const boundaries = useRef([]), raf = useRef(null), silencePad = useRef(0.15);
  const playingRef = useRef(false), idxRef = useRef(-1);
  const onPlaybackRef = useRef(onPlaybackChange);
  onPlaybackRef.current = onPlaybackChange;

  // ── Logo drag / resize state & handlers ──────────────────────────────────
  const stageRef = useRef(null);
  const dragRef = useRef(null); // { startX, startY, startPctX, startPctY } for drag
  const resizeRef = useRef(null); // { handle, startX, startY, startSize } for resize

  const handleLogoMouseDown = useCallback((e) => {
    if (!stageRef.current || !onLogoPositionChange) return;
    e.preventDefault();
    const rect = stageRef.current.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPctX: logoX,
      startPctY: logoY,
    };
    // Global listeners
    const onMove = (ev) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const pctX = dragRef.current.startPctX + (dx / rect.width) * 100;
      const pctY = dragRef.current.startPctY + (dy / rect.height) * 100;
      onLogoPositionChange(
        Math.max(0, Math.min(100, pctX)),
        Math.max(0, Math.min(100, pctY))
      );
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [logoX, logoY, onLogoPositionChange]);

  const handleResizeStart = useCallback((e) => {
    if (!stageRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget.getAttribute('data-handle');
    const rect = stageRef.current.getBoundingClientRect();
    resizeRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startSize: logoSize,
    };
    const onMove = (ev) => {
      if (!resizeRef.current) return;
      const dx = ev.clientX - resizeRef.current.startX;
      const dy = ev.clientY - resizeRef.current.startY;
      // Use the larger delta to size proportionally
      const delta = Math.max(dx, dy) / rect.width * 100;
      let newSize = resizeRef.current.startSize + delta;
      // Clamp between 5 and 50
      newSize = Math.max(5, Math.min(50, newSize));
      onLogoSizeChange?.(newSize);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [logoSize, onLogoSizeChange]);

  const buildAudio = useCallback((srcSegments, srcMode, buffers, pad) => {
    if (!srcSegments?.length) return;
    setStatus(srcMode === 'tts' ? 'tts-processing' : 'processing');
    setIsPlaying(false); setCurrentIndex(-1); setProgress(0);
    if (aCtx.current) { aCtx.current.close(); aCtx.current = null; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let result;
    if (srcMode === 'tts' && buffers) {
      result = buildProcessedSegments(srcSegments, buffers, pad, ctx);
    } else {
      result = generateAudioSegments(srcSegments, { silencePadding: pad });
      if (result.audioContext) { if (aCtx.current) aCtx.current.close(); aCtx.current = result.audioContext; }
    }
    if (srcMode !== 'tts') aCtx.current = result.audioContext || ctx;
    else aCtx.current = ctx;
    setProcessedSegments(result.segments);
    setTotalDuration(result.totalDuration);
    let c = 0;
    boundaries.current = result.segments.map((s) => {
      const b = { start: c, end: c + s.paddedDuration, index: result.segments.indexOf(s) };
      c += s.paddedDuration; return b;
    });
    onSegmentsProcessed?.(result.segments);
    setStatus(srcMode === 'tts' ? 'tts-ready' : 'ready');
    setMode(srcMode);
  }, [onSegmentsProcessed]);

  useEffect(() => {
    if (!segments?.length) return;
    if (ttsAudioBuffers?.length) return;
    buildAudio(segments, 'demo', null, silencePad.current);
  }, [segments]);

  useEffect(() => {
    if (!segments?.length || !ttsAudioBuffers?.length) return;
    if (ttsAudioBuffers.some(b => b !== null)) buildAudio(segments, 'tts', ttsAudioBuffers, silencePad.current);
  }, [ttsAudioBuffers]);

  const stop = useCallback(() => {
    if (masterSrc.current) { try { masterSrc.current.stop(); } catch {} masterSrc.current.disconnect(); masterSrc.current = null; }
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = null; }
    setIsPlaying(false); setCurrentIndex(-1); setProgress(0);
    playingRef.current = false; idxRef.current = -1;
    setStatus(mode === 'tts' ? 'tts-ready' : 'ready');
    onPlaybackRef.current?.(false, -1);
  }, [mode]);

  const tick = useCallback(() => {
    if (!aCtx.current || !playingRef.current) return;
    const elapsed = aCtx.current.currentTime - startTime.current;
    if (elapsed >= totalDuration) { stop(); return; }
    setProgress(Math.min(elapsed / totalDuration, 1));
    for (const b of boundaries.current) {
      if (elapsed >= b.start && elapsed < b.end && b.index !== idxRef.current) {
        idxRef.current = b.index; setCurrentIndex(b.index);
        onPlaybackRef.current?.(true, b.index); break;
      }
    }
    raf.current = requestAnimationFrame(tick);
  }, [totalDuration, stop]);

  const play = useCallback(() => {
    if (!aCtx.current || !processedSegments.length) return;
    const ctx = aCtx.current; if (ctx.state === 'suspended') ctx.resume();
    const mb = concatenateAudio(ctx, processedSegments);
    if (masterSrc.current) masterSrc.current.disconnect();
    const src = ctx.createBufferSource(); src.buffer = mb; src.connect(ctx.destination); src.start(0);
    masterSrc.current = src; startTime.current = ctx.currentTime;
    setIsPlaying(true); setCurrentIndex(0); setStatus('playing');
    playingRef.current = true; idxRef.current = 0;
    onPlaybackRef.current?.(true, 0);
    raf.current = requestAnimationFrame(tick);
  }, [processedSegments, tick]);

  const seek = useCallback((index) => {
    if (!aCtx.current || !processedSegments.length || !boundaries.current[index]) return;
    if (masterSrc.current) { try { masterSrc.current.stop(); } catch {} masterSrc.current.disconnect(); masterSrc.current = null; }
    if (raf.current) cancelAnimationFrame(raf.current);
    const ctx = aCtx.current; if (ctx.state === 'suspended') ctx.resume();
    const mb = concatenateAudio(ctx, processedSegments);
    const src = ctx.createBufferSource();
    src.buffer = mb; src.connect(ctx.destination); src.start(0, boundaries.current[index].start);
    masterSrc.current = src; startTime.current = ctx.currentTime - boundaries.current[index].start;
    setIsPlaying(true); setCurrentIndex(index); setStatus('playing');
    setProgress(boundaries.current[index].start / totalDuration);
    playingRef.current = true; idxRef.current = index;
    onPlaybackRef.current?.(true, index);
    raf.current = requestAnimationFrame(tick);
  }, [processedSegments, totalDuration, tick]);

  if (seekToRef) seekToRef.current = seek;

  // ── Export / Download ───────────────────────────────────────────────────
  const [downloadingSegment, setDownloadingSegment] = useState(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const handleDownloadSegment = useCallback(async (index) => {
    const seg = processedSegments[index];
    if (!seg?.audioBuffer) return;
    setDownloadingSegment(index);
    await new Promise(r => setTimeout(r, 50));
    try {
      let label = `segment-${index + 1}`;
      if (seg.text) {
        label = seg.text.slice(0, 30).replace(/[^a-zA-Z0-9 _-]/g, '') || label;
      }
      downloadAudioBuffer(seg.audioBuffer, `${label}.wav`);
    } finally {
      setDownloadingSegment(null);
    }
  }, [processedSegments]);

  const handleDownloadAll = useCallback(async () => {
    if (!processedSegments.length || !aCtx.current) return;
    setDownloadingAll(true);
    await new Promise(r => setTimeout(r, 50));
    try {
      const masterBuffer = concatenateAudio(aCtx.current, processedSegments);
      downloadAudioBuffer(masterBuffer, 'full-recap-audio.wav');
    } finally {
      setDownloadingAll(false);
    }
  }, [processedSegments, aCtx]);

  const toggle = () => { if (isPlaying) stop(); else play(); };

  const onSilenceChange = (e) => {
    const val = parseFloat(e.target.value); silencePad.current = val;
    if (segments?.length) {
      if (mode === 'tts' && ttsAudioBuffers?.length) buildAudio(segments, 'tts', ttsAudioBuffers, val);
      else buildAudio(segments, 'demo', null, val);
    }
  };

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (masterSrc.current) { try { masterSrc.current.stop(); } catch {} masterSrc.current.disconnect(); }
    if (aCtx.current) aCtx.current.close();
  }, []);

  const disabled = !processedSegments.length || status === 'processing' || status === 'tts-processing';

  return (
    <div className="preview-panel">
      <div className="panel-header">
        <h2>Preview</h2>
        <div className="panel-header-actions">
          <span className={`mode-badge ${mode}`}>{mode === 'tts' ? 'TTS' : 'Demo'}</span>
          <span className={`status-badge ${status}`}>{status}</span>
        </div>
      </div>

      {/* ── Video Display Stage (with logo overlay) ─────────────────────────── */}
      <div
        className="preview-display-stage"
        ref={stageRef}
      >
        {videoPreviewUrl ? (
          <video
            className="preview-display-video"
            src={videoPreviewUrl}
            muted
            loop
            playsInline
            controls={false}
          />
        ) : (
          <div className="preview-display-placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
            <span>Upload a video to preview with overlay</span>
          </div>
        )}
        {/* Logo overlay image — draggable & resizable */}
        {logoPreviewUrl && logoVisible && (
          <div
            className="preview-logo-wrapper"
            style={{
              left: `${logoX}%`,
              top: `${logoY}%`,
              width: `${logoSize}%`,
              opacity: logoOpacity,
            }}
            onMouseDown={handleLogoMouseDown}
          >
            <img
              className="preview-logo-overlay"
              src={logoPreviewUrl}
              alt="Logo overlay"
              draggable={false}
            />
            {/* Resize handles */}
            <span className="logo-resize-handle logo-resize-nw" data-handle="nw" onMouseDown={handleResizeStart} />
            <span className="logo-resize-handle logo-resize-ne" data-handle="ne" onMouseDown={handleResizeStart} />
            <span className="logo-resize-handle logo-resize-sw" data-handle="sw" onMouseDown={handleResizeStart} />
            <span className="logo-resize-handle logo-resize-se" data-handle="se" onMouseDown={handleResizeStart} />
          </div>
        )}
      </div>

      <div className="preview-visual">
        {status === 'idle' && (
          <div className="preview-placeholder">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
              <rect x="6" y="4" width="4" height="16" /><rect x="14" y="2" width="4" height="20" /><rect x="10" y="6" width="4" height="12" />
            </svg>
            <p>Upload an SRT file to generate audio</p>
          </div>
        )}
        {(status === 'processing' || status === 'tts-processing') && (
          <div className="preview-processing">
            <div className="spinner" />
            <p>{status === 'tts-processing' ? 'Applying TTS audio...' : 'Generating demo tones...'}</p>
          </div>
        )}
        {(status === 'ready' || status === 'playing' || status === 'tts-ready') && (
          <>
            <div className="waveform-bar">
              <div className="waveform-track" />
              {processedSegments.map((seg, i) => (
                <div key={i}
                  className={`waveform-segment ${i === currentIndex ? 'active' : ''} ${seg.isRealAudio ? 'real' : ''}`}
                  style={{ width: `${Math.max((seg.paddedDuration / totalDuration) * 100, 0.5)}%` }}
                  title={`#${i+1}: ${seg.text}`}
                  onClick={() => seek(i)} />
              ))}
              {isPlaying && <div className="playhead" style={{ left: `${progress * 100}%` }} />}
            </div>
            <div className="preview-info">
              <span>{fmt(progress * totalDuration)} / {fmt(totalDuration)}</span>
              <span>{currentIndex >= 0 ? `Seg ${currentIndex+1} of ${processedSegments.length}` : `${processedSegments.length} segs`}</span>
            </div>
          </>
        )}
      </div>
      <div className="preview-controls">
        <button className="control-btn primary" onClick={toggle} disabled={disabled} title={isPlaying ? 'Stop' : 'Play All'}>
          {isPlaying ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
          )}
        </button>
        <div className="controls-secondary">
          <label className="silence-control">
            <span>Silence:</span>
            <select value={silencePad.current} onChange={onSilenceChange}>
              <option value="0">None</option>
              <option value="0.05">50ms</option>
              <option value="0.1">100ms</option>
              <option value="0.15">150ms</option>
              <option value="0.25">250ms</option>
              <option value="0.5">500ms</option>
            </select>
          </label>
        </div>
        {(status === 'ready' || status === 'playing' || status === 'tts-ready') && (
          <div className="controls-export">
            <button
              className="control-btn export-all"
              onClick={handleDownloadAll}
              disabled={downloadingAll || disabled}
              title="Download full audio as WAV"
            >
              {downloadingAll ? (
                <div className="mini-spinner" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
              <span>Download All</span>
            </button>
          </div>
        )}
      </div>
      {processedSegments.length > 0 && (status === 'ready' || status === 'playing' || status === 'tts-ready') && (
        <div className="segment-download-bar">
          {processedSegments.map((seg, i) => (
            seg.audioBuffer ? (
              <button
                key={i}
                className="segment-dl-btn"
                onClick={() => handleDownloadSegment(i)}
                disabled={downloadingSegment === i}
                title={`Download segment ${i + 1}`}
              >
                {downloadingSegment === i ? (
                  <div className="mini-spinner" />
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
                <span>{i + 1}</span>
              </button>
            ) : null
          ))}
        </div>
      )}
      {currentIndex >= 0 && processedSegments[currentIndex] && (
        <div className="current-caption"><p className="caption-text">{processedSegments[currentIndex].text}</p></div>
      )}
    </div>
  );
}

function fmt(s) {
  if (!s || isNaN(s)) return '0:00.000';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 1000);
  return `${m}:${String(sec).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}
