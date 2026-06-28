import React, { useCallback, useRef, useState } from 'react';

/**
 * VideoUploader - Drag-and-drop / file-picker for .mp4 video files.
 *
 * Props:
 *  - onVideoLoaded: (file: File|null, objectURL: string|null) => void
 *  - disabled: boolean
 */
export default function VideoUploader({ onVideoLoaded, disabled, hideVideoPreview }) {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [videoPreview, setVideoPreview] = useState(null);
  const [fileName, setFileName] = useState('');
  const [videoMeta, setVideoMeta] = useState(null);
  const [error, setError] = useState('');

  const readVideoMeta = useCallback((file, mainUrl) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    // Create a SEPARATE blob URL for the temp metadata reader so that
    // revoking it does NOT affect the URL used by the main video player.
    const tempUrl = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      setVideoMeta({ duration: video.duration, width: video.videoWidth, height: video.videoHeight, size: file.size, type: file.type || 'video/mp4' });
      video.src = '';
      URL.revokeObjectURL(tempUrl);
    };
    video.onerror = () => {
      setVideoMeta({ duration: 0, width: 0, height: 0, size: file.size, type: file.type || 'video/mp4' });
      URL.revokeObjectURL(tempUrl);
    };
    video.src = tempUrl;
  }, []);

  const handleFile = useCallback((file) => {
    setError('');
    if (!file) return;
    const validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    const validExts = ['.mp4', '.webm', '.ogg', '.mov'];
    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      setError('Please select a valid video file (.mp4, .webm, .ogg, .mov).');
      return;
    }
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
    readVideoMeta(file, url);
    onVideoLoaded?.(file, url);
  }, [onVideoLoaded, readVideoMeta, videoPreview]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile, disabled]);
  const handleDragOver = useCallback((e) => { e.preventDefault(); if (!disabled) setDragOver(true); }, [disabled]);
  const handleDragLeave = useCallback(() => { setDragOver(false); }, []);
  const handleBrowseClick = () => { if (!disabled) fileInputRef.current?.click(); };
  const handleInputChange = (e) => { const file = e.target.files[0]; handleFile(file); };

  const handleClear = useCallback(() => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null); setFileName(''); setVideoMeta(null); setError('');
    onVideoLoaded?.(null, null);
  }, [videoPreview, onVideoLoaded]);

  const formatSize = (bytes) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const fmtDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return 'Unknown';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + s.toString().padStart(2, '0');
  };

  return (
    <div className="video-uploader-panel">
      {!videoPreview && (
        <div
          className={'video-drop-zone' + (dragOver ? ' drag-over' : '') + (disabled ? ' disabled' : '')}
          onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
          onClick={handleBrowseClick} role="button" tabIndex={0}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) handleBrowseClick(); }}
        >
          <div className="video-drop-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
          </div>
          <p className="video-drop-title">Drop video here</p>
          <p className="video-drop-subtitle">or click to browse .mp4, .webm, .mov</p>
        </div>
      )}
      <input ref={fileInputRef} type="file" accept=".mp4,.webm,.ogg,.mov" style={{display:'none'}} onChange={handleInputChange} disabled={disabled} />
      {videoPreview && !hideVideoPreview && (
        <div className="video-preview-card">
          <div className="video-preview-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
            <span className="video-filename">{fileName}</span>
            <button className="video-clear-btn" onClick={handleClear} title="Remove video" disabled={disabled}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="video-preview-container">
            <video className="video-preview-player" src={videoPreview} controls preload="metadata" playsInline />
          </div>
          {videoMeta && (
            <div className="video-meta-row">
              <span className="video-meta-item">{fmtDuration(videoMeta.duration)}</span>
              <span className="video-meta-item">{videoMeta.width}x{videoMeta.height}</span>
              <span className="video-meta-item">{formatSize(videoMeta.size)}</span>
            </div>
          )}
        </div>
      )}
      {error && <p className="video-upload-error">{error}</p>}
    </div>
  );
}
