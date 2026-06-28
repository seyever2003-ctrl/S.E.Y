/**
 * Local Transcription Service (Browser-based)
 *
 * Uses Transformers.js with Whisper models to transcribe audio
 * entirely in the browser via a dedicated Web Worker (ES Module).
 *
 * ═══ Module Worker Architecture ═══
 * The worker file (public/transformers/transcription.worker.js) is loaded
 * as { type: 'module' } and uses standard import statements to load
 * Transformers.js — NOT importScripts(). This avoids the "Unexpected token
 * export" error that occurs when importScripts() tries to load an ES module.
 *
 * All Transformers / ONNX Runtime files are referenced by public path strings
 * (e.g. /transformers/transformers.min.js), keeping them outside Vite's
 * build system and eliminating "Failed to load url" / CSP errors.
 *
 * Model is downloaded once (~150-500 MB) and cached by the browser.
 *
 * @see https://huggingface.co/docs/transformers.js
 */

// ── Configuration ──────────────────────────────────────────────────────────────

// Path to the ES Module worker — served from public/ as a static asset.
// Vite does not process it; it's loaded by the browser as a native module worker.
var WORKER_URL = '/transformers/transcription.worker.js';

// ── Web Worker Transcriber ─────────────────────────────────────────────────────

var workerInstance = null;
var workerReady = null;

/**
 * Check if Module Workers are supported in this environment.
 */
function isWorkerSupported() {
  try {
    if (typeof Worker === 'undefined') return false;
    // Quick test: module worker constructor exists
    new Worker('data:text/javascript;charset=utf-8,self.postMessage("ok")', { type: 'module' });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get (or create) the Web Worker for transcription.
 * Loads the standalone module worker from public/ via path string.
 *
 * @param {'tiny'|'base'|'small'} size - Whisper model size
 * @param {Function} [onLog] - Log callback
 * @param {object} [signal] - Optional AbortSignal
 * @returns {Promise<{worker: Worker}>} Worker interface
 */
async function getWorker(size, onLog, signal) {
  if (workerInstance && workerReady) return workerInstance;

  // Check module worker support
  if (!isWorkerSupported()) {
    throw new Error(
      'ES Module Workers are not supported in this environment. ' +
      'Please use a modern browser (Chrome 80+, Firefox 113+, Edge 80+).'
    );
  }

  // Terminate any existing worker
  if (workerInstance) {
    try { workerInstance.worker.terminate(); } catch {}
    workerInstance = null;
    workerReady = null;
  }

  onLog?.('Starting AI engine in background worker...');
  onLog?.('Loading Transformers.js engine...');

  // ── Create module worker from public path string ─────────────────────
  // No blob URL needed. The worker file is a native ES module served as a
  // static asset from public/. It uses `import` to load Transformers.js.
  var worker = new Worker(WORKER_URL, { type: 'module' });
  var timeoutId;

  workerReady = new Promise(function(resolve, reject) {
    timeoutId = setTimeout(function() {
      worker.terminate();
      reject(new Error('Worker init timed out (120s). Model download interrupted. ' +
        'Check your internet connection and ensure huggingface.co is accessible.'));
    }, 120000);

    worker.onmessage = function(e) {
      var msg = e.data;
      if (msg.status === 'ready') { clearTimeout(timeoutId); resolve(); }
      else if (msg.status === 'log') { onLog?.(msg.text); }
      else if (msg.status === 'loading') { onLog?.('⏳ ' + (msg.message || 'Loading model...')); }
      else if (msg.status === 'error') { clearTimeout(timeoutId); reject(Error(msg.error)); }
    };
    worker.onerror = function(err) {
      clearTimeout(timeoutId);
      reject(Error('Worker error: ' + (err.message || err.error || 'Unknown')));
    };

    worker.postMessage({ command: 'load', modelSize: size });
  });

  await workerReady;

  workerInstance = { worker: worker };
  onLog?.('AI engine worker ready.');
  return workerInstance;
}

/**
 * Send a transcription job to the worker and wait for the result.
 * Transfers the audio buffer to the worker (zero-copy).
 */
function sendToWorker(workerApi, audioData, opts) {
  return new Promise(function(resolve, reject) {
    var worker = workerApi.worker;
    var timeoutId = setTimeout(function() {
      reject(Error('Transcription timed out after 30 minutes.'));
    }, 1800000);

    worker.onmessage = function(e) {
      var msg = e.data;
      if (msg.status === 'done') { clearTimeout(timeoutId); resolve(msg); }
      else if (msg.status === 'log') { opts.onLog?.(msg.text); }
      else if (msg.status === 'progress') { opts.onProgress?.(msg.value); }
      else if (msg.status === 'error') { clearTimeout(timeoutId); reject(Error(msg.error)); }
    };
    worker.onerror = function(err) {
      clearTimeout(timeoutId);
      reject(Error('Worker error: ' + (err.message || err.error || 'Unknown')));
    };

    worker.postMessage(
      { command: 'transcribe', audioData: audioData, language: opts.language || null },
      [audioData.buffer]
    );
  });
}

// ── Available Models ───────────────────────────────────────────────────────────

export const LOCAL_WHISPER_MODELS = [
  {
    id: 'tiny',
    name: 'Whisper Tiny (Fastest)',
    description: 'Quick tests only. Not recommended for Khmer or non-English speech.',
  },
  {
    id: 'base',
    name: 'Whisper Base',
    description: 'Decent for English/European languages. May struggle with Khmer script.',
  },
  {
    id: 'small',
    name: 'Whisper Small ⭐ Recommended',
    description: 'Best accuracy for Khmer and non-Latin scripts. Handles complex languages well.',
  },
];

// ── Transcription (returns SRT text) ───────────────────────────────────────────

/**
 * Transcribe audio locally using a background Web Worker.
 * Worker loads Transformers.js via importScripts() (outside Vite's module graph),
 * which allows ONNX Runtime's webpack initialization to complete correctly.
 *
 * @param {Blob} audioBlob - WAV audio blob (16kHz mono, from extractAudio)
 * @param {Object} [opts]
 * @param {'tiny'|'base'|'small'} [opts.modelSize='small'] - Whisper model size
 * @param {string} [opts.language] - Language code (e.g. 'km', 'en') or empty for auto-detect
 * @param {Function} [opts.onLog] - Log callback
 * @param {Function} [opts.onProgress] - Progress callback (0-1)
 * @param {AbortSignal} [opts.signal] - Optional AbortSignal
 * @returns {Promise<string>} SRT-formatted transcription text
 */
export async function transcribeLocally(audioBlob, opts) {
  if (!opts) opts = {};
  var modelSize = opts.modelSize || 'small';
  var language = opts.language || 'km';
  var onLog = opts.onLog;
  var onProgress = opts.onProgress;
  var signal = opts.signal;

  if (signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');

  onLog?.('Starting local transcription engine...');

  // Step 1: Load the module worker (uses dynamic import for Transformers.js from CDN)
  var workerApi;
  try {
    workerApi = await getWorker(modelSize, onLog, signal);
  } catch (initErr) {
    onLog?.('ERROR: ' + initErr.message);
    onLog?.('Check F12 > Console for details.');
    throw initErr;
  }
  if (signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');

  // Step 2: Decode WAV to Float32Array and send to worker (zero-copy transfer)
  onLog?.('Decoding audio for processing...');
  var audioData;
  try {
    var arrayBuf = await audioBlob.arrayBuffer();
    var ctx = new AudioContext({ sampleRate: 16000 });
    var audioBuf = await ctx.decodeAudioData(arrayBuf);
    audioData = audioBuf.getChannelData(0);
    ctx.close();
  } catch (decodeErr) {
    onLog?.('ERROR: Audio decoding failed: ' + (decodeErr.message || 'Corrupted WAV'));
    throw new Error('Audio decoding failed: ' + (decodeErr.message || 'WAV not recognized'));
  }

  onLog?.('Transcribing (' + (audioData.length / 16000 / 60).toFixed(1) + ' min, ' +
    (audioData.byteLength / 1024 / 1024).toFixed(1) + ' MB) with Whisper ' + modelSize + '...');
  if (signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');

  // Step 3: Send audio to worker for transcription
  var result;
  try {
    result = await sendToWorker(workerApi, audioData, {
      language: language,
      onLog: onLog,
      onProgress: onProgress,
    });
  } catch (transErr) {
    onLog?.('ERROR: ' + transErr.message);
    throw transErr;
  }

  // Step 4: Convert result to valid SRT format
  if (!result || (!result.chunks && !result.text)) {
    throw new Error('Transcription returned empty result. Audio may be silent.');
  }
  if (!result.chunks || result.chunks.length === 0) {
    onLog?.('Using full text (no timestamps) as a single segment.');
    return '1\n00:00:00,000 --> 00:00:10,000\n' + (result.text || '').trim() + '\n';
  }

  var srt = [];
  for (var i = 0; i < result.chunks.length; i++) {
    var c = result.chunks[i];
    var t = (c.text || '').trim();
    if (!t) continue;
    srt.push(
      (i + 1) + '\n' +
      fmtTime(c.timestamp[0]) + ' --> ' + fmtTime(c.timestamp[1]) + '\n' +
      t + '\n'
    );
  }
  var output = srt.join('\n');
  var blockCount = output.split('\n').filter(function(l) { return l.indexOf('-->') >= 0; }).length;
  onLog?.('Complete: ' + blockCount + ' subtitle blocks.');
  return output;
}

// ── Transcription (returns App-compatible Segments) ────────────────────────────

/**
 * Transcribe audio locally and return app-compatible segment objects
 * that can be passed directly into App.jsx's segments state.
 *
 * Each segment: { id, start, end, duration, text, originalText, translated }
 *
 * @param {Blob} audioBlob - WAV audio blob (16kHz mono, from extractAudio)
 * @param {Object} [opts]
 * @param {'tiny'|'base'|'small'} [opts.modelSize='small'] - Whisper model size
 * @param {string} [opts.language] - Language code (e.g. 'km', 'en') or empty for auto-detect
 * @param {Function} [opts.onLog] - Log callback
 * @param {Function} [opts.onProgress] - Progress callback (0-1)
 * @param {AbortSignal} [opts.signal] - Optional AbortSignal
 * @returns {Promise<Array<{id:number,start:number,end:number,duration:number,text:string,originalText:string,translated:boolean}>>}
 */
export async function transcribeLocallyToSegments(audioBlob, opts) {
  if (!opts) opts = {};
  var modelSize = opts.modelSize || 'small';
  var language = opts.language || 'km';
  var onLog = opts.onLog;
  var onProgress = opts.onProgress;
  var signal = opts.signal;

  if (signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');

  onLog?.('Starting local transcription engine (direct segments)...');

  // Step 1: Load the module worker
  var workerApi;
  try {
    workerApi = await getWorker(modelSize, onLog, signal);
  } catch (initErr) {
    onLog?.('ERROR: ' + initErr.message);
    throw initErr;
  }
  if (signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');

  // Step 2: Decode WAV to Float32Array
  onLog?.('Decoding audio for processing...');
  var audioData;
  try {
    var arrayBuf = await audioBlob.arrayBuffer();
    var ctx = new AudioContext({ sampleRate: 16000 });
    var audioBuf = await ctx.decodeAudioData(arrayBuf);
    audioData = audioBuf.getChannelData(0);
    ctx.close();
  } catch (decodeErr) {
    onLog?.('ERROR: Audio decoding failed: ' + (decodeErr.message || 'Corrupted WAV'));
    throw new Error('Audio decoding failed: ' + (decodeErr.message || 'WAV not recognized'));
  }

  onLog?.('Transcribing (' + (audioData.length / 16000 / 60).toFixed(1) + ' min, ' +
    (audioData.byteLength / 1024 / 1024).toFixed(1) + ' MB) with Whisper ' + modelSize + '...');
  if (signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');

  // Step 3: Send audio to worker
  var result;
  try {
    result = await sendToWorker(workerApi, audioData, {
      language: language,
      onLog: onLog,
      onProgress: onProgress,
    });
  } catch (transErr) {
    onLog?.('ERROR: ' + transErr.message);
    throw transErr;
  }

  // Step 4: Convert chunks to app-compatible segments
  if (!result || (!result.chunks && !result.text)) {
    throw new Error('Transcription returned empty result. Audio may be silent.');
  }

  var segments = [];
  var chunks = result.chunks || [];

  if (chunks.length === 0 && result.text) {
    // No timestamps — create a single segment
    segments.push({
      id: 1,
      start: 0,
      end: 10,
      duration: 10,
      text: (result.text || '').trim(),
      originalText: (result.text || '').trim(),
      translated: false,
    });
  } else {
    for (var i = 0; i < chunks.length; i++) {
      var c = chunks[i];
      var t = (c.text || '').trim();
      if (!t) continue;
      var start = c.timestamp ? c.timestamp[0] : 0;
      var end = c.timestamp ? c.timestamp[1] : 0;
      segments.push({
        id: i + 1,
        start: start,
        end: end,
        duration: end - start,
        text: t,
        originalText: t,
        translated: false,
      });
    }
  }

  onLog?.('Complete: ' + segments.length + ' segments generated (no API key needed).');
  return segments;
}

// ── Model Cache Info ───────────────────────────────────────────────────────────

/**
 * Check if a specific Whisper model is cached in the browser.
 * Transformers.js uses IndexedDB and Cache API for model storage.
 *
 * @param {'tiny'|'base'|'small'} size
 * @returns {Promise<boolean>}
 */
export async function isModelCached(size = 'base') {
  try {
    const modelName = 'Xenova/whisper-' + size;
    // Check if the model config is in Cache API
    const cache = await caches.open('transformers-cache');
    const configUrl = 'https://huggingface.co/' + modelName + '/resolve/main/config.json';
    const cached = await cache.match(configUrl);
    return !!cached;
  } catch {
    return false;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Format seconds as SRT timestamp: HH:MM:SS,mmm
 */
function fmtTime(seconds) {
  if (seconds == null || isNaN(seconds)) return '00:00:00,000';
  var h = Math.floor(seconds / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  var s = Math.floor(seconds % 60);
  var ms = Math.floor((seconds % 1) * 1000);
  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + ',' +
    String(ms).padStart(3, '0')
  );
}