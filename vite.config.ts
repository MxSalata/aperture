/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Aperture - Vite configuration.
//
// Modes:
//   dev            `vite`                     proxies /api/admin to a local IRIS (VITE_IRIS_URL)
//   production     `vite build`               same-origin build for nginx / IPM deployment
//   demo           `vite build --mode demo`   bundles the in-browser mock (MSW) for GitHub Pages
//
// VITE_BASE lets CI build under a sub-path (GitHub Pages serves /<repo>/).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const irisUrl = env.VITE_IRIS_URL || 'http://localhost:52773';
  const base = env.VITE_BASE || '/';

  return {
    base,
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api/monitor': { target: irisUrl, changeOrigin: true, secure: false },
        // REST management API (REST services screen); a 401 there names Basic, like /api/admin's.
        '/api/mgmnt': {
          target: irisUrl,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              delete proxyRes.headers['www-authenticate'];
            });
          },
        },
        // Avoids CORS during development: the browser talks to Vite, Vite talks to IRIS.
        '/api/admin': {
          target: irisUrl,
          changeOrigin: true,
          secure: false,
          // A 401 with WWW-Authenticate: Basic would make the browser show its own login dialog.
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              delete proxyRes.headers['www-authenticate'];
            });
          },
        },
      },
    },
    build: {
      // Source maps only on request (VITE_SOURCEMAP=1); committed www/ and the demo stay small.
      sourcemap: env.VITE_SOURCEMAP === '1',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router'],
            mantine: [
              '@mantine/core',
              '@mantine/hooks',
              '@mantine/notifications',
              '@mantine/modals',
              '@mantine/spotlight',
            ],
            charts: ['recharts', '@mantine/charts'],
            query: ['@tanstack/react-query', '@tanstack/react-table'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
