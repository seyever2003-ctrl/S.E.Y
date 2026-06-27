/**
 * TTS Provider Registry
 *
 * Each provider must export an object with:
 *   id          – unique string key
 *   name        – human-readable label
 *   needsApiKey – boolean; if true, the UI shows an API key field
 *   hasVoices   – boolean; if true, the UI shows a voice picker
 *   hasModels   – boolean; if true, the UI shows a model picker
 *   getVoices() – returns array of { id, name, … }
 *   getModels() – returns array of { id, name, … }
 *
 *   synthesizeText(text, apiKey, opts) – Promise<ArrayBuffer>
 *   synthesizeAll(segments, apiKey, opts) – Promise<Array<{index,arrayBuffer,error}>>
 *
 *   (optional) isBrowserBased – if true, playback uses SpeechSynthesis directly
 *   speakSegment(text, voiceId, …) – void (for browser-based providers)
 *   stopSpeaking() – void
 */

import { provider as elevenLabs } from './elevenLabs.js';
import { provider as googleCloud } from './googleCloud.js';
import { provider as browserTts } from './browserTts.js';
import { provider as edgeTts } from './edgeTts.js';

/** All registered providers */
export const PROVIDERS = [elevenLabs, googleCloud, edgeTts, browserTts];

/** Look up a provider by id */
export function getProvider(id) {
  return PROVIDERS.find(p => p.id === id) || elevenLabs;
}

/** Shared decode helpers */
export async function decodeMp3ToBuffer(ctx, data) {
  if (!data) return null;
  try { return await ctx.decodeAudioData(data.slice(0)); }
  catch (e) { console.error('MP3 decode fail:', e); return null; }
}

export async function decodeAll(ctx, results) {
  return Promise.all(results.map(async r => ({
    index: r.index,
    audioBuffer: r.arrayBuffer ? await decodeMp3ToBuffer(ctx, r.arrayBuffer) : null,
    error: r.error,
  })));
}
