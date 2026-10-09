import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { wordBank } from './scripts/word-bank-plugin';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Cloudflare Pages sets these during its builds; local builds fall back to "local".
const commit = (process.env.CF_PAGES_COMMIT_SHA ?? 'local').slice(0, 7);
const branch = process.env.CF_PAGES_BRANCH ?? 'local';

const BRAND = '#1e1b4b';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_BRANCH__: JSON.stringify(branch),
  },
  plugins: [
    svelte(),
    wordBank(fileURLToPath(new URL('./content/', import.meta.url))),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/lib/pwa.ts so the app can show offline status.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Vocab',
        short_name: 'Vocab',
        description: 'Build a vocabulary you can actually use.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: BRAND,
        theme_color: BRAND,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // A new version takes over as soon as it is downloaded, instead of waiting until
        // every window of the app has been closed (the app then reloads at a quiet moment;
        // see startServiceWorker). vite-plugin-pwa only sets these itself when it injects
        // its own registration, which we don't.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'],
        // The word bank is one JSON file that grows with every content batch.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
