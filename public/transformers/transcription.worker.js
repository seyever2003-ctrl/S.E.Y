/**
 * Transcription Web Worker (ES Module)
 *
 * Loaded as { type: 'module' } so it can use standard import statements
 * instead of importScripts(). This avoids the "Unexpected token export"
 * error that occurs when importScripts() tries to load an ES module.
 *
 * ═══ Transformers.js CDN Loading ═══
 * Transformers.js is imported from unpkg CDN instead of the local
 * public/transformers/ bundle. The local webpack-bundled copy does not
 * correctly register the "whisper" model_type in its internal AutoClass
 * mapping when loaded in a module worker context, causing the error:
 *   "Unsupported model type: whisper"
 *
 * The CDN-hosted version is a properly built ES module that fully supports
 * all model types including Whisper. It's imported using a URL string (not
 * a Vite import), so Vite's build system never touches it.
 *
 * WASM binaries are still served from public/transformers/ and ONNX Runtime
 * auto-resolves their paths from the CDN base URL.
 *
 * @see ../localTranscriptionService.js
 */

// ── CDN URL constant ─────────────────────────────────────────────────────────
// Using unpkg CDN — properly built ES module with full Whisper support.
// This is a string URL, *not* a Vite import, so Vite skips it during build.
var TRANSFORMERS_CDN =
  'https://unpkg.com/@xenova/transformers@2.17.2/dist/transformers.min.js';

// ── Dynamic Import ───────────────────────────────────────────────────────────
// Using dynamic import() because static import from a cross-origin URL can
// fail in some worker environments. Dynamic import handles CORS and returns
// the module namespace which we destructure for pipeline + env.
var transformersModule = null;

async function getTransformers() {
  if (!transformersModule) {
    transformersModule = await import(/* @vite-ignore */ TRANSFORMERS_CDN);
  }
  return transformersModule;
}

// ── Configuration ────────────────────────────────────────────────────────────

// ── Worker Message Handler ───────────────────────────────────────────────────

var pipe = null;

self.onmessage = async function (e) {
  var m = e.data;
  try {
    if (m.command === 'load') {
      self.postMessage({
        status: 'log',
        text: 'Loading Transformers.js from CDN...',
      });
      var tf = await getTransformers();
      var pipeline = tf.pipeline;
      var env = tf.env;

      // Configure ONNX Runtime environment
      env.allowLocalModel = false;
      env.useBrowserCache = true;

      self.postMessage({
        status: 'log',
        text: 'Creating Whisper ' + m.modelSize + ' pipeline...',
      });
      pipe = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-' + m.modelSize,
        { quantized: true }
      );
      self.postMessage({ status: 'ready' });
    } else if (m.command === 'transcribe') {
      if (!pipe) {
        self.postMessage({
          status: 'error',
          error: 'Whisper model not loaded. Call load first.',
        });
        return;
      }
      self.postMessage({ status: 'progress', value: 0.3 });
      var r = await pipe(m.audioData, {
        chunk_length_s: 12,
        stride_length_s: 2,
        return_timestamps: true,
        task: 'transcribe',
        language: m.language || void 0,
      });
      self.postMessage({
        status: 'done',
        chunks: r.chunks || null,
        text: r.text || '',
      });
    }
  } catch (err) {
    console.error('[transcription.worker] Error:', err);
    self.postMessage({ status: 'error', error: err.message });
  }
};
