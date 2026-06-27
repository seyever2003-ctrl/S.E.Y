/**
 * ElevenLabs TTS Provider
 * Requires a paid/free API key from elevenlabs.io
 */
const BASE = 'https://api.elevenlabs.io/v1';
const MAX_CONCURRENCY = 3;

const VOICES_LIST = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Warm, Professional)', accent: 'American', gender: 'Female' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (Energetic)', accent: 'American', gender: 'Female' },
  { id: 'EXAVITQu4vr5xnSDxMaL', name: 'Bella (Soft, British)', accent: 'British', gender: 'Female' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Deep Narrator)', accent: 'American', gender: 'Male' },
  { id: 'VR6AewLTigWG4xSOGBWu', name: 'Arnold (Authoritative)', accent: 'American', gender: 'Male' },
  { id: 'ODq5zmih8GrVes37Dizd', name: 'Patrick (Smooth)', accent: 'American', gender: 'Male' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger (Casual)', accent: 'American', gender: 'Male' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry (Fierce)', accent: 'American', gender: 'Male' },
];

const MODELS_LIST = [
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2 (Best)' },
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (Fastest)' },
  { id: 'eleven_flash_v2_5', name: 'Flash v2.5 (Balanced)' },
  { id: 'eleven_flash_v2', name: 'Flash v2 (Low latency)' },
];

const cache = new Map();

async function synthesizeText(text, apiKey, opts = {}) {
  if (!text?.trim()) throw new Error('Empty text');
  if (!apiKey) throw new Error('API key required');

  const {
    voiceId = VOICES_LIST[0].id,
    modelId = MODELS_LIST[0].id,
    voiceSettings = { stability: 0.45, similarity_boost: 0.75 },
  } = opts;

  const cacheKey = `${voiceId}:${modelId}:${text}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const res = await fetch(
    `${BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({ text, model_id: modelId, voice_settings: voiceSettings }),
    },
  );

  if (!res.ok) {
    let msg = `ElevenLabs error (${res.status})`;
    try {
      const d = JSON.parse(await res.text());
      msg = d.detail?.message || d.detail || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  const ab = await res.arrayBuffer();
  cache.set(cacheKey, ab);
  return ab;
}

async function synthesizeAll(segments, apiKey, opts = {}) {
  const { voiceId, modelId, voiceSettings, onProgress, signal } = opts;
  const results = [];
  const queue = segments.map((s, i) => ({ s, i }));
  let done = 0;

  async function worker() {
    while (queue.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const job = queue.shift();
      try {
        const ab = await synthesizeText(job.s.text, apiKey, {
          voiceId, modelId, voiceSettings,
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
  id: 'elevenlabs',
  name: 'ElevenLabs',
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

  /* ElevenLabs uses ArrayBuffer-based flow, not browser SpeechSynthesis */
  isBrowserBased: false,
};
