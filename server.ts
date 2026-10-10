import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Proxy endpoint for live sheet fetching (OneDrive / Google Sheets / Live Excel)
app.post('/api/fetch-live-sheet', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    let fetchUrl = url.trim();

    // Google Sheets export direct link conversion
    if (fetchUrl.includes('docs.google.com/spreadsheets')) {
      if (!fetchUrl.includes('export?format=csv') && !fetchUrl.includes('/pub?output=csv')) {
        fetchUrl = fetchUrl.replace(/\/edit.*$/, '/export?format=csv');
      }
    }

    // Microsoft OneDrive link conversion
    if (fetchUrl.includes('1drv.ms') || fetchUrl.includes('onedrive.live.com')) {
      if (!fetchUrl.includes('download=1')) {
        fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'download=1';
      }
    }

    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return res.json({
        success: false,
        message: `تعذر الوصول المباشر للملف (رمز الاستجابة: ${response.status}). يمكنك فتح الرابط وتنزيل الملف ثم رفعه مباشرة عبر زر [رفع ملف Excel].`
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const bufferNode = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // Check if returned data is an HTML page (like OneDrive login redirect)
    const sampleText = bufferNode.subarray(0, 400).toString('utf-8').toLowerCase();
    if (contentType.includes('text/html') || sampleText.includes('<!doctype html') || sampleText.includes('<html') || sampleText.includes('login.live.com')) {
      return res.json({
        success: false,
        isProtectedOneDrive: true,
        message: 'رابط OneDrive هذا محمي بحساب مايكروسوفت الشخصي. يمكنك فتح الرابط بضغطة زر وتنزيل الملف، ثم رفعه مباشرة عبر زر [رفع ملف Excel] أو نسخه ولصقه.'
      });
    }

    const base64 = bufferNode.toString('base64');

    res.json({
      success: true,
      contentType,
      dataBase64: base64,
      byteLength: arrayBuffer.byteLength
    });
  } catch (err: any) {
    res.json({
      success: false,
      message: 'تعذر الاتصال بالرابط السحابي حالياً. يرجى استخدام زر [رفع ملف Excel] أو لصق محتوى الجدول مباشرة.'
    });
  }
});

// Use process.env.PORT assigned by Cloud Run (e.g. 8080) or default to 3000
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Health check endpoint for deployment probes
app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});


// ==========================================
// Central Real-Time Synchronization Hub
// Works across all devices, browsers, and networks instantly
// ==========================================
const SYNC_DATA_DIR = path.join(__dirname, '.sync_data');
if (!fs.existsSync(SYNC_DATA_DIR)) {
  try { fs.mkdirSync(SYNC_DATA_DIR, { recursive: true }); } catch {}
}

const syncCache: Record<string, any[]> = {};
const syncTimestamps: Record<string, number> = {};

function loadEntityData(entity: string): any[] {
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

function saveEntityData(entity: string, data: any[]) {
  syncCache[entity] = data;
  syncTimestamps[entity] = Date.now();
  const filePath = path.join(SYNC_DATA_DIR, `${entity}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.error(`Failed to save sync entity ${entity}:`, err);
  }
}

app.get('/api/sync/state', (req, res) => {
  const entities = ['invoices', 'parties', 'inventory', 'vouchers', 'printOrders', 'purchases'];
  const result: Record<string, any> = {};
  for (const ent of entities) {
    result[ent] = {
      items: loadEntityData(ent),
      version: syncTimestamps[ent] || Date.now()
    };
  }
  res.json({ success: true, data: result, serverTime: Date.now() });
});

app.post('/api/sync/push', (req, res) => {
  try {
    const { entity, item, items, op } = req.body;
    if (!entity || typeof entity !== 'string') {
      return res.status(400).json({ error: 'Missing entity' });
    }

    const current = loadEntityData(entity);
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
    saveEntityData(entity, updatedList);

    res.json({
      success: true,
      count: updatedList.length,
      version: syncTimestamps[entity],
      items: updatedList
    });
  } catch (err: any) {
    console.error('Sync push error:', err);
    res.status(500).json({ error: err.message });
  }
});

const distPath = path.join(__dirname, 'dist');

// Serve static assets from dist
app.use(express.static(distPath, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// SPA fallback for all client routes
app.get('*', (_req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>برنامج الأيهم</title></head><body>جاري تحميل التطبيق...</body></html>');
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Application server running on http://0.0.0.0:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
