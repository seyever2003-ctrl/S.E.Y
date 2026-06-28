import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Play, Pause, RotateCcw, SkipForward, Volume2, VolumeX } from 'lucide-react';
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
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [audioBlocked, setAudioBlocked] = useState(false);

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

  /* ── Sync volume / muted state to <video> element ──────────────────────── */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = volume;
    el.muted = isMuted;
  }, [volume, isMuted]);

  /* ── Mute / Unmute toggle ──────────────────────────────────────────── */
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  /* ── Volume slider handler ─────────────────────────────────────────── */
  const handleVolumeChange = useCallback((e) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (val === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  }, [isMuted]);

  /* ── Play / Pause toggle ───────────────────────────────────────────── */
  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch((err) => {
        console.error('[VideoPlayer] play() failed:', err);
        // If autoplay was blocked, fall back to paused state
        setIsPlaying(false);
        // Mark that audio was blocked by the browser's autoplay policy
        // so we can guide the user to interact first
        setAudioBlocked(true);
      });
    } else {
      el.pause();
    }
  }, []);

  /* ── Retry playback after user interaction (for autoplay policy) ──── */
  const handleAudioBlockedClick = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setAudioBlocked(false);
    // Briefly mute, start playback, then restore volume
    el.muted = true;
    el.play().then(() => {
      // Restore desired muted/volume state after playback starts
      el.muted = isMuted;
      el.volume = volume;
    }).catch((err) => {
      console.error('[VideoPlayer] retry play() still failed:', err);
      setIsPlaying(false);
    });
  }, [isMuted, volume]);

  /* ── Seek relative (seconds) ───────────────────────────────────────── */
  const seekRelative = useCallback((delta) => {
    const el = videoRef.current;
    if (!el) return;
    const d = el.duration || 0;
    if (d <= 0) return; // no duration yet, can't seek
    el.currentTime = Math.max(0, Math.min(d, el.currentTime + delta));
  }, []);

  /* ── Helper: compute the actual rendered video content rect (excludes
   *    letterbox / pillarbox that object-fit: contain leaves around it) ─── */
  const getVideoContentRect = useCallback(() => {
    const stage = stageRef.current;
    const video = videoRef.current;
    if (!stage || !video) return null;
    const stageRect = stage.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    if (stageRect.width === 0 || stageRect.height === 0) return null;
    if (videoRect.width === 0 || videoRect.height === 0) return null;

    const elW = videoRect.width;
    const elH = videoRect.height;
    const vW = video.videoWidth || elW;  // intrinsic width (falls back to element width)
    const vH = video.videoHeight || elH; // intrinsic height (falls back to element height)

    let renderW, renderH, offsetX, offsetY;
    if (vW === elW && vH === elH) {
      // No intrinsic dimensions available (e.g. video not loaded yet) — use full element
      renderW = elW;
      renderH = elH;
      offsetX = 0;
      offsetY = 0;
    } else {
      const elAspect = elW / elH;
      const vAspect = vW / vH;
      if (vAspect > elAspect) {
        // Video is wider (relative to element) → letterbox on top / bottom
        renderW = elW;
        renderH = elW / vAspect;
        offsetX = 0;
        offsetY = (elH - renderH) / 2;
      } else {
        // Video is taller (relative to element) → letterbox on left / right
        renderH = elH;
        renderW = elH * vAspect;
        offsetX = (elW - renderW) / 2;
        offsetY = 0;
      }
    }

    return {
      left:   (videoRect.left - stageRect.left) + offsetX,
      top:    (videoRect.top  - stageRect.top)  + offsetY,
      right:  (videoRect.left - stageRect.left) + offsetX + renderW,
      bottom: (videoRect.top  - stageRect.top)  + offsetY + renderH,
      width:  renderW,
      height: renderH,
    };
  }, []); // no deps — reads refs at call-time

  /* ── Drag handler (clamped to video-element bounds) ────────────────────── */
  const handleLogoMouseDown = useCallback((e) => {
    if (!stageRef.current || !videoRef.current || !onLogoPositionChange) return;
    e.preventDefault();

    // Compute the strict video-content boundary (excludes letterbox bars)
    const contentRect = getVideoContentRect();
    if (!contentRect) return;

    const stageRect = stageRef.current.getBoundingClientRect();
    const logoEl = e.currentTarget;
    const logoRect = logoEl.getBoundingClientRect();

    // Half-dimensions of the logo — guard against zero/undefined so clamping never fails
    const logoW = logoRect.width || 0;
    const logoH = logoRect.height || 0;
    const halfLogoW = logoW / 2;
    const halfLogoH = logoH / 2;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPctX: logoX,
      startPctY: logoY,
      halfLogoW,
      halfLogoH,
    };
    // Capture snapshots so onMove doesn't need closure refs that may shift
    const snap = { stageRect, contentRect };
    const onMove = (ev) => {
      if (!dragRef.current) return;
      const { startX, startY, startPctX, startPctY, halfLogoW: hw, halfLogoH: hh } = dragRef.current;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      // Convert start position to stage-relative pixels, add drag offset → center in pixels
      let centerPxX = (startPctX / 100) * snap.stageRect.width + dx;
      let centerPxY = (startPctY / 100) * snap.stageRect.height + dy;

      // Clamp so the entire logo stays within the actual VIDEO CONTENT area
      // (never into letterbox/pillarbox bars)
      const clampedX = Math.max(snap.contentRect.left + hw,
                                Math.min(snap.contentRect.right - hw, centerPxX));
      const clampedY = Math.max(snap.contentRect.top + hh,
                                Math.min(snap.contentRect.bottom - hh, centerPxY));

      // Guard against NaN / Infinity propagating to state
      if (!isFinite(clampedX) || !isFinite(clampedY)) return;

      // Convert back to percentage of the STAGE (left/top CSS is relative to stage)
      const pctX = (clampedX / snap.stageRect.width) * 100;
      const pctY = (clampedY / snap.stageRect.height) * 100;

      onLogoPositionChange(pctX, pctY);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [logoX, logoY, onLogoPositionChange, getVideoContentRect]);

  /* ── Resize handler ───────────────────────────────────────────────────── */
  const handleResizeStart = useCallback((e) => {
    if (!stageRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget.getAttribute('data-handle');
    const rect = stageRef.current.getBoundingClientRect();
    // Capture wrapper element reference synchronously — e.currentTarget may be
    // nullified later (React synthetic event lifecycle), so relying on it inside
    // the async onUp callback would cause a TypeError and prevent cleanup.
    const wrapperEl = e.currentTarget.parentElement;
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
      // ⚠️ Cleanup MUST happen first so that even if the position-clamping
      // logic below throws, the resize state is released immediately.
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      // After resize completes, re-clamp the logo position to prevent overflow
      if (onLogoPositionChange && wrapperEl) {
        const contentRect = getVideoContentRect();
        const sRect = stageRef.current?.getBoundingClientRect();
        if (contentRect && sRect) {
          const wRect = wrapperEl.getBoundingClientRect();
          const halfW = wRect.width / 2;
          const halfH = wRect.height / 2;

          // Logo center in stage-relative pixels (from current percentage props)
          const cx = (logoX / 100) * sRect.width;
          const cy = (logoY / 100) * sRect.height;

          const newCx = Math.max(contentRect.left + halfW,
                                 Math.min(contentRect.right - halfW, cx));
          const newCy = Math.max(contentRect.top + halfH,
                                 Math.min(contentRect.bottom - halfH, cy));

          if (isFinite(newCx) && isFinite(newCy) && (newCx !== cx || newCy !== cy)) {
            const pctX = (newCx / sRect.width) * 100;
            const pctY = (newCy / sRect.height) * 100;
            onLogoPositionChange(pctX, pctY);
          }
        }
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [logoSize, logoX, logoY, onLogoPositionChange, onLogoSizeChange]);

  return (
    <div className="video-player-with-logo">
      <div className="preview-display-stage" ref={stageRef}>
        {videoPreviewUrl ? (
          <video
            key={videoPreviewUrl}
            ref={videoRef}
            className="preview-display-video"
            src={videoPreviewUrl}
            muted={isMuted}
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

        {/* Audio blocked overlay — browser prevented autoplay with sound */}
        {videoPreviewUrl && audioBlocked && (
          <div className="audio-blocked-overlay" onClick={handleAudioBlockedClick}>
            <div className="audio-blocked-content">
              <VolumeX size={28} />
              <span>Click to enable audio</span>
              <span className="audio-blocked-hint">
                Your browser requires a user interaction to start playback with sound.
              </span>
            </div>
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

          // Calculate video-content-only bounds so text never spills into
          // letterbox / pillarbox bars (left/right black bars on portrait video).
          const vBounds = computeVideoContentPct(stageRef.current, videoRef.current);

          return (
            <div
              className="text-scroll-overlay"
              aria-live="off"
              style={{
                opacity: overlayOpacity,
                /* Override the default inset:0 so the overlay is pinned to
                   the actual video content rectangle */
                left: vBounds?.left ?? '0',
                top: vBounds?.top ?? '0',
                width: vBounds?.width ?? '100%',
                height: vBounds?.height ?? '100%',
                right: 'auto',
                bottom: 'auto',
              }}
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

          {/* Volume / Mute section */}
          <div className="control-volume-section">
            <button
              className="control-btn control-btn--mute"
              onClick={toggleMute}
              disabled={!videoPreviewUrl}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              className="control-volume-slider"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onInput={handleVolumeChange}
              disabled={!videoPreviewUrl}
              aria-label="Volume"
            />
          </div>
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

/* ── Helper: compute percentage-based CSS for the video content rect
 *    (excludes letterbox/pillarbox bars that object-fit: contain creates).
 *    Returns { left, top, width, height } as percentage strings, or null. ── */
function computeVideoContentPct(stageEl, videoEl) {
  if (!stageEl || !videoEl) return null;
  const sr = stageEl.getBoundingClientRect();
  const vr = videoEl.getBoundingClientRect();
  if (sr.width === 0 || sr.height === 0) return null;
  if (vr.width === 0 || vr.height === 0) return null;

  const elW = vr.width;
  const elH = vr.height;
  // intrinsic dimensions (0 until loadedmetadata fires)
  const vW = videoEl.videoWidth || elW;
  const vH = videoEl.videoHeight || elH;

  let renderW, renderH, offsetX, offsetY;
  if (vW === elW && vH === elH) {
    // No intrinsic dims available yet – use full element
    renderW = elW; renderH = elH; offsetX = 0; offsetY = 0;
  } else {
    const elAspect = elW / elH;
    const vAspect = vW / vH;
    if (vAspect > elAspect) {
      // Video wider (relative) → letterbox top/bottom
      renderW = elW; renderH = elW / vAspect;
      offsetX = 0; offsetY = (elH - renderH) / 2;
    } else {
      // Video taller (relative) → letterbox left/right
      renderH = elH; renderW = elH * vAspect;
      offsetY = 0; offsetX = (elW - renderW) / 2;
    }
  }

  return {
    left:   `${(offsetX             / sr.width) * 100}%`,
    top:    `${(offsetY             / sr.height) * 100}%`,
    width:  `${(renderW             / sr.width) * 100}%`,
    height: `${(renderH             / sr.height) * 100}%`,
  };
}
