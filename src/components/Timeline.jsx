import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import WaveSurfer from 'wavesurfer.js';

/**
 * Base pixels per second at 1× zoom.
 * The effective pixels-per-second = PIXELS_PER_SECOND × zoomLevel.
 * Total track width = duration × pixelsPerSecond × zoomLevel.
 */
const PIXELS_PER_SECOND = 50;

// ─── Sub-components ───────────────────────────────────────────────────────────

function VideoFilmstrip({ videoPreviewUrl, dur, ppc, currentTime, onTimelineClick, zoomLevel, seekFromClick }) {
  const ref = useRef(null);
  const [frames, setFrames] = useState([]);
  const zoom = zoomLevel || 1;
  const tw = Math.round(80 * zoom);
  const th = Math.round(48 * zoom);
  const cnt = Math.max(Math.floor(dur / 2), 1);
  const fw = cnt * (tw + 2);

  useEffect(() => {
    if (!videoPreviewUrl || dur <= 0) return;
    let cancelled = false;
    (async () => {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.src = videoPreviewUrl;
      try { await v.play(); } catch { v.remove(); return; }
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      c.width = 80;
      c.height = 48;
      const result = [];
      for (let i = 0; i < cnt; i++) {
        if (cancelled) { v.pause(); v.remove(); return; }
        v.currentTime = (i / cnt) * dur;
        await new Promise((r) => {
          v.onseeked = () => {
            ctx.drawImage(v, 0, 0, 80, 48);
            c.toBlob((b) => { if (b) result.push(URL.createObjectURL(b)); r(); }, "image/jpeg", 0.85);
          };
        });
      }
      v.pause();
      v.remove();
      if (!cancelled) setFrames(result);
    })();
    return () => { cancelled = true; };
  }, [videoPreviewUrl, dur]);

  if (frames.length === 0) {
    return (
      <div className="filmstrip-container" ref={ref} style={{ width: fw }}>
        <div className="filmstrip-placeholder">
          <div className="filmstrip-placeholder-bar" />
        </div>
      </div>
    );
  }

  return (
    <div className="filmstrip-container" ref={ref} style={{ width: fw }}>
      <div className="filmstrip-track">
        {frames.map((url, i) => (
          <div
            key={i}
            className="filmstrip-frame"
            style={{ backgroundImage: `url(${url})`, width: tw, height: th, minWidth: tw }}
            title={fmtTime(i * 2)}
          >
            <span className="filmstrip-frame-time">{fmtTime(i * 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Ruler({ dur, ppc }) {
  const interval = dur > 60 ? 30 : 10;
  const ticks = [];
  for (let t = 0; t <= dur; t += interval) {
    ticks.push(
      <div key={t} className="ruler-tick" style={{ left: t * ppc }}>
        <div className="ruler-tick-line" />
        <span className="ruler-tick-label">{fmtTime(t)}</span>
      </div>
    );
  }
  return <div className="ruler-inner">{ticks}</div>;
}

function fmtTime(s) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function fmtDetail(s) {
  if (!s || isNaN(s)) return "0:00.000";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  return `${m}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

function trunc(t, m) {
  if (!t) return "";
  return t.length > m ? t.slice(0, m) + "..." : t;
}

function encodeWav(ab) {
  const nc = ab.numberOfChannels;
  const sr = ab.sampleRate;
  const samples = ab.getChannelData(0);
  const dl = samples.length * 2;
  const tl = 44 + dl;
  const b = new ArrayBuffer(tl);
  const v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF");
  v.setUint32(4, tl - 8, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nc, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * nc * 2, true);
  v.setUint16(32, nc * 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, dl, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7FFF, true);
    o += 2;
  }
  return new Blob([b], { type: "audio/wav" });
}

function TrackRow({ track, items, dur, ppc, currentTime, zoomLevel, onToggleVisibility, onToggleLock, videoPreviewUrl, waveformRef, waveformReady, onTimelineClick, seekFromClick, scrollRef }) {
  const ref = useRef(null);
  const tw = dur * ppc;
  return (
    <div className="timeline-track-row" ref={ref}>
      <div className="track-controls">
        <span className="track-icon">{track.icon}</span>
        <span className="track-label">{track.label}</span>
        <button className="track-btn" onClick={(e) => { e.stopPropagation(); onToggleVisibility(track.id); }} title={track.visible ? "Hide" : "Show"}>V</button>
        <button className={`track-btn${track.locked ? " locked" : ""}`} onClick={(e) => { e.stopPropagation(); onToggleLock(track.id); }} title={track.locked ? "Unlock" : "Lock"}>L</button>
      </div>
      <div className="track-body" onClick={(e) => { seekFromClick(e, ref.current); }}>
        <div className="track-inner" style={{ width: tw }}>
          {track.id === "captions" && items.map(item => (
            <div
              key={item.id}
              className={`track-caption-block${item.active ? " active" : ""}`}
              style={{ left: item.start * ppc, width: Math.max((item.end - item.start) * ppc, 3) }}
              onClick={(e) => { e.stopPropagation(); item.onClick?.(); }}
              title={`${fmtDetail(item.start)} - ${fmtDetail(item.end)}: ${item.text}`}
            >
              <span className="track-caption-text">{trunc(item.text, 20)}</span>
            </div>
          ))}
          {track.id === "video" && (
            <VideoFilmstrip
              videoPreviewUrl={videoPreviewUrl}
              dur={dur}
              ppc={ppc}
              currentTime={currentTime}
              onTimelineClick={onTimelineClick}
              zoomLevel={zoomLevel}
              seekFromClick={seekFromClick}
            />
          )}
          {track.id === "audio" && (
            <div className="track-audio-layer">
              {waveformRef ? (
                <div className="waveform-container" ref={waveformRef} style={{ height: 48, width: tw }} />
              ) : (
                <div className="track-audio-placeholder">
                  <div className="track-audio-wave" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ─── Main Timeline Component ─────────────────────────────────────────────────

export default function Timeline({
  segments,
  currentSegmentIndex,
  onSegmentClick,
  totalDuration,
  videoFile,
  videoPreviewUrl,
  ttsAudioBuffers,
  currentTime = 0,
  onVideoDrop,
  onTimeUpdate
}) {
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);
  const scrollRef = useRef(null);
  const playheadRef = useRef(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [waveformReady, setWaveformReady] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);

  /* ── Duration & pixel computations ─────────────────────────────────────── */
  const dur = Math.max(totalDuration, 1);
  // Effective pixels-per-second after zoom: base × zoomLevel
  const pixelsPerSecond = PIXELS_PER_SECOND * zoomLevel;
  // Full timeline width = duration (s) × pixelsPerSecond
  const totalWidth = dur * pixelsPerSecond;

  /* ── Track management ──────────────────────────────────────────────────── */
  const [tracks, setTracks] = useState([
    { id: 'captions', label: 'Captions', icon: 'TT', visible: true, locked: false },
    { id: 'video',    label: 'Video',    icon: 'VD', visible: true, locked: false },
    { id: 'audio',    label: 'Audio',    icon: 'AU', visible: true, locked: false }
  ]);

  const toggleVisibility = useCallback(
    (id) => setTracks((p) => p.map((t) => t.id === id ? { ...t, visible: !t.visible } : t)),
    []
  );

  const toggleLock = useCallback(
    (id) => setTracks((p) => p.map((t) => t.id === id ? { ...t, locked: !t.locked } : t)),
    []
  );

  /* ── Track items (segments / video / audio) ────────────────────────────── */
  const items = useMemo(() => {
    const s = segments && segments.length > 0;
    const a = ttsAudioBuffers && ttsAudioBuffers.length > 0;
    const v = !!videoFile;
    return {
      captions: s
        ? segments.map((seg, i) => ({
            id: 'c-' + i,
            start: seg.start,
            end: seg.end,
            text: seg.text,
            active: i === currentSegmentIndex,
            onClick: () => onSegmentClick?.(i)
          }))
        : [],
      video:  v ? [{ id: 'v-main', start: 0, end: dur }] : [],
      audio:  a ? [{ id: 'a-main', start: 0, end: dur }] : []
    };
  }, [segments, currentSegmentIndex, onSegmentClick, totalDuration, videoFile, ttsAudioBuffers]);

  /* ── Click-to-seek on track body ───────────────────────────────────────── */
  const seekFromClick = useCallback(
    (e, el) => {
      if (!el || !onTimeUpdate) return;
      const rect = el.getBoundingClientRect();
      const sl = scrollRef.current ? scrollRef.current.scrollLeft : 0;
      onTimeUpdate(Math.max(0, Math.min(dur, (e.clientX - rect.left + sl) / pixelsPerSecond)));
    },
    [onTimeUpdate, pixelsPerSecond, dur]
  );

  /* ── Draggable playhead ────────────────────────────────────────────────── */
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  const handlePlayheadMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPlayhead(true);
  }, []);

  // Attach global mousemove / mouseup while dragging so the user can drag
  // across the entire document without losing capture.
  useEffect(() => {
    if (!isDraggingPlayhead) return;
    const handleMove = (e) => {
      if (!scrollRef.current || !onTimeUpdate) return;
      const container = scrollRef.current;
      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const x = e.clientX - rect.left + scrollLeft;
      const newTime = Math.max(0, Math.min(dur, x / pixelsPerSecond));
      onTimeUpdate(newTime);
    };
    const handleUp = () => {
      setIsDraggingPlayhead(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDraggingPlayhead, dur, pixelsPerSecond, onTimeUpdate]);

  /* ── WaveSurfer audio waveform ─────────────────────────────────────────── */
  useEffect(() => {
    if (!waveformRef.current || !ttsAudioBuffers || ttsAudioBuffers.length === 0) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ttsAudioBuffers.reduce((s, b) => s + b.length, 0);
    if (len === 0) return;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = b.getChannelData(0);
    let off = 0;
    for (const buf of ttsAudioBuffers) {
      ch.set(buf.getChannelData(0), off);
      off += buf.length;
    }
    const blob = encodeWav(b);
    const url = URL.createObjectURL(blob);
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgba(168,85,247,0.3)',
      progressColor: 'rgba(168,85,247,0.6)',
      cursorColor: 'transparent',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 48,
      normalize: true,
      backend: 'WebAudio'
    });
    ws.load(url).then(() => setWaveformReady(true));
    ws.on('click', (r) => {
      const t = ws.getDuration() * r;
      if (onTimeUpdate) onTimeUpdate(t);
    });
    wavesurferRef.current = ws;
    return () => {
      ws.destroy();
      URL.revokeObjectURL(url);
      ctx.close();
    };
  }, [ttsAudioBuffers]);

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="timeline-panel">
      <div className="panel-header">
        <h2>Timeline</h2>
        <div className="panel-header-actions">
          {segments?.length > 0 && (
            <span className="segment-count">{segments.length} seg</span>
          )}
          <div className="timeline-zoom-control" title={`Zoom: ${Math.round(zoomLevel * 100)}%`}>
            <input
              type="range"
              className="timeline-zoom-slider"
              min="0.1"
              max="5.0"
              step="0.1"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </div>
          <span className="segment-count" style={{ fontVariantNumeric: "tabular-nums" }}>
            {fmtTime(dur)}
          </span>
        </div>
      </div>
      <div className="timeline-scroll-container" ref={scrollRef}>
        <div className="timeline-ruler-wrapper">
          <div className="timeline-ruler-track" style={{ width: totalWidth }}>
            <Ruler dur={dur} ppc={pixelsPerSecond} />
          </div>
        </div>
        <div className="timeline-multi-track-area">
          <div className="timeline-tracks-container">
            {tracks.filter((t) => t.visible).map((track) => {
              const its = items[track.id] || [];
              return (
                <TrackRow
                  key={track.id}
                  track={track}
                  items={its}
                  dur={dur}
                  ppc={pixelsPerSecond}
                  currentTime={currentTime}
                  zoomLevel={zoomLevel}
                  onToggleVisibility={toggleVisibility}
                  onToggleLock={toggleLock}
                  videoPreviewUrl={videoPreviewUrl}
                  waveformRef={track.id === "audio" ? waveformRef : null}
                  waveformReady={track.id === "audio" ? waveformReady : false}
                  onTimelineClick={onTimeUpdate}
                  seekFromClick={seekFromClick}
                  scrollRef={scrollRef}
                />
              );
            })}
          </div>
          <div className="timeline-tracks-spacer" style={{ width: totalWidth }} />
        </div>
        <div
          className="timeline-playhead-bar"
          ref={playheadRef}
          style={{ transform: `translateX(${currentTime * pixelsPerSecond}px)` }}
          onMouseDown={handlePlayheadMouseDown}
        >
          <div className="timeline-playhead-handle" />
        </div>
      </div>
    </div>
  );
}


