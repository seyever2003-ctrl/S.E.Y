import { getFFmpeg } from './videoMerger.js';

// ═══ [CLEARED] All transcription engines have been removed ═══
// No engines are currently available. This object is intentionally
// empty to prevent any API calls or background processes.
export const TRANSCRIPTION_PROVIDERS = {};

export async function extractAudio(videoFile, opts = {}) {
  const { onLog } = opts;
  if (!videoFile) throw new Error('No video file provided for audio extraction');

  // FIX: Ensure FFmpeg is fully loaded before proceeding
  onLog?.('Initializing FFmpeg engine (loading WebAssembly)...');
  var ffmpeg;
  try {
    ffmpeg = await getFFmpeg({ onLog });
  } catch (initErr) {
    onLog?.('ERROR: FFmpeg initialization failed: ' + (initErr.message || 'Unknown error'));
    onLog?.('Check that your browser supports WebAssembly and CDN (cdn.jsdelivr.net) is accessible.');
    throw new Error('FFmpeg engine failed to initialize: ' + (initErr.message || 'Unknown error'));
  }

  // FIX: Null-check ffmpeg instance
  if (!ffmpeg || typeof ffmpeg.writeFile !== 'function') {
    throw new Error('FFmpeg instance is not properly initialized (null or missing writeFile method)');
  }

  const videoExt = getFileExtension(videoFile.name || 'video.mp4');
  const inputName = 'input' + videoExt;
  const outputName = 'audio.wav';
  onLog?.('Writing video to virtual filesystem...');
  const { fetchFile } = await import('@ffmpeg/util');
  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
  onLog?.('Extracting audio (16kHz mono WAV)...');
  await ffmpeg.exec(['-i', inputName, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', '-y', outputName]);
  onLog?.('Reading extracted audio...');
  const data = await ffmpeg.readFile(outputName);
  try { await ffmpeg.deleteFile(inputName); await ffmpeg.deleteFile(outputName); } catch {}
  return new Blob([data.buffer], { type: 'audio/wav' });
}

// ═══ [NEW] Local Auto-Caption Workflow ═══
// Combined local workflow: extract audio → transcribe (any language) → translate to Khmer
// All processing happens in-browser using Transformers.js Web Workers.
// No API keys, no server calls — fully local, CSP-compatible.

import { parseSRT } from '../utils/srtParser.js';

/**
 * Full local Auto-Caption workflow:
 *   1. Extract audio from video (FFmpeg.wasm)
 *   2. Transcribe with Whisper (Transformers.js worker)
 *   3. Parse SRT into segments
 *   4. Translate each segment's text to Khmer (NLLB-200 worker)
 *
 * All processing is done in-browser via dedicated Web Workers loaded through
 * importScripts() in blob URLs, avoiding Vite bundling issues and CSP problems.
 *
 * @param {File} videoFile - The uploaded video file.
 * @param {Object} [opts]
 * @param {string} [opts.sourceLanguage=''] - Source language code ('' = auto-detect by Whisper).
 * @param {string} [opts.modelSize='small'] - Whisper model size ('tiny','base','small').
 * @param {Function} [opts.onProgress] - Progress callback (0.0–1.0).
 * @param {Function} [opts.onLog] - Log callback.
 * @param {AbortSignal} [opts.signal] - Optional AbortSignal for cancellation.
 * @returns {Promise<Array<{id:number, start:number, end:number, duration:number, text:string, originalText:string, translated:boolean}>>}
 */
export async function transcribeAndTranslateToKhmer(videoFile, opts) {
  if (!opts) opts = {};
  var sourceLanguage = opts.sourceLanguage || '';
  var modelSize = opts.modelSize || 'small';
  var onProgress = opts.onProgress || function () {};
  var onLog = opts.onLog || function () {};
  var signal = opts.signal;

  if (!videoFile) throw new Error('No video file provided');

  // ─── Step 1: Extract Audio ───────────────────────────────────────────────
  onLog('═══════════════════════════════════════════');
  onLog('  LOCAL AUTO-CAPTION WORKFLOW');
  onLog('═══════════════════════════════════════════');
  onLog('Step 1/3: Extracting audio from video (local FFmpeg)...');
  onProgress(0.05);

  if (signal?.aborted) throw new DOMException('Workflow cancelled', 'AbortError');

  var audioBlob;
  try {
    audioBlob = await extractAudio(videoFile, { onLog: onLog });
  } catch (extractErr) {
    onLog('✗ ERROR: Audio extraction failed: ' + extractErr.message);
    throw new Error('Audio extraction failed: ' + (extractErr.message || 'Unknown error'));
  }

  onProgress(0.25);
  if (signal?.aborted) throw new DOMException('Workflow cancelled', 'AbortError');
  onLog('✓ Audio extracted: ' + (audioBlob.size / 1024 / 1024).toFixed(1) + ' MB');

  // ─── Step 2: Transcribe Locally ──────────────────────────────────────────
  onLog('');
  onLog('Step 2/3: Transcribing audio with Whisper ' + modelSize + ' (local)...');
  onLog('Language: ' + (sourceLanguage || 'auto-detect'));

  var srtText;
  try {
    var { transcribeLocally } = await import('./localTranscriptionService.js');
    srtText = await transcribeLocally(audioBlob, {
      modelSize: modelSize,
      language: sourceLanguage || 'km', // Whisper auto-detects when language matches audio
      onLog: onLog,
      onProgress: function (pct) {
        onProgress(0.25 + pct * 0.35); // Map 0–1 → 0.25–0.60
      },
      signal: signal,
    });
  } catch (transcribeErr) {
    onLog('✗ ERROR: Transcription failed: ' + transcribeErr.message);
    throw new Error('Transcription failed: ' + (transcribeErr.message || 'Unknown error'));
  }

  onProgress(0.6);
  if (signal?.aborted) throw new DOMException('Workflow cancelled', 'AbortError');

  // ─── Step 3: Parse SRT into Segments ────────────────────────────────────
  onLog('');
  onLog('Step 3/3: Parsing subtitles & translating to Khmer...');

  var segments = parseSRT(srtText);
  if (!segments || segments.length === 0) {
    throw new Error('No subtitles were generated. The audio may be silent or unclear.');
  }
  onLog('✓ ' + segments.length + ' segments transcribed');

  // ─── Step 4: Translate Each Segment to Khmer ────────────────────────────
  var { translateToKhmerLocally } = await import('./localTranslationService.js');

  var translatedSegments = [];
  for (var i = 0; i < segments.length; i++) {
    if (signal?.aborted) throw new DOMException('Workflow cancelled', 'AbortError');

    var seg = segments[i];
    var originalText = seg.text || '';

    onProgress(0.6 + ((i + 1) / segments.length) * 0.35);

    // Translate to Khmer
    var translatedText;
    if (!originalText.trim()) {
      translatedText = '';
    } else {
      var srcLang = sourceLanguage || 'en'; // Fallback to English if not specified
      translatedText = await translateToKhmerLocally(originalText, srcLang, {
        onLog: onLog,
        signal: signal,
      });
    }

    translatedSegments.push({
      id: seg.id,
      start: seg.start,
      end: seg.end,
      duration: seg.duration || (seg.end - seg.start),
      text: translatedText || originalText,
      originalText: originalText,
      translated: sourceLanguage !== 'km', // Mark as translated unless source is Khmer
    });
  }

  onProgress(0.95);
  if (signal?.aborted) throw new DOMException('Workflow cancelled', 'AbortError');

  onLog('');
  onLog('═══════════════════════════════════════════');
  onLog('✓ Auto-Caption complete: ' + translatedSegments.length + ' segments translated to Khmer');
  onLog('═══════════════════════════════════════════');
  onProgress(1.0);

  return translatedSegments;
}

export function getSuggestedSRTFilename(videoFileName) {
  return videoFileName.replace(/\.[^.]*$/, '') + '-captions.srt';
}

function getFileExtension(filename) {
  var idx = filename.lastIndexOf('.');
  if (idx === -1) return '.mp4';
  return filename.slice(idx).toLowerCase();
}

