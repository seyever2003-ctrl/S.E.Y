import React, { useCallback, useRef, useState } from 'react';

/**
 * SRTUploader – Drag-and-drop / file-picker for .srt files.
 *
 * Props:
 *  - onSRTLoaded: (segments, rawText) => void
 */
export default function SRTUploader({ onSRTLoaded }) {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const handleFile = useCallback((file) => {
    setError('');
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.srt')) {
      setError('Please select a valid .srt file.');
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      // Dynamic import to keep main bundle lean
      import('../utils/srtParser.js').then(({ parseSRT }) => {
        const segments = parseSRT(text);
        if (segments.length === 0) {
          setError('No valid subtitle blocks found in this file.');
          return;
        }
        onSRTLoaded(segments, text);
      });
    };
    reader.onerror = () => {
      setError('Failed to read file.');
    };
    reader.readAsText(file, 'UTF-8');
  }, [onSRTLoaded]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e) => {
    const file = e.target.files[0];
    handleFile(file);
  };

  return (
    <div className="uploader-panel">
      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleBrowseClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleBrowseClick(); }}
      >
        <div className="drop-zone-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className="drop-zone-title">
          {fileName || 'Drop SRT file here'}
        </p>
        <p className="drop-zone-subtitle">
          or click to browse &middot; .srt files only
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".srt"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />

      {error && <p className="upload-error">{error}</p>}

      {fileName && !error && (
        <div className="file-loaded">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{fileName} loaded</span>
        </div>
      )}
    </div>
  );
}
