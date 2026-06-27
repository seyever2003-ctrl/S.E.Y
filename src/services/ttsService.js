/**
 * TTS Service – Facade over multiple TTS providers.
 *
 * Import this from your components; it delegates to the correct provider
 * based on the `providerId` passed in options.
 */
export { PROVIDERS, getProvider, decodeAll, decodeMp3ToBuffer } from './ttsProviders/index.js';

/**
 * Synthesize all segments using the specified provider.
 *
 * @param {Array}  segments  – [{ text, … }]
 * @param {string} apiKey    – API key (ignored for providers that don't need one)
 * @param {Object} opts
 * @param {string} opts.providerId – 'elevenlabs' | 'googlecloud' | 'edgetts' | 'browsertts'
 * @param {string} opts.voiceId
 * @param {string} opts.modelId
 * @param {number} [opts.rate]
 * @param {number} [opts.pitch]
 * @param {AbortSignal} opts.signal
 * @param {Function} opts.onProgress
 * @returns {Promise<Array<{index, arrayBuffer, error}>>}
 *
 * Note: For browser-based providers (isBrowserBased === true),
 * synthesizeAll will throw — use speakAllSegments instead.
 */
export async function synthesizeAll(segments, apiKey, opts = {}) {
  const { providerId = 'elevenlabs', ...rest } = opts;
  const provider = getProvider(providerId);

  if (provider.isBrowserBased) {
    throw new Error(
      'Browser TTS does not support ArrayBuffer synthesis. Use speakAllSegments().',
    );
  }

  return provider.synthesizeAll(segments, apiKey, rest);
}

/**
 * Speak segments sequentially using a browser-based provider (SpeechSynthesis).
 *
 * @param {Array}  segments
 * @param {Object} opts
 * @param {string} opts.providerId – must be 'browsertts'
 * @param {string} opts.voiceId
 * @param {number} opts.rate
 * @param {number} opts.pitch
 * @param {AbortSignal} opts.signal
 * @param {Function} opts.onProgress
 */
export async function speakAllSegments(segments, opts = {}) {
  const { providerId = 'browsertts', ...rest } = opts;
  const provider = getProvider(providerId);

  if (!provider.isBrowserBased) {
    throw new Error(
      `${provider.name} does not support live SpeechSynthesis. Use synthesizeAll().`,
    );
  }

  return provider.speakAll(segments, rest);
}

/**
 * Stop any in-progress browser-based speech.
 */
export function stopBrowserSpeech() {
  import('./ttsProviders/browserTts.js').then(mod => {
    mod.provider.stopSpeaking();
  }).catch(() => {});
}

/**
 * Clear caches for all API-based providers (ElevenLabs, Google Cloud, etc.).
 */
export function clearCache() {
  // For now this is a no-op since caches are provider-internal.
  // Future: iterate PROVIDERS and call provider.clearCache?.()
}

