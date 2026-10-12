// Google Drive Database Sync Engine for Lobnan Press Accounting App
// Exclusively syncs the database with the user's Google Drive (Firebase completely disconnected).

export const DATABASE_DRIVE_FOLDER = 'Lobnan_Accounting_Cloud_Database';
export const MASTER_DATABASE_FILENAME = 'The Start Data';

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

export async function requestGoogleDriveToken(promptUser: boolean = false): Promise<string | null> {
  const existing = getCachedSyncToken();
  if (existing) return existing;

  if (!promptUser) {
    return null;
  }

  try {
    const clientId = '209948056563-6phejmgml54cu8rqoebpqd4a0nglosii.apps.googleusercontent.com';
    const redirectUri = window.location.origin;
    const scope = 'https://www.googleapis.com/auth/drive.file';
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scope)}&prompt=select_account`;

    return new Promise((resolve) => {
      const width = 500;
      const height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const popup = window.open(authUrl, 'GoogleDriveOAuth', `width=${width},height=${height},top=${top},left=${left}`);
      
      if (!popup) {
        resolve(null);
        return;
      }

      const interval = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(interval);
            resolve(getCachedSyncToken());
            return;
          }
          const hash = popup.location.hash;
          if (hash && hash.includes('access_token=')) {
            const params = new URLSearchParams(hash.substring(1));
            const token = params.get('access_token');
            const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
            if (token) {
              saveSyncToken(token, expiresIn);
              popup.close();
              clearInterval(interval);
              resolve(token);
            }
          }
        } catch (e) {}
      }, 500);
    });
  } catch (error: any) {
    console.warn('Failed to request Google Drive access token:', error?.message || error);
    return null;
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
  const q = `'${folderId}' in parents and (name='The Start Data' or name='The Start Data.json' or name='Lobnan_Accounting_Master_Database.json') and trashed=false`;
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
        throw new Error(`فشل رفع قاعدة البيانات إلى قوقل درايف (${uploadRes.status})`);
      }

      const resJson = await uploadRes.json();
      return { success: true, fileId: resJson.id };
    }
  } catch (error: any) {
    console.error('Error saving master database to Google Drive:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

export function mergeEntityLists(localList: any[], remoteList: any[]): any[] {
  const map = new Map<string, any>();
  if (Array.isArray(localList)) {
    for (const item of localList) {
      if (item && item.id) {
        map.set(String(item.id), item);
      }
    }
  }
  if (Array.isArray(remoteList)) {
    for (const item of remoteList) {
      if (item && item.id) {
        const key = String(item.id);
        const existing = map.get(key);
        if (!existing) {
          map.set(key, item);
        } else {
          const tExist = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
          const tRemote = new Date(item.updatedAt || item.createdAt || 0).getTime();
          if (tRemote >= tExist) {
            map.set(key, item);
          }
        }
      }
    }
  }
  return Array.from(map.values());
}
