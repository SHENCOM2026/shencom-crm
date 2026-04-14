const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

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
    conditions.push('l.pipeline_status = ?');
    params.push(req.query.status);
  }
  if (req.query.vendor_id) {
    conditions.push('l.vendor_id = ?');
    params.push(req.query.vendor_id);
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
      o.name as operator_name, ls.name as source_name, cp.name as claro_plan_name
    FROM leads l
    LEFT JOIN users v ON l.vendor_id = v.id
    LEFT JOIN users s ON l.supervisor_id = s.id
    LEFT JOIN origin_operators o ON l.operator_origin_id = o.id
    LEFT JOIN lead_sources ls ON l.source_id = ls.id
    LEFT JOIN claro_plans cp ON l.claro_plan_id = cp.id
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

module.exports = router;
