/**
 * Local Translation Service (Browser-based)
 * Uses Transformers.js with NLLB-200 to translate text to Khmer entirely
 * in the browser via a Web Worker (importScripts) — CSP-compatible.
 * Model: Xenova/nllb-200-distilled-600M (~350 MB, cached after first load).
 */
var WORKER_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
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
    var b = new Blob(['self.postMessage("ok")'], { type: 'application/javascript' });
    var u = URL.createObjectURL(b);
    var w = new Worker(u);
    URL.revokeObjectURL(u);
    w.terminate();
    return true;
  } catch (e) { return false; }
}

async function getTranslationWorker(onLog, signal) {
  if (workerInstance && workerReady) return workerInstance;
  if (!isWorkerSupported()) throw new Error('Web Workers not supported. Use a modern browser or check CSP settings.');
  if (workerInstance) { try { workerInstance.worker.terminate(); } catch {} workerInstance = null; workerReady = null; }
  onLog?.('Starting translation engine in background worker...');
  onLog?.('Loading Translation model (' + TRANSLATION_MODEL + ') from CDN...');
  onLog?.('First load downloads ~350 MB. Subsequent loads use browser cache.');
  var wc = [
    'var URL=' + JSON.stringify(WORKER_SCRIPT_URL) + ';',
    'importScripts(URL);',
    'if(!self.transformers){self.postMessage({status:"error",error:"Transformers.js failed to load from CDN."});return;}',
    'var pipe=null;var ready=false;',
    'async function init(){',
    '  try{',
    '    if(!self.transformers){throw new Error("self.transformers is null");}',
    '    var p=null;',
    '    if(typeof self.transformers.pipeline==="function"){p=self.transformers.pipeline;}',
    '    else if(self.transformers.default&&typeof self.transformers.default.pipeline==="function"){p=self.transformers.default.pipeline;}',
    '    else{throw new Error("Transformers.js pipeline() not found.");}',
    '    var env=self.transformers.env||self.transformers.default?.env;',
    '    if(env){env.allowLocalModel=false;env.useBrowserCache=true;}',
    '    self.postMessage({status:"loading",message:"Loading translation model (NLLB-200)..."});',
    '    pipe=await p("translation",' + JSON.stringify(TRANSLATION_MODEL) + ',{quantized:true});',
    '    if(!pipe){throw new Error("pipeline() returned null");}',
    '    ready=true;',
    '    self.postMessage({status:"ready"});',
    '  }catch(e){self.postMessage({status:"error",error:e.message||String(e)});}',
    '}',
    'init();',
    'self.onmessage=async function(e){',
    '  if(!ready){self.postMessage({status:"error",error:"Worker not ready."});return;}',
    '  var d=e.data;',
    '  if(!d||!d.text){self.postMessage({status:"error",error:"No text for translation."});return;}',
    '  try{',
    '    var src=d.srcLang||"eng_Latn";',
    '    var r=await pipe(d.text,{src_lang:src,tgt_lang:' + JSON.stringify(TARGET_CODE) + ',max_length:512});',
    '    if(!r||!r[0]){throw new Error("Translation returned empty result.");}',
    '    var t=r[0].translation_text||r[0].generated_text||"";',
    '    self.postMessage({status:"complete",text:t});',
    '  }catch(e){self.postMessage({status:"error",error:e.message||String(e)});}',
    '};',
  ].join('\n');
  var blob = new Blob([wc], { type: 'application/javascript' });
  var blobUrl = URL.createObjectURL(blob);
  var worker = new Worker(blobUrl);
  var inst = { worker: worker, blobUrl: blobUrl };
  var readyP = new Promise(function (resolve, reject) {
    var t = setTimeout(function () {
      worker.terminate();
      reject(new Error('Translation model download timed out after 300s. Check your internet connection.'));
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
  try {
    workerInstance = await readyP;
    workerReady = true;
    return workerInstance;
  } catch (err) {
    URL.revokeObjectURL(blobUrl);
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
