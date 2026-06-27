/**
 * Translation Service
 *
 * Translates subtitle segments from one language to another
 * using AI APIs (Gemini or OpenAI). Preserves SRT timestamps.
 *
 * Usage:
 *   import { translateSegments } from './translationService.js';
 *   const results = await translateSegments(segments, {
 *     provider: 'gemini', apiKey: '...',
 *     sourceLang: 'Chinese', targetLang: 'Khmer',
 *     onProgress: (done, total) => ..., onLog: (msg) => ...,
 *   });
 */

import { generateWithGemini } from './geminiService.js';

export const TRANSLATION_PROVIDERS = {
  gemini: {
    id: 'gemini', name: 'Google Gemini',
    needsApiKey: true,
    description: 'Excellent multilingual translation.',
    pricing: 'Free tier — use your Gemini API key',
  },
  openai: {
    id: 'openai', name: 'OpenAI GPT',
    needsApiKey: true,
    description: 'High-quality translation with GPT.',
    pricing: 'Pay-per-token — use your OpenAI key',
  },
};

export const LANGUAGE_PAIRS = [
  { id: 'zh-km', sourceLabel: 'Chinese (中文)', targetLabel: 'Khmer (ភាសាខ្មែរ)' },
  { id: 'en-km', sourceLabel: 'English', targetLabel: 'Khmer (ភាសាខ្មែរ)' },
  { id: 'th-km', sourceLabel: 'Thai (ไทย)', targetLabel: 'Khmer (ភាសាខ្មែរ)' },
  { id: 'vi-km', sourceLabel: 'Vietnamese (Tiếng Việt)', targetLabel: 'Khmer (ភាសាខ្មែរ)' },
  { id: 'ja-km', sourceLabel: 'Japanese (日本語)', targetLabel: 'Khmer (ភាសាខ្មែរ)' },
  { id: 'ko-km', sourceLabel: 'Korean (한국어)', targetLabel: 'Khmer (ភាសាខ្មែរ)' },
  { id: 'zh-en', sourceLabel: 'Chinese (中文)', targetLabel: 'English' },
  { id: 'custom', sourceLabel: 'Custom...', targetLabel: '' },
];

export async function translateSegments(segments, opts) {
  if (!opts) opts = {};
  var provider = opts.provider || 'gemini';
  var apiKey = opts.apiKey;
  var sourceLang = opts.sourceLang || 'Chinese';
  var targetLang = opts.targetLang || 'Khmer';
  var model = opts.model;
  var onProgress = opts.onProgress;
  var onLog = opts.onLog || function() {};

  if (!segments || !segments.length) throw new Error('No segments to translate');
  if (!apiKey || !apiKey.trim()) throw new Error('API key is required');

  var providerName = provider === 'gemini' ? 'Gemini' : 'OpenAI';
  onLog('Translating ' + segments.length + ' segments from ' + sourceLang + ' to ' + targetLang + ' using ' + providerName + '...');

  var srtText = buildSRTString(segments);
  onLog('SRT content built, sending for translation...');
  if (onProgress) onProgress(0, segments.length);

  var translatedSRT;
  if (provider === 'gemini') {
    translatedSRT = await translateWithGemini(srtText, apiKey, { sourceLang: sourceLang, targetLang: targetLang, model: model, onLog: onLog });
  } else if (provider === 'openai') {
    translatedSRT = await translateWithOpenAI(srtText, apiKey, { sourceLang: sourceLang, targetLang: targetLang, model: model, onLog: onLog });
  } else {
    throw new Error('Unknown provider: ' + provider);
  }

  var parseMod = await import('../utils/srtParser.js');
  var translatedSegments = parseMod.parseSRT(translatedSRT);

  if (translatedSegments.length === 0) {
    throw new Error('Translation returned no valid segments.');
  }

  var results = segments.map(function(orig, i) {
    var translated = translatedSegments[i] || {};
    return Object.assign({}, orig, {
      originalText: orig.text,
      text: translated.text || orig.text,
      translated: true,
    });
  });

  onLog('Translation complete: ' + results.length + ' segments');
  if (onProgress) onProgress(segments.length, segments.length);
  return results;
}

async function translateWithGemini(srtText, apiKey, opts) {
  var sourceLang = opts.sourceLang;
  var targetLang = opts.targetLang;
  var model = opts.model;
  var onLog = opts.onLog;

  var systemPrompt = 'You are a professional subtitle translator. ' +
    'Translate the following SRT subtitle text from ' + sourceLang + ' to ' + targetLang + '. ' +
    'CRITICAL: Preserve the EXACT SRT format including all timestamps, index numbers, and structure. ' +
    'Only translate the text lines between timestamps. ' +
    'Output ONLY the translated SRT content, no explanations, no markdown. ' +
    'Keep the same number of subtitle blocks.';

  var result = await generateWithGemini(srtText, apiKey, {
    systemPrompt: systemPrompt,
    model: model || 'gemini-2.0-flash',
    temperature: 0.1,
  });

  return result;
}

async function translateWithOpenAI(srtText, apiKey, opts) {
  var sourceLang = opts.sourceLang;
  var targetLang = opts.targetLang;
  var model = opts.model;
  var onLog = opts.onLog;

  onLog?.('Sending to OpenAI GPT...');

  var messages = [
    {
      role: 'system',
      content: 'You are a professional subtitle translator. ' +
        'Translate the following SRT subtitle text from ' + sourceLang + ' to ' + targetLang + '. ' +
        'CRITICAL: Preserve the EXACT SRT format including all timestamps, index numbers, and structure. ' +
        'Only translate the text lines between timestamps. ' +
        'Output ONLY the translated SRT content, no explanations, no markdown. ' +
        'Keep the same number of subtitle blocks.',
    },
    { role: 'user', content: srtText },
  ];

  var modelId = model || 'gpt-4o-mini';

  var res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ model: modelId, messages: messages, temperature: 0.1, max_tokens: 16384 }),
  });

  if (!res.ok) {
    var msg = 'OpenAI API error (' + res.status + ')';
    try { var err = await res.json(); msg = err.error?.message || msg; } catch {}
    throw new Error(msg);
  }

  var data = await res.json();
  var text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI returned empty response');
  return text;
}

function buildSRTString(segments) {
  return segments.map(function(seg, i) {
    var start = fmtSRT(seg.start);
    var end = fmtSRT(seg.end);
    return (i + 1) + '\\n' + start + ' --> ' + end + '\\n' + seg.text;
  }).join('\\n\\n');
}

function fmtSRT(s) {
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = Math.floor(s % 60);
  var ms = Math.floor((s % 1) * 1000);
  return pad(h) + ':' + pad(m) + ':' + pad(sec) + ',' + pad3(ms);
}

function pad(n) { return String(n).padStart(2, '0'); }
function pad3(n) { return String(n).padStart(3, '0'); }
