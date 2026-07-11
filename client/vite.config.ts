import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Project pages live under /<repo-name>/ — the workflow sets VITE_BASE.
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    // PWA only in the static (GitHub Pages) build; the local dev app stays
    // plain so the service worker never caches /api responses or fights HMR.
    ...(process.env.VITE_STATIC === '1'
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            manifest: {
              name: 'SG Baking Price Tracker',
              short_name: 'BakePrice SG',
              description: 'Baking ingredient prices across Singapore shops',
              theme_color: '#b45309',
              background_color: '#fffbeb',
              display: 'standalone',
              // Relative so the manifest works under the /<repo>/ subpath.
              start_url: '.',
              scope: '.',
              icons: [
                { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
              // Exported price data changes daily and is runtime-cached
              // below; precaching it would churn the SW on every deploy.
              globIgnores: ['data/**'],
              // HashRouter — only '/' is ever navigated, and index.html is precached.
              navigateFallback: null,
              runtimeCaching: [
                {
                  urlPattern: ({ url }) => url.pathname.includes('/data/'),
                  handler: 'StaleWhileRevalidate',
                  options: {
                    cacheName: 'price-data',
                    expiration: { maxEntries: 300, maxAgeSeconds: 14 * 86400 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ],
            },
          }),
        ]
      : []),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
