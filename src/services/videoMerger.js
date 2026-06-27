/**
 * Video Merger Service
 *
 * Uses ffmpeg.wasm to merge a video file with a generated audio track
 * entirely in the browser — no server-side processing needed.
 *
 * The audio blob (from TTS) is mixed into the video as a new audio track.
 * If the video already has audio, it can be replaced or overlaid.
 *
 * Usage:
 *   import { mergeAudioVideo, getFFmpeg } from './videoMerger.js';
 *
 *   const mergedBlob = await mergeAudioVideo(videoFile, audioBlob, {
 *     onProgress: (pct) => console.log(pct),
 *     onLog: (msg) => console.log(msg),
 *   });
 *   // Download: URL.createObjectURL(mergedBlob)
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// ── Singleton FFmpeg instance ─────────────────────────────────────────────────

let ffmpeg = null;
let loaded = false;
const CORE_VERSION = '0.12.10';

/**
 * Get (or create) the shared FFmpeg instance.
 * Loads the core WASM binaries on first call.
 */
export async function getFFmpeg(opts = {}) {
  if (ffmpeg && loaded) {
    // FIX: Verify the loaded instance is still valid (not terminated)
    try {
      // Quick probe: check if a basic method exists
      if (typeof ffmpeg.writeFile === 'function') {
        return ffmpeg;
      }
      // Instance is corrupted, reset
      ffmpeg = null;
      loaded = false;
    } catch {
      ffmpeg = null;
      loaded = false;
    }
  }

  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
  }

  const { onLog, onProgress } = opts;

  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }
  if (onProgress) {
    ffmpeg.on('progress', ({ progress }) => onProgress(progress));
  }

  const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@' + CORE_VERSION + '/dist/esm';

  // FIX: Wrap load in try/catch for proper error handling
  try {
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
  } catch (loadErr) {
    ffmpeg = null;
    loaded = false;
    const msg = 'FFmpeg load failed: ' + (loadErr.message || 'Unknown error');
    throw new Error(msg);
  }

  loaded = true;
  return ffmpeg;
}

/**
 * Check if ffmpeg is loaded and ready (with null-safety).
 */
export function isFFmpegLoaded() {
  try {
    return loaded && ffmpeg !== null && typeof ffmpeg.writeFile === 'function';
  } catch {
    return false;
  }
}

/**
 * Terminate the FFmpeg worker to free memory.
 * Call this when you're done with all merging operations.
 */
export function terminateFFmpeg() {
  if (ffmpeg) {
    try { ffmpeg.terminate(); } catch { /* ignore */ }
    ffmpeg = null;
    loaded = false;
  }
}

// ── Merge Operation ───────────────────────────────────────────────────────────

/**
 * Merge an audio blob into a video file using ffmpeg.wasm.
 *
 * @param {File|Blob} videoFile  - The uploaded video file (.mp4, .webm, etc.)
 * @param {Blob}       audioBlob - The generated audio blob (WAV or MP3)
 * @param {Object}     opts
 * @param {Function}   [opts.onProgress] - (progress: number) => void  (0–1)
 * @param {Function}   [opts.onLog]      - (message: string) => void
 * @param {string}     [opts.outputFormat='mp4'] - Output container format
 * @param {string}     [opts.audioCodec='aac']   - Output audio codec
 * @param {boolean}    [opts.replaceAudio=true]  - Replace existing audio track
 * @returns {Promise<Blob>} The merged video blob
 */
export async function mergeAudioVideo(videoFile, audioBlob, opts = {}) {
  const {
    onProgress,
    onLog,
    outputFormat = 'mp4',
    audioCodec = 'aac',
    replaceAudio = true,
  } = opts;

  const instance = await getFFmpeg({ onLog, onProgress });

  // Determine file extensions for ffmpeg's virtual filesystem
  const videoExt = getFileExtension(videoFile.name || 'video.mp4');
  const audioExt = audioBlob.type.includes('wav') ? 'wav' : 'mp3';
  const outputName = `output.${outputFormat}`;

  // Write input files into ffmpeg's virtual filesystem
  onLog?.('Writing video to virtual filesystem...');
  await instance.writeFile(`input${videoExt}`, await fetchFile(videoFile));

  onLog?.('Writing audio to virtual filesystem...');
  await instance.writeFile(`audio.${audioExt}`, await fetchFile(audioBlob));

  // Build ffmpeg arguments
  const args = [
    '-i', `input${videoExt}`,   // video input (index 0)
    '-i', `audio.${audioExt}`,  // audio input (index 1)
  ];

  if (replaceAudio) {
    // Replace any existing audio with our new audio track
    args.push('-map', '0:v:0');  // take video stream from input 0
    args.push('-map', '1:a:0');  // take audio stream from input 1
  } else {
    // Mix both audio tracks (keeps original + adds new)
    args.push('-filter_complex', '[1:a]adelay=0|0[a1];[0:a][a1]amix=inputs=2:duration=first');
  }

  // Copy video codec (no re-encode), encode audio to chosen codec
  args.push('-c:v', 'copy');
  args.push('-c:a', audioCodec);

  // Shortest: match duration to the shorter input
  args.push('-shortest');

  // Avoid y/n prompts in the WASM environment
  args.push('-y');

  // Output filename
  args.push(outputName);

  onLog?.(`Executing: ffmpeg ${args.join(' ')}`);

  // Run ffmpeg
  await instance.exec(args);

  // Read the output file
  onLog?.('Reading merged output...');
  const data = await instance.readFile(outputName);

  // Delete temp files to free virtual filesystem space
  try {
    await instance.deleteFile(`input${videoExt}`);
    await instance.deleteFile(`audio.${audioExt}`);
    await instance.deleteFile(outputName);
  } catch { /* ignore cleanup errors */ }

  // Convert the Uint8Array to a Blob
  const mimeType = outputFormat === 'mp4' ? 'video/mp4' : 'video/webm';
  return new Blob([data.buffer], { type: mimeType });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFileExtension(filename) {
  const idx = filename.lastIndexOf('.');
  if (idx === -1) return '.mp4';
  return filename.slice(idx).toLowerCase();
}
