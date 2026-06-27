/**
 * SRT Parser & Audio Segment Generator
 *
 * Parses SubRip (.srt) subtitle files into structured segments
 * and generates precise audio buffers using the Web Audio API.
 */

// ── SRT Parsing ─────────────────────────────────────────────────────────────

const TIME_REGEX = /(\d{2}):(\d{2}):(\d{2}),(\d{3})/;
const TIME_LINE_REGEX = /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/;

/**
 * Convert SRT timestamp (HH:MM:SS,mmm) to total seconds.
 */
function timeToSeconds(timestamp) {
  const match = TIME_REGEX.exec(timestamp);
  if (!match) return 0;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const millis = parseInt(match[4], 10);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/**
 * Parse raw SRT text into an array of segment objects.
 *
 * @param {string} srtText - Raw .srt file content.
 * @returns {Array<{ id: number, start: number, end: number, duration: number, text: string }>}
 */
export function parseSRT(srtText) {
  const blocks = srtText.trim().split(/\n\s*\n/);
  const segments = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    // First line: index (optional)
    const id = parseInt(lines[0], 10);
    const timeLineIndex = lines.findIndex(l => TIME_LINE_REGEX.test(l));
    if (timeLineIndex === -1) continue;

    const timeMatch = TIME_LINE_REGEX.exec(lines[timeLineIndex]);
    if (!timeMatch) continue;

    const start = timeToSeconds(timeMatch[1]);
    const end = timeToSeconds(timeMatch[2]);
    const text = lines.slice(timeLineIndex + 1).join('\n')
      .replace(/<[^>]*>/g, '').trim();

    segments.push({
      id: isNaN(id) ? segments.length + 1 : id,
      start,
      end,
      duration: end - start,
      text,
    });
  }

  return segments;
}

// ── Audio Generation ────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const DEFAULT_SILENCE_PADDING = 0.15; // 150ms of silence padding on each side

/**
 * Generate a silent audio buffer.
 */
function createSilenceBuffer(ctx, durationSec) {
  const length = Math.ceil(durationSec * SAMPLE_RATE);
  const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  return buffer; // already zeroed
}

/**
 * Generate a simple tone / beep buffer (for demo purposes when no real audio).
 */
function createToneBuffer(ctx, durationSec, frequencyHz = 440) {
  const length = Math.ceil(durationSec * SAMPLE_RATE);
  const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buffer.getChannelData(0);

  const fadeLen = Math.min(
    Math.floor(SAMPLE_RATE * 0.01),
    Math.floor(length * 0.1)
  );

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    let sample = Math.sin(2 * Math.PI * frequencyHz * t) * 0.15;
    sample += Math.sin(2 * Math.PI * (frequencyHz * 1.5) * t) * 0.05;

    // Fade in/out to avoid clicks
    if (i < fadeLen) sample *= i / fadeLen;
    else if (i > length - fadeLen) sample *= (length - i) / fadeLen;

    data[i] = sample;
  }
  return buffer;
}

/**
 * Generate audio segments from parsed SRT data with silence padding.
 *
 * Each segment: [silence padding] + [audio content] + [silence padding]
 *
 * For demo purposes without actual recorded audio, we generate tones that
 * vary in pitch per segment. To use real audio, replace createToneBuffer
 * with your own audio source (e.g., loaded from a file or TTS API).
 *
 * @param {Array} segments - Parsed SRT segments.
 * @param {object} options
 * @param {number} options.silencePadding - Seconds of silence before/after
 * @param {boolean} options.useRealAudio - Set true when real buffers provided
 * @returns {{ segments: Array, totalDuration: number, audioContext: AudioContext }}
 */
export function generateAudioSegments(segments, options = {}) {
  const { silencePadding = DEFAULT_SILENCE_PADDING, useRealAudio = false } = options;
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  const processedSegments = segments.map((seg, index) => {
    const freqHz = 300 + (index * 40) % 600;
    const contentBuffer = useRealAudio
      ? createSilenceBuffer(audioContext, seg.duration)
      : createToneBuffer(audioContext, seg.duration, freqHz);

    const padBefore = createSilenceBuffer(audioContext, silencePadding);
    const padAfter = createSilenceBuffer(audioContext, silencePadding);

    const totalLength = padBefore.length + contentBuffer.length + padAfter.length;
    const combinedBuffer = audioContext.createBuffer(1, totalLength, SAMPLE_RATE);
    const outputData = combinedBuffer.getChannelData(0);

    outputData.set(padBefore.getChannelData(0), 0);
    outputData.set(contentBuffer.getChannelData(0), padBefore.length);
    outputData.set(padAfter.getChannelData(0), padBefore.length + contentBuffer.length);

    return {
      ...seg,
      audioBuffer: combinedBuffer,
      paddedStart: silencePadding,
      paddedDuration: totalLength / SAMPLE_RATE,
      originalDuration: seg.duration,
    };
  });

  const totalDuration = processedSegments.reduce(
    (sum, seg) => sum + seg.paddedDuration, 0
  );

  return { segments: processedSegments, totalDuration, audioContext };
}

/**
 * Concatenate all audio segments into one continuous AudioBuffer.
 */
export function concatenateAudio(ctx, segments) {
  const totalFrames = segments.reduce((sum, s) => sum + s.audioBuffer.length, 0);
  const masterBuffer = ctx.createBuffer(1, totalFrames, SAMPLE_RATE);
  const outputData = masterBuffer.getChannelData(0);

  let offset = 0;
  for (const seg of segments) {
    outputData.set(seg.audioBuffer.getChannelData(0), offset);
    offset += seg.audioBuffer.length;
  }

  return masterBuffer;
}

/**
 * Build processed segments from pre-loaded real audio buffers.
 * Adds silence padding around each buffer.
 * Used by TTS integration instead of generateAudioSegments.
 *
 * @param {Array} segments - Parsed SRT segments [{ id, text, duration }]
 * @param {Array<AudioBuffer|null>} audioBuffers - Real TTS audio buffers (one per segment)
 * @param {number} silencePadding - Silence padding in seconds
 * @param {AudioContext} audioContext
 * @returns {{ segments: Array, totalDuration: number }}
 */
// ── WAV Export ──────────────────────────────────────────────────────────────

/**
 * Convert an AudioBuffer to a WAV Blob suitable for download.
 * Outputs standard 16-bit PCM WAV at the AudioBuffer's sample rate.
 *
 * @param {AudioBuffer} audioBuffer - The buffer to export (mono or stereo).
 * @returns {Blob} A WAV Blob ready for URL.createObjectURL / download.
 */
export function audioBufferToWavBlob(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;

  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;

  // Interleave channels and convert to 16-bit PCM
  const length = audioBuffer.length;
  const samples = new Int16Array(length * numChannels);

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      samples[i * numChannels + ch] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
  }

  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // WAV header
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);          // file size - 8
  writeStr(8, 'WAVE');

  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);                     // chunk size
  view.setUint16(20, format, true);                 // PCM format
  view.setUint16(22, numChannels, true);            // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM samples
  samples.forEach((val, i) => view.setInt16(headerSize + i * 2, val, true));

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Trigger a browser download of an AudioBuffer as a WAV file.
 *
 * @param {AudioBuffer} audioBuffer
 * @param {string} fileName - e.g. "segment-1.wav" or "full-recap.wav"
 */
export function downloadAudioBuffer(audioBuffer, fileName) {
  if (!audioBuffer) return;
  const blob = audioBufferToWavBlob(audioBuffer);
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function buildProcessedSegments(segments, audioBuffers, silencePadding, audioContext) {
  const pad = silencePadding || 0.15;
  const processedSegments = segments.map((seg, index) => {
    const contentBuffer = audioBuffers[index] || createSilenceBuffer(audioContext, seg.duration);
    const padBefore = createSilenceBuffer(audioContext, pad);
    const padAfter = createSilenceBuffer(audioContext, pad);
    const totalLength = padBefore.length + contentBuffer.length + padAfter.length;
    const combined = audioContext.createBuffer(1, totalLength, SAMPLE_RATE);
    const data = combined.getChannelData(0);
    data.set(padBefore.getChannelData(0), 0);
    data.set(contentBuffer.getChannelData(0), padBefore.length);
    data.set(padAfter.getChannelData(0), padBefore.length + contentBuffer.length);
    return {
      ...seg,
      audioBuffer: combined,
      paddedStart: pad,
      paddedDuration: totalLength / SAMPLE_RATE,
      originalDuration: seg.duration,
      isRealAudio: true,
    };
  });

  const totalDuration = processedSegments.reduce((s, seg) => s + seg.paddedDuration, 0);
  return { segments: processedSegments, totalDuration };
}
