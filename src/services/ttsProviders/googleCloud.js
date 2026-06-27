/**
 * Google Cloud Text-to-Speech Provider
 *
 * Uses the Google Cloud TTS REST API directly from the browser.
 * Requires an API key – free tier provides 1 million characters per month.
 *
 * Docs: https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize
 */
const BASE = 'https://texttospeech.googleapis.com/v1';
const MAX_CONCURRENCY = 3;

const VOICES_LIST = [
  { id: 'en-US-Neural2-J', name: 'Neural2-J (US, Male, Rich)', languageCode: 'en-US', gender: 'Male' },
  { id: 'en-US-Neural2-F', name: 'Neural2-F (US, Female, Warm)', languageCode: 'en-US', gender: 'Female' },
  { id: 'en-US-Neural2-D', name: 'Neural2-D (US, Male, Deep)', languageCode: 'en-US', gender: 'Male' },
  { id: 'en-US-Neural2-I', name: 'Neural2-I (US, Female, Bright)', languageCode: 'en-US', gender: 'Female' },
  { id: 'en-US-Neural2-A', name: 'Neural2-A (US, Male, News)', languageCode: 'en-US', gender: 'Male' },
  { id: 'en-US-Standard-A', name: 'Standard-A (US, Male)', languageCode: 'en-US', gender: 'Male' },
  { id: 'en-US-Standard-F', name: 'Standard-F (US, Female)', languageCode: 'en-US', gender: 'Female' },
  { id: 'en-GB-Neural2-B', name: 'Neural2-B (UK, Male)', languageCode: 'en-GB', gender: 'Male' },
  { id: 'en-GB-Neural2-A', name: 'Neural2-A (UK, Female)', languageCode: 'en-GB', gender: 'Female' },
  { id: 'en-AU-Neural2-B', name: 'Neural2-B (AU, Male)', languageCode: 'en-AU', gender: 'Male' },
  { id: 'en-AU-Neural2-A', name: 'Neural2-A (AU, Female)', languageCode: 'en-AU', gender: 'Female' },
];

const MODELS_LIST = [
  { id: 'default', name: 'Standard (lowest cost)' },
  { id: 'premium', name: 'Premium (Neural2, highest quality)' },
];

/**
 * Decode a base64 string to an ArrayBuffer
 */
function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function synthesizeText(text, apiKey, opts = {}) {
  if (!text?.trim()) throw new Error('Empty text');
  if (!apiKey) throw new Error('Google Cloud API key required');

  const {
    voiceId = VOICES_LIST[0].id,
    modelId = 'default',
    languageCode = 'en-US',
    speakingRate = 1.0,
    pitch = 0,
  } = opts;

  // Determine the voice name and language from the voice id
  const voice = VOICES_LIST.find(v => v.id === voiceId) || VOICES_LIST[0];

  // Build the request body per the Google Cloud TTS API
  const requestBody = {
    input: { text },
    voice: {
      languageCode: voice.languageCode || languageCode,
      name: voiceId,
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate,
      pitch,
    },
  };

  // For the "premium" model use Neural2 voices; standard uses standard/studio
  if (modelId === 'premium' && !voiceId.includes('Neural2') && !voiceId.includes('Studio')) {
    // Upgrade to a neural voice if available
    const neuralFallback = VOICES_LIST.find(
      v => v.id.includes('Neural2') && v.languageCode === voice.languageCode,
    );
    if (neuralFallback) {
      requestBody.voice.name = neuralFallback.id;
    }
  }

  const url = `${BASE}/text:synthesize?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    let msg = `Google Cloud TTS error (${res.status})`;
    try {
      const d = await res.json();
      msg = d.error?.message || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  const json = await res.json();
  // The API returns base64-encoded audio content
  const audioBuffer = base64ToArrayBuffer(json.audioContent);
  return audioBuffer;
}

async function synthesizeAll(segments, apiKey, opts = {}) {
  const { voiceId, languageCode, speakingRate, pitch, onProgress, signal } = opts;
  // "modelId" is embedded in the provider's model selection
  const modelId = opts.modelId || 'default';
  const results = [];
  const queue = segments.map((s, i) => ({ s, i }));
  let done = 0;

  async function worker() {
    while (queue.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const job = queue.shift();
      try {
        const ab = await synthesizeText(job.s.text, apiKey, {
          voiceId,
          modelId,
          languageCode,
          speakingRate,
          pitch,
        });
        results.push({ index: job.i, arrayBuffer: ab });
      } catch (e) {
        results.push({ index: job.i, arrayBuffer: null, error: e.message });
      }
      done++;
      onProgress?.(done, segments.length, job.i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, segments.length) }, () => worker()),
  );

  return results.sort((a, b) => a.index - b.index);
}

export const provider = {
  id: 'googlecloud',
  name: 'Google Cloud TTS',
  needsApiKey: true,
  hasVoices: true,
  hasModels: true,

  getVoices() {
    return VOICES_LIST;
  },

  getModels() {
    return MODELS_LIST;
  },

  synthesizeText,
  synthesizeAll,

  isBrowserBased: false,
};
