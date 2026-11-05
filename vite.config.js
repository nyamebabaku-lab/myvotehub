import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Three apps from one codebase (VITE_APP): main → dist/, admin → dist/admin/, demo → dist/demo/.
const APP = process.env.VITE_APP || 'demo';
const META = {
  main: { name: 'MyVoteHub', short: 'MyVoteHub', desc: 'Vote for your favourite nominees, or run your own awards, pageant or reality show', out: 'dist' },
  admin: { name: 'MyVoteHub Admin', short: 'MVH Admin', desc: 'Approve accounts, review events and pay organisers', out: 'dist/admin' },
  demo: { name: 'MyVoteHub — Demo', short: 'MVH Demo', desc: 'Try MyVoteHub with demo events', out: 'dist/demo' },
}[APP];

export default defineConfig({
  base: './',
  define: { 'import.meta.env.VITE_APP': JSON.stringify(APP) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: `myvotehub-${APP}`,
        name: META.name,
        short_name: META.short,
        description: META.desc,
        theme_color: '#1d43d8',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The whole app (every page) is cached on first visit so it opens with no internet.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The main app's folder also holds the admin and demo apps; never cache or answer for them.
        globIgnores: APP === 'main' ? ['admin/**', 'demo/**'] : [],
        navigateFallbackDenylist: APP === 'main' ? [/\/admin\//, /\/demo\//] : [],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        runtimeCaching: [
          // Never cache Supabase API calls.
          { urlPattern: /supabase\.co\//, handler: 'NetworkOnly' },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-files', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: process.env.OUT_DIR || META.out,
    emptyOutDir: APP === 'main' || !!process.env.OUT_DIR,
    chunkSizeWarningLimit: 1500,
  },
});
