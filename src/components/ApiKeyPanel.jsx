import React, { useState, useCallback, useMemo } from 'react';
import { PROVIDERS, getProvider } from '../services/ttsService.js';

/**
 * ApiKeyPanel – Provider selection, API key input, voice/model pickers, and generate button.
 *
 * Props:
 *  - onGenerate: (providerId, apiKey, voiceId, modelId, extraOpts) => void
 *  - isGenerating: boolean
 *  - progress: { completed, total }
 *  - disabled: boolean (no segments loaded)
 */
export default function ApiKeyPanel({ onGenerate, isGenerating, progress, disabled }) {
  const [providerId, setProviderId] = useState(PROVIDERS[0].id);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [voiceId, setVoiceId] = useState('');
  const [modelId, setModelId] = useState('');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [validationError, setValidationError] = useState('');

  const provider = useMemo(() => getProvider(providerId), [providerId]);

  // Get the default voice/model whenever the provider changes
  const voices = useMemo(() => {
    const v = provider.getVoices();
    return Array.isArray(v) ? v : [];
  }, [provider]);

  const models = useMemo(() => {
    const m = provider.getModels();
    return Array.isArray(m) ? m : [];
  }, [provider]);

  const progressPct = progress
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  // Auto-set voice/model when provider changes
  const handleProviderChange = useCallback((e) => {
    const newProviderId = e.target.value;
    setProviderId(newProviderId);
    setApiKey('');
    setValidationError('');
    setVoiceId('');
    setModelId('');
    setRate(1);
    setPitch(1);

    const newProvider = getProvider(newProviderId);
    const defaultVoices = newProvider.getVoices?.() || [];
    const defaultModels = newProvider.getModels?.() || [];
    if (defaultVoices.length > 0) setVoiceId(defaultVoices[0].id);
    if (defaultModels.length > 0) setModelId(defaultModels[0].id);
  }, []);

  const handleGenerate = useCallback(() => {
    setValidationError('');

    if (provider.needsApiKey) {
      if (!apiKey.trim()) {
        setValidationError(`Please enter your ${provider.name} API key`);
        return;
      }
      if (providerId === 'elevenlabs' && !apiKey.trim().startsWith('sk_') && apiKey.trim().length < 20) {
        setValidationError('API key looks invalid. It should start with "sk_"');
        return;
      }
    }

    const extraOpts = {};
    if (providerId === 'browsertts') {
      extraOpts.rate = rate;
      extraOpts.pitch = pitch;
    }

    onGenerate(providerId, apiKey.trim(), voiceId, modelId, extraOpts);
  }, [provider, providerId, apiKey, voiceId, modelId, rate, pitch, onGenerate]);

  const providerLabel = provider.name;

  return (
    <div className="api-key-panel">
      {/* Provider selector */}
      <div className="api-key-select-row">
        <label className="api-key-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          TTS Provider
        </label>
        <select
          value={providerId}
          onChange={handleProviderChange}
          disabled={isGenerating}
          className="api-key-select"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* API Key field (only for providers that need one) */}
      {provider.needsApiKey && (
        <div className="api-key-field">
          <label className="api-key-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {provider.name} API Key
          </label>
          <div className="api-key-input-row">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setValidationError(''); }}
              placeholder={providerId === 'elevenlabs' ? 'sk_...' : 'Enter your API key'}
              className="api-key-input"
              disabled={isGenerating}
            />
            <button
              className="key-toggle"
              onClick={() => setShowKey(!showKey)}
              title={showKey ? 'Hide key' : 'Show key'}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {showKey ? (
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                ) : (
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                )}
              </svg>
            </button>
          </div>
          {validationError && <p className="api-key-error">{validationError}</p>}
        </div>
      )}

      {/* Voice selector */}
      {provider.hasVoices && voices.length > 0 && (
        <div className="api-key-select-row">
          <label className="api-key-label">Voice</label>
          <select
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            disabled={isGenerating}
            className="api-key-select"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}{v.gender ? ` (${v.gender})` : ''}{v.lang ? ` - ${v.lang}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Model selector */}
      {provider.hasModels && models.length > 0 && (
        <div className="api-key-select-row">
          <label className="api-key-label">Model</label>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={isGenerating}
            className="api-key-select"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Rate & Pitch sliders (only for Browser TTS) */}
      {providerId === 'browsertts' && (
        <>
          <div className="api-key-slider-row">
            <label className="api-key-label">Speed: {rate.toFixed(1)}x</label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              disabled={isGenerating}
              className="api-key-slider"
            />
          </div>
          <div className="api-key-slider-row">
            <label className="api-key-label">Pitch: {pitch.toFixed(1)}</label>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value))}
              disabled={isGenerating}
              className="api-key-slider"
            />
          </div>
        </>
      )}

      {/* Generate button */}
      <button
        className={`generate-btn ${isGenerating ? 'generating' : ''}`}
        onClick={handleGenerate}
        disabled={disabled || isGenerating}
      >
        {isGenerating ? (
          <>
            <div className="btn-spinner" />
            <span>Generating {progress?.completed}/{progress?.total}...</span>
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 8 14 2 18 2 22 6 22 10 16 22 15 18 19 13" />
            </svg>
            <span>Generate with {providerLabel}</span>
          </>
        )}
      </button>

      {/* Progress bar */}
      {isGenerating && (
        <div className="generate-progress-bar">
          <div className="generate-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {/* Provider-specific hints */}
      <p className="api-key-hint">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        {providerId === 'elevenlabs' && 'Get a free API key at elevenlabs.io'}
        {providerId === 'googlecloud' && 'Get an API key at console.cloud.google.com (free: 1M chars/month)'}
        {providerId === 'edgetts' && "Uses Microsoft Edge TTS via local server - no API key needed (run: npm run server)"}
        {providerId === 'browsertts' && "Uses your browser's built-in speech - no API key needed, works offline"}
      </p>
    </div>
  );
}
