// Google Drive Database Sync Engine for Lobnan Press Accounting App
// Replaces Firebase database with Google Drive for 100% cloud database sync online and offline.

import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

export const DATABASE_DRIVE_FOLDER = 'Lobnan_Accounting_Cloud_Database';
export const MASTER_DATABASE_FILENAME = 'Lobnan_Accounting_Master_Database.json';

const STORAGE_KEY_TOKEN = 'lobnan_drive_access_token';
const STORAGE_KEY_TOKEN_EXP = 'lobnan_drive_token_expires_at';

let cachedAccessToken: string | null = null;

export function getCachedSyncToken(): string | null {
  if (cachedAccessToken) return cachedAccessToken;
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  const exp = localStorage.getItem(STORAGE_KEY_TOKEN_EXP);
  if (token && exp && Date.now() < parseInt(exp, 10)) {
    cachedAccessToken = token;
    return token;
  }
  return null;
}

export function saveSyncToken(token: string, expiresInSeconds: number = 3600) {
  cachedAccessToken = token;
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
  localStorage.setItem(STORAGE_KEY_TOKEN_EXP, (Date.now() + expiresInSeconds * 1000).toString());
}

export async function requestGoogleDriveToken(): Promise<string> {
  const existing = getCachedSyncToken();
  if (existing) return existing;

  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      throw new Error('لم يتم الحصول على رمز صلاحية قوقل درايف');
    }

    saveSyncToken(token, 3600);
    return token;
  } catch (error: any) {
    console.error('Failed to request Google Drive access token:', error);
    throw error;
  }
}

export async function getOrCreateCloudDatabaseFolder(token: string): Promise<string> {
  const q = `name='${DATABASE_DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: DATABASE_DRIVE_FOLDER,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'مجلد قاعدة البيانات الموحدة لقوقل درايف - برنامج الأيهم المحاسبي'
    })
  });

  if (!createRes.ok) {
    throw new Error(`فشل إنشاء مجلد قاعدة بيانات قوقل درايف (${createRes.status})`);
  }

  const folderData = await createRes.json();
  return folderData.id;
}

export async function findMasterDatabaseFile(token: string, folderId: string): Promise<{ id: string; name: string } | null> {
  const q = `'${folderId}' in parents and name='${MASTER_DATABASE_FILENAME}' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=modifiedTime desc`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0];
    }
  }
  return null;
}

export async function fetchMasterDatabaseFromDrive(token: string): Promise<any | null> {
  try {
    const folderId = await getOrCreateCloudDatabaseFolder(token);
    const file = await findMasterDatabaseFile(token, folderId);
    if (!file) return null;

    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!fileRes.ok) {
      if (fileRes.status === 401) {
        cachedAccessToken = null;
        localStorage.removeItem(STORAGE_KEY_TOKEN);
      }
      return null;
    }

    const json = await fileRes.json();
    return json;
  } catch (err) {
    console.error('Error fetching master database from Google Drive:', err);
    return null;
  }
}

export async function saveMasterDatabaseToDrive(token: string, payload: any): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    const folderId = await getOrCreateCloudDatabaseFolder(token);
    const existingFile = await findMasterDatabaseFile(token, folderId);

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const arrayBuffer = await blob.arrayBuffer();

    if (existingFile) {
      // Overwrite existing database file via PATCH multipart upload
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
      const updateRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: blob
      });

      if (!updateRes.ok) {
        if (updateRes.status === 401) {
          cachedAccessToken = null;
          localStorage.removeItem(STORAGE_KEY_TOKEN);
        }
        throw new Error(`فشل تحديث قاعدة البيانات في قوقل درايف (${updateRes.status})`);
      }

      return { success: true, fileId: existingFile.id };
    } else {
      // Create new database file
      const metadata = {
        name: MASTER_DATABASE_FILENAME,
        description: 'قاعدة البيانات المركزية الموحدة لبرنامج الأيهم المحاسبي',
        parents: [folderId]
      };

      const boundary = '-------LobnanDbSyncBoundary' + Date.now();
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
      const mediaHeaderPart = `${delimiter}Content-Type: application/json\r\n\r\n`;

      const metaEncoder = new TextEncoder();
      const metaBytes = metaEncoder.encode(metadataPart);
      const mediaHeaderBytes = metaEncoder.encode(mediaHeaderPart);
      const closeBytes = metaEncoder.encode(closeDelimiter);

      const fullBody = new Uint8Array(metaBytes.length + mediaHeaderBytes.length + arrayBuffer.byteLength + closeBytes.length);
      fullBody.set(metaBytes, 0);
      fullBody.set(mediaHeaderBytes, metaBytes.length);
      fullBody.set(new Uint8Array(arrayBuffer), metaBytes.length + mediaHeaderBytes.length);
      fullBody.set(closeBytes, metaBytes.length + mediaHeaderBytes.length + arrayBuffer.byteLength);

      const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name';
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: fullBody
      });

      if (!uploadRes.ok) {
        if (uploadRes.status === 401) {
          cachedAccessToken = null;
          localStorage.removeItem(STORAGE_KEY_TOKEN);
        }
        throw new Error(`فشل إنشاء ملف قاعدة البيانات في قوقل درايف (${uploadRes.status})`);
      }

      const data = await uploadRes.json();
      return { success: true, fileId: data.id };
    }
  } catch (err: any) {
    console.error('Error saving master database to Drive:', err);
    return { success: false, error: err?.message || 'خطأ في حفظ قاعدة البيانات' };
  }
}

// Merge entity lists by ID without duplicates
export function mergeEntityLists<T extends { id: string | number }>(localList: T[] = [], remoteList: T[] = []): T[] {
  const map = new Map<string | number, T>();
  
  // 1. Add remote items
  for (const item of remoteList) {
    if (item && item.id !== undefined && item.id !== null) {
      map.set(item.id, item);
    }
  }
  
  // 2. Add local items (overwriting or complementing remote)
  for (const item of localList) {
    if (item && item.id !== undefined && item.id !== null) {
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
      } else {
        // Merge fields, local priority if same timestamp
        map.set(item.id, { ...existing, ...item });
      }
    }
  }
  
  return Array.from(map.values());
}
