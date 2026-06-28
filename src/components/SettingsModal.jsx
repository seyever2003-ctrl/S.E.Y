import React from 'react';
import { Eye, EyeOff, Settings } from 'lucide-react';

/**
 * SettingsModal — a compact dropdown for configuring the DeepSeek API key
 * from the topbar. Clicking outside or on the close button dismisses it.
 */
export default function SettingsModal({
  deepSeekApiKey,
  onApiKeyChange,
  onClose,
}) {
  const [showDeepSeekKey, setShowDeepSeekKey] = React.useState(false);
  const modalRef = React.useRef(null);

  // Close on click outside
  React.useEffect(() => {
    function handleClickOutside(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape
  React.useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="settings-overlay">
      <div className="settings-dropdown" ref={modalRef}>
        <div className="settings-dropdown-header">
          <Settings size={16} strokeWidth={2} />
          <span>Settings</span>
          <button className="settings-dropdown-close" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-dropdown-body">
          {/* DeepSeek API Key */}
          <div className="settings-dropdown-field">
            <label className="settings-dropdown-label">DeepSeek API Key</label>
            <div className="settings-dropdown-key-row">
              <input
                className="settings-dropdown-input"
                type={showDeepSeekKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={deepSeekApiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
              />
              <button
                className="settings-dropdown-key-toggle"
                type="button"
                onClick={() => setShowDeepSeekKey((v) => !v)}
                tabIndex="-1"
                title={showDeepSeekKey ? 'Hide key' : 'Show key'}
              >
                {showDeepSeekKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="settings-dropdown-hint">Get your key at platform.deepseek.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
