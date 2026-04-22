const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'google.json');
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1Yr9C5c6IN1AF8ClzC8hBNkV1C2a3bOu1';

let cachedClient = null;
let warnedDisabled = false;

function loadCredentials() {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    try { return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON); }
    catch (e) { return null; }
  }
  if (fs.existsSync(CREDENTIALS_PATH)) {
    try { return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')); }
    catch (e) { return null; }
  }
  return null;
}

function getClient() {
  if (cachedClient) return cachedClient;
  const creds = loadCredentials();
  if (!creds) {
    if (!warnedDisabled) {
      console.warn('[googleDrive] credentials not found, sync disabled');
      warnedDisabled = true;
    }
    return null;
  }
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  cachedClient = google.drive({ version: 'v3', auth });
  return cachedClient;
}

async function uploadPdf({ filePath, driveName, mimeType = 'application/pdf' }) {
  const drive = getClient();
  if (!drive) return { uploaded: false, reason: 'no_credentials' };
  try {
    const res = await drive.files.create({
      requestBody: {
        name: driveName,
        parents: [FOLDER_ID],
      },
      media: {
        mimeType,
        body: fs.createReadStream(filePath),
      },
      fields: 'id, webViewLink',
    });
    return {
      uploaded: true,
      fileId: res.data.id,
      webViewLink: res.data.webViewLink,
    };
  } catch (e) {
    console.error('[googleDrive] upload error:', e.message);
    return { uploaded: false, reason: e.message };
  }
}

async function deleteFile(fileId) {
  const drive = getClient();
  if (!drive || !fileId) return { deleted: false };
  try {
    await drive.files.delete({ fileId });
    return { deleted: true };
  } catch (e) {
    console.error('[googleDrive] delete error:', e.message);
    return { deleted: false, reason: e.message };
  }
}

function getFolderLink() {
  return `https://drive.google.com/drive/folders/${FOLDER_ID}`;
}

module.exports = { uploadPdf, deleteFile, getFolderLink, FOLDER_ID };
