import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react';
import './LogoOverlay.css';

/**
 * VideoPlayerWithLogo — A compact video player that hosts the logo/image overlay
 * directly on the video element, with live drag-and-drop and resize,
 * plus a custom styled control bar at the bottom.
 */
export default function VideoPlayerWithLogo({
  videoPreviewUrl,
  logoPreviewUrl,
  logoX = 90,
  logoY = 90,
  logoSize = 8,
  logoVisible = true,
  logoOpacity = 0.85,
  onLogoPositionChange,
  onLogoSizeChange,
  overlayText = '',
  overlayFontSize = 28,
  overlayColor = '#ffffff',
  overlayDirection = 'bottom-to-top',
  overlaySpeed = 5,
  overlayOpacity = 1.0,
}) {
  const stageRef = useRef(null);
  const videoRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const seekingRef = useRef(false);       // tracks seek without re-renders
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoError, setVideoError] = useState(null);
  const [isBuffering, setIsBuffering] = useState(false);

  /* ── Sync play state + time with video events ──────────────────────── */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) {
      console.warn('[VideoPlayer] videoRef is null — no video element to attach events to');
      return;
    }

    console.log('[VideoPlayer] Attaching event listeners to', el.src || '(empty src)');

    const onPlay = () => {
      console.log('[VideoPlayer] play event');
      setIsPlaying(true);
    };
    const onPause = () => {
      console.log('[VideoPlayer] pause event');
      setIsPlaying(false);
    };
    const onEnded = () => {
      console.log('[VideoPlayer] ended event');
      setIsPlaying(false);
    };
    const onTimeUpdate = () => {
      if (seekingRef.current) return; // skip while user is dragging seek bar
      setCurrentTime(el.currentTime);
    };
    const onLoadedMeta = () => {
      const d = el.duration || 0;
      console.log('[VideoPlayer] loadedmetadata — duration:', d);
      setDuration(d);
    };
    const onError = () => {
      const mediaErr = el.error;
      let msg = 'Unknown video error';
      if (mediaErr) {
        const codes = {
          1: 'MEDIA_ERR_ABORTED — Fetching aborted',
          2: 'MEDIA_ERR_NETWORK — Network error',
          3: 'MEDIA_ERR_DECODE — Decode error',
          4: 'MEDIA_ERR_SRC_NOT_SUPPORTED — Source not supported',
        };
        msg = codes[mediaErr.code] || `Error code ${mediaErr.code}: ${mediaErr.message}`;
      }
      console.error('[VideoPlayer] error:', msg);
      setVideoError(msg);
    };
    const onWaiting = () => {
      console.log('[VideoPlayer] waiting — buffering');
      setIsBuffering(true);
    };
    const onCanPlay = () => {
      if (seekingRef.current) return;
      setIsBuffering(false);
    };
    const onPlaying = () => {
      setIsBuffering(false);
    };
    const onAbort = () => {
      console.warn('[VideoPlayer] abort — source loading cancelled');
    };
    const onEmptied = () => {
      console.warn('[VideoPlayer] emptied — source removed');
    };

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoadedMeta);
    el.addEventListener('error', onError);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('abort', onAbort);
    el.addEventListener('emptied', onEmptied);

    return () => {
      console.log('[VideoPlayer] Removing event listeners');
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onLoadedMeta);
      el.removeEventListener('error', onError);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('abort', onAbort);
      el.removeEventListener('emptied', onEmptied);
    };
  }, [videoPreviewUrl]); // ← only re-attach when source changes, NOT on every seek toggle

  /* ── Reset state when source changes ───────────────────────────────── */
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setVideoError(null);
    setIsBuffering(false);
    seekingRef.current = false;
  }, [videoPreviewUrl]);

  /* ── Seek to absolute position ─────────────────────────────────────── */
  const handleSeek = useCallback((e) => {
    const el = videoRef.current;
    if (!el || !el.duration) return;
    const value = Number(e.target.value);
    // Clamp to valid range
    const clamped = Math.max(0, Math.min(el.duration, value));
    el.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  /* ── Play / Pause toggle ───────────────────────────────────────────── */
  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch((err) => {
        console.error('[VideoPlayer] play() failed:', err);
        // If autoplay was blocked, fall back to paused state
        setIsPlaying(false);
      });
    } else {
      el.pause();
    }
  }, []);

  /* ── Seek relative (seconds) ───────────────────────────────────────── */
  const seekRelative = useCallback((delta) => {
    const el = videoRef.current;
    if (!el) return;
    const d = el.duration || 0;
    if (d <= 0) return; // no duration yet, can't seek
    el.currentTime = Math.max(0, Math.min(d, el.currentTime + delta));
  }, []);

  /* ── Drag handler ─────────────────────────────────────────────────────── */
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
    const rectAtStart = rect; // capture
    const onMove = (ev) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const pctX = dragRef.current.startPctX + (dx / rectAtStart.width) * 100;
      const pctY = dragRef.current.startPctY + (dy / rectAtStart.height) * 100;
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

  /* ── Resize handler ───────────────────────────────────────────────────── */
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
      const delta = Math.max(dx, dy) / rect.width * 100;
      let newSize = resizeRef.current.startSize + delta;
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

  return (
    <div className="video-player-with-logo">
      <div className="preview-display-stage" ref={stageRef}>
        {videoPreviewUrl ? (
          <video
            key={videoPreviewUrl}
            ref={videoRef}
            className="preview-display-video"
            src={videoPreviewUrl}
            muted
            loop
            playsInline
            controls={false}
            preload="auto"
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

        {/* Buffering spinner overlay */}
        {videoPreviewUrl && isBuffering && (
          <div className="preview-buffering-overlay">
            <div className="preview-buffering-spinner" />
          </div>
        )}

        {/* Video error overlay */}
        {videoPreviewUrl && videoError && (
          <div className="preview-error-overlay">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Video error</span>
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

        {/* ── Scrolling text overlay (sequential, non-overlapping) ──────── */}
        {overlayText && (() => {
          // Map speed (1-10) → animation duration in seconds.
          // Speed 1 ≈ 40s, speed 5 ≈ 20s (moderate), speed 10 ≈ 8s.
          const duration = 44 - overlaySpeed * 3.6;
          const dirClass = overlayDirection === 'top-to-bottom'
            ? 'text-scroll-down'
            : 'text-scroll-up';
          return (
            <div
              className="text-scroll-overlay"
              aria-live="off"
              style={{ opacity: overlayOpacity }}
            >
              <div
                className={`text-scroll-content ${dirClass}`}
                style={{
                  fontSize: overlayFontSize,
                  color: overlayColor,
                  animationDuration: `${duration}s`,
                }}
              >
                {overlayText}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Custom Control Bar ──────────────────────────────────────────── */}
      <div className={`video-control-bar${!videoPreviewUrl ? ' video-control-bar--disabled' : ''}`}>
        {/* Seek row */}
        <div className="control-seek-row">
          <span className="control-time">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="control-seek-bar"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onInput={handleSeek}
            onMouseDown={() => { seekingRef.current = true; }}
            onMouseUp={() => { seekingRef.current = false; }}
            onTouchStart={() => { seekingRef.current = true; }}
            onTouchEnd={() => { seekingRef.current = false; }}
            disabled={!videoPreviewUrl}
            aria-label="Video seek bar"
          />
          <span className="control-time">{formatTime(duration)}</span>
        </div>

        {/* Buttons row */}
        <div className="control-buttons-row">
          {/* 5s Rewind */}
          <button
            className="control-btn"
            onClick={() => seekRelative(-5)}
            disabled={!videoPreviewUrl}
            title="Rewind 5 seconds"
          >
            <RotateCcw size={15} />
            <span className="control-btn-label">5</span>
          </button>

          {/* Play / Pause */}
          <button
            className="control-btn control-btn--play"
            onClick={togglePlay}
            disabled={!videoPreviewUrl}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>

          {/* 5s Forward */}
          <button
            className="control-btn"
            onClick={() => seekRelative(5)}
            disabled={!videoPreviewUrl}
            title="Forward 5 seconds"
          >
            <SkipForward size={15} />
            <span className="control-btn-label">5</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Helper: format seconds → m:ss ─────────────────────────────────────── */
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
