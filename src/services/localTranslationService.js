/**
 * Local Translation Service (Browser-based)
 * Uses Transformers.js with NLLB-200 to translate text to Khmer entirely
 * in the browser via a Web Worker (ES Module) — CSP-compatible.
 *
 * ═══ Module Worker Architecture ═══
 * The worker file (public/transformers/translation.worker.js) is loaded
 * as { type: 'module' } and uses standard import statements to load
 * Transformers.js — NOT importScripts(). This avoids the "Unexpected token
 * export" error that occurs when importScripts() tries to load an ES module.
 *
 * All Transformers / ONNX Runtime files are referenced by public path strings
 * (e.g. /transformers/transformers.min.js), keeping them outside Vite's
 * build system.
 *
 * Model: Xenova/nllb-200-distilled-600M (~350 MB, cached after first load).
 */

// Path to the ES Module worker — served from public/ as a static asset.
var WORKER_URL = '/transformers/translation.worker.js';
var TRANSLATION_MODEL = 'Xenova/nllb-200-distilled-600M';
var LANGUAGE_MAP = {
  en: { name: 'English', code: 'eng_Latn' },
  zh: { name: 'Chinese', code: 'zho_Hans' },
  th: { name: 'Thai', code: 'tha_Thai' },
  vi: { name: 'Vietnamese', code: 'vie_Latn' },
  ja: { name: 'Japanese', code: 'jpn_Jpan' },
  ko: { name: 'Korean', code: 'kor_Hang' },
  km: { name: 'Khmer', code: 'khm_Khmr' },
};
var TARGET_CODE = 'khm_Khmr';
var workerInstance = null;
var workerReady = null;

function isWorkerSupported() {
  try {
    if (typeof Worker === 'undefined') return false;
    new Worker('data:text/javascript;charset=utf-8,self.postMessage("ok")', { type: 'module' });
    return true;
  } catch (e) { return false; }
}

async function getTranslationWorker(onLog, signal) {
  if (workerInstance && workerReady) return workerInstance;
  if (!isWorkerSupported()) throw new Error('ES Module Workers not supported. Use a modern browser.');
  if (workerInstance) { try { workerInstance.worker.terminate(); } catch {} workerInstance = null; workerReady = null; }
  onLog?.('Starting translation engine in background worker...');
  onLog?.('Loading Translation model (' + TRANSLATION_MODEL + ')...');
  onLog?.('First load downloads ~350 MB. Subsequent loads use browser cache.');

  // Create module worker from public path string
  var worker = new Worker(WORKER_URL, { type: 'module' });
  var inst = { worker: worker };

  var readyP = new Promise(function (resolve, reject) {
    var t = setTimeout(function () {
      worker.terminate();
      reject(new Error('Translation model download timed out after 300s. Check your internet connection and ensure huggingface.co is accessible.'));
    }, 300000);
    worker.onmessage = function (m) {
      var d = m.data;
      if (!d) return;
      if (d.status === 'ready') { clearTimeout(t); resolve(inst); }
      else if (d.status === 'loading') { onLog?.('⏳ ' + (d.message || 'Loading model...')); }
      else if (d.status === 'error') { clearTimeout(t); reject(new Error(d.error || 'Unknown worker error')); }
    };
    worker.onerror = function (e) { clearTimeout(t); reject(new Error('Worker error: ' + (e.message || 'Unknown error'))); };
  });

  // Send load command to worker
  worker.postMessage({ command: 'load' });

  try {
    workerInstance = await readyP;
    workerReady = true;
    return workerInstance;
  } catch (err) {
    worker.terminate();
    workerInstance = null;
    workerReady = null;
    throw err;
  }
}

function sendToWorker(workerApi, text, srcLang, timeout) {
  if (timeout == null) timeout = 60000;
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      reject(new Error('Translation timed out after ' + (timeout / 1000) + 's.'));
    }, timeout);
    workerApi.worker.onmessage = function (msg) {
      var d = msg.data;
      if (!d) return;
      if (d.status === 'complete') { clearTimeout(timer); resolve(d.text || ''); }
      else if (d.status === 'error') { clearTimeout(timer); reject(new Error(d.error || 'Translation error')); }
    };
    workerApi.worker.postMessage({ text: text, srcLang: srcLang });
  });
}




// ── Public API ─────────────────────────────────────────────────────────────────

export async function translateToKhmerLocally(text, sourceLanguage, opts) {
  if (!opts) opts = {};
  var onLog = opts.onLog || function () {};
  var signal = opts.signal;
  if (!text || !text.trim()) return '';
  if (signal?.aborted) throw new DOMException('Translation cancelled', 'AbortError');
  var lang = LANGUAGE_MAP[sourceLanguage];
  if (!lang) { onLog?.('Unsupported language "' + sourceLanguage + '". Falling back to English.'); lang = LANGUAGE_MAP.en; }
  if (sourceLanguage === 'km') return text;
  onLog?.('Translating "' + lang.name + '" → Khmer...');
  var workerApi;
  try { workerApi = await getTranslationWorker(onLog, signal); }
  catch (initErr) { onLog?.('ERROR: ' + initErr.message); throw initErr; }
  if (signal?.aborted) throw new DOMException('Translation cancelled', 'AbortError');
  var maxChunk = 2000;
  if (text.length <= maxChunk) {
    return await sendToWorker(workerApi, text, lang.code);
  }
  var chunks = [];
  for (var i = 0; i < text.length; i += maxChunk) chunks.push(text.slice(i, i + maxChunk));
  onLog?.('Text is long — splitting into ' + chunks.length + ' chunks...');
  var results = [];
  for (var c = 0; c < chunks.length; c++) {
    if (signal?.aborted) throw new DOMException('Translation cancelled', 'AbortError');
    var r = await sendToWorker(workerApi, chunks[c], lang.code);
    results.push(r);
    if (chunks.length > 1) onLog?.('Chunk ' + (c + 1) + '/' + chunks.length + ' translated.');
  }
  if (signal?.aborted) throw new DOMException('Translation cancelled', 'AbortError');
  onLog?.('✓ Translated to Khmer');
  return results.join('\n');
}

export function getSupportedSourceLanguages() {
  return Object.entries(LANGUAGE_MAP).map(function (e) { return { id: e[0], name: e[1].name }; });
}

export async function isTranslationModelCached() {
  try {
    var c = await caches.open('transformers-cache');
    var m = await c.match('https://huggingface.co/' + TRANSLATION_MODEL + '/resolve/main/config.json');
    return !!m;
  } catch { return false; }
}
