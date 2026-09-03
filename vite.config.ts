import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { handleApiRequest } from './server/apiHandler.js';

// Custom Vite plugin for live API server middleware
const apiPlugin = () => ({
  name: 'sharefridge-api-middleware',
  configureServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      try {
        const handled = await handleApiRequest(req, res);
        if (!handled) {
          next();
        }
      } catch (err) {
        console.error('API Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
  },
  configurePreviewServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      try {
        const handled = await handleApiRequest(req, res);
        if (!handled) {
          next();
        }
      } catch (err) {
        console.error('API Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
  }
});

export default defineConfig({
  plugins: [
    react(),
    apiPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      workbox: {
        // Adds the C024 push/notificationclick handlers to the active generated
        // service worker; generateSW alone never runs custom listener code.
        importScripts: ['sw-push.js']
      },
      manifest: {
        name: 'ShareFridge — Tủ Lạnh Phòng Trọ',
        short_name: 'ShareFridge',
        description: 'Quản lý kho thực phẩm dùng chung cho phòng trọ với AI gợi ý món ăn và cảnh báo hạn dùng.',
        theme_color: '#10b981',
        background_color: '#090d16',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true
  }
});
