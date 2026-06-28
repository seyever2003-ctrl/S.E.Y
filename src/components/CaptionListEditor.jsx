import React, { useState, useCallback, useRef, useEffect } from 'react';

/**
 * CaptionListEditor — Displays auto-generated caption segments as editable blocks.
 *
 * Each block shows:
 *   • Segment index
 *   • Start time / End time (editable)
 *   • Caption text (editable inline)
 *   • A visual bar indicating duration relative to total
 *
 * Edits are batched and sent to parent via `onSegmentsUpdate`.
 */
export default function CaptionListEditor({
  segments = [],
  onSegmentsUpdate,
  currentSegmentIndex = -1,
  onSegmentClick,
  disabled = false,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [localSegments, setLocalSegments] = useState(segments);
  const editRef = useRef(null);

  // Sync local segments when prop changes (e.g., after translation)
  useEffect(() => {
    setLocalSegments(segments);
  }, [segments]);

  // Auto-focus text input when editing starts
  useEffect(() => {
    if (editingId !== null && editRef.current) {
      editRef.current.focus();
    }
  }, [editingId]);

  const totalDuration = localSegments.reduce((sum, s) => sum + (s.duration || (s.end - s.start)), 0);

  // ── Begin editing a segment ─────────────────────────────────────────────
  const handleStartEdit = useCallback((seg) => {
    if (disabled) return;
    setEditingId(seg.id);
    setEditText(seg.text || '');
    setEditStart(formatTimeInput(seg.start));
    setEditEnd(formatTimeInput(seg.end));
  }, [disabled]);

  // ── Save edits ──────────────────────────────────────────────────────────
  const handleSaveEdit = useCallback(() => {
    if (editingId === null) return;
    const updated = localSegments.map((seg) => {
      if (seg.id !== editingId) return seg;
      // Parse times — allow empty/unchanged
      const newStart = parseTimeInput(editStart);
      const newEnd = parseTimeInput(editEnd);
      return {
        ...seg,
        text: editText.trim() || seg.text,
        start: newStart !== null ? newStart : seg.start,
        end: newEnd !== null ? newEnd : seg.end,
        duration: newEnd !== null && newStart !== null
          ? newEnd - newStart
          : seg.duration,
      };
    });
    setLocalSegments(updated);
    setEditingId(null);
    onSegmentsUpdate?.(updated);
  }, [editingId, localSegments, editText, editStart, editEnd, onSegmentsUpdate]);

  // ── Cancel editing ──────────────────────────────────────────────────────
  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  // ── Delete a segment ────────────────────────────────────────────────────
  const handleDelete = useCallback((segId) => {
    if (disabled) return;
    const updated = localSegments.filter((s) => s.id !== segId);
    setLocalSegments(updated);
    onSegmentsUpdate?.(updated);
    if (editingId === segId) setEditingId(null);
  }, [disabled, localSegments, onSegmentsUpdate, editingId]);

  // ── Click on a segment block ────────────────────────────────────────────
  const handleBlockClick = useCallback((index) => {
    onSegmentClick?.(index);
  }, [onSegmentClick]);

  if (!localSegments || localSegments.length === 0) {
    return (
      <div className="caption-list-editor caption-list-empty">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        <span>No captions yet. Generate captions using the Auto-Caption panel above.</span>
      </div>
    );
  }

  return (
    <div className="caption-list-editor">
      <div className="caption-list-header">
        <span className="caption-list-count">{localSegments.length} caption{localSegments.length !== 1 ? 's' : ''}</span>
        <span className="caption-list-hint">Click to edit · Ctrl+Enter to save · Esc to cancel</span>
      </div>

      <div className="caption-list-scroll">
        {localSegments.map((seg, index) => {
          const duration = seg.duration || (seg.end - seg.start) || 0;
          const widthPct = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
          const isEditing = editingId === seg.id;
          const isActive = currentSegmentIndex === index;

          return (
            <div
              key={seg.id ?? index}
              className={`caption-list-block${isActive ? ' active' : ''}${isEditing ? ' editing' : ''}`}
              onClick={() => !isEditing && handleBlockClick(index)}
            >
              {/* Visual duration bar (mini-timeline indicator) */}
              <div
                className="caption-list-bar"
                style={{ width: `${Math.max(widthPct, 0.5)}%` }}
                title={`${formatTime(seg.start)} → ${formatTime(seg.end)}`}
              />

              {/* Segment metadata row */}
              <div className="caption-list-meta">
                <span className="caption-list-index">#{index + 1}</span>

                {isEditing ? (
                  <div className="caption-list-time-edits">
                    <input
                      className="caption-list-time-input"
                      value={editStart}
                      onChange={(e) => setEditStart(e.target.value)}
                      placeholder="0:00.000"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Start time"
                    />
                    <span className="caption-list-time-sep">→</span>
                    <input
                      className="caption-list-time-input"
                      value={editEnd}
                      onChange={(e) => setEditEnd(e.target.value)}
                      placeholder="0:00.000"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="End time"
                    />
                  </div>
                ) : (
                  <span className="caption-list-time">
                    {formatTime(seg.start)} → {formatTime(seg.end)}
                  </span>
                )}
              </div>

              {/* Text content */}
              <div className="caption-list-text-row">
                {isEditing ? (
                  <textarea
                    ref={editRef}
                    className="caption-list-textarea"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    rows={2}
                    placeholder="Caption text…"
                  />
                ) : (
                  <span className="caption-list-text">
                    {seg.text || seg.originalText || '(empty)'}
                  </span>
                )}
              </div>

              {/* Action buttons — only show on hover or when editing */}
              <div className="caption-list-actions">
                {isEditing ? (
                  <>
                    <button
                      className="caption-list-action-btn save-btn"
                      onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                      title="Save (Ctrl+Enter)"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                    <button
                      className="caption-list-action-btn cancel-btn"
                      onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
                      title="Cancel (Esc)"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="caption-list-action-btn edit-btn"
                      onClick={(e) => { e.stopPropagation(); handleStartEdit(seg); }}
                      title="Edit caption"
                      disabled={disabled}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      className="caption-list-action-btn delete-btn"
                      onClick={(e) => { e.stopPropagation(); handleDelete(seg.id); }}
                      title="Delete caption"
                      disabled={disabled}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editingId !== null && (
        <div className="caption-list-editing-hint">
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to save · <kbd>Esc</kbd> to cancel
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format seconds → "m:ss.SSS"
 */
function formatTime(seconds) {
  if (seconds == null || isNaN(seconds)) return '0:00.000';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Format seconds → input-friendly "m:ss.SSS"
 */
function formatTimeInput(seconds) {
  return formatTime(seconds);
}

/**
 * Parse "m:ss.SSS" or "seconds.nnn" back to a number.
 * Returns null if parsing fails.
 */
function parseTimeInput(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (!trimmed) return null;

  // Try direct number (seconds with optional fractional)
  const asNumber = Number(trimmed);
  if (!isNaN(asNumber) && asNumber >= 0) return asNumber;

  // Try "m:ss.SSS" format
  const match = trimmed.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (match) {
    const m = parseInt(match[1], 10);
    const s = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
    if (s < 60) return m * 60 + s + ms / 1000;
  }

  // Try "mm:ss.SSS" format
  const matchLong = trimmed.match(/^(\d+):(\d{2})(?:\.(\d{1,3}))?$/);
  if (matchLong) {
    const m = parseInt(matchLong[1], 10);
    const s = parseInt(matchLong[2], 10);
    const ms = matchLong[3] ? parseInt(matchLong[3].padEnd(3, '0'), 10) : 0;
    if (s < 60) return m * 60 + s + ms / 1000;
  }

  return null;
}