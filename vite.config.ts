import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

function disableHmrWsClientPlugin(): Plugin {
  return {
    name: 'disable-hmr-ws-client',
    apply: 'serve',
    enforce: 'post',
    transform(code, id) {
      const normalizedId = id.replace(/\\/g, '/');
      if (!normalizedId.includes('vite/dist/client/client.mjs')) {
        return null;
      }
      const startMarker = 'const transport = normalizeModuleRunnerTransport(';
      const endMarker = 'let willUnload = false;';
      const startIdx = code.indexOf(startMarker);
      const endIdx = code.indexOf(endMarker, startIdx);
      if (startIdx !== -1 && endIdx !== -1) {
        const replacement =
          'const transport = normalizeModuleRunnerTransport({\n  async connect() {},\n  async disconnect() {},\n  send() {},\n});\n';
        return {
          code: code.slice(0, startIdx) + replacement + code.slice(endIdx),
          map: null,
        };
      }
      return null;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    disableHmrWsClientPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'jarvis-icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        id: '/',
        name: 'MARK LVI (56) - Autonomous Voice AI Assistant',
        short_name: 'JARVIS LVI',
        description: 'Cross-platform personal voice AI with holographic HUD avatar, real-time speech and thinking engine, memory matrix, system telemetry, and multi-mode actions.',
        theme_color: '#00060a',
        background_color: '#00060a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    hmr: false,
    ws: false,
  },
});
