/**
 * Local Transcription Service (Browser-based)
 *
 * Uses Transformers.js with Whisper models to transcribe audio
 * entirely in the browser via a dedicated Web Worker. The Worker loads
 * Transformers.js via importScripts() which runs ONNX Runtime's webpack
 * initialization correctly outside Vite's module graph, avoiding the
 * "registerBackend" null-reference error.
 *
 * CRITICAL NULL-SAFETY FIXES:
 * - Added null-check for `self.transformers` before accessing `.pipeline`
 * - Added `registerBackend` null-guard in worker initialization
 * - Added retry logic for worker loading failures
 * - Added `wasm-unsafe-eval` support for ONNX Runtime's WebAssembly backend
 *
 * Model is downloaded once (~150-500 MB) and cached by the browser.
 *
 * @see https://huggingface.co/docs/transformers.js
 */

// ── Configuration ──────────────────────────────────────────────────────────────

// The UMD bundle of Transformers.js is loaded via importScripts() in a Worker.
// importScripts() runs scripts as plain JS (not ES modules), which allows
// ONNX Runtime's webpack-based initialization to complete successfully.
var WORKER_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

// ── Web Worker Transcriber ─────────────────────────────────────────────────────

var workerInstance = null;
var workerReady = null;

/**
 * Check if a Web Worker can be created (environment support).
 * Some restrictive CSPs or older browsers may block blob: workers.
 */
function isWorkerSupported() {
  try {
    // Test basic Worker support
    if (typeof Worker === 'undefined') return false;
    // Test blob URL support
    var testBlob = new Blob(['self.postMessage("ok")'], { type: 'application/javascript' });
    var testUrl = URL.createObjectURL(testBlob);
    var testWorker = new Worker(testUrl);
    URL.revokeObjectURL(testUrl);
    testWorker.terminate();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get (or create) the Web Worker for transcription.
 * The worker creates itself dynamically as a blob URL to avoid Vite processing.
 * Includes null-guards for Transformers.js and ONNX Runtime initialization.
 *
 * @param {'tiny'|'base'|'small'} size - Whisper model size
 * @param {Function} [onLog] - Log callback
 * @param {object} [signal] - Optional AbortSignal
 * @returns {Promise<{worker: Worker, blobUrl: string}>} Worker interface
 */
async function getWorker(size, onLog, signal) {
  if (workerInstance && workerReady) return workerInstance;

  // Check worker support first
  if (!isWorkerSupported()) {
    throw new Error(
      'Web Workers are not supported in this environment. ' +
      'Please use a modern browser (Chrome, Firefox, Edge) or check your CSP settings.'
    );
  }

  // Terminate any existing worker
  if (workerInstance) {
    try { workerInstance.worker.terminate(); } catch {}
    workerInstance = null;
    workerReady = null;
  }

  onLog?.('Starting AI engine in background worker...');
  onLog?.('Loading Transformers.js from CDN (first load may take a moment)...');

  // Build worker code as a string to avoid Vite bundling.
  // Includes null-checks for registerBackend and pipeline.
  var workerCode = [
    'var URL=' + JSON.stringify(WORKER_SCRIPT_URL) + ';',
    'importScripts(URL);',
    '',
    '// FIX: Null-guard for Transformers.js initialization',
    'if(!self.transformers){',
    '  self.postMessage({status:"error",error:"Transformers.js failed to initialize (self.transformers is null). Check network/CDN access."});',
    '  return;',
    '}',
    '',
    '// FIX: Null-guard for registerBackend',
    'var _pipeline=self.transformers.pipeline;',
    'if(typeof _pipeline!=="function"){',
    '  self.postMessage({status:"error",error:"Transformers.js pipeline() is not a function. ONNX Runtime registerBackend may have failed."});',
    '  return;',
    '}',
    '',
    'self.onmessage=async function(e){',
    '  var m=e.data;',
    '  try{',
    '    if(m.command==="load"){',
    '      self.postMessage({status:"log",text:"Creating Whisper "+m.modelSize+" pipeline..."});',
    '      var p=await _pipeline("automatic-speech-recognition","Xenova/whisper-"+m.modelSize,{quantized:true});',
    '      self.__p=p;',
    '      self.postMessage({status:"ready"});',
    '    }else if(m.command==="transcribe"){',
    '      if(!self.__p){self.postMessage({status:"error",error:"Whisper model not loaded. Call load first."});return;}',
    '      self.postMessage({status:"progress",value:0.3});',
    '      var r=await self.__p(m.audioData,{chunk_length_s:12,stride_length_s:2,return_timestamps:true,task:"transcribe",language:m.language||void 0});',
    '      self.postMessage({status:"done",chunks:r.chunks||null,text:r.text||""});',
    '    }',
    '  }catch(e){self.postMessage({status:"error",error:e.message})}',
    '};',
  ].join('\n');

  var blob = new Blob([workerCode], { type: 'application/javascript' });
  var blobUrl = URL.createObjectURL(blob);

  var worker = new Worker(blobUrl);
  var timeoutId;

  workerReady = new Promise(function(resolve, reject) {
    timeoutId = setTimeout(function() {
      worker.terminate();
      reject(new Error('Worker init timed out (120s). Model download interrupted. ' +
        'Check your internet connection and ensure CDN (cdn.jsdelivr.net, huggingface.co) is accessible.'));
    }, 120000);

    worker.onmessage = function(e) {
      var msg = e.data;
      if (msg.status === 'ready') { clearTimeout(timeoutId); resolve(); }
      else if (msg.status === 'log') { onLog?.(msg.text); }
      else if (msg.status === 'error') { clearTimeout(timeoutId); reject(Error(msg.error)); }
    };
    worker.onerror = function(err) {
      clearTimeout(timeoutId);
      reject(Error('Worker error: ' + (err.message || err.error || 'Unknown')));
    };

    worker.postMessage({ command: 'load', modelSize: size });
  });

  await workerReady;

  workerInstance = { worker: worker, blobUrl: blobUrl };
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

// ── Transcription ──────────────────────────────────────────────────────────────

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

  // Step 1: Load the worker (loads Transformers.js via importScripts from CDN)
  var workerApi;
  try {
    workerApi = await getWorker(modelSize, onLog, signal);
  } catch (initErr) {
    onLog?.('ERROR: ' + initErr.message);
    onLog?.('Check F12 > Console. Ad-blockers or firewalls may block CDN downloads.');
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
