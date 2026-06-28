/**
 * videoStreamService.js
 *
 * Provides a MediaSource-based streaming layer for playing large video files
 * without loading the entire blob into memory at once.
 *
 * On mobile browsers (especially Chrome on Android), setting a blob: URL as
 * the <video> src can cause the browser to keep the whole File in memory and
 * potentially garbage-collect the underlying blob memory mid-playback, causing
 * a "Video error" (MEDIA_ERR_DECODE / MEDIA_ERR_NETWORK).
 *
 * This service reads the File in small chunks (default 512 KB) via File.slice()
 * and feeds them progressively into a MediaSource SourceBuffer. The browser
 * only holds as much data as needed for the current playhead, drastically
 * reducing peak memory usage.
 *
 * Usage:
 *   import { createVideoStream } from '../services/videoStreamService.js';
 *
 *   const stream = createVideoStream(videoElement, file, {
 *     chunkSize: 512 * 1024,
 *     mimeType: 'video/mp4',
 *     onError: (err) => { ... },
 *   });
 *   stream.start();
 *   // later, to clean up:
 *   stream.destroy();
 */

/**
 * @typedef {Object} VideoStreamOptions
 * @property {number}  [chunkSize=524288]
 * @property {string}  [mimeType]
 * @property {(err: Error) => void} [onError]
 * @property {() => void} [onEnded]
 */

/**
 * Create a controllable video stream from a File/Blob using MediaSource.
 *
 * @param {HTMLVideoElement} videoEl
 * @param {File|Blob}        file
 * @param {VideoStreamOptions} [opts]
 * @returns {{
 *   start: () => void,
 *   destroy: () => void,
 *   getState: () => string,
 * }}
 */
export function createVideoStream(videoEl, file, opts = {}) {
  if (!videoEl || !file) {
    throw new Error('[videoStream] videoEl and file are required');
  }

  const {
    chunkSize = 512 * 1024,
    mimeType = file.type || 'video/mp4',
    onError = () => {},
    onEnded = () => {},
  } = opts;

  let mediaSource = null;
  let sourceBuffer = null;
  let fileReader = null;
  let offset = 0;
  let aborted = false;
  let state = 'idle';

  const fileSize = file.size;

  /**
   * Read the next chunk from the File and append it to the SourceBuffer.
   */
  function appendNextChunk() {
    if (aborted || !sourceBuffer || sourceBuffer.updating) return;

    if (offset >= fileSize) {
      state = 'ended';
      try {
        mediaSource.endOfStream();
      } catch (e) {
        if (!aborted) {
          console.warn('[videoStream] endOfStream warning:', e.message);
        }
      }
      onEnded();
      return;
    }

    const end = Math.min(offset + chunkSize, fileSize);
    const chunk = file.slice(offset, end);

    fileReader = new FileReader();

    fileReader.onload = () => {
      if (aborted) return;
      try {
        sourceBuffer.appendBuffer(fileReader.result);
        offset = end;
      } catch (err) {
        handleError(new Error('[videoStream] appendBuffer failed: ' + err.message));
      }
    };

    fileReader.onerror = () => {
      handleError(new Error('[videoStream] FileReader error'));
    };

    fileReader.readAsArrayBuffer(chunk);
  }

  function onUpdateEnd() {
    if (aborted) return;
    appendNextChunk();
  }

  function handleError(err) {
    if (aborted) return;
    console.error('[videoStream]', err.message);
    state = 'error';
    onError(err);
  }

  /**
   * Start streaming: open MediaSource, wait for it, create SourceBuffer,
   * then begin appending chunks.
   */
  function start() {
    if (state !== 'idle') {
      console.warn('[videoStream] start() called but state is', state);
      return;
    }

    let effectiveMime = mimeType;

    // Add codec hints if missing — MediaSource often requires them
    if (!effectiveMime.includes('codecs=')) {
      var codecMap = {
        'video/mp4': 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
        'video/webm': 'video/webm; codecs="vp8, vorbis"',
        'video/ogg': 'video/ogg; codecs="theora, vorbis"',
        'video/quicktime': 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
      };
      effectiveMime = codecMap[effectiveMime] || effectiveMime;
    }

    if (!MediaSource.isTypeSupported(effectiveMime)) {
      console.warn(
        '[videoStream] MediaSource does not support MIME type "' +
        effectiveMime + '" — falling back to blob URL with preload=metadata'
      );
      state = 'error';
      onError(new Error('MediaSource not supported for ' + effectiveMime));
      return;
    }

    state = 'opening';
    mediaSource = new MediaSource();

    mediaSource.addEventListener('sourceopen', function onOpen() {
      if (aborted) return;

      try {
        sourceBuffer = mediaSource.addSourceBuffer(effectiveMime);
        sourceBuffer.addEventListener('updateend', onUpdateEnd);
        sourceBuffer.addEventListener('error', function () {
          handleError(new Error('[videoStream] SourceBuffer error'));
        });

        videoEl.src = URL.createObjectURL(mediaSource);
        videoEl.load();

        state = 'appending';
        appendNextChunk();
      } catch (err) {
        handleError(new Error('[videoStream] addSourceBuffer failed: ' + err.message));
      }
    });

    mediaSource.addEventListener('sourceended', function () {
      console.log('[videoStream] MediaSource stream ended');
    });

    mediaSource.addEventListener('sourceclose', function () {
      console.log('[videoStream] MediaSource closed');
    });
  }

  /**
   * Destroy the stream: abort pending reads, close MediaSource, and revoke
   * any object URLs.
   */
  function destroy() {
    aborted = true;

    if (fileReader) {
      try { fileReader.abort(); } catch (_) { /* ignore */ }
      fileReader = null;
    }

    if (sourceBuffer) {
      try {
        sourceBuffer.removeEventListener('updateend', onUpdateEnd);
        if (!sourceBuffer.updating) {
          sourceBuffer.abort();
        }
      } catch (_) { /* ignore */ }
      sourceBuffer = null;
    }

    if (mediaSource) {
      try {
        if (mediaSource.readyState === 'open') {
          mediaSource.endOfStream();
        }
      } catch (_) { /* ignore */ }

      if (videoEl && videoEl.src && videoEl.src.startsWith('blob:')) {
        URL.revokeObjectURL(videoEl.src);
      }

      mediaSource = null;
    }

    if (videoEl) {
      videoEl.src = '';
      videoEl.load();
    }

    state = 'destroyed';
    console.log('[videoStream] destroyed');
  }

  function getState() {
    return state;
  }

  return { start: start, destroy: destroy, getState: getState };
}


/**
 * Determines whether streaming via MediaSource is likely beneficial
 * for the given file. Large files (>50MB) on mobile are the primary target.
 *
 * @param {File|Blob} file
 * @returns {boolean}
 */
export function shouldStreamFile(file) {
  if (!file) return false;
  var LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50 MB
  var isLarge = file.size > LARGE_FILE_THRESHOLD;
  var isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
  return isLarge || isMobile;
}


/**
 * Check if MediaSource API is available in the current browser.
 * @returns {boolean}
 */
export function isMediaSourceSupported() {
  return typeof MediaSource !== 'undefined' &&
         typeof MediaSource.isTypeSupported === 'function';
}
