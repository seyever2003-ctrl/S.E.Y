/**
 * Browser SpeechSynthesis Provider
 *
 * Uses the browser's built-in SpeechSynthesis API (Web Speech API).
 * Completely free – no API key needed. Works offline.
 * Voices available depend on the user's OS and browser.
 *
 * Note: This provider does NOT return ArrayBuffers. Instead, playback
 * happens directly via speechSynthesis.speak(). The Preview component
 * switches to a "live speak" mode when this provider is active.
 */
let cachedVoices = [];
let voiceLoadAttempted = false;

/**
 * Load voices from the browser API, retrying if they aren't ready yet.
 */
function loadVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return [];
  }
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    cachedVoices = voices;
    voiceLoadAttempted = true;
  }
  return cachedVoices;
}

// Attempt to load voices immediately
if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices();
  // Some browsers load voices asynchronously
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function getVoices() {
  if (cachedVoices.length === 0 && !voiceLoadAttempted) {
    loadVoices();
  }
  // Map to a consistent shape; filter to only English for simplicity
  const english = cachedVoices.filter(v => v.lang && v.lang.startsWith('en'));
  if (english.length === 0) {
    // Fallback: return all voices if no English ones found
    return cachedVoices.map(v => ({
      id: v.voiceURI,
      name: `${v.name} (${v.lang})`,
      gender: v.name.toLowerCase().includes('female') ? 'Female' : 'Male',
      lang: v.lang,
    }));
  }
  return english.map(v => ({
    id: v.voiceURI,
    name: `${v.name} (${v.lang})`,
    gender: v.name.toLowerCase().includes('female') ? 'Female' : 'Male',
    lang: v.lang,
  }));
}

function getModels() {
  return [{ id: 'default', name: 'Browser Default' }];
}

// ── Direct speech playback (the primary interface for this provider) ─────

let currentUtterance = null;
let speechResolve = null;

/**
 * Speak a single segment via the SpeechSynthesis API.
 * Returns a Promise that resolves when speech completes or is cancelled.
 */
function speakText(text, opts = {}) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }
    // Cancel any in-progress speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const { voiceId, rate = 1, pitch = 1, volume = 1 } = opts;

    // Set the voice if specified
    if (voiceId) {
      const voices = window.speechSynthesis.getVoices();
      const found = voices.find(v => v.voiceURI === voiceId);
      if (found) utterance.voice = found;
    }

    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    currentUtterance = utterance;
    speechResolve = resolve;

    utterance.onend = () => {
      currentUtterance = null;
      speechResolve = null;
      resolve();
    };
    utterance.onerror = () => {
      currentUtterance = null;
      speechResolve = null;
      resolve();
    };

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Stop any in-progress speech.
 */
function stopSpeaking() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (speechResolve) {
    speechResolve();
    speechResolve = null;
  }
  currentUtterance = null;
}

/**
 * Speak an array of segments sequentially, calling onProgress after each.
 */
async function speakAll(segments, opts = {}) {
  const { onProgress, signal, voiceId, rate, pitch } = opts;

  for (let i = 0; i < segments.length; i++) {
    if (signal?.aborted) {
      stopSpeaking();
      throw new DOMException('Aborted', 'AbortError');
    }
    const text = segments[i].text?.trim();
    if (text) {
      await speakText(text, { voiceId, rate, pitch });
    }
    onProgress?.(i + 1, segments.length, i);
  }
}

// ── Stub synthesize methods (this provider doesn't use ArrayBuffers) ─────
// These exist so the provider interface is consistent, but they are NOT used.
// The Preview component checks `isBrowserBased` and uses speakAll instead.

async function synthesizeText() {
  throw new Error('Browser TTS does not support ArrayBuffer synthesis. Use speakAll().');
}

async function synthesizeAll() {
  throw new Error('Browser TTS does not support ArrayBuffer synthesis. Use speakAll().');
}

export const provider = {
  id: 'browsertts',
  name: 'Browser TTS (Free)',
  needsApiKey: false,
  hasVoices: true,
  hasModels: false,

  getVoices,
  getModels,

  synthesizeText,
  synthesizeAll,

  isBrowserBased: true,
  speakText,
  speakAll,
  stopSpeaking,
};
