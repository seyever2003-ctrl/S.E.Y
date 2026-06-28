/**
 * Gemini AI Service
 *
 * Uses Google's Gemini API to rewrite or summarize movie recap text
 * from SRT subtitle segments.
 *
 * @see https://ai.google.dev/docs/gemini_api_overview
 */

// ── Configuration ────────────────────────────────────────────────────────────

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.0-flash';

const DEFAULT_SYSTEM_PROMPT = `You are an expert movie recap writer and editor.
Your task is to rewrite the given subtitle text to make it more engaging,
concise, and cinematic. Follow these rules:
- Keep the same timing/duration — do NOT change the length significantly.
- Use vivid, descriptive language suitable for a movie recap voiceover.
- Maintain the original meaning and key details.
- Output ONLY the rewritten text, no explanations or markdown.
- If the text is already well-written, you may keep it as-is.`;

const SUMMARIZE_SYSTEM_PROMPT = `You are an expert movie recap writer and editor.
Your task is to SUMMARIZE the given subtitle text to be shorter and more concise.
Follow these rules:
- Keep the essential information but reduce length by 30-50%.
- Use clear, concise language suitable for a voiceover.
- Maintain the original meaning and key plot points.
- Output ONLY the summarized text, no explanations or markdown.`;

// ── API Call ─────────────────────────────────────────────────────────────────

/**
 * Send a prompt to Gemini and return the generated text.
 *
 * @param {string} text      - The segment text to process.
 * @param {string} apiKey    - Google Gemini API key.
 * @param {Object} [opts]
 * @param {string} [opts.systemPrompt] - System instruction for the model.
 * @param {string} [opts.model=DEFAULT_MODEL] - Model name.
 * @param {number} [opts.temperature=0.7] - Creativity (0-1).
 * @returns {Promise<string>} The rewritten/summarized text.
 */
export async function generateWithGemini(text, apiKey, opts = {}) {
  if (!text?.trim()) return text;
  if (!apiKey?.trim()) throw new Error('Gemini API key is required');

  const {
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    model = DEFAULT_MODEL,
    temperature = 0.7,
  } = opts;

  const url = `${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        parts: [{ text }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature,
      maxOutputTokens: 1024,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const retryMsg = retryAfter ? ` Retry in ${retryAfter}s.` : ' Wait a minute and try again.';
      throw new Error(`Gemini rate limit reached (free tier quota exhausted).${retryMsg} Check usage at https://ai.dev/rate-limit`);
    }
    if (res.status === 403 || res.status === 401) {
      throw new Error('Gemini API authentication failed (403/401). Your API key is invalid, expired, or does not have access to the Gemini API. Get a new key at https://aistudio.google.com/apikey');
    }
    let msg = `Gemini API error (${res.status})`;
    try {
      const err = await res.json();
      // Check for specific auth-related error messages
      if (err.error?.message?.toLowerCase().includes('api key')) {
        msg = 'Gemini API key is invalid: ' + err.error.message;
      } else {
        msg = err.error?.message || err.message || msg;
      }
    } catch {
      // use default message
    }
    throw new Error(msg);
  }

  const data = await res.json();

  // Extract the response text
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('Gemini returned no response candidates');

  // Search all parts for text content, ignoring non-text parts (inlineData, image_url, etc.)
  let responseText = '';
  if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
    for (const part of candidate.content.parts) {
      if (part.text) {
        responseText = part.text.trim();
        break;
      }
    }
  }
  if (!responseText) throw new Error('Gemini returned empty response');

  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    console.warn('Gemini: Non-stop finish reason:', candidate.finishReason);
  }

  return responseText;
}

// ── Batch Processing ─────────────────────────────────────────────────────────

/**
 * Process all segments through Gemini with progress reporting.
 *
 * @param {Array}  segments - Array of segment objects [{ id, text, ... }]
 * @param {string} apiKey   - Google Gemini API key
 * @param {Object} [opts]
 * @param {'rewrite'|'summarize'} [opts.mode='rewrite'] - Processing mode
 * @param {string} [opts.customPrompt] - Optional custom system prompt
 * @param {Function} [opts.onProgress] - (completed, total, currentIndex) => void
 * @param {AbortSignal} [opts.signal] - AbortSignal for cancellation
 * @returns {Promise<Array>} Updated segments with rewritten text
 */
export async function rewriteAllSegments(segments, apiKey, opts = {}) {
  if (!segments?.length) return segments;
  if (!apiKey?.trim()) throw new Error('Gemini API key is required');

  const {
    mode = 'rewrite',
    customPrompt = '',
    onProgress,
    signal,
  } = opts;

  const systemPrompt = customPrompt.trim() ||
    (mode === 'summarize' ? SUMMARIZE_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT);

  const results = [...segments];
  let completedCount = 0;

  for (let i = 0; i < segments.length; i++) {
    if (signal?.aborted) {
      throw new DOMException('Gemini processing aborted', 'AbortError');
    }

    const seg = segments[i];
    if (!seg.text?.trim()) {
      completedCount++;
      onProgress?.(completedCount, segments.length, i);
      continue;
    }

    try {
      const rewritten = await generateWithGemini(seg.text, apiKey, {
        systemPrompt,
      });
      results[i] = {
        ...seg,
        originalText: seg.text,
        text: rewritten,
        rewritten: true,
      };
    } catch (err) {
      results[i] = {
        ...seg,
        originalText: seg.text,
        geminiError: err.message,
        rewritten: false,
      };
      console.warn(`Gemini segment ${i} failed:`, err.message);
    }

    completedCount++;
    onProgress?.(completedCount, segments.length, i);
  }

  return results;
}

// ── Available Models ─────────────────────────────────────────────────────────

export const GEMINI_MODELS = [
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Fast, balanced)' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite (Lowest cost)' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Legacy, fast)' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Most capable)' },
];

