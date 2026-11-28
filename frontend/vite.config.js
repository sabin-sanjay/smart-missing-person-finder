// vite.config.js
// Settings for Vite, the tool that runs our app while we build it
// and packs it into small files when we publish it.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // lets Vite understand React code
import tailwindcss from '@tailwindcss/vite' // turns Tailwind class names into CSS
import { VitePWA } from 'vite-plugin-pwa' // makes the site installable like an app
import basicSsl from '@vitejs/plugin-basic-ssl' // https:// for testing on a phone

// "mode" is "https" when started with:  npm run dev:phone
// Phones only allow GPS on https:// sites, so that command adds a
// home-made security certificate. (The phone will warn that it's
// "not private"; that's expected for testing.)
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    mode === 'https' && basicSsl(),

    VitePWA({
      // When we publish a new version, phones update to it automatically.
      registerType: 'autoUpdate',
      // We start the updater ourselves in src/lib/appUpdate.js (so it can
      // also check for a new version every time the app is opened).
      injectRegister: false,

      // Extra files from the "public" folder to keep available offline.
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],

      // The "manifest" tells Android how to show the app once installed:
      // its name, icon, colour, and that it opens full-screen like a real app.
      manifest: {
        name: 'Lumen: Missing Person Finder',
        short_name: 'Lumen',
        description: 'Help find missing people near you with alerts, sightings and a live map.',
        theme_color: '#0b0a0b',
        background_color: '#0b0a0b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }, // artwork shrunk so Android's circle crop never cuts it
        ],
      },

      // Workbox is the part that saves files on the phone so the app
      // still opens when the internet is slow or gone.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        globIgnores: [
          // The push worker is separate and must always be fetched fresh
          '**/firebase-messaging-sw.js',
          // The big 512px app icon (~100 KB) is only needed when installing the app,
          // and the phone fetches it itself then. No need to pre-download it.
          '**/pwa-512x512.png',
          '**/pwa-maskable-512x512.png',
          // Big extras only police use (PDF maker and its helpers, about 600 KB).
          // Not downloaded in advance; fetched the first time someone makes a PDF.
          '**/jspdf*.js',
          '**/html2canvas*.js',
          '**/purify*.js',
          '**/index.es-*.js',
        ],

        // Save map tiles and case photos on the phone after the first view,
        // so the map opens faster next time and works better on weak signal.
        runtimeCaching: [
          {
            // App code files that weren't saved in advance (like the PDF maker):
            // save them the first time they're used. Their names change with
            // every new version, so a saved copy is never out of date.
            urlPattern: /\/assets\/.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-extras',
              expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            // The Outfit font: saved after the first visit, so text looks right offline too
            urlPattern: /\/assets\/.*\.woff2$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 6, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 }, // keep 7 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/storage\/v1\/object\/public\/case-photos\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'case-photos',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }, // keep 30 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
}))
