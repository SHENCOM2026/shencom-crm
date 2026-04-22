const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { upsertSaleForm } = require('../lib/googleSheets');
const googleDrive = require('../lib/googleDrive');

// Multer setup for PDF uploads
const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/lead_docs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo se permiten archivos PDF'));
  }
});

const router = express.Router();
router.use(authMiddleware);

const upload = multer({ storage: multer.memoryStorage() });

function buildLeadFilter(req) {
  let conditions = [];
  let params = [];

  // Role-based filtering
  if (req.user.role === 'vendedor') {
    conditions.push('l.vendor_id = ?');
    params.push(req.user.id);
  } else if (req.user.role === 'supervisor') {
    conditions.push('(l.supervisor_id = ? OR l.vendor_id = ?)');
    params.push(req.user.id, req.user.id);
  }

  // Query filters
  if (req.query.status) {
    const statuses = req.query.status.split(',').filter(Boolean);
    if (statuses.length === 1) {
      conditions.push('l.pipeline_status = ?');
      params.push(statuses[0]);
    } else if (statuses.length > 1) {
      conditions.push(`l.pipeline_status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }
  if (req.query.vendor_id) {
    const vids = req.query.vendor_id.split(',').filter(Boolean);
    if (vids.length === 1) {
      conditions.push('l.vendor_id = ?');
      params.push(vids[0]);
    } else if (vids.length > 1) {
      conditions.push(`l.vendor_id IN (${vids.map(() => '?').join(',')})`);
      params.push(...vids);
    }
  }
  if (req.query.operator_id) {
    conditions.push('l.operator_origin_id = ?');
    params.push(req.query.operator_id);
  }
  if (req.query.source_id) {
    conditions.push('l.source_id = ?');
    params.push(req.query.source_id);
  }
  if (req.query.date_from) {
    conditions.push('l.created_at >= ?');
    params.push(req.query.date_from);
  }
  if (req.query.date_to) {
    conditions.push('l.created_at <= ?');
    params.push(req.query.date_to + ' 23:59:59');
  }
  if (req.query.search) {
    conditions.push('(l.full_name LIKE ? OR l.cedula LIKE ? OR l.phone_primary LIKE ?)');
    const s = `%${req.query.search}%`;
    params.push(s, s, s);
  }
  if (req.query.value_min) {
    conditions.push('l.prospect_total >= ?');
    params.push(parseFloat(req.query.value_min));
  }
  if (req.query.value_max) {
    conditions.push('l.prospect_total <= ?');
    params.push(parseFloat(req.query.value_max));
  }
  if (req.query.import_id) {
    conditions.push('l.import_id = ?');
    params.push(parseInt(req.query.import_id));
  }

  return { where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '', params };
}

// List leads
router.get('/', (req, res) => {
  const { where, params } = buildLeadFilter(req);
  const leads = db.prepare(`
    SELECT l.*, v.full_name as vendor_name, s.full_name as supervisor_name,
      o.name as operator_name, ls.name as source_name, cp.name as claro_plan_name,
      rr.name as rejection_reason_name,
      l.lines_to_port, l.prospect_total
    FROM leads l
    LEFT JOIN users v ON l.vendor_id = v.id
    LEFT JOIN users s ON l.supervisor_id = s.id
    LEFT JOIN origin_operators o ON l.operator_origin_id = o.id
    LEFT JOIN lead_sources ls ON l.source_id = ls.id
    LEFT JOIN claro_plans cp ON l.claro_plan_id = cp.id
    LEFT JOIN rejection_reasons rr ON l.rejection_reason_id = rr.id
    ${where}
    ORDER BY l.updated_at DESC
  `).all(...params);
  res.json(leads);
});

// Get single lead
router.get('/:id', (req, res) => {
  const lead = db.prepare(`
    SELECT l.*, v.full_name as vendor_name, s.full_name as supervisor_name,
      o.name as operator_name, ls.name as source_name, cp.name as claro_plan_name,
      ih.file_name as import_file_name, ih.created_at as import_date
    FROM leads l
    LEFT JOIN users v ON l.vendor_id = v.id
    LEFT JOIN users s ON l.supervisor_id = s.id
    LEFT JOIN origin_operators o ON l.operator_origin_id = o.id
    LEFT JOIN lead_sources ls ON l.source_id = ls.id
    LEFT JOIN claro_plans cp ON l.claro_plan_id = cp.id
    LEFT JOIN import_history ih ON l.import_id = ih.id
    WHERE l.id = ?
  `).get(req.params.id);

  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

  // Check permission
  if (req.user.role === 'vendedor' && lead.vendor_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  // Get activities
  const activities = db.prepare(`
    SELECT a.*, u.full_name as user_name
    FROM lead_activities a
    JOIN users u ON a.user_id = u.id
    WHERE a.lead_id = ?
    ORDER BY a.created_at DESC
  `).all(req.params.id);

  // Get prospect plans
  const prospect_plans = db.prepare(
    'SELECT * FROM lead_prospect_plans WHERE lead_id = ? ORDER BY id'
  ).all(req.params.id);

  // Get change history
  const change_log = db.prepare(`
    SELECT cl.*, u.full_name as user_name
    FROM lead_change_log cl
    JOIN users u ON cl.user_id = u.id
    WHERE cl.lead_id = ?
    ORDER BY cl.created_at DESC LIMIT 50
  `).all(req.params.id);

  res.json({ ...lead, activities, prospect_plans, change_log });
});

// Create lead
router.post('/', (req, res) => {
  const { full_name, cedula, phone_primary, phone_secondary, email,
    operator_origin_id, current_plan, claro_plan_id, vendor_id,
    supervisor_id, source_id, notes, next_followup,
    lines_to_port, prospect_plans } = req.body;

  if (!full_name || !phone_primary) {
    return res.status(400).json({ error: 'Nombre y teléfono son requeridos' });
  }

  // Validate prospect plans if provided
  if (prospect_plans && prospect_plans.length > 0) {
    for (let i = 0; i < prospect_plans.length; i++) {
      const p = prospect_plans[i];
      if (!p.plan_name || !p.plan_name.trim()) {
        return res.status(400).json({ error: `Plan ${i + 1}: el nombre es requerido` });
      }
      if (p.plan_price === undefined || p.plan_price === '' || parseFloat(p.plan_price) < 0) {
        return res.status(400).json({ error: `Plan ${i + 1}: la tarifa debe ser un valor positivo` });
      }
    }
    if (lines_to_port && parseInt(lines_to_port) > 0) {
      const total = prospect_plans.reduce((sum, p) => sum + parseFloat(p.plan_price || 0), 0);
      if (total <= 0) {
        return res.status(400).json({ error: 'El valor total prospectado no puede ser $0 si hay líneas registradas' });
      }
    }
  }

  // Check duplicates
  if (cedula) {
    const dupCedula = db.prepare('SELECT id, full_name FROM leads WHERE cedula = ?').get(cedula);
    if (dupCedula) {
      return res.status(400).json({ error: `Duplicado: Ya existe un lead con esa cédula (${dupCedula.full_name}, ID: ${dupCedula.id})` });
    }
  }
  const dupPhone = db.prepare('SELECT id, full_name FROM leads WHERE phone_primary = ?').get(phone_primary);
  if (dupPhone) {
    return res.status(400).json({ error: `Duplicado: Ya existe un lead con ese teléfono (${dupPhone.full_name}, ID: ${dupPhone.id})` });
  }

  const assignedVendor = req.user.role === 'vendedor' ? req.user.id : (vendor_id || req.user.id);
  const assignedSupervisor = supervisor_id || null;
  const prospectTotal = (prospect_plans || []).reduce((sum, p) => sum + parseFloat(p.plan_price || 0), 0);

  const createLead = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO leads (full_name, cedula, phone_primary, phone_secondary, email,
        operator_origin_id, current_plan, claro_plan_id, vendor_id, supervisor_id,
        source_id, notes, next_followup, lines_to_port, prospect_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(full_name, cedula || null, phone_primary, phone_secondary || null,
      email || null, operator_origin_id || null, current_plan || null,
      claro_plan_id || null, assignedVendor, assignedSupervisor,
      source_id || null, notes || null, next_followup || null,
      parseInt(lines_to_port) || 0, prospectTotal);

    const leadId = result.lastInsertRowid;

    // Insert prospect plans
    if (prospect_plans && prospect_plans.length > 0) {
      const insertPlan = db.prepare(
        'INSERT INTO lead_prospect_plans (lead_id, plan_name, plan_price) VALUES (?, ?, ?)'
      );
      prospect_plans.forEach(p => {
        insertPlan.run(leadId, p.plan_name.trim(), parseFloat(p.plan_price) || 0);
      });
    }

    db.prepare('INSERT INTO user_activity_log (user_id, action, details) VALUES (?, ?, ?)')
      .run(req.user.id, 'create_lead', `Lead: ${full_name}`);

    return leadId;
  });

  const leadId = createLead();
  res.status(201).json({ id: leadId, message: 'Lead creado' });
});

// Update lead
router.put('/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

  if (req.user.role === 'vendedor' && lead.vendor_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  const { full_name, cedula, phone_primary, phone_secondary, email,
    operator_origin_id, current_plan, claro_plan_id, vendor_id,
    supervisor_id, source_id, pipeline_status, claro_request_number,
    activation_date, rejection_reason_id, next_followup, notes,
    lines_to_port, prospect_plans } = req.body;

  // Validate prospect plans if provided
  if (prospect_plans && prospect_plans.length > 0) {
    for (let i = 0; i < prospect_plans.length; i++) {
      const p = prospect_plans[i];
      if (!p.plan_name || !p.plan_name.trim()) {
        return res.status(400).json({ error: `Plan ${i + 1}: el nombre es requerido` });
      }
      if (p.plan_price === undefined || p.plan_price === '' || parseFloat(p.plan_price) < 0) {
        return res.status(400).json({ error: `Plan ${i + 1}: la tarifa debe ser un valor positivo` });
      }
    }
  }

  // Check duplicates on update
  if (cedula && cedula !== lead.cedula) {
    const dup = db.prepare('SELECT id FROM leads WHERE cedula = ? AND id != ?').get(cedula, req.params.id);
    if (dup) return res.status(400).json({ error: 'Ya existe un lead con esa cédula' });
  }

  // Log status change
  if (pipeline_status && pipeline_status !== lead.pipeline_status) {
    db.prepare(`INSERT INTO lead_activities (lead_id, user_id, activity_type, notes)
      VALUES (?, ?, 'cambio_estado', ?)`).run(
      req.params.id, req.user.id,
      `Estado cambiado de "${lead.pipeline_status}" a "${pipeline_status}"`
    );
  }

  // Log field changes for audit trail
  const trackFields = {
    full_name: 'Nombre', cedula: 'Cédula', phone_primary: 'Teléfono',
    email: 'Email', pipeline_status: 'Estado', vendor_id: 'Vendedor',
    supervisor_id: 'Supervisor', notes: 'Notas', lines_to_port: 'Líneas a portar'
  };
  const insertChange = db.prepare(
    'INSERT INTO lead_change_log (lead_id, user_id, field_name, old_value, new_value) VALUES (?, ?, ?, ?, ?)'
  );
  Object.entries(trackFields).forEach(([field, label]) => {
    const newVal = req.body[field];
    if (newVal !== undefined && String(newVal || '') !== String(lead[field] || '')) {
      try {
        insertChange.run(req.params.id, req.user.id, label, String(lead[field] || ''), String(newVal || ''));
      } catch(e) {}
    }
  });

  const prospectTotal = prospect_plans !== undefined
    ? (prospect_plans || []).reduce((sum, p) => sum + parseFloat(p.plan_price || 0), 0)
    : lead.prospect_total;

  const updateLead = db.transaction(() => {
    db.prepare(`
      UPDATE leads SET full_name = ?, cedula = ?, phone_primary = ?, phone_secondary = ?,
        email = ?, operator_origin_id = ?, current_plan = ?, claro_plan_id = ?,
        vendor_id = ?, supervisor_id = ?, source_id = ?, pipeline_status = ?,
        claro_request_number = ?, activation_date = ?, rejection_reason_id = ?,
        next_followup = ?, notes = ?, lines_to_port = ?, prospect_total = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      full_name || lead.full_name, cedula || lead.cedula,
      phone_primary || lead.phone_primary, phone_secondary ?? lead.phone_secondary,
      email ?? lead.email, operator_origin_id ?? lead.operator_origin_id,
      current_plan ?? lead.current_plan, claro_plan_id ?? lead.claro_plan_id,
      vendor_id || lead.vendor_id, supervisor_id ?? lead.supervisor_id,
      source_id ?? lead.source_id, pipeline_status || lead.pipeline_status,
      claro_request_number ?? lead.claro_request_number,
      activation_date ?? lead.activation_date,
      rejection_reason_id ?? lead.rejection_reason_id,
      next_followup ?? lead.next_followup, notes ?? lead.notes,
      lines_to_port !== undefined ? (parseInt(lines_to_port) || 0) : (lead.lines_to_port || 0),
      prospectTotal,
      req.params.id
    );

    // Update prospect plans if provided
    if (prospect_plans !== undefined) {
      db.prepare('DELETE FROM lead_prospect_plans WHERE lead_id = ?').run(req.params.id);
      if (prospect_plans && prospect_plans.length > 0) {
        const insertPlan = db.prepare(
          'INSERT INTO lead_prospect_plans (lead_id, plan_name, plan_price) VALUES (?, ?, ?)'
        );
        prospect_plans.forEach(p => {
          insertPlan.run(req.params.id, p.plan_name.trim(), parseFloat(p.plan_price) || 0);
        });
      }
    }
  });

  updateLead();
  res.json({ message: 'Lead actualizado' });
});

// Update pipeline status (drag & drop)
router.patch('/:id/status', (req, res) => {
  const { pipeline_status, claro_request_number, activation_date, claro_plan_id, rejection_reason_id } = req.body;
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

  if (req.user.role === 'vendedor' && lead.vendor_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  let updates = ['pipeline_status = ?', "updated_at = datetime('now')"];
  let params = [pipeline_status];

  if (claro_request_number) {
    updates.push('claro_request_number = ?');
    params.push(claro_request_number);
  }
  if (activation_date) {
    updates.push('activation_date = ?');
    params.push(activation_date);
  }
  if (claro_plan_id) {
    updates.push('claro_plan_id = ?');
    params.push(claro_plan_id);
  }
  if (rejection_reason_id) {
    updates.push('rejection_reason_id = ?');
    params.push(rejection_reason_id);
  }

  params.push(req.params.id);
  db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  db.prepare(`INSERT INTO lead_activities (lead_id, user_id, activity_type, notes)
    VALUES (?, ?, 'cambio_estado', ?)`).run(
    req.params.id, req.user.id,
    `Estado cambiado de "${lead.pipeline_status}" a "${pipeline_status}"`
  );

  res.json({ message: 'Estado actualizado' });
});

// Delete lead
router.delete('/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

  if (req.user.role === 'vendedor') {
    return res.status(403).json({ error: 'Sin permisos para eliminar leads' });
  }

  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  res.json({ message: 'Lead eliminado' });
});

// Bulk assign
router.post('/bulk-assign', (req, res) => {
  if (req.user.role === 'vendedor') {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  const { lead_ids, vendor_id } = req.body;
  const vendor = db.prepare('SELECT id, supervisor_id FROM users WHERE id = ? AND active = 1').get(vendor_id);
  if (!vendor) return res.status(400).json({ error: 'Vendedor no encontrado' });

  const stmt = db.prepare("UPDATE leads SET vendor_id = ?, supervisor_id = ?, updated_at = datetime('now') WHERE id = ?");
  const updateMany = db.transaction((ids) => {
    ids.forEach(id => stmt.run(vendor_id, vendor.supervisor_id, id));
  });
  updateMany(lead_ids);

  res.json({ message: `${lead_ids.length} leads reasignados` });
});

// Import CSV
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  try {
    const records = parse(req.file.buffer.toString(), {
      columns: true, skip_empty_lines: true, trim: true
    });

    let imported = 0, skipped = 0, errors = [];

    const insertStmt = db.prepare(`
      INSERT INTO leads (full_name, cedula, phone_primary, phone_secondary, email,
        vendor_id, notes, pipeline_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'lead_nuevo')
    `);

    const importAll = db.transaction(() => {
      records.forEach((row, idx) => {
        const name = row.nombre || row.full_name || row.Nombre;
        const phone = row.telefono || row.phone_primary || row.Telefono || row.celular || row.Celular;
        const cedula = row.cedula || row.Cedula || row.identificacion;

        if (!name || !phone) {
          errors.push(`Fila ${idx + 2}: nombre o teléfono faltante`);
          skipped++;
          return;
        }

        // Check duplicate
        const dup = db.prepare('SELECT id FROM leads WHERE phone_primary = ?').get(phone);
        if (dup) {
          skipped++;
          return;
        }

        insertStmt.run(
          name, cedula || null, phone,
          row.telefono_secundario || row.phone_secondary || null,
          row.email || row.Email || null,
          req.user.role === 'vendedor' ? req.user.id : (req.user.id),
          row.notas || row.notes || null
        );
        imported++;
      });
    });

    importAll();
    res.json({ imported, skipped, errors: errors.slice(0, 10) });
  } catch (e) {
    res.status(400).json({ error: 'Error procesando CSV: ' + e.message });
  }
});

// Export CSV
router.get('/export/csv', (req, res) => {
  const { where, params } = buildLeadFilter(req);
  const leads = db.prepare(`
    SELECT l.full_name as Nombre, l.cedula as Cedula, l.phone_primary as Telefono,
      l.phone_secondary as Telefono_Secundario, l.email as Email,
      o.name as Operador_Origen, l.current_plan as Plan_Actual,
      cp.name as Plan_Claro, v.full_name as Vendedor,
      CASE WHEN l.prospect_total > 0 THEN ROUND(l.prospect_total, 2) ELSE NULL END as "Valor ($)",
      l.pipeline_status as Estado, l.created_at as Fecha_Creacion,
      l.claro_request_number as Numero_Solicitud, l.activation_date as Fecha_Activacion
    FROM leads l
    LEFT JOIN users v ON l.vendor_id = v.id
    LEFT JOIN origin_operators o ON l.operator_origin_id = o.id
    LEFT JOIN claro_plans cp ON l.claro_plan_id = cp.id
    ${where}
    ORDER BY l.created_at DESC
  `).all(...params);

  const csv = stringify(leads, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=leads_shencom.csv');
  res.send(csv);
});

// ─── Sale Form ────────────────────────────────────────────

// GET /leads/:id/sale-form
router.get('/:id/sale-form', (req, res) => {
  const leadId = parseInt(req.params.id);
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

  const form = db.prepare('SELECT * FROM lead_sale_forms WHERE lead_id = ?').get(leadId);
  const formData = form ? JSON.parse(form.form_data) : {};

  // Pre-fill with lead data if not already set
  const defaults = {
    titular: lead.full_name || '',
    ruc_ci: lead.cedula || '',
    celular: lead.phone_primary || '',
    correo: lead.email || '',
    ciudad: lead.city || '',
    gestor_nombre: lead.full_name || '',
    gestor_ci: lead.cedula || '',
    gestor_celular: lead.phone_primary || '',
    gestor_correo: lead.email || '',
    lineas: [{ usuario: lead.full_name || '', numero_portar: lead.phone_primary || '', tipo_transaccion: 'PORTABILIDAD', tarifa: '', bp: '', equipo: '', financiamiento: '', feature: '', codigo_feature: '' }],
  };

  res.json({ ...defaults, ...formData });
});

// PUT /leads/:id/sale-form
router.put('/:id/sale-form', async (req, res) => {
  const leadId = parseInt(req.params.id);
  const lead = db.prepare('SELECT id, vendor_id FROM leads WHERE id = ?').get(leadId);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

  const formData = JSON.stringify(req.body);
  db.prepare(`
    INSERT INTO lead_sale_forms (lead_id, form_data, updated_by, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(lead_id) DO UPDATE SET
      form_data = excluded.form_data,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(leadId, formData, req.user.id);

  // Sync to Google Sheets (non-blocking error)
  const vendor = db.prepare('SELECT full_name FROM users WHERE id = ?').get(lead.vendor_id);
  const crmBase = process.env.CRM_BASE_URL || 'http://localhost:5173';
  const syncResult = await upsertSaleForm(leadId, vendor?.full_name || '', {
    ...req.body,
    _crm_lead_link: `${crmBase}/leads?leadId=${leadId}`
  });

  res.json({ message: 'Formulario guardado', drive_sync: syncResult });
});

// ─── Lead Documents ───────────────────────────────────────

// GET /leads/:id/documents
router.get('/:id/documents', (req, res) => {
  const docs = db.prepare(`
    SELECT ld.*, u.full_name as uploader_name
    FROM lead_documents ld
    LEFT JOIN users u ON ld.uploaded_by = u.id
    WHERE ld.lead_id = ?
    ORDER BY ld.created_at DESC
  `).all(req.params.id);
  res.json(docs);
});

// POST /leads/:id/documents — upload PDF (stored locally + Google Drive)
router.post('/:id/documents', uploadPdf.single('file'), async (req, res) => {
  const leadId = parseInt(req.params.id);
  const lead = db.prepare('SELECT id, full_name, cedula FROM leads WHERE id = ?').get(leadId);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo PDF' });

  // Upload to Google Drive (best-effort, does not block DB insert)
  const safeName = (lead.full_name || `lead-${leadId}`).replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '_');
  const driveName = `${safeName}_${lead.cedula || leadId}_${req.file.originalname}`;
  const filePath = req.file.path;
  let driveResult = { uploaded: false };
  try {
    driveResult = await googleDrive.uploadPdf({ filePath, driveName });
  } catch (e) {
    console.error('[documents] drive upload threw:', e.message);
  }

  const result = db.prepare(`
    INSERT INTO lead_documents (lead_id, file_name, original_name, file_size, uploaded_by, drive_file_id, drive_link)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    leadId,
    req.file.filename,
    req.file.originalname,
    req.file.size,
    req.user.id,
    driveResult.uploaded ? driveResult.fileId : null,
    driveResult.uploaded ? driveResult.webViewLink : null
  );

  res.status(201).json({
    id: result.lastInsertRowid,
    message: 'Documento subido correctamente',
    drive: driveResult.uploaded ? { fileId: driveResult.fileId, webViewLink: driveResult.webViewLink } : null
  });
});

// GET /leads/:id/documents/:docId — download PDF
router.get('/:id/documents/:docId', (req, res) => {
  const doc = db.prepare('SELECT * FROM lead_documents WHERE id = ? AND lead_id = ?')
    .get(req.params.docId, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

  const filePath = path.join(__dirname, '../../uploads/lead_docs', doc.file_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado en servidor' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${doc.original_name}"`);
  res.sendFile(path.resolve(filePath));
});

// DELETE /leads/:id/documents/:docId
router.delete('/:id/documents/:docId', async (req, res) => {
  const doc = db.prepare('SELECT * FROM lead_documents WHERE id = ? AND lead_id = ?')
    .get(req.params.docId, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

  const filePath = path.join(__dirname, '../../uploads/lead_docs', doc.file_name);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
  }
  if (doc.drive_file_id) {
    try { await googleDrive.deleteFile(doc.drive_file_id); }
    catch (e) { console.error('[documents] drive delete threw:', e.message); }
  }
  db.prepare('DELETE FROM lead_documents WHERE id = ?').run(doc.id);
  res.json({ message: 'Documento eliminado' });
});

// GET /leads/:id/formato — kept for backwards compat, redirects to sale-form concept
router.get('/:id/formato', async (req, res) => {
  const lead = db.prepare(`
    SELECT l.*, u.full_name as vendor_name
    FROM leads l
    LEFT JOIN users u ON l.vendor_id = u.id
    WHERE l.id = ?
  `).get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

  const templatePath = path.join(__dirname, '../assets/formato_ingreso_template.xlsx');
  if (!fs.existsSync(templatePath)) {
    return res.status(500).json({ error: 'Plantilla no encontrada en servidor' });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const fillSheet = (sheetName, cells) => {
      const ws = workbook.getWorksheet(sheetName);
      if (!ws) return;
      cells.forEach(([addr, value]) => {
        if (value) ws.getCell(addr).value = String(value);
      });
    };

    // Fill INGRESO sheet
    fillSheet('INGRESO', [
      ['B6', lead.full_name],
      ['B7', lead.cedula],
      ['B13', lead.city],
      ['B17', lead.phone_primary],
      ['B18', lead.email],
      // Gestores section
      ['A39', lead.full_name],
      ['C39', lead.cedula],
      ['D39', lead.phone_primary],
      ['E39', lead.email],
      // Line/portabilidad section
      ['A44', lead.full_name],
      ['B44', lead.phone_primary],
    ]);

    // Fill SP NATURAL sheet
    fillSheet('SP NATURAL', [
      ['E9', lead.full_name],
      ['E10', lead.cedula],
    ]);

    const safeName = (lead.full_name || 'lead').replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');
    const filename = `FORMATO_INGRESO_${safeName}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('Error generating formato:', e);
    res.status(500).json({ error: 'Error al generar formato: ' + e.message });
  }
});

module.exports = router;
