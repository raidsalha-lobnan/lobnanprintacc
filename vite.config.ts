
import fs from 'fs';

const SYNC_DATA_DIR = path.resolve(__dirname, '.sync_data');
if (!fs.existsSync(SYNC_DATA_DIR)) {
  try { fs.mkdirSync(SYNC_DATA_DIR, { recursive: true }); } catch {}
}

const syncCache: Record<string, any[]> = {};
const syncTimestamps: Record<string, number> = {};

function getEntityData(entity: string): any[] {
  if (syncCache[entity]) return syncCache[entity];
  const filePath = path.join(SYNC_DATA_DIR, `${entity}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) {
        syncCache[entity] = data;
        syncTimestamps[entity] = Date.now();
        return data;
      }
    } catch {}
  }
  syncCache[entity] = [];
  syncTimestamps[entity] = Date.now();
  return [];
}

function putEntityData(entity: string, data: any[]) {
  syncCache[entity] = data;
  syncTimestamps[entity] = Date.now();
  const filePath = path.join(SYNC_DATA_DIR, `${entity}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  } catch {}
}

function syncHubPlugin() {
  return {
    name: 'central-sync-hub',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url || '';
        
        if (url.startsWith('/api/sync/state')) {
          const entities = ['invoices', 'parties', 'inventory', 'vouchers', 'printOrders', 'purchases'];
          const result: Record<string, any> = {};
          for (const ent of entities) {
            result[ent] = {
              items: getEntityData(ent),
              version: syncTimestamps[ent] || Date.now()
            };
          }
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, data: result, serverTime: Date.now() }));
        }

        if (url.startsWith('/api/sync/push') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', () => {
            try {
              const { entity, item, items } = JSON.parse(body || '{}');
              if (!entity) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Missing entity' }));
              }

              const current = getEntityData(entity);
              const map = new Map<string, any>();
              for (const it of current) {
                if (it && it.id) map.set(String(it.id), it);
              }

              if (item && item.id) {
                map.set(String(item.id), item);
              }

              if (Array.isArray(items)) {
                for (const it of items) {
                  if (it && it.id) map.set(String(it.id), it);
                }
              }

              const updatedList = Array.from(map.values());
              putEntityData(entity, updatedList);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: true,
                count: updatedList.length,
                version: syncTimestamps[entity]
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function liveSheetProxyPlugin() {
  return {
    name: 'live-sheet-proxy',
    configureServer(server: any) {
      server.middlewares.use('/api/fetch-live-sheet', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('Method Not Allowed');
        }

        let body = '';
        req.on('data', (chunk: any) => { body += chunk; });
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body || '{}');
            const targetUrl = parsed.url;
            if (!targetUrl) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Missing url parameter' }));
            }

            let fetchUrl = targetUrl.trim();
            if (fetchUrl.includes('docs.google.com/spreadsheets')) {
              if (!fetchUrl.includes('export?format=csv') && !fetchUrl.includes('/pub?output=csv')) {
                fetchUrl = fetchUrl.replace(/\/edit.*$/, '/export?format=csv');
              }
            }

            if (fetchUrl.includes('1drv.ms') || fetchUrl.includes('onedrive.live.com')) {
              if (!fetchUrl.includes('download=1')) {
                fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'download=1';
              }
            }

            const fetchRes = await fetch(fetchUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              redirect: 'follow'
            });

            if (!fetchRes.ok) {
              res.statusCode = fetchRes.status;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                error: `Failed to fetch external sheet (${fetchRes.status}): ${fetchRes.statusText}`
              }));
            }

            const arrayBuffer = await fetchRes.arrayBuffer();
            const bufferNode = Buffer.from(arrayBuffer);
            const contentType = fetchRes.headers.get('content-type') || 'application/octet-stream';
            
            // Check if returned data is an HTML page (like OneDrive login redirect)
            const sampleText = bufferNode.subarray(0, 400).toString('utf-8').toLowerCase();
            if (contentType.includes('text/html') || sampleText.includes('<!doctype html') || sampleText.includes('<html') || sampleText.includes('login.live.com')) {
              res.statusCode = 422;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                error: 'الرابط السحابي يتطلب تسجيل دخول مايكروسوفت (تم استلام صفحة HTML بدلاً من ملف الإكسل المباشر). يرجى تنزيل الملف ورفعه عبر زر [رفع ملف Excel] أو نسخ الجدول ولصقه.'
              }));
            }

            const base64 = bufferNode.toString('base64');

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              contentType,
              dataBase64: base64,
              byteLength: arrayBuffer.byteLength
            }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Error fetching sheet' }));
          }
        });
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      liveSheetProxyPlugin(),
      syncHubPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png', 'icon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: '/',
          name: 'برنامج الأيهم المحاسبي',
          short_name: 'Al-Ayham',
          description: 'برنامج الأيهم المحاسبي الشامل لإدارة المطابع ونقاط البيع والحسابات',
          theme_color: '#1e293b',
          background_color: '#1e293b',
          display: 'standalone',
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
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024, // 15MB
        },
        devOptions: {
          enabled: false,
        },
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: false,
    },
  };
});
