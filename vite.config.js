import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  /* ── Dev server (ignored during production build) ───────────────────── */
  server: {
    port: 3000,
    allowedHosts: true,
    open: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
        'Content-Security-Policy':
          "default-src 'self';" +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data: https://huggingface.co https://unpkg.com https://cdn.jsdelivr.net; " +
          "worker-src 'self' blob: data: https://huggingface.co https://unpkg.com https://cdn.jsdelivr.net; " +
          "style-src 'self' 'unsafe-inline'; " +
          "connect-src 'self' blob: data: " +
            "https://huggingface.co https://unpkg.com https://cdn.jsdelivr.net " +
            "https://api.openai.com https://generativelanguage.googleapis.com " +
            "https://texttospeech.googleapis.com https://storage.googleapis.com " +
            "https://www.googleapis.com https://api.deepseek.com wss://*; " +
          "img-src 'self' blob: data: https://huggingface.co; " +
          "media-src 'self' blob: data:; " +
          "font-src 'self' data:; " +
          "child-src 'self' blob: data:;",
    },
    proxy: {
      '/api/tts': {
        target: process.env.VITE_TTS_API_BASE || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  /* ── Production build optimizations ─────────────────────────────────── */
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },

  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
