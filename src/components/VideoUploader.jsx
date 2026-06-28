import React, { useCallback, useRef, useState } from 'react';

/**
 * MediaLibrary — multi-file video uploader with thumbnail grid.
 *
 * Props:
 *   onVideoLoaded   — (file, objectURL) called when user clicks a card
 *   mediaLibrary    — array of { id, file, name, duration, url }
 *   setMediaLibrary — setter for the array above
 *   disabled        — boolean
 */
export default function VideoUploader({ onVideoLoaded, mediaLibrary, setMediaLibrary, disabled }) {
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);
  const dragCounterRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  const fmtDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return '?';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + s.toString().padStart(2, '0');
  };

  const genId = () => Math.random().toString(36).slice(2, 10);

  /* capture a single frame as a static thumbnail (no playback) */
  const captureThumb = (file) =>
    new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      const url = URL.createObjectURL(file);
      let cleaned = false;
      const clean = () => { if (!cleaned) { cleaned = true; v.src = ''; URL.revokeObjectURL(url); } };
      v.onloadedmetadata = () => {
        v.currentTime = Math.min(1, v.duration / 2);
      };
      v.onseeked = () => {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 180;
        c.getContext('2d').drawImage(v, 0, 0, 320, 180);
        const dataUrl = c.toDataURL('image/jpeg', 0.85);
        clean();
        resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, thumbnail: dataUrl });
      };
      v.onerror = () => { clean(); resolve({ duration: 0, width: 0, height: 0, thumbnail: null }); };
      v.src = url;
    });

  /* process one or more dropped / picked files */
  const processFiles = useCallback(
    async (fileList) => {
      setError('');
      const validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
      const validExts = ['.mp4', '.webm', '.ogg', '.mov'];
      const newItems = [];

      for (const file of fileList) {
        const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
        if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
          setError(`"${file.name}" is not a supported video file.`);
          continue;
        }
        // Grab a static frame + metadata immediately via canvas (no live video)
        const meta = await captureThumb(file);
        const url = URL.createObjectURL(file);
        newItems.push({
          id: genId(),
          file,
          name: file.name,
          duration: meta.duration,
          url,
          width: meta.width,
          height: meta.height,
          thumbnail: meta.thumbnail,  // static JPEG data URL
        });
      }

      if (newItems.length > 0) {
        setMediaLibrary((prev) => [...prev, ...newItems]);
        if (newItems.length === 1 && mediaLibrary.length === 0) {
          onVideoLoaded?.(newItems[0].file, newItems[0].url);
        }
      }
    },
    [mediaLibrary.length, onVideoLoaded, setMediaLibrary],
  );

  /* event handlers — ref-based drag counter prevents flicker */
  const handleDragEnter = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      if (!disabled) setDragOver(true);
    },
    [disabled],
  );
  const handleDragOver = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    [],
  );
  const handleDragLeave = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setDragOver(false);
      }
    },
    [],
  );
  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setDragOver(false);
      if (disabled) return;
      processFiles(e.dataTransfer.files);
    },
    [disabled, processFiles],
  );
  const handleBrowseClick = () => { if (!disabled) fileInputRef.current?.click(); };
  const handleInputChange = (e) => {
    if (e.target.files?.length) processFiles(e.target.files);
    e.target.value = '';
  };

  /* select a card as the active video */
  const handleCardClick = useCallback(
    (item) => { onVideoLoaded?.(item.file, item.url); },
    [onVideoLoaded],
  );

  /* remove a card from the library */
  const handleRemove = useCallback(
    (e, item) => {
      e.stopPropagation();
      URL.revokeObjectURL(item.url);
      setMediaLibrary((prev) => prev.filter((i) => i.id !== item.id));
    },
    [setMediaLibrary],
  );

  return (
    <div className="media-library">
      {/* drop / browse zone — events bound to this dashed container only */}
      <div
        ref={dropRef}
        className={'media-drop-zone' + (dragOver ? ' drag-over' : '') + (disabled ? ' disabled' : '')}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBrowseClick}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) handleBrowseClick(); }}
      >
        <div className="media-drop-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
          </svg>
        </div>
        <p className="media-drop-title">Drop videos here</p>
        <p className="media-drop-subtitle">or click to browse &middot; select multiple</p>
      </div>

      <input
        ref={fileInputRef}
        type="file" multiple
        accept=".mp4,.webm,.ogg,.mov"
        style={{ display: 'none' }}
        onChange={handleInputChange}
        disabled={disabled}
      />

      {/* vertical list of uploaded video cards */}
      {mediaLibrary.length > 0 && (
        <div className="media-library-list">
          {mediaLibrary.map((item) => (
            <div
              key={item.id}
              className="media-library-card"
              onClick={() => handleCardClick(item)}
              title={`Click to load "${item.name}"`}
            >
              <div className="media-card-thumb">
                <img className="media-card-img" src={item.thumbnail} alt="" />
                <span className="media-card-duration">{fmtDuration(item.duration)}</span>
              </div>
              <div className="media-card-info">
                <span className="media-card-filename" title={item.name}>{item.name}</span>
                <button className="media-card-remove" onClick={(e) => handleRemove(e, item)} title="Remove">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="media-upload-error">{error}</p>}
    </div>
  );
}

