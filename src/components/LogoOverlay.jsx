import React, { useRef, useState } from 'react';
import './LogoOverlay.css';

/**
 * LogoOverlay — panel for uploading and configuring a logo / image overlay
 * that renders on top of the video preview area.
 *
 * Props:
 *  - logoPreviewUrl   : string | null   – blob URL of the uploaded image
 *  - logoPosition     : string          – one of the POSITION_KEYS
 *  - logoSize         : number          – 5–50 (percentage of container width)
 *  - logoVisible      : boolean
 *  - logoOpacity      : number          – 0–1
 *  - onUpload         : (file) => void
 *  - onClear          : () => void
 *  - onToggleVisibility : () => void
 *  - onPositionChange : (key) => void
 *  - onSizeChange     : (size) => void
 *  - onOpacityChange  : (opacity) => void
 *  - disabled         : boolean
 */

const POSITIONS = [
  { key: 'top-left',      label: 'Top Left' },
  { key: 'top-right',     label: 'Top Right' },
  { key: 'bottom-left',   label: 'Bottom Left' },
  { key: 'bottom-right',  label: 'Bottom Right' },
  { key: 'center',        label: 'Center' },
];

/** Maps position keys to icon fill coordinates for the SVG grid */
const POSITION_FILLS = {
  'top-left':      { x: 2, y: 2 },
  'top-right':     { x: 9, y: 2 },
  'bottom-left':   { x: 2, y: 9 },
  'bottom-right':  { x: 9, y: 9 },
  'center':        { x: 4, y: 4, w: 8, h: 8 },
};

export default function LogoOverlay({
  logoPreviewUrl,
  logoPosition,
  logoSize,
  logoVisible,
  logoOpacity,
  onUpload,
  onClear,
  onToggleVisibility,
  onPositionChange,
  onSizeChange,
  onOpacityChange,
  disabled = false,
}) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    onUpload?.(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleBrowseClick = () => fileRef.current?.click();

  const handleFileChange = (e) => {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  };

  return (
    <div className="logo-overlay-panel">
      <h3 className="sidebar-title">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        Logo / Image Overlay
      </h3>

      {/* Upload Area */}
      <div
        className={`logo-upload-zone ${dragOver ? 'drag-over' : ''} ${logoPreviewUrl ? 'has-logo' : ''} ${disabled ? 'logo-disabled' : ''}`}
        onDrop={disabled ? undefined : handleDrop}
        onDragOver={disabled ? undefined : handleDragOver}
        onDragLeave={disabled ? undefined : handleDragLeave}
        onClick={!disabled && !logoPreviewUrl ? handleBrowseClick : undefined}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload logo image"
      >
        {logoPreviewUrl ? (
          <img className="logo-preview-thumb" src={logoPreviewUrl} alt="Logo preview" draggable={false} />
        ) : (
          <div className="logo-upload-placeholder">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>Drop image here or click to browse</span>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
      </div>

      {/* Controls (only when a logo is loaded) */}
      {logoPreviewUrl && (
        <div className="logo-controls">
          {/* Visibility Toggle */}
          <label className="logo-toggle-row">
            <span>Show overlay</span>
            <button
              className={`logo-toggle-btn ${logoVisible ? 'active' : ''}`}
              onClick={onToggleVisibility}
              disabled={disabled}
              aria-label={logoVisible ? 'Hide overlay' : 'Show overlay'}
            >
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
            </button>
          </label>

          {/* Position Selector */}
          <div className="logo-control-group">
            <label className="logo-control-label">
              Position
              {logoPosition === 'custom' && (
                <span className="logo-custom-badge">Custom</span>
              )}
            </label>
            <div className="logo-position-grid">
              {POSITIONS.map(({ key, label }) => {
                const fill = POSITION_FILLS[key];
                return (
                  <button
                    key={key}
                    className={`logo-pos-btn ${logoPosition === key ? 'active' : ''}`}
                    onClick={() => onPositionChange?.(key)}
                    disabled={disabled || !logoVisible}
                    title={label}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <rect x="1" y="1" width="14" height="14" rx="1" />
                      {fill && (
                        <rect
                          x={fill.x} y={fill.y}
                          width={fill.w || 5} height={fill.h || 5}
                          rx="0.5" fill="currentColor"
                        />
                      )}
                    </svg>
                  </button>
                );
              })}
            </div>
            <p className="logo-drag-hint">← Drag logo on video to fine-tune position</p>
          </div>

          {/* Size Slider */}
          <div className="logo-control-group">
            <label className="logo-control-label">Size: <strong>{logoSize}%</strong></label>
            <input
              type="range"
              className="logo-slider"
              min={5} max={50} step={1}
              value={logoSize}
              onChange={(e) => onSizeChange?.(Number(e.target.value))}
              disabled={disabled || !logoVisible}
            />
          </div>

          {/* Opacity Slider */}
          <div className="logo-control-group">
            <label className="logo-control-label">Opacity: <strong>{Math.round(logoOpacity * 100)}%</strong></label>
            <input
              type="range"
              className="logo-slider"
              min={10} max={100} step={5}
              value={Math.round(logoOpacity * 100)}
              onChange={(e) => onOpacityChange?.(Number(e.target.value) / 100)}
              disabled={disabled || !logoVisible}
            />
          </div>

          {/* Clear Button */}
          <button className="logo-clear-btn" onClick={onClear} disabled={disabled}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Remove Logo
          </button>
        </div>
      )}
    </div>
  );
}
