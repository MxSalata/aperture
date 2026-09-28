/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

// Aperture - Vite configuration.
//
// Modes:
//   dev            `vite`                     proxies /api/admin to a local IRIS (VITE_IRIS_URL)
//   production     `vite build`               same-origin build for nginx (docker/Dockerfile)
//   iris           `vite build --mode iris`   www/, the build IRIS serves at /aperture/ (IPM, image)
//   demo           `vite build --mode demo`   bundles the in-browser mock (MSW) for GitHub Pages
//
// VITE_BASE lets CI build under a sub-path (GitHub Pages serves /<repo>/).

/**
 * The Content-Security-Policy of the builds no server of ours sends one for: the portal IRIS serves
 * itself (mode iris) and the demo on GitHub Pages (mode demo). nginx sends the same policy as a
 * header (docker/nginx/default.conf.template), with frame-ancestors, which a meta element cannot
 * carry. The tokens live in sessionStorage, so what this keeps out is an injected script: scripts
 * come only from the portal's own files, none inline, and calls go to its own origin only.
 * VITE_CONNECT_SRC adds origins (space-separated), for a proxy of your own that sends CORS headers.
 */
function contentSecurityPolicy(connectSrc: string): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src 'self'${connectSrc.trim() ? ` ${connectSrc.trim()}` : ''}`,
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'aperture-content-security-policy',
    apply: 'build',
    // Right after the charset, before the first script it has to cover.
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `$&\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      ),
  };
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const irisUrl = env.VITE_IRIS_URL || 'http://localhost:52773';
  const base = env.VITE_BASE || '/';
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  };

  return {
    base,
    plugins: [
      react(),
      ...(mode === 'iris' || mode === 'demo' ? [contentSecurityPolicy(env.VITE_CONNECT_SRC ?? '')] : []),
    ],
    // The package's version, for the About page and the demo's log reader.
    define: { __APP_VERSION__: JSON.stringify(version) },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api/monitor': { target: irisUrl, changeOrigin: true, secure: false },
        // Aperture's own log reader (the /api/aperture web application of the IPM package); a
        // 401 there names Basic too, and the browser must never see it.
        '/api/aperture': {
          target: irisUrl,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              delete proxyRes.headers['www-authenticate'];
            });
          },
        },
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
          // The scheme still matters to sign-in (Basic means JWT is off), so it is passed on renamed.
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              const challenge = proxyRes.headers['www-authenticate'];
              if (challenge) proxyRes.headers['x-aperture-www-authenticate'] = challenge;
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
            // react-dom/client is an entry point of its own: without it here, React DOM (200 KB)
            // lands in the app's entry chunk and is downloaded again with every release.
            react: ['react', 'react-dom', 'react-dom/client', 'react-router'],
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
