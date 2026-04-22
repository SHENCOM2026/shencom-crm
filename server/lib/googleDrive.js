const fs = require('fs');
const { google } = require('googleapis');

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1Yr9C5c6IN1AF8ClzC8hBNkV1C2a3bOu1';

let cachedClient = null;
let warnedDisabled = false;

function getClient() {
  if (cachedClient) return cachedClient;
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    if (!warnedDisabled) {
      console.warn('[googleDrive] OAuth creds missing (need GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN), sync disabled');
      warnedDisabled = true;
    }
    return null;
  }
  const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: REFRESH_TOKEN });
  cachedClient = google.drive({ version: 'v3', auth: oauth2 });
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
