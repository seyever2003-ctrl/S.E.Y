import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './app.css';

// ── Global error handler — catches any uncaught runtime errors ────────────
window.onerror = function (msg, url, line, col, error) {
  const errDiv = document.getElementById('runtime-error');
  if (errDiv) {
    errDiv.style.display = 'block';
    errDiv.querySelector('.error-message').textContent = msg;
    errDiv.querySelector('.error-stack').textContent =
      error?.stack || `at ${url}:${line}:${col}`;
  }
  console.error('[Global Error]', msg, error);
  return true;
};

window.addEventListener('unhandledrejection', function (e) {
  const errDiv = document.getElementById('runtime-error');
  if (errDiv) {
    errDiv.style.display = 'block';
    errDiv.querySelector('.error-message').textContent =
      e.reason?.message || String(e.reason);
    errDiv.querySelector('.error-stack').textContent =
      e.reason?.stack || '(no stack)';
  }
  console.error('[Unhandled Promise]', e.reason);
});

// ── Render the app ────────────────────────────────────────────────────────
const rootEl = document.getElementById('root');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
