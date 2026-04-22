const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'google.json');
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '184HUCx8B9kpDwHKA-YUZUetfSIoYYzULGqjHpt04htM';
const SHEET_TAB = process.env.GOOGLE_SHEET_TAB || 'Ventas';

const HEADERS = [
  'Lead ID', 'Fecha actualización', 'Vendedor',
  'Titular', 'RUC/Cédula', 'Fecha nacimiento', 'Nacionalidad',
  'Celular', 'Correo', 'Ciudad', 'Dirección',
  'Negociación PAYBACK', 'Tipo Contrato',
  'Referencia 1 nombre', 'Referencia 1 teléfono',
  'Referencia 2 nombre', 'Referencia 2 teléfono',
  'Forma de pago', 'Banco', 'Tipo cuenta', 'Número cuenta',
  'Tarjeta tipo', 'Tarjeta número', 'Tarjeta titular', 'Tarjeta caducidad',
  'Lugar entrega', 'Dirección entrega', 'Referencia entrega',
  'Gestor nombre', 'Gestor cédula', 'Gestor celular', 'Gestor correo',
  'Líneas (JSON)', 'Observaciones', 'Ver en CRM (documentos)'
];

let cachedClient = null;
let warnedDisabled = false;

function loadCredentials() {
  // Production: env var with full JSON content
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    try { return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON); }
    catch (e) { console.error('[googleSheets] invalid GOOGLE_CREDENTIALS_JSON:', e.message); return null; }
  }
  // Local dev: file
  if (fs.existsSync(CREDENTIALS_PATH)) {
    try { return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')); }
    catch (e) { console.error('[googleSheets] cannot read credentials file:', e.message); return null; }
  }
  return null;
}

function getClient() {
  if (cachedClient) return cachedClient;
  const creds = loadCredentials();
  if (!creds) {
    if (!warnedDisabled) {
      console.warn('[googleSheets] credentials not found (set GOOGLE_CREDENTIALS_JSON env var or place file at server/credentials/google.json), sync disabled');
      warnedDisabled = true;
    }
    return null;
  }
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  cachedClient = google.sheets({ version: 'v4', auth });
  return cachedClient;
}

async function ensureHeaders(sheets) {
  // Read first row; rewrite if missing or any column differs
  const range = `${SHEET_TAB}!1:1`;
  let needsHeaders = false;
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
    const firstRow = res.data.values?.[0] || [];
    if (firstRow.length !== HEADERS.length) needsHeaders = true;
    else for (let i = 0; i < HEADERS.length; i++) {
      if (firstRow[i] !== HEADERS[i]) { needsHeaders = true; break; }
    }
  } catch (e) {
    if (String(e.message).includes('Unable to parse range')) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: SHEET_TAB } } }] }
      });
      needsHeaders = true;
    } else {
      throw e;
    }
  }
  if (needsHeaders) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] }
    });
  }
}

async function findRowByLeadId(sheets, leadId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:A`
  });
  const rows = res.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(leadId)) return i + 1; // 1-indexed
  }
  return null;
}

function buildRow(leadId, vendorName, formData) {
  const lineas = Array.isArray(formData.lineas) ? formData.lineas : [];
  return [
    leadId,
    new Date().toISOString(),
    vendorName || '',
    formData.titular || '',
    formData.ruc_ci || '',
    formData.fecha_nacimiento || '',
    formData.nacionalidad || '',
    formData.celular || '',
    formData.correo || '',
    formData.ciudad || '',
    formData.direccion || '',
    formData.negociacion_payback || '',
    formData.tipo_contrato || '',
    formData.ref1_nombre || '',
    formData.ref1_telefono || '',
    formData.ref2_nombre || '',
    formData.ref2_telefono || '',
    formData.forma_pago || '',
    formData.banco || '',
    formData.tipo_cuenta || '',
    formData.numero_cuenta || '',
    formData.tarjeta_tipo || '',
    formData.tarjeta_numero || '',
    formData.tarjeta_titular || '',
    formData.tarjeta_caducidad || '',
    formData.lugar_entrega || '',
    formData.direccion_entrega || '',
    formData.referencia_entrega || '',
    formData.gestor_nombre || '',
    formData.gestor_ci || '',
    formData.gestor_celular || '',
    formData.gestor_correo || '',
    JSON.stringify(lineas),
    formData.observaciones || '',
    formData._crm_lead_link || ''
  ];
}

async function upsertSaleForm(leadId, vendorName, formData) {
  const sheets = getClient();
  if (!sheets) return { synced: false, reason: 'no_credentials' };
  try {
    await ensureHeaders(sheets);
    const row = buildRow(leadId, vendorName, formData);
    const existingRow = await findRowByLeadId(sheets, leadId);
    if (existingRow) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!A${existingRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] }
      });
      return { synced: true, action: 'updated', row: existingRow };
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!A:A`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] }
      });
      return { synced: true, action: 'appended' };
    }
  } catch (e) {
    console.error('[googleSheets] sync error:', e.message);
    return { synced: false, reason: e.message };
  }
}

module.exports = { upsertSaleForm };
