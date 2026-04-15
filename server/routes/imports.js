const express = require('express');
const db = require('../database');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Check duplicates - receives phone numbers, returns matches
router.post('/check-duplicates', (req, res) => {
  const { phones } = req.body;
  if (!phones || !Array.isArray(phones)) {
    return res.status(400).json({ error: 'Se requiere un array de teléfonos' });
  }

  const duplicates = {};
  const stmt = db.prepare(`
    SELECT l.id, l.full_name, l.phone_primary, l.pipeline_status, v.full_name as vendor_name
    FROM leads l LEFT JOIN users v ON l.vendor_id = v.id
    WHERE l.phone_primary = ?
  `);

  phones.forEach(phone => {
    const cleaned = phone.replace(/\D/g, '');
    if (!cleaned) return;
    const existing = stmt.get(cleaned);
    if (existing) {
      duplicates[cleaned] = existing;
    }
  });

  res.json(duplicates);
});

// Main import endpoint
router.post('/', requireRole('gerente', 'supervisor'), (req, res) => {
  const { leads, assignment, duplicates: dupActions, file_name } = req.body;

  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'No se recibieron leads para importar' });
  }
  if (!assignment || !assignment.campaign_id) {
    return res.status(400).json({ error: 'La campaña es obligatoria' });
  }
  if (!assignment.vendor_ids || assignment.vendor_ids.length === 0) {
    return res.status(400).json({ error: 'Debe seleccionar al menos un agente' });
  }

  // Validate campaign exists
  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(assignment.campaign_id);
  if (!campaign) return res.status(400).json({ error: 'Campaña no válida' });

  // Validate vendors exist
  const vendorStmt = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1');
  for (const vid of assignment.vendor_ids) {
    if (!vendorStmt.get(vid)) return res.status(400).json({ error: `Agente con ID ${vid} no válido` });
  }

  // Validate source
  let sourceId = null;
  if (assignment.source_id) {
    const src = db.prepare('SELECT id FROM lead_sources WHERE id = ?').get(assignment.source_id);
    if (src) sourceId = src.id;
  }

  // Phone validation regex (Ecuadorian: 09XXXXXXXX or 10 digits)
  const phoneRegex = /^0[9]\d{8}$/;

  const results = {
    created: 0,
    replaced: 0,
    merged: 0,
    skipped: 0,
    errors: []
  };

  const importLeads = db.transaction(() => {
    // Create import history record
    const histResult = db.prepare(`
      INSERT INTO import_history (user_id, file_name, campaign_id, total_records)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, file_name || 'import.xlsx', assignment.campaign_id, leads.length);
    const importId = histResult.lastInsertRowid;

    const insertLead = db.prepare(`
      INSERT INTO leads (full_name, phone_primary, email, city, operator_origin_id,
        current_plan, vendor_id, source_id, pipeline_status, notes, import_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'lead_nuevo', ?, ?)
    `);

    const updateLead = db.prepare(`
      UPDATE leads SET full_name = ?, email = COALESCE(?, email), city = COALESCE(?, city),
        operator_origin_id = COALESCE(?, operator_origin_id), current_plan = COALESCE(?, current_plan),
        notes = CASE WHEN ? IS NOT NULL THEN COALESCE(notes || char(10), '') || ? ELSE notes END,
        updated_at = datetime('now'), import_id = ?
      WHERE phone_primary = ?
    `);

    const mergeLead = db.prepare(`
      UPDATE leads SET
        full_name = CASE WHEN full_name IS NULL OR full_name = '' THEN ? ELSE full_name END,
        email = CASE WHEN email IS NULL OR email = '' THEN ? ELSE email END,
        city = CASE WHEN city IS NULL OR city = '' THEN ? ELSE city END,
        operator_origin_id = CASE WHEN operator_origin_id IS NULL THEN ? ELSE operator_origin_id END,
        current_plan = CASE WHEN current_plan IS NULL OR current_plan = '' THEN ? ELSE current_plan END,
        notes = CASE WHEN ? IS NOT NULL THEN COALESCE(notes || char(10), '') || ? ELSE notes END,
        updated_at = datetime('now')
      WHERE phone_primary = ?
    `);

    const findOperator = db.prepare('SELECT id FROM origin_operators WHERE LOWER(name) = LOWER(?)');

    let vendorIndex = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];

      // Clean phone
      const phone = (lead.phone_primary || '').replace(/\D/g, '');
      if (!phone) {
        results.errors.push({ row: i + 1, phone: lead.phone_primary || '', error: 'Teléfono vacío' });
        continue;
      }

      // Validate phone format
      if (!phoneRegex.test(phone) && phone.length !== 10) {
        results.errors.push({ row: i + 1, phone, error: 'Formato de teléfono inválido (se espera 09XXXXXXXX)' });
        continue;
      }

      if (!lead.full_name || !lead.full_name.trim()) {
        results.errors.push({ row: i + 1, phone, error: 'Nombre vacío' });
        continue;
      }

      // Resolve operator
      let operatorId = null;
      if (lead.operator_origin) {
        const op = findOperator.get(lead.operator_origin.trim());
        if (op) operatorId = op.id;
      }

      // Determine vendor (round-robin)
      const vendorId = assignment.vendor_ids[vendorIndex % assignment.vendor_ids.length];
      vendorIndex++;

      // Check if duplicate
      const existingPhone = phone;
      const dupAction = (dupActions && dupActions[existingPhone]) || 'new';
      const batchNotes = assignment.batch_notes ? assignment.batch_notes.trim() : null;

      const existing = db.prepare('SELECT id FROM leads WHERE phone_primary = ?').get(existingPhone);

      if (existing) {
        if (dupAction === 'skip') {
          results.skipped++;
          continue;
        } else if (dupAction === 'replace') {
          updateLead.run(
            lead.full_name.trim(), lead.email || null, lead.city || null,
            operatorId, lead.current_plan || null,
            batchNotes, batchNotes, importId, existingPhone
          );
          results.replaced++;
        } else if (dupAction === 'merge') {
          mergeLead.run(
            lead.full_name.trim(), lead.email || null, lead.city || null,
            operatorId, lead.current_plan || null,
            batchNotes, batchNotes, existingPhone
          );
          results.merged++;
        } else {
          results.skipped++;
          continue;
        }
      } else {
        try {
          insertLead.run(
            lead.full_name.trim(), existingPhone, lead.email || null,
            lead.city || null, operatorId, lead.current_plan || null,
            vendorId, sourceId, batchNotes, importId
          );
          results.created++;
        } catch (e) {
          results.errors.push({ row: i + 1, phone: existingPhone, error: e.message });
        }
      }
    }

    // Update import history with results
    db.prepare(`
      UPDATE import_history SET
        new_records = ?, replaced_records = ?, merged_records = ?,
        skipped_records = ?, error_records = ?
      WHERE id = ?
    `).run(results.created, results.replaced, results.merged, results.skipped, results.errors.length, importId);

    // Activity log
    db.prepare('INSERT INTO user_activity_log (user_id, action, details) VALUES (?, ?, ?)')
      .run(req.user.id, 'import_leads', `Importó ${results.created} leads desde ${file_name || 'archivo'}`);

    return importId;
  });

  try {
    const importId = importLeads();
    res.json({
      importId,
      ...results,
      total: leads.length
    });
  } catch (e) {
    res.status(500).json({ error: 'Error al importar: ' + e.message });
  }
});

// Get import history
router.get('/history', (req, res) => {
  const history = db.prepare(`
    SELECT ih.*, u.full_name as user_name, c.name as campaign_name
    FROM import_history ih
    LEFT JOIN users u ON ih.user_id = u.id
    LEFT JOIN campaigns c ON ih.campaign_id = c.id
    ORDER BY ih.created_at DESC
  `).all();
  res.json(history);
});

module.exports = router;
