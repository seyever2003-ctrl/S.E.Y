import React, { useRef, useEffect, useState } from 'react';

/**
 * Timeline – Visual display of subtitle segments.
 *
 * Props:
 *  - segments: processed segments array (with .start, .end, .text, .paddedDuration, etc.)
 *  - currentSegmentIndex: currently playing segment index (-1 = none)
 *  - onSegmentClick: (index) => void
 *  - totalDuration: total duration in seconds
 */
export default function Timeline({ segments, currentSegmentIndex, onSegmentClick, totalDuration }) {
  const timelineRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to the current segment
  useEffect(() => {
    if (!autoScroll || currentSegmentIndex < 0 || !timelineRef.current) return;
    const items = timelineRef.current.children;
    if (items[currentSegmentIndex]) {
      items[currentSegmentIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentSegmentIndex, autoScroll]);

  if (!segments || segments.length === 0) {
    return (
      <div className="timeline-panel">
        <div className="panel-header">
          <h2>Timeline</h2>
        </div>
        <div className="timeline-empty">
          <p>No segments loaded</p>
          <p className="text-muted">Upload an SRT file to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="timeline-panel">
      <div className="panel-header">
        <h2>Timeline</h2>
        <div className="panel-header-actions">
          <span className="segment-count">{segments.length} segments</span>
          <label className="auto-scroll-toggle" title="Auto-scroll to playing segment">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <span>Auto</span>
          </label>
        </div>
      </div>

      <div className="timeline-ruler">
        <div className="ruler-label">0:00</div>
        <div className="ruler-label">{formatTime(totalDuration)}</div>
      </div>

      <div className="timeline-list" ref={timelineRef}>
        {segments.map((seg, index) => (
          <div
            key={seg.id || index}
            className={`timeline-item ${index === currentSegmentIndex ? 'active' : ''}`}
            onClick={() => onSegmentClick?.(index)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSegmentClick?.(index);
            }}
          >
            <div className="timeline-item-index">
              <span className="index-badge">{index + 1}</span>
            </div>
            <div className="timeline-item-content">
              <div className="timeline-item-time">
                <span className="time-start">{formatTime(seg.start)}</span>
                <span className="time-sep">→</span>
                <span className="time-end">{formatTime(seg.end)}</span>
                <span className="time-duration">({formatDuration(seg.duration)})</span>
              </div>
              <p className="timeline-item-text">{truncateText(seg.text, 80)}</p>
            </div>
            <div className="timeline-item-duration-bar">
              <div
                className="duration-bar-fill"
                style={{ width: `${Math.min((seg.duration / (totalDuration || 1)) * 100, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00.000';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0s';
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  return `${seconds.toFixed(1)}s`;
}

function truncateText(text, maxLen) {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}
