/**
 * Transcription Web Worker (ES Module)
 *
 * Loaded as { type: 'module' } so it can use standard import statements
 * instead of importScripts(). This avoids the "Unexpected token export"
 * error that occurs when importScripts() tries to load an ES module.
 *
 * ═══ Transformers.js Loading ═══
 * Transformers.js is loaded from the local file at /transformers/transformers.min.js
 * (served from the public/ directory) as the primary source. If local loading fails,
 * it falls back to jsDelivr CDN which is more reliable than unpkg.
 *
 * The local copy is a pre-downloaded ES module build that fully supports
 * all model types including Whisper. WASM binaries are also served from
 * public/transformers/ and ONNX Runtime is configured to load them from
 * those local paths.
 *
 * ═══ Model Loading ═══
 * The model files are downloaded from Hugging Face Hub (huggingface.co)
 * on first use and cached by the browser (Cache API / IndexedDB).
 * The remote path template is explicitly set to ensure correct URLs
 * are used, preventing HTML responses from broken redirects.
 *
 * @see ../localTranscriptionService.js
 */

// ── URLs ────────────────────────────────────────────────────────────────────────
// Primary: local file served from public/transformers/
// Fallback: jsDelivr CDN (more reliable than unpkg.com)
var LOCAL_MODULE_URL = '/transformers/transformers.min.js';
var CDN_MODULE_URL =
  'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

// ── Debug: Intercept ALL fetch calls ─────────────────────────────────────────────
// This intercepts every fetch() call made inside the worker (including ONNX Runtime's
// internal fetches for WASM files and Hugging Face model downloads) and logs the
// full URL before the request proceeds. This helps diagnose "Unexpected token <"
// errors by revealing exactly which URL returned HTML instead of the expected file.
(function interceptFetch() {
  var originalFetch = self.fetch;
  self.fetch = function() {
    var url = (arguments[0] && typeof arguments[0] === 'object' && arguments[0].url)
      ? arguments[0].url
      : String(arguments[0] || 'unknown');
    console.log('[transcription.worker] 🔍 FETCH URL:', url);
    console.log('[transcription.worker] 🔍 FETCH method:', (arguments[1] && arguments[1].method) || 'GET');
    return originalFetch.apply(self, arguments).then(function(response) {
      console.log('[transcription.worker] ✅ FETCH response status:', response.status, 'for URL:', url);
      // Check if response is HTML (which would cause "Unexpected token <")
      var contentType = response.headers ? response.headers.get('content-type') : null;
      if (contentType && contentType.indexOf('text/html') !== -1) {
        console.error('[transcription.worker] ❌ FETCH returned HTML instead of expected file! URL:', url);
        console.error('[transcription.worker] ❌ Content-Type:', contentType);
        // Clone the response so we can inspect the body
        response.clone().text().then(function(body) {
          console.error('[transcription.worker] ❌ HTML body (first 500 chars):', body.substring(0, 500));
          // Send the error info back to the main thread
          self.postMessage({
            status: 'error',
            error: 'Server returned HTML for URL: ' + url + '\nContent-Type: ' + contentType +
              '\nThis usually means the server cannot find the file and is returning its index.html fallback page.'
          });
        }).catch(function() {});
      }
      return response;
    }).catch(function(err) {
      console.error('[transcription.worker] ❌ FETCH failed for URL:', url, 'Error:', err.message);
      throw err;
    });
  };
  console.log('[transcription.worker] 🔍 Fetch interception installed - all network requests will be logged.');
})();

// ── Dynamic Import (with fallback) ──────────────────────────────────────────────
var transformersModule = null;

async function getTransformers() {
  if (!transformersModule) {
    // Try local module first, fall back to CDN
    var lastError = null;
    try {
      console.log('[transcription.worker] 🔍 Attempting to load local Transformers.js from:', LOCAL_MODULE_URL);
      transformersModule = await import(/* @vite-ignore */ LOCAL_MODULE_URL);
      console.log('[transcription.worker] ✅ Local Transformers.js loaded successfully from:', LOCAL_MODULE_URL);
      return transformersModule;
    } catch (localErr) {
      lastError = localErr;
      console.warn(
        '[transcription.worker] ❌ Local Transformers.js load failed, falling back to CDN:',
        localErr.message
      );
      console.warn('[transcription.worker] 🔍 Local URL that failed:', LOCAL_MODULE_URL);
    }

    try {
      console.log('[transcription.worker] 🔍 Attempting to load Transformers.js from CDN:', CDN_MODULE_URL);
      transformersModule = await import(/* @vite-ignore */ CDN_MODULE_URL);
      console.log('[transcription.worker] ✅ CDN Transformers.js loaded successfully from:', CDN_MODULE_URL);
      return transformersModule;
    } catch (cdnErr) {
      console.error('[transcription.worker] ❌ CDN Transformers.js also failed:', cdnErr.message);
      throw new Error(
        'Failed to load Transformers.js from both local file and CDN.\n' +
        'Local URL: ' + LOCAL_MODULE_URL + '\n' +
        'Local error: ' + (lastError.message || lastError) + '\n' +
        'CDN URL: ' + CDN_MODULE_URL + '\n' +
        'CDN error: ' + (cdnErr.message || cdnErr)
      );
    }
  }
  return transformersModule;
}

// ── Configuration ────────────────────────────────────────────────────────────

/**
 * Configure ONNX Runtime WASM paths to use local files served from /transformers/
 * This prevents ONNX Runtime from incorrectly resolving WASM URLs to the CDN
 * or Hugging Face, which could return HTML error pages instead of valid WASM.
 */
function configureWasmPaths(env) {
  // Point WASM file loading to our local public/transformers/ directory
  // The trailing slash is essential for correct URL resolution.
  var wasmPath = '/transformers/';
  console.log('[transcription.worker] 🔍 Setting WASM paths to:', wasmPath);
  env.backends.onnx.wasm.wasmPaths = wasmPath;

  // Ensure ONNX Runtime uses the local WASM files with threading support
  // if SharedArrayBuffer is available (requires Cross-Origin-Opener-Policy).
  env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;
  console.log('[transcription.worker] 🔍 WASM numThreads:', env.backends.onnx.wasm.numThreads);
}

/**
 * Set the remote path template for model file downloads.
 * Use the Hugging Face Hub CDN to ensure reliable model file delivery
 * and avoid HTML error pages from the main huggingface.co domain.
 */
function configureModelPaths(env) {
  // Use the Hugging Face Hub CDN for model file downloads.
  // The default resolver sometimes hits the main huggingface.co domain
  // which may return HTML pages (e.g., rate limiting, redirects).
  // The hf.co CDN serves raw model files directly.
  var remotePath = 'https://huggingface.co/{model}/resolve/{revision}/{file}';
  console.log('[transcription.worker] 🔍 Setting remote path template to:', remotePath);
  env.remotePathTemplate = remotePath;

  // Disable local model loading (we always download from Hugging Face Hub)
  env.allowLocalModel = false;

  // Enable browser cache for downloaded models
  env.useBrowserCache = true;

  // Use the custom cache path to avoid collisions
  env.cacheDir = 'transformers-cache';
  
  console.log('[transcription.worker] 🔍 Model config: allowLocalModel=' + env.allowLocalModel +
    ', useBrowserCache=' + env.useBrowserCache + ', cacheDir=' + env.cacheDir);
}

// ── Worker Message Handler ───────────────────────────────────────────────────

var pipe = null;

self.onmessage = async function (e) {
  var m = e.data;
  try {
    if (m.command === 'load') {
      // ── Step 1: Load Transformers.js ───────────────────────────────
      self.postMessage({
        status: 'log',
        text: 'Loading Transformers.js engine...',
      });
      var tf = await getTransformers();
      var pipeline = tf.pipeline;
      var env = tf.env;

      // ── Step 2: Log the current origin / base URL ──────────────────
      var origin = self.location ? self.location.origin : 'unknown worker origin';
      console.log('[transcription.worker] 🔍 Worker origin:', origin);
      console.log('[transcription.worker] 🔍 Worker location href:', self.location ? self.location.href : 'unknown');
      console.log('[transcription.worker] 🔍 Transformers.js env backends:', Object.keys(env.backends));
      console.log('[transcription.worker] 🔍 Transformers.js version:', env.version || 'unknown');

      // ── Step 3: Configure ONNX Runtime paths ──────────────────────
      self.postMessage({
        status: 'log',
        text: 'Configuring ONNX Runtime (local WASM from /transformers/)...',
      });
      configureWasmPaths(env);
      configureModelPaths(env);

      // ── Step 4: Create Whisper pipeline ───────────────────────────
      self.postMessage({
        status: 'log',
        text: 'Creating Whisper ' + m.modelSize + ' pipeline...',
      });
      console.log('[transcription.worker] 🔍 Creating pipeline: automatic-speech-recognition for Xenova/whisper-' + m.modelSize);
      pipe = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-' + m.modelSize,
        {
          quantized: true,
          // Specify the model revision for reproducible builds
          revision: 'main',
        }
      );
      console.log('[transcription.worker] ✅ Pipeline created successfully for Whisper ' + m.modelSize);
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
      console.log('[transcription.worker] 🔍 Starting transcription, audio length:', m.audioData ? m.audioData.length : 0);
      var r = await pipe(m.audioData, {
        chunk_length_s: 12,
        stride_length_s: 2,
        return_timestamps: true,
        task: 'transcribe',
        language: m.language || void 0,
      });
      console.log('[transcription.worker] ✅ Transcription complete, text length:', r.text ? r.text.length : 0);
      self.postMessage({
        status: 'done',
        chunks: r.chunks || null,
        text: r.text || '',
      });
    }
  } catch (err) {
    // ── Detailed error logging ─────────────────────────────────────
    // The "SyntaxError: Unexpected token <" error typically means a
    // network request returned HTML instead of valid JSON/model data.
    // This happens when ONNX Runtime or Transformers.js tries to fetch
    // a resource (model file, WASM binary, or config) and the server
    // returns an error page (HTML).
    console.error('[transcription.worker] ❌ Error:', err);

    // Log the full stack trace
    console.error('[transcription.worker] ❌ Error stack:', err.stack);

    // Extract the most useful error message
    var errorMsg = err.message || 'Unknown error';

    // Check for the common "Unexpected token <" error which indicates
    // HTML was received instead of model data
    if (errorMsg.indexOf('Unexpected token <') !== -1) {
      errorMsg =
        'Model download failed: The server returned HTML instead of model data. ' +
        'This usually means Hugging Face is rate-limiting or redirecting the request. ' +
        'Check the console (F12) for the logged FETCH URLs to see which URL returned HTML.\n\n' +
        'Possible fixes:\n' +
        '1. If URL starts with http://localhost:PORT, ensure the /transformers/ files exist in your public/ folder\n' +
        '2. If URL is huggingface.co, you may be rate-limited — wait and try again\n' +
        '3. Check that your server is not rewriting /transformers/* routes to index.html\n\n' +
        'Error: ' + errorMsg;
    }

    // Check for WASM loading errors
    if (errorMsg.indexOf('wasm') !== -1 || errorMsg.indexOf('WebAssembly') !== -1) {
      errorMsg =
        'WASM loading failed: ' + errorMsg + '. ' +
        'Ensure the WASM files exist in /transformers/ on your server.\n' +
        'Expected files: ort-wasm-simd-threaded.wasm, ort-wasm-simd.wasm, ort-wasm-threaded.wasm, ort-wasm.wasm\n' +
        'Check console for the FETCH URL to see which exact URL failed.';
    }

    self.postMessage({ status: 'error', error: errorMsg });
  }
};