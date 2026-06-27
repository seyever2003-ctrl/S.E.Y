/**
 * Edge TTS Server
 *
 * A lightweight Node.js server that generates speech audio using
 * Microsoft Edge's Text-to-Speech engine via WebSocket.
 *
 * Runs alongside the Vite dev server — Vite proxies /api requests here.
 *
 * Start: node server/tts-server.js
 * Port: 3001 (configurable via PORT env)
 *
 * Endpoints:
 *   GET  /api/tts/voices  – List available voices
 *   POST /api/tts/speak   – Generate speech audio
 */

import express from 'express';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = process.env.PORT || 3001;
const app = express();

app.use(express.json({ limit: '1mb' }));

// ── Voice List ──────────────────────────────────────────────────────────────

const EDGE_VOICES = [
  // English (US)
  { id: 'en-US-JennyNeural', name: 'Jenny (US, Female, Natural)', locale: 'en-US', gender: 'Female' },
  { id: 'en-US-GuyNeural', name: 'Guy (US, Male, Natural)', locale: 'en-US', gender: 'Male' },
  { id: 'en-US-AriaNeural', name: 'Aria (US, Female, Expressive)', locale: 'en-US', gender: 'Female' },
  { id: 'en-US-DavisNeural', name: 'Davis (US, Male, Friendly)', locale: 'en-US', gender: 'Male' },
  { id: 'en-US-JaneNeural', name: 'Jane (US, Female, Professional)', locale: 'en-US', gender: 'Female' },
  { id: 'en-US-JasonNeural', name: 'Jason (US, Male, Energetic)', locale: 'en-US', gender: 'Male' },
  { id: 'en-US-NancyNeural', name: 'Nancy (US, Female, Warm)', locale: 'en-US', gender: 'Female' },
  { id: 'en-US-SaraNeural', name: 'Sara (US, Female, Cheerful)', locale: 'en-US', gender: 'Female' },
  { id: 'en-US-TonyNeural', name: 'Tony (US, Male, Narrative)', locale: 'en-US', gender: 'Male' },
  // English (UK)
  { id: 'en-GB-SoniaNeural', name: 'Sonia (UK, Female, Warm)', locale: 'en-GB', gender: 'Female' },
  { id: 'en-GB-RyanNeural', name: 'Ryan (UK, Male, Natural)', locale: 'en-GB', gender: 'Male' },
  { id: 'en-GB-LibbyNeural', name: 'Libby (UK, Female, Articulate)', locale: 'en-GB', gender: 'Female' },
  // English (Australia)
  { id: 'en-AU-NatashaNeural', name: 'Natasha (AU, Female, Warm)', locale: 'en-AU', gender: 'Female' },
  { id: 'en-AU-WilliamNeural', name: 'William (AU, Male, Friendly)', locale: 'en-AU', gender: 'Male' },
  // English (India)
  { id: 'en-IN-NeerjaNeural', name: 'Neerja (IN, Female, Friendly)', locale: 'en-IN', gender: 'Female' },
  { id: 'en-IN-PrabhatNeural', name: 'Prabhat (IN, Male, Deep)', locale: 'en-IN', gender: 'Male' },
  // Chinese
  { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (CN, Female, Warm)', locale: 'zh-CN', gender: 'Female' },
  { id: 'zh-CN-YunyangNeural', name: 'Yunyang (CN, Male, News)', locale: 'zh-CN', gender: 'Male' },
  // European
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
  { id: 'ko-KR-SunHiNeural', name: 'Sun-Hi (KR, Female, Warm)', locale: 'ko-KR', gender: 'Female' },
  { id: 'ko-KR-InJoonNeural', name: 'InJoon (KR, Male, Natural)', locale: 'ko-KR', gender: 'Male' },
  { id: 'pt-BR-FranciscaNeural', name: 'Francisca (BR, Female, Warm)', locale: 'pt-BR', gender: 'Female' },
  { id: 'pt-BR-AntonioNeural', name: 'Antonio (BR, Male, Natural)', locale: 'pt-BR', gender: 'Male' },
];

app.get('/api/tts/voices', (_req, res) => {
  res.json(EDGE_VOICES);
});


// ── Microsoft Edge TTS via WebSocket ──────────────────────────────────────

/**
 * Obtain a trust token from Microsoft's Edge TTS auth endpoint.
 */
async function getTrustToken() {
  const res = await fetch('https://edge.microsoft.com/translate/auth');
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  return res.text();
}

/**
 * Build SSML for the given text and voice.
 */
function buildSSML(text, voiceId, rate = 0, pitch = 0) {
  const escaped = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${voiceId}"><prosody rate="${rate}%" pitch="${pitch}Hz">${escaped}</prosody></voice></speak>`;
}

/**
 * Generate speech audio via Microsoft Edge TTS WebSocket.
 */
async function synthesizeEdgeTTS(text, voiceId, opts = {}) {
  if (!text?.trim()) throw new Error('Text is required');
  const { rate = 0, pitch = 0 } = opts;
  const trustToken = await getTrustToken();
  const ssml = buildSSML(text, voiceId, rate, pitch);
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();
  // The auth token is CRITICAL — Microsoft's service rejects requests without it
  const wsUrl = `wss://speech.platform.bing.com/connect?TrustedClient=default&ConnectionId=${requestId}&auth=${trustToken}`;

  return new Promise((resolve, reject) => {
    const chunks = [];
    let audioTurnEnded = false;
    const TIMEOUT = 30000;
    const timeout = setTimeout(() => {
      if (!audioTurnEnded) { ws.close(); reject(new Error('Edge TTS timed out')); }
    }, TIMEOUT);

    const ws = new WebSocket(wsUrl, [], {
      headers: {
        'Pragma': 'no-cache', 'Cache-Control': 'no-cache',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    ws.on('open', () => {
      // Send configuration
      ws.send('Path: speech.config\r\nX-RequestId: ' + requestId + '\r\nX-Timestamp: ' + timestamp + '\r\nContent-Type: application/json\r\n\r\n' +
        JSON.stringify({ context: { system: { version: '1.0.0', name: 'MicrosoftSpeechSDK', build: '1.0.0' }, os: { platform: 'Windows', name: 'Windows', version: '10.0' }, device: { type: 'Desktop', name: 'Chrome', version: '120.0.0.0' } } })
      );
      // Send TTS request
      ws.send('Path: ssml\r\nX-RequestId: ' + requestId + '\r\nX-Timestamp: ' + timestamp + '\r\nContent-Type: application/ssml+xml\r\n\r\n' + ssml);
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        chunks.push(Buffer.from(data));
      } else {
        const msg = data.toString();
        if (msg.includes('Path: turn.end')) audioTurnEnded = true;
      }
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      if (chunks.length === 0) return reject(new Error('No audio data from Edge TTS'));
      resolve(Buffer.concat(chunks));
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error('WS error: ' + err.message));
    });
  });
}

// ── REST Endpoints ───────────────────────────────────────────────────────────

app.post('/api/tts/speak', async (req, res) => {
  const { text, voice = 'en-US-JennyNeural', rate = 0, pitch = 0 } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });
  try {
    const audio = await synthesizeEdgeTTS(text, voice, { rate, pitch });
    res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length });
    res.send(audio);
  } catch (err) {
    console.error('Edge TTS error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Edge TTS server running on http://localhost:${PORT}`);
  console.log('  GET /api/tts/voices  – List voices');
  console.log('  POST /api/tts/speak  – Generate audio');
});
