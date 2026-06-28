/**
 * Translation Web Worker (ES Module)
 *
 * Loaded as { type: 'module' } so it can use standard import statements
 * instead of importScripts(). This avoids the "Unexpected token export"
 * error that occurs when importScripts() tries to load an ES module.
 *
 * ═══ Transformers.js CDN Loading ═══
 * Transformers.js is imported from unpkg CDN instead of the local
 * public/transformers/ bundle. The local copy has initialization issues
 * in module workers that prevent proper model type registration.
 *
 * WASM binaries are still served from public/transformers/ and ONNX Runtime
 * auto-resolves their paths from the CDN base URL.
 *
 * Translates text to Khmer using NLLB-200 distilled model.
 *
 * @see ../localTranslationService.js
 */

// ── CDN URL constant ─────────────────────────────────────────────────────────
var TRANSFORMERS_CDN =
  'https://unpkg.com/@xenova/transformers@2.17.2/dist/transformers.min.js';

// ── Dynamic Import ───────────────────────────────────────────────────────────
var transformersModule = null;

async function getTransformers() {
  if (!transformersModule) {
    transformersModule = await import(/* @vite-ignore */ TRANSFORMERS_CDN);
  }
  return transformersModule;
}

// ── Configuration ────────────────────────────────────────────────────────────

var TRANSLATION_MODEL = 'Xenova/nllb-200-distilled-600M';
var TARGET_CODE = 'khm_Khmr';

// ── Worker Message Handler ───────────────────────────────────────────────────

var pipe = null;

self.onmessage = async function (e) {
  var m = e.data;
  try {
    if (m.command === 'load') {
      self.postMessage({
        status: 'loading',
        message: 'Loading Transformers.js from CDN...',
      });
      var tf = await getTransformers();
      var pipeline = tf.pipeline;
      var env = tf.env;

      // Configure environment
      env.allowLocalModel = false;
      env.useBrowserCache = true;

      self.postMessage({
        status: 'loading',
        message: 'Loading translation model (NLLB-200)...',
      });
      pipe = await pipeline('translation', TRANSLATION_MODEL, {
        quantized: true,
      });
      if (!pipe) throw new Error('pipeline() returned null');
      self.postMessage({ status: 'ready' });
    } else if (m.command === 'translate') {
      if (!pipe) {
        self.postMessage({
          status: 'error',
          error: 'Translation model not loaded. Call load first.',
        });
        return;
      }
      var result = await pipe(m.text, {
        src_lang: m.srcLang || 'eng_Latn',
        tgt_lang: TARGET_CODE,
      });
      var translated = (result && result[0] && result[0].translation_text) || '';
      self.postMessage({ status: 'complete', text: translated });
    }
  } catch (err) {
    console.error('[translation.worker] Error:', err);
    self.postMessage({ status: 'error', error: err.message });
  }
};
