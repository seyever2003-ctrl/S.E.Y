import React from 'react';

/**
 * ErrorBoundary — catches rendering errors and displays them on screen
 * instead of showing a blank white page.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught:', error);
    console.error('[ErrorBoundary] Component stack:', info?.componentStack);
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '40px',
          fontFamily: 'monospace',
          background: '#0d0d0f',
          color: '#e8e8ef',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            maxWidth: '700px',
            width: '100%',
            background: '#1c1d23',
            border: '1px solid #ef4444',
            borderRadius: '10px',
            padding: '32px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          }}>
            <h1 style={{ color: '#ef4444', fontSize: '20px', marginBottom: '12px', fontWeight: 600 }}>
              ⚠ Application Error
            </h1>
            <p style={{ color: '#9899a8', fontSize: '13px', marginBottom: '20px', lineHeight: 1.5 }}>
              Something went wrong while rendering the application.
              Check the browser console (<strong>F12 &gt; Console</strong>) for detailed stack traces.
            </p>

            <div style={{
              background: '#0d0d0f',
              border: '1px solid #2a2b35',
              borderRadius: '6px',
              padding: '16px',
              marginBottom: '16px',
              overflow: 'auto',
              maxHeight: '300px',
            }}>
              <p style={{ color: '#ef4444', fontSize: '12px', fontFamily: 'monospace', marginBottom: '8px', fontWeight: 600 }}>
                {this.state.error.message || String(this.state.error)}
              </p>
              {this.state.error.stack && (
                <pre style={{
                  fontSize: '11px',
                  color: '#6a6b7a',
                  fontFamily: 'monospace',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {this.state.error.stack}
                </pre>
              )}
            </div>

            {this.state.info?.componentStack && (
              <div style={{
                background: '#0d0d0f',
                border: '1px solid #2a2b35',
                borderRadius: '6px',
                padding: '16px',
                overflow: 'auto',
                maxHeight: '200px',
              }}>
                <p style={{ color: '#a855f7', fontSize: '12px', fontFamily: 'monospace', marginBottom: '8px', fontWeight: 600 }}>
                  Component Stack:
                </p>
                <pre style={{
                  fontSize: '11px',
                  color: '#6a6b7a',
                  fontFamily: 'monospace',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}>
                  {this.state.info.componentStack}
                </pre>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '20px',
                padding: '10px 24px',
                background: '#7c3aed',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
