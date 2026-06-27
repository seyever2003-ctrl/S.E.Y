import React, { useState, useCallback, useMemo } from 'react';
import { TRANSLATION_PROVIDERS, LANGUAGE_PAIRS } from '../services/translationService.js';

export default function TranslatePanel({ segments, onTranslateApplied, disabled }) {
  const [providerId, setProviderId] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [langPair, setLangPair] = useState('zh-km');
  const [customSource, setCustomSource] = useState('');
  const [customTarget, setCustomTarget] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState('');
  const [error, setError] = useState('');
  const [translatedSegments, setTranslatedSegments] = useState(null);
  const [editTexts, setEditTexts] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  const provider = TRANSLATION_PROVIDERS[providerId];

  const addLog = useCallback(function(msg) { setLog(function(p) { return p + '\n' + msg; }); }, []);

  var langInfo = useMemo(function() {
    if (langPair === 'custom') return { sourceLabel: customSource || 'Source', targetLabel: customTarget || 'Target' };
    return LANGUAGE_PAIRS.find(function(p) { return p.id === langPair; }) || LANGUAGE_PAIRS[0];
  }, [langPair, customSource, customTarget]);

  var handleTranslate = useCallback(async function() {
    if (!segments || !segments.length) return;
    if (!apiKey.trim()) { setError('Please enter your API key'); return; }
    setIsTranslating(true);
    setProgress({ done: 0, total: segments.length });
    setLog(''); setError(''); setTranslatedSegments(null); setEditTexts({}); setSuccessMessage('');
    try {
      var mod = await import('../services/translationService.js');
      var src = langInfo.sourceLabel.replace(/\s*\(.*?\)\s*/g, '').trim();
      var tgt = langInfo.targetLabel.replace(/\s*\(.*?\)\s*/g, '').trim();
      addLog('Source: ' + src + ' -> Target: ' + tgt);
      addLog('Provider: ' + provider.name);
      var results = await mod.translateSegments(segments, {
        provider: providerId, apiKey: apiKey.trim(), sourceLang: src, targetLang: tgt,
        onProgress: function(done, total) { setProgress({ done: done, total: total }); },
        onLog: addLog,
      });
      setTranslatedSegments(results);
      var texts = {};
      results.forEach(function(s, i) { texts[i] = s.text; });
      setEditTexts(texts);
      setSuccessMessage('Translation ready - review and edit below, then click Apply to Timeline.');
    } catch (err) {
      console.error('Translation failed:', err);
      setError(err.message || 'Translation failed');
      addLog('Error: ' + (err.message || 'Unknown error'));
    } finally { setIsTranslating(false); }
  }, [segments, apiKey, providerId, langInfo, provider, onTranslateApplied, addLog]);

  var handleEditChange = useCallback(function(index, value) {
    setEditTexts(function(prev) { var n = Object.assign({}, prev); n[index] = value; return n; });
  }, []);

  var handleApply = useCallback(function() {
    if (!translatedSegments) return;
    var updated = translatedSegments.map(function(s, i) { return Object.assign({}, s, { text: editTexts[i] || s.text }); });
    onTranslateApplied(updated);
    setSuccessMessage('Applied ' + updated.length + ' translated segments to timeline!');
  }, [translatedSegments, editTexts, onTranslateApplied]);

  var handleDownload = useCallback(function() {
    if (!translatedSegments) return;
    var lines = translatedSegments.map(function(s, i) {
      return (i + 1) + '\n' + fmtSRT(s.start) + ' --> ' + fmtSRT(s.end) + '\n' + (editTexts[i] || s.text);
    });
    var blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'translated-captions.srt'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
  }, [translatedSegments, editTexts]);

  var hasSegments = segments && segments.length > 0;
  var progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  if (!hasSegments) return null;

  return (
    <div className="translate-panel">
      <div className="caption-row">
        <label className="caption-label">Engine</label>
        <select className="caption-select" value={providerId} onChange={function(e) { setProviderId(e.target.value); }} disabled={isTranslating}>
          {Object.keys(TRANSLATION_PROVIDERS).map(function(id) { return <option key={id} value={id}>{TRANSLATION_PROVIDERS[id].name}</option>; })}
        </select>
      </div>
      <p className="caption-hint">{provider.description}</p>

      <div className="caption-row">
        <label className="caption-label">Language Pair</label>
        <select className="caption-select" value={langPair} onChange={function(e) { setLangPair(e.target.value); }} disabled={isTranslating}>
          {LANGUAGE_PAIRS.map(function(p) { return <option key={p.id} value={p.id}>{p.sourceLabel} &rarr; {p.targetLabel}</option>; })}
        </select>
      </div>

      {langPair === 'custom' && (
        <div style={{ marginBottom: 6 }}>
          <input className="caption-input" placeholder="Source language" value={customSource} onChange={function(e) { setCustomSource(e.target.value); }} disabled={isTranslating} style={{ marginBottom: 4 }} />
          <input className="caption-input" placeholder="Target language" value={customTarget} onChange={function(e) { setCustomTarget(e.target.value); }} disabled={isTranslating} />
        </div>
      )}

      <div className="caption-row">
        <label className="caption-label">API Key</label>
        <div className="caption-key-input">
          <input type={showKey ? 'text' : 'password'} className="caption-input" value={apiKey} onChange={function(e) { setApiKey(e.target.value); }} placeholder={providerId === 'gemini' ? 'Enter Gemini API key' : 'sk-...'} disabled={isTranslating} />
          <button className="caption-toggle-key" onClick={function() { setShowKey(!showKey); }} type="button" tabIndex={-1}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {showKey ? <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
            </svg>
          </button>
        </div>
      </div>

      <div className="caption-actions">
        {!translatedSegments && (
          <button className="caption-transcribe-btn" onClick={handleTranslate} disabled={isTranslating || !apiKey.trim() || !hasSegments}>
            {isTranslating ? <><div className="btn-spinner" /><span>Translating... {progressPct}%</span></> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg><span>Translate {segments.length} Segments</span></>}
          </button>
        )}
      </div>

      {isTranslating && <div className="caption-progress-bar"><div className="caption-progress-fill" style={{ width: progressPct + '%' }} /></div>}
      {log && <pre className="caption-log">{log}</pre>}
      {error && <p className="caption-error">{error}</p>}
      {successMessage && !isTranslating && <p className="caption-success">{successMessage}</p>}

      {translatedSegments && !isTranslating && (
        <div className="translate-table-section">
          <div className="translate-table-header">
            <h4 className="translate-table-title">Review &amp; Edit</h4>
            <button className="translate-download-btn" onClick={handleDownload} title="Download SRT">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </button>
          </div>
          <div className="translate-table-scroll">
            <table className="translate-table">
              <thead><tr>
                <th className="tt-col-num">#</th>
                <th className="tt-col-time">Time</th>
                <th className="tt-col-orig">Original ({langInfo.sourceLabel})</th>
                <th className="tt-col-trans">Translated ({langInfo.targetLabel})</th>
              </tr></thead>
              <tbody>
                {translatedSegments.map(function(s, i) {
                  return (
                    <tr key={i}>
                      <td className="tt-col-num">{i + 1}</td>
                      <td className="tt-col-time">{fmtSRT(s.start)}<br /><span style={{display:'block',fontSize:6,color:'var(--border-medium)',lineHeight:1}}>&darr;</span><br />{fmtSRT(s.end)}</td>
                      <td className="tt-col-orig"><div style={{fontSize:9,color:'var(--text-secondary)',wordBreak:'break-word',lineHeight:1.4}}>{s.originalText}</div></td>
                      <td className="tt-col-trans">
                        <textarea className="tt-edit-input" value={editTexts[i] !== undefined ? editTexts[i] : s.text} onChange={function(e) { handleEditChange(i, e.target.value); }} rows={2} disabled={disabled} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="translate-apply-btn" onClick={handleApply} disabled={disabled}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
            <span>Apply to Timeline ({translatedSegments.length} segments)</span>
          </button>
        </div>
      )}

      <p className="caption-pricing">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
        {provider.pricing}
      </p>
    </div>
  );
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
