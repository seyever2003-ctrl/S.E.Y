/**
 * Edge TTS Provider (Server-based)
 *
 * Uses a local Node.js server to generate speech via Microsoft Edge TTS
 * WebSocket protocol. Produces high-quality neural TTS audio (MP3) that
 * can be saved/downloaded as .wav via the existing export pipeline.
 *
 * API-based (isBrowserBased: false) — returns ArrayBuffers compatible
 * with playback via AudioContext and export as .wav files.
 *
 * Completely free – no API key required. Requires the TTS server.
 * Start: npm run server   (or npm start to run both Vite + server)
 */

// In dev, Vite proxies /api/tts → localhost:3001.
// In production, set VITE_TTS_API_BASE to your deployed TTS server URL.
const API_BASE = import.meta.env.VITE_TTS_API_BASE || '/api/tts';

const EDGE_VOICES = [
  { id: 'en-US-JennyNeural', name: 'Jenny (US, Female, Natural)', locale: 'en-US', gender: 'Female' },
  { id: 'en-US-GuyNeural', name: 'Guy (US, Male, Natural)', locale: 'en-US', gender: 'Male' },
  { id: 'en-US-AriaNeural', name: 'Aria (US, Female, Expressive)', locale: 'en-US', gender: 'Female' },
  { id: 'en-US-DavisNeural', name: 'Davis (US, Male, Friendly)', locale: 'en-US', gender: 'Male' },
  { id: 'en-US-JaneNeural', name: 'Jane (US, Female, Professional)', locale: 'en-US', gender: 'Female' },
  { id: 'en-US-JasonNeural', name: 'Jason (US, Male, Energetic)', locale: 'en-US', gender: 'Male' },
  { id: 'en-US-NancyNeural', name: 'Nancy (US, Female, Warm)', locale: 'en-US', gender: 'Female' },
  { id: 'en-US-SaraNeural', name: 'Sara (US, Female, Cheerful)', locale: 'en-US', gender: 'Female' },
  { id: 'en-US-TonyNeural', name: 'Tony (US, Male, Narrative)', locale: 'en-US', gender: 'Male' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia (UK, Female, Warm)', locale: 'en-GB', gender: 'Female' },
  { id: 'en-GB-RyanNeural', name: 'Ryan (UK, Male, Natural)', locale: 'en-GB', gender: 'Male' },
  { id: 'en-GB-LibbyNeural', name: 'Libby (UK, Female, Articulate)', locale: 'en-GB', gender: 'Female' },
  { id: 'en-AU-NatashaNeural', name: 'Natasha (AU, Female, Warm)', locale: 'en-AU', gender: 'Female' },
  { id: 'en-AU-WilliamNeural', name: 'William (AU, Male, Friendly)', locale: 'en-AU', gender: 'Male' },
  { id: 'en-IN-NeerjaNeural', name: 'Neerja (IN, Female, Friendly)', locale: 'en-IN', gender: 'Female' },
  { id: 'en-IN-PrabhatNeural', name: 'Prabhat (IN, Male, Deep)', locale: 'en-IN', gender: 'Male' },
  { id: 'de-DE-KatjaNeural', name: 'Katja (DE, Female, Warm)', locale: 'de-DE', gender: 'Female' },
  { id: 'de-DE-ConradNeural', name: 'Conrad (DE, Male, Calm)', locale: 'de-DE', gender: 'Male' },
  { id: 'fr-FR-DeniseNeural', name: 'Denise (FR, Female, Warm)', locale: 'fr-FR', gender: 'Female' },
  { id: 'fr-FR-HenriNeural', name: 'Henri (FR, Male, Natural)', locale: 'fr-FR', gender: 'Male' },
  { id: 'es-ES-ElviraNeural', name: 'Elvira (ES, Female, Warm)', locale: 'es-ES', gender: 'Female' },
  { id: 'es-ES-AlvaroNeural', name: 'Alvaro (ES, Male, Natural)', locale: 'es-ES', gender: 'Male' },
  { id: 'it-IT-ElsaNeural', name: 'Elsa (IT, Female, Warm)', locale: 'it-IT', gender: 'Female' },
  { id: 'it-IT-DiegoNeural', name: 'Diego (IT, Male, Natural)', locale: 'it-IT', gender: 'Male' },
  { id: 'ja-JP-NanamiNeural', name: 'Nanami (JP, Female, Warm)', locale: 'ja-JP', gender: 'Female' },
  { id: 'ja-JP-KeitaNeural', name: 'Keita (JP, Male, Natural)', locale: 'ja-JP', gender: 'Male' },
  { id: 'pt-BR-FranciscaNeural', name: 'Francisca (BR, Female, Warm)', locale: 'pt-BR', gender: 'Female' },
  { id: 'pt-BR-AntonioNeural', name: 'Antonio (BR, Male, Natural)', locale: 'pt-BR', gender: 'Male' },
  { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (CN, Female, Warm)', locale: 'zh-CN', gender: 'Female' },
  { id: 'zh-CN-YunyangNeural', name: 'Yunyang (CN, Male, News)', locale: 'zh-CN', gender: 'Male' },
];

function getVoices() { return EDGE_VOICES; }
function getModels() { return [{ id: 'default', name: 'Default' }]; }


// ── Synthesis ────────────────────────────────────────────────────────────────

const MAX_CONCURRENCY = 3;

async function synthesizeText(text, apiKey, opts = {}) {
  if (!text?.trim()) throw new Error('Empty text');
  const { voiceId = EDGE_VOICES[0].id, rate = 0, pitch = 0 } = opts;

  const res = await fetch(`${API_BASE}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: voiceId,
      rate: typeof rate === 'number' ? Math.round(rate) : 0,
      pitch: typeof pitch === 'number' ? Math.round(pitch) : 0,
    }),
  });

  if (!res.ok) {
    let msg = `Edge TTS error (${res.status})`;
    try { const e = await res.json(); msg = e.error || msg; } catch { /* */ }
    throw new Error(msg);
  }
  return res.arrayBuffer();
}

async function synthesizeAll(segments, apiKey, opts = {}) {
  const { voiceId, rate, pitch, onProgress, signal } = opts;
  const results = [];
  const queue = segments.map((s, i) => ({ s, i }));
  let done = 0;

  async function worker() {
    while (queue.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const job = queue.shift();
      try {
        const ab = await synthesizeText(job.s.text, apiKey, { voiceId, rate, pitch });
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

// ── Stub browser methods ─────────────────────────────────────────────────────

function speakText() { throw new Error('Edge TTS is server-based. Use synthesizeAll().'); }
function speakAll() { throw new Error('Edge TTS is server-based. Use synthesizeAll().'); }
function stopSpeaking() { /* no-op */ }

// ── Provider Export ──────────────────────────────────────────────────────────

export const provider = {
  id: 'edgetts',
  name: 'Edge TTS (Free)',
  needsApiKey: false,
  hasVoices: true,
  hasModels: false,
  getVoices,
  getModels,
  synthesizeText,
  synthesizeAll,
  isBrowserBased: false,
  speakText,
  speakAll,
  stopSpeaking,
};
