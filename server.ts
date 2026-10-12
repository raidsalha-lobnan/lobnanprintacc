import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (_req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

const ALL_SYNC_ENTITIES = [
  'invoices', 'parties', 'inventory', 'vouchers', 'printOrders',
  'purchases', 'purchaseReturns', 'salesReturns', 'accounts', 'treasuries',
  'employees', 'employeeAdvances', 'employeeDeductions', 'employeeIncentives',
  'payrollSheets', 'stockMovements', 'companies', 'branches',
  'warehouses', 'warehouseOperations', 'roles', 'users', 'debtClearings',
  'expenses', 'journalEntries', 'settings', 'dailyEntrySheets'
];

const syncCache: Record<string, any[]> = {};
const syncTimestamps: Record<string, number> = {};

function loadEntityData(entity: string): any[] {
  if (syncCache[entity]) return syncCache[entity];
  const filePath = path.join(SYNC_DATA_DIR, `${entity}.json`);
  let existingData: any[] = [];
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) existingData = data;
    } catch {}
  }

  // Fallback / merge seed from public/master_drive_database_snapshot.json
  const snapshotPath = path.join(__dirname, 'public', 'master_drive_database_snapshot.json');
  if (fs.existsSync(snapshotPath)) {
    try {
      const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      if (snap && Array.isArray(snap[entity]) && snap[entity].length > 0) {
        if (existingData.length === 0) {
          existingData = snap[entity];
          try { fs.writeFileSync(filePath, JSON.stringify(existingData), 'utf8'); } catch {}
        } else {
          // Merge snapshot items if any are missing in existingData
          const itemMap = new Map<string, any>();
          for (const it of snap[entity]) {
            if (it && it.id) itemMap.set(String(it.id), it);
          }
          for (const it of existingData) {
            if (it && it.id) {
              const existing = itemMap.get(String(it.id));
              itemMap.set(String(it.id), existing ? { ...existing, ...it } : it);
            }
          }
          existingData = Array.from(itemMap.values());
        }
      }
    } catch {}
  }

  syncCache[entity] = existingData;
  syncTimestamps[entity] = Date.now();
  return existingData;
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

app.get('/api/app-version', (_req, res) => {
  res.json({ version: '1791656836620', time: Date.now() });
});

// Summary status of all synced entities on the server
app.get('/api/sync/status', (_req, res) => {
  const summary: Record<string, { count: number; lastModified: number }> = {};
  for (const ent of ALL_SYNC_ENTITIES) {
    const items = loadEntityData(ent);
    summary[ent] = {
      count: items.length,
      lastModified: syncTimestamps[ent] || Date.now()
    };
  }
  res.json({
    success: true,
    serverTime: Date.now(),
    serverTimeString: new Date().toLocaleTimeString('ar-EG'),
    entities: summary
  });
});

// Full state retrieval across all or requested entities
app.get('/api/sync/state', (req, res) => {
  const requestedEntities = req.query.entities
    ? String(req.query.entities).split(',')
    : ALL_SYNC_ENTITIES;

  const result: Record<string, any> = {};
  for (const ent of requestedEntities) {
    const safeEnt = ent.trim();
    if (!safeEnt) continue;
    result[safeEnt] = {
      items: loadEntityData(safeEnt),
      version: syncTimestamps[safeEnt] || Date.now()
    };
  }
  res.json({ success: true, data: result, serverTime: Date.now() });
});

// Push single item, batch of items, or deletion
app.post('/api/sync/push', (req, res) => {
  try {
    const { entity, item, items, op, deletedIds } = req.body;
    if (!entity || typeof entity !== 'string') {
      return res.status(400).json({ error: 'Missing entity' });
    }

    const current = loadEntityData(entity);
    const map = new Map<string, any>();
    for (const it of current) {
      if (it && it.id) map.set(String(it.id), it);
    }

    // Process explicit deleted IDs
    if (Array.isArray(deletedIds)) {
      for (const dId of deletedIds) {
        if (dId) map.delete(String(dId));
      }
    }

    // Process single item
    if (item && item.id) {
      if (item._deleted || op === 'delete') {
        map.delete(String(item.id));
      } else {
        map.set(String(item.id), item);
      }
    }

    // Process array of items
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it && it.id) {
          if (it._deleted) {
            map.delete(String(it.id));
          } else {
            map.set(String(it.id), it);
          }
        }
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

// Master bidirectional full-sync endpoint: synchronizes all local data with server in one atomic call
app.post('/api/sync/full-sync', (req, res) => {
  try {
    const { entities, deletedDocs } = req.body;
    if (!entities || typeof entities !== 'object') {
      return res.status(400).json({ error: 'Missing entities map' });
    }

    const delSet = new Set<string>();
    if (Array.isArray(deletedDocs)) {
      deletedDocs.forEach((d: any) => {
        if (d && d.col && d.id) delSet.add(`${d.col}_${d.id}`);
      });
    }

    const resultMap: Record<string, { items: any[]; count: number; version: number }> = {};
    const countsSummary: Record<string, number> = {};

    for (const [entityName, incomingItems] of Object.entries(entities)) {
      if (!Array.isArray(incomingItems)) continue;

      const serverItems = loadEntityData(entityName);
      const mergedMap = new Map<string, any>();

      // 1. Load server items (excluding deleted)
      for (const sIt of serverItems) {
        if (sIt && sIt.id && !delSet.has(`${entityName}_${sIt.id}`) && !sIt._deleted) {
          mergedMap.set(String(sIt.id), sIt);
        }
      }

      // 2. Merge incoming client items
      for (const cIt of incomingItems) {
        if (!cIt || !cIt.id) continue;
        const key = String(cIt.id);
        if (delSet.has(`${entityName}_${key}`) || cIt._deleted) {
          mergedMap.delete(key);
          continue;
        }

        if (!mergedMap.has(key)) {
          mergedMap.set(key, cIt);
        } else {
          // Both have it: merge fields (client updates win)
          const existing = mergedMap.get(key);
          mergedMap.set(key, { ...existing, ...cIt });
        }
      }

      const mergedList = Array.from(mergedMap.values());
      saveEntityData(entityName, mergedList);

      resultMap[entityName] = {
        items: mergedList,
        count: mergedList.length,
        version: syncTimestamps[entityName] || Date.now()
      };
      countsSummary[entityName] = mergedList.length;
    }

    res.json({
      success: true,
      serverTime: Date.now(),
      serverTimeString: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      data: resultMap,
      counts: countsSummary
    });
  } catch (err: any) {
    console.error('Master full-sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

const distPath = path.join(__dirname, 'dist');

// Serve static assets from dist
app.use(express.static(distPath, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    // Strict no-cache headers for instant app updates across all browsers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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
