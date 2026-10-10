// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
app.use(express.json());
app.post("/api/fetch-live-sheet", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing url parameter" });
    }
    let fetchUrl = url.trim();
    if (fetchUrl.includes("docs.google.com/spreadsheets")) {
      if (!fetchUrl.includes("export?format=csv") && !fetchUrl.includes("/pub?output=csv")) {
        fetchUrl = fetchUrl.replace(/\/edit.*$/, "/export?format=csv");
      }
    }
    if (fetchUrl.includes("1drv.ms") || fetchUrl.includes("onedrive.live.com")) {
      if (!fetchUrl.includes("download=1")) {
        fetchUrl += (fetchUrl.includes("?") ? "&" : "?") + "download=1";
      }
    }
    const response = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      redirect: "follow"
    });
    if (!response.ok) {
      return res.json({
        success: false,
        message: `\u062A\u0639\u0630\u0631 \u0627\u0644\u0648\u0635\u0648\u0644 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0644\u0644\u0645\u0644\u0641 (\u0631\u0645\u0632 \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629: ${response.status}). \u064A\u0645\u0643\u0646\u0643 \u0641\u062A\u062D \u0627\u0644\u0631\u0627\u0628\u0637 \u0648\u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u0645\u0644\u0641 \u062B\u0645 \u0631\u0641\u0639\u0647 \u0645\u0628\u0627\u0634\u0631\u0629 \u0639\u0628\u0631 \u0632\u0631 [\u0631\u0641\u0639 \u0645\u0644\u0641 Excel].`
      });
    }
    const arrayBuffer = await response.arrayBuffer();
    const bufferNode = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const sampleText = bufferNode.subarray(0, 400).toString("utf-8").toLowerCase();
    if (contentType.includes("text/html") || sampleText.includes("<!doctype html") || sampleText.includes("<html") || sampleText.includes("login.live.com")) {
      return res.json({
        success: false,
        isProtectedOneDrive: true,
        message: "\u0631\u0627\u0628\u0637 OneDrive \u0647\u0630\u0627 \u0645\u062D\u0645\u064A \u0628\u062D\u0633\u0627\u0628 \u0645\u0627\u064A\u0643\u0631\u0648\u0633\u0648\u0641\u062A \u0627\u0644\u0634\u062E\u0635\u064A. \u064A\u0645\u0643\u0646\u0643 \u0641\u062A\u062D \u0627\u0644\u0631\u0627\u0628\u0637 \u0628\u0636\u063A\u0637\u0629 \u0632\u0631 \u0648\u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u0645\u0644\u0641\u060C \u062B\u0645 \u0631\u0641\u0639\u0647 \u0645\u0628\u0627\u0634\u0631\u0629 \u0639\u0628\u0631 \u0632\u0631 [\u0631\u0641\u0639 \u0645\u0644\u0641 Excel] \u0623\u0648 \u0646\u0633\u062E\u0647 \u0648\u0644\u0635\u0642\u0647."
      });
    }
    const base64 = bufferNode.toString("base64");
    res.json({
      success: true,
      contentType,
      dataBase64: base64,
      byteLength: arrayBuffer.byteLength
    });
  } catch (err) {
    res.json({
      success: false,
      message: "\u062A\u0639\u0630\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0633\u062D\u0627\u0628\u064A \u062D\u0627\u0644\u064A\u0627\u064B. \u064A\u0631\u062C\u0649 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0632\u0631 [\u0631\u0641\u0639 \u0645\u0644\u0641 Excel] \u0623\u0648 \u0644\u0635\u0642 \u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u062C\u062F\u0648\u0644 \u0645\u0628\u0627\u0634\u0631\u0629."
    });
  }
});
var PORT = process.env.PORT ? Number(process.env.PORT) : 3e3;
app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});
var SYNC_DATA_DIR = path.join(__dirname, ".sync_data");
if (!fs.existsSync(SYNC_DATA_DIR)) {
  try {
    fs.mkdirSync(SYNC_DATA_DIR, { recursive: true });
  } catch {
  }
}
var syncCache = {};
var syncTimestamps = {};
function loadEntityData(entity) {
  if (syncCache[entity]) return syncCache[entity];
  const filePath = path.join(SYNC_DATA_DIR, `${entity}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (Array.isArray(data)) {
        syncCache[entity] = data;
        syncTimestamps[entity] = Date.now();
        return data;
      }
    } catch {
    }
  }
  syncCache[entity] = [];
  syncTimestamps[entity] = Date.now();
  return [];
}
function saveEntityData(entity, data) {
  syncCache[entity] = data;
  syncTimestamps[entity] = Date.now();
  const filePath = path.join(SYNC_DATA_DIR, `${entity}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data), "utf8");
  } catch (err) {
    console.error(`Failed to save sync entity ${entity}:`, err);
  }
}
app.get("/api/sync/state", (req, res) => {
  const entities = ["invoices", "parties", "inventory", "vouchers", "printOrders", "purchases"];
  const result = {};
  for (const ent of entities) {
    result[ent] = {
      items: loadEntityData(ent),
      version: syncTimestamps[ent] || Date.now()
    };
  }
  res.json({ success: true, data: result, serverTime: Date.now() });
});
app.post("/api/sync/push", (req, res) => {
  try {
    const { entity, item, items, op } = req.body;
    if (!entity || typeof entity !== "string") {
      return res.status(400).json({ error: "Missing entity" });
    }
    const current = loadEntityData(entity);
    const map = /* @__PURE__ */ new Map();
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
  } catch (err) {
    console.error("Sync push error:", err);
    res.status(500).json({ error: err.message });
  }
});
var distPath = path.join(__dirname, "dist");
app.use(express.static(distPath, {
  maxAge: "1d",
  setHeaders: (res, filePath) => {
    if (filePath.endsWith("index.html") || filePath.endsWith("sw.js")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  }
}));
app.get("*", (_req, res) => {
  const indexPath = path.join(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>\u0628\u0631\u0646\u0627\u0645\u062C \u0627\u0644\u0623\u064A\u0647\u0645</title></head><body>\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642...</body></html>');
  }
});
var server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Application server running on http://0.0.0.0:${PORT}`);
});
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
  });
});
