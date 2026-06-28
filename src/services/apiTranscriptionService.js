/**
 * API-based Transcription Service
 *
 * Provides transcription via external APIs (OpenAI Whisper or Deepgram)
 * instead of running Whisper locally in the browser.
 *
 * Both APIs return word-level timestamps which we convert to SRT format
 * for compatibility with the existing pipeline.
 */

// ── OpenAI Whisper ───────────────────────────────────────────────────────────

/**
 * Transcribe audio using OpenAI Whisper API.
 *
 * @param {Blob} audioBlob - WAV audio blob (16kHz mono)
 * @param {string} apiKey - OpenAI API key
 * @param {Object} [opts]
 * @param {string} [opts.language] - Language code (e.g. 'en', 'km') or '' for auto-detect
 * @param {Function} [opts.onLog] - Log callback
 * @param {AbortSignal} [opts.signal] - Optional AbortSignal
 * @returns {Promise<string>} SRT-formatted transcription
 */
async function transcribeWithOpenAI(audioBlob, apiKey, opts) {
  if (!opts) opts = {};
  var language = opts.language || '';
  var onLog = opts.onLog || function () {};
  var signal = opts.signal;

  if (!apiKey) throw new Error('OpenAI API key is required');
  if (signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');

  var formData = new FormData();
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  if (language) formData.append('language', language);

  onLog('[API] Sending to OpenAI Whisper...');

  var res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey },
    body: formData,
    signal: signal,
  });

  if (!res.ok) {
    var errorMsg = 'OpenAI API error (' + res.status + ')';
    try { var errBody = await res.json(); errorMsg = errBody.error?.message || errorMsg; } catch {}
    throw new Error(errorMsg);
  }

  var data = await res.json();
  if (!data || !data.segments || data.segments.length === 0) {
    if (data.text && data.text.trim()) {
      onLog('[API] No timestamps in response — using full text as a single segment.');
      return '1\n00:00:00,000 --> 00:00:10,000\n' + (data.text || '').trim() + '\n';
    }
    throw new Error('OpenAI Whisper returned empty transcription');
  }

  onLog('[API] Received ' + data.segments.length + ' segments from OpenAI');
  return segmentsToSRT(data.segments);
}

// ── Deepgram ─────────────────────────────────────────────────────────────────

/**
 * Transcribe audio using Deepgram API (Nova-2 model).
 *
 * @param {Blob} audioBlob - WAV audio blob (16kHz mono)
 * @param {string} apiKey - Deepgram API key
 * @param {Object} [opts]
 * @param {string} [opts.language] - Language code (e.g. 'en', 'km') or '' for auto-detect
 * @param {Function} [opts.onLog] - Log callback
 * @param {AbortSignal} [opts.signal] - Optional AbortSignal
 * @returns {Promise<string>} SRT-formatted transcription
 */
async function transcribeWithDeepgram(audioBlob, apiKey, opts) {
  if (!opts) opts = {};
  var language = opts.language || '';
  var onLog = opts.onLog || function () {};
  var signal = opts.signal;

  if (!apiKey) throw new Error('Deepgram API key is required');
  if (signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');

  var params = new URLSearchParams({
    model: 'nova-2',
    smart_format: 'true',
    punctuate: 'true',
    utterances: 'true',
    diarize: 'false',
  });
  if (language) params.set('language', language);

  onLog('[API] Sending to Deepgram Nova-2...');

  var arrayBuf = await audioBlob.arrayBuffer();

  var res = await fetch('https://api.deepgram.com/v1/listen?' + params.toString(), {
    method: 'POST',
    headers: {
      Authorization: 'Token ' + apiKey,
      'Content-Type': audioBlob.type || 'audio/wav',
    },
    body: arrayBuf,
    signal: signal,
  });

  if (!res.ok) {
    var errorMsg = 'Deepgram API error (' + res.status + ')';
    try { var errBody = await res.json(); errorMsg = errBody.err?.message || errBody.message || errorMsg; } catch {}
    throw new Error(errorMsg);
  }

  var data = await res.json();
  var words = data?.results?.channels?.[0]?.alternatives?.[0]?.words;
  var fullText = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

  if (!words || words.length === 0) {
    if (fullText && fullText.trim()) {
      onLog('[API] No word timestamps — using full text as a single segment.');
      return '1\n00:00:00,000 --> 00:00:10,000\n' + fullText.trim() + '\n';
    }
    throw new Error('Deepgram returned empty transcription');
  }

  onLog('[API] Received ' + words.length + ' words from Deepgram');

  // Group words into utterances using a 1.0s gap threshold
  var utterances = groupWordsIntoUtterances(words, 1.0);

  onLog('[API] Grouped into ' + utterances.length + ' subtitle segments.');
  return segmentsToSRT(utterances);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert an array of { start, end, text } segments to SRT format.
 */
function segmentsToSRT(segments) {
  var srtLines = [];
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    var text = (seg.text || '').trim();
    if (!text) continue;
    srtLines.push(
      (i + 1) + '\n' +
      fmtTimestamp(seg.start) + ' --> ' + fmtTimestamp(seg.end) + '\n' +
      text + '\n'
    );
  }
  var output = srtLines.join('\n');
  var blockCount = output.split('\n').filter(function (l) { return l.indexOf('-->') >= 0; }).length;
  return output;
}

/**
 * Group an array of Deepgram word objects into utterance-like segments.
 * A new segment starts when the gap between words exceeds `gapThreshold` seconds.
 *
 * @param {Array} words - Array of { word, start, end }
 * @param {number} gapThreshold - Gap in seconds to split utterances
 * @returns {Array<{ start: number, end: number, text: string }>}
 */
function groupWordsIntoUtterances(words, gapThreshold) {
  if (!words || words.length === 0) return [];
  var segments = [];
  var currentWords = [words[0]];
  for (var i = 1; i < words.length; i++) {
    var prev = words[i - 1];
    var curr = words[i];
    if (curr.start - prev.end > gapThreshold) {
      var first = currentWords[0];
      var last = currentWords[currentWords.length - 1];
      segments.push({
        start: first.start,
        end: last.end,
        text: currentWords.map(function (w) { return w.word; }).join(' ').trim(),
      });
      currentWords = [curr];
    } else {
      currentWords.push(curr);
    }
  }
  if (currentWords.length > 0) {
    var firstW = currentWords[0];
    var lastW = currentWords[currentWords.length - 1];
    segments.push({
      start: firstW.start,
      end: lastW.end,
      text: currentWords.map(function (w) { return w.word; }).join(' ').trim(),
    });
  }
  return segments;
}

/**
 * Format seconds to SRT timestamp (HH:MM:SS,mmm).
 */
function fmtTimestamp(seconds) {
  if (seconds == null || isNaN(seconds)) return '00:00:00,000';
  var hrs = Math.floor(seconds / 3600);
  var mins = Math.floor((seconds % 3600) / 60);
  var secs = Math.floor(seconds % 60);
  var millis = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return (
    String(hrs).padStart(2, '0') + ':' +
    String(mins).padStart(2, '0') + ':' +
    String(secs).padStart(2, '0') + ',' +
    String(millis).padStart(3, '0')
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Transcribe audio using the specified API provider.
 *
 * @param {Blob} audioBlob - WAV audio blob (16kHz mono)
 * @param {string} provider - 'openai' | 'deepgram'
 * @param {string} apiKey - API key for the provider
 * @param {Object} [opts]
 * @param {string} [opts.language] - Language code or '' for auto-detect
 * @param {Function} [opts.onLog] - Log callback
 * @param {Function} [opts.onProgress] - Progress callback
 * @param {AbortSignal} [opts.signal] - Optional AbortSignal
 * @returns {Promise<string>} SRT-formatted transcription
 */
export async function transcribeWithAPI(audioBlob, provider, apiKey, opts) {
  if (!opts) opts = {};
  var onLog = opts.onLog || function () {};
  var onProgress = opts.onProgress || function () {};
  var signal = opts.signal;

  if (signal?.aborted) throw new DOMException('Transcription cancelled', 'AbortError');

  var providerName = provider === 'openai' ? 'OpenAI Whisper' : 'Deepgram';
  onLog('Using ' + providerName + ' for transcription...');
  onProgress(0);

  var srtText;
  if (provider === 'openai') {
    srtText = await transcribeWithOpenAI(audioBlob, apiKey, {
      language: opts.language || '',
      onLog: onLog,
      signal: signal,
    });
  } else if (provider === 'deepgram') {
    srtText = await transcribeWithDeepgram(audioBlob, apiKey, {
      language: opts.language || '',
      onLog: onLog,
      signal: signal,
    });
  } else {
    throw new Error('Unknown transcription provider: ' + provider);
  }

  onProgress(1);
  return srtText;
}

/**
 * Available transcription providers metadata.
 */
export const API_TRANSCRIPTION_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI Whisper',
    description: 'High-quality STT using Whisper. Supports 100+ languages.',
    pricing: '~$0.006/min. Get key at platform.openai.com',
    needsApiKey: true,
  },
  {
    id: 'deepgram',
    name: 'Deepgram Nova-2',
    description: 'Fast accurate STT with Nova-2. Great for real-time.',
    pricing: 'Free $200 credit. Get key at console.deepgram.com',
    needsApiKey: true,
  },
];

/**
 * Get provider info by ID.
 */
export function getAPITranscriptionProvider(id) {
  return API_TRANSCRIPTION_PROVIDERS.find(function (p) { return p.id === id; });
}
