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
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net https://huggingface.co; " +
        "worker-src 'self' blob: https://cdn.jsdelivr.net https://huggingface.co; " +
        "style-src 'self' 'unsafe-inline'; " +
        "connect-src 'self' blob: data: " +
          "https://cdn.jsdelivr.net https://huggingface.co " +
          "https://api.openai.com https://generativelanguage.googleapis.com " +
          "https://texttospeech.googleapis.com https://storage.googleapis.com " +
          "https://www.googleapis.com wss://*; " +
        "img-src 'self' blob: data: https://huggingface.co; " +
        "media-src 'self' blob:; " +
        "font-src 'self' data:;",
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
          ffmpeg: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
        },
      },
    },
  },

  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
