/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// https://vite.dev/config/
// `mode === 'https-dev'` (npm run dev:https) → activate self-signed cert
// pour tester sur le réseau local en HTTPS (Web Crypto exige un contexte sécurisé).
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    mode === 'https-dev' && basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/logo-mark.svg'],
      manifest: {
        name: 'DecoShop Livreur',
        short_name: 'DecoLivreur',
        description: 'Application livreur DecoShop Toulouse — gestion des bons de livraison',
        theme_color: '#1E3A8A',
        background_color: '#FAF7F0',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'fr',
        dir: 'ltr',
        icons: [
          {
            src: '/icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Mapbox (~1,8 MB) exclu du précache — chargé à la demande puis caché en runtime.
        // Évite +488 KiB gzip à chaque install/update.
        globIgnores: ['**/mapbox-*.js', '**/mapbox-gl*.css'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Mapbox JS chunk : cache-first (immutable hash) après 1ère visite BL detail
            urlPattern: /\/assets\/mapbox-[^/]+\.(js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapbox-chunk',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Tuiles Mapbox API (style + tiles)
            urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'mapbox-api',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    open: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          query: ['@tanstack/react-query'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          // Mapbox isolé : chunk dédié, lazy-loadé via React.lazy(BLMap),
          // évite les 1,8 MB sur la première page qui n'utilise pas la map.
          mapbox: ['mapbox-gl'],
        },
      },
    },
  },
}));
