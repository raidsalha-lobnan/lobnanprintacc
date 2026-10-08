// Google Drive Automated Backup Service for Lobnan Press & Library
// Supports hourly automatic backups and 7-day retention policy (deleting day 8 and older)

import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';

export const BACKUP_DRIVE_FOLDER_NAME = 'Lobnan_Accounting_Hourly_Backups';
export const BACKUP_DRIVE_FOLDER_DESC = 'مجلد النسخ الاحتياطية التلقائية كل ساعة - برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان';

export interface DriveBackupFileItem {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  isOlderThan7Days: boolean;
  ageInDays: number;
  formattedDate: string;
}

export interface BackupExecutionResult {
  success: boolean;
  timestamp: string;
  fileName: string;
  fileId?: string;
  fileSize?: number;
  driveLink?: string;
  deletedOldBackupsCount: number;
  deletedOldFiles: Array<{ id: string; name: string; createdTime: string }>;
  totalBackupsInDrive: number;
  error?: string;
}

// In-memory token cache (MANDATORY per Workspace skill guidelines: no localStorage for raw tokens)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Check if token is available
export function getCachedDriveToken(): string | null {
  return cachedAccessToken;
}

export function setCachedDriveToken(token: string | null): void {
  cachedAccessToken = token;
}

// Initialize Auth Listener to clear cached token on sign-out
export function initDriveAuthListener(
  onSuccess?: (user: User, token: string) => void,
  onSignedOut?: () => void
) {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onSuccess) onSuccess(user, cachedAccessToken);
      }
    } else {
      cachedAccessToken = null;
      if (onSignedOut) onSignedOut();
    }
  });
}

// Connect to Google Drive with drive.file scope via popup
export async function connectGoogleDrive(): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      throw new Error('لم يتم استلام رمز صلاحية الوصول إلى Google Drive من جوجل.');
    }

    cachedAccessToken = token;
    return { user: result.user, accessToken: token };
  } catch (err: any) {
    console.error('Google Drive sign-in error:', err);
    throw err;
  } finally {
    isSigningIn = false;
  }
}

// Disconnect / Clear memory token
export async function disconnectGoogleDrive(): Promise<void> {
  cachedAccessToken = null;
}

// Find or Create the dedicated Backup Folder in Google Drive
export async function getOrCreateBackupFolder(accessToken: string): Promise<string> {
  try {
    // 1. Search existing folder
    const q = `name='${BACKUP_DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }

    // 2. Create folder if not found
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: BACKUP_DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        description: BACKUP_DRIVE_FOLDER_DESC
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`فشل إنشاء مجلد النسخ الاحتياطية في Google Drive (${createRes.status}): ${errText}`);
    }

    const folderData = await createRes.json();
    return folderData.id;
  } catch (err) {
    console.error('Error finding/creating backup folder in Drive:', err);
    throw err;
  }
}

// Upload Backup JSON directly to Google Drive via multipart/related
export async function uploadBackupJsonToDrive(
  accessToken: string,
  backupPayload: any,
  customFileName?: string
): Promise<{ id: string; name: string; size: number; webViewLink?: string; webContentLink?: string }> {
  const folderId = await getOrCreateBackupFolder(accessToken);

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1].replace(/[:.]/g, '-').slice(0, 8);
  const fileName = customFileName || `Lobnan_Backup_${dateStr}_${timeStr}.json`;

  const jsonString = typeof backupPayload === 'string' ? backupPayload : JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const arrayBuffer = await blob.arrayBuffer();

  const metadata = {
    name: fileName,
    description: `نسخة احتياطية آلية شاملة لبرنامج الأيهم المحاسبي - مطبعة لبنان، تاريخ ${now.toLocaleString('ar-SA')}`,
    parents: [folderId]
  };

  const boundary = '-------LobnanBackupBoundary' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const mediaHeaderPart = `${delimiter}Content-Type: application/json\r\n\r\n`;

  const metaEncoder = new TextEncoder();
  const metaBytes = metaEncoder.encode(metadataPart);
  const mediaHeaderBytes = metaEncoder.encode(mediaHeaderPart);
  const closeBytes = metaEncoder.encode(closeDelimiter);

  const fullBody = new Uint8Array(
    metaBytes.length + mediaHeaderBytes.length + arrayBuffer.byteLength + closeBytes.length
  );
  fullBody.set(metaBytes, 0);
  fullBody.set(mediaHeaderBytes, metaBytes.length);
  fullBody.set(new Uint8Array(arrayBuffer), metaBytes.length + mediaHeaderBytes.length);
  fullBody.set(closeBytes, metaBytes.length + mediaHeaderBytes.length + arrayBuffer.byteLength);

  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType,webViewLink,webContentLink';
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: fullBody
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 401) {
      cachedAccessToken = null;
    }
    throw new Error(`فشل رفع النسخة الاحتياطية إلى Google Drive (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    name: data.name || fileName,
    size: parseInt(data.size || '0', 10) || arrayBuffer.byteLength,
    webViewLink: data.webViewLink,
    webContentLink: data.webContentLink
  };
}

// List all Backup Files currently stored in the Drive Folder
export async function listDriveBackupFiles(accessToken: string): Promise<DriveBackupFileItem[]> {
  try {
    const folderId = await getOrCreateBackupFolder(accessToken);
    const q = `'${folderId}' in parents and trashed=false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      q
    )}&fields=files(id,name,size,createdTime,modifiedTime,webViewLink,webContentLink)&orderBy=createdTime desc&pageSize=100`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        cachedAccessToken = null;
      }
      throw new Error(`فشل جلب قائمة النسخ من Google Drive (${res.status})`);
    }

    const data = await res.json();
    const files: any[] = data.files || [];

    const nowTime = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    return files.map((f) => {
      const fileDate = new Date(f.createdTime || f.modifiedTime || 0);
      const ageMs = nowTime - fileDate.getTime();
      const ageInDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      const isOlderThan7Days = ageMs > sevenDaysMs;

      return {
        id: f.id,
        name: f.name,
        size: parseInt(f.size || '0', 10),
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
        webContentLink: f.webContentLink,
        isOlderThan7Days,
        ageInDays,
        formattedDate: fileDate.toLocaleString('ar-SA', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      };
    });
  } catch (err) {
    console.error('Error listing backups from Drive:', err);
    throw err;
  }
}

// Retention policy cleanup: Deletes files older than 7 days (day 8 and older)
export async function cleanOldBackupsFromDrive(
  accessToken: string,
  retentionDays: number = 7
): Promise<{ deletedCount: number; deletedFiles: Array<{ id: string; name: string; createdTime: string }> }> {
  try {
    const allFiles = await listDriveBackupFiles(accessToken);
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    const oldFiles = allFiles.filter((f) => {
      const t = new Date(f.createdTime).getTime();
      return t < cutoffTime;
    });

    const deletedFiles: Array<{ id: string; name: string; createdTime: string }> = [];

    for (const f of oldFiles) {
      try {
        const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (delRes.ok || delRes.status === 204 || delRes.status === 404) {
          deletedFiles.push({ id: f.id, name: f.name, createdTime: f.createdTime });
        }
      } catch (delErr) {
        console.warn(`Could not delete old backup file ${f.id}:`, delErr);
      }
    }

    return {
      deletedCount: deletedFiles.length,
      deletedFiles
    };
  } catch (err) {
    console.error('Error during 7-day retention cleanup:', err);
    throw err;
  }
}

// Delete single backup file (with explicit file id)
export async function deleteSingleBackupFile(accessToken: string, fileId: string): Promise<boolean> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return res.ok || res.status === 204;
}

// Complete Hourly Backup Runner: Creates snapshot, uploads to Drive, and executes 7-day retention rotation
export async function executeHourlyDriveBackupFlow(
  accessToken: string,
  backupPayload: any,
  options: {
    retentionDays?: number;
    autoCleanOld?: boolean;
    fileName?: string;
  } = {}
): Promise<BackupExecutionResult> {
  const { retentionDays = 7, autoCleanOld = true, fileName } = options;
  const nowIso = new Date().toISOString();

  try {
    // 1. Upload backup snapshot to Google Drive
    const uploaded = await uploadBackupJsonToDrive(accessToken, backupPayload, fileName);

    // 2. Perform retention policy cleanup if enabled (delete files older than 7 days)
    let deletedCount = 0;
    let deletedFiles: Array<{ id: string; name: string; createdTime: string }> = [];

    if (autoCleanOld) {
      const cleanResult = await cleanOldBackupsFromDrive(accessToken, retentionDays);
      deletedCount = cleanResult.deletedCount;
      deletedFiles = cleanResult.deletedFiles;
    }

    // 3. Count total files remaining in Drive
    const currentFiles = await listDriveBackupFiles(accessToken);

    return {
      success: true,
      timestamp: nowIso,
      fileName: uploaded.name,
      fileId: uploaded.id,
      fileSize: uploaded.size,
      driveLink: uploaded.webViewLink,
      deletedOldBackupsCount: deletedCount,
      deletedOldFiles: deletedFiles,
      totalBackupsInDrive: currentFiles.length
    };
  } catch (err: any) {
    return {
      success: false,
      timestamp: nowIso,
      fileName: fileName || 'backup_error.json',
      deletedOldBackupsCount: 0,
      deletedOldFiles: [],
      totalBackupsInDrive: 0,
      error: err?.message || 'حدث خطأ أثناء إجراء النسخة الاحتياطية على Google Drive'
    };
  }
}
