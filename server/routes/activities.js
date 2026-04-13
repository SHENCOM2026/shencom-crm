const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Add activity to lead
router.post('/', (req, res) => {
  const { lead_id, activity_type, duration_minutes, result, notes, next_action, next_action_date } = req.body;

  if (!lead_id || !activity_type) {
    return res.status(400).json({ error: 'lead_id y activity_type son requeridos' });
  }

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead_id);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });

  if (req.user.role === 'vendedor' && lead.vendor_id !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  const actResult = db.prepare(`
    INSERT INTO lead_activities (lead_id, user_id, activity_type, duration_minutes, result, notes, next_action, next_action_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(lead_id, req.user.id, activity_type, duration_minutes || null,
    result || null, notes || null, next_action || null, next_action_date || null);

  // Update lead's last activity and next followup
  const updates = ["updated_at = datetime('now')"];
  const params = [];
  if (next_action_date) {
    updates.push('next_followup = ?');
    params.push(next_action_date);
  }
  params.push(lead_id);
  db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  db.prepare('INSERT INTO user_activity_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(req.user.id, 'add_activity', `${activity_type} en lead #${lead_id}`);

  res.status(201).json({ id: actResult.lastInsertRowid, message: 'Gestión registrada' });
});

// Get activities for a lead
router.get('/lead/:leadId', (req, res) => {
  const activities = db.prepare(`
    SELECT a.*, u.full_name as user_name
    FROM lead_activities a
    JOIN users u ON a.user_id = u.id
    WHERE a.lead_id = ?
    ORDER BY a.created_at DESC
  `).all(req.params.leadId);
  res.json(activities);
});

// Get my recent activities
router.get('/my-recent', (req, res) => {
  let query = `
    SELECT a.*, u.full_name as user_name, l.full_name as lead_name
    FROM lead_activities a
    JOIN users u ON a.user_id = u.id
    JOIN leads l ON a.lead_id = l.id
  `;

  if (req.user.role === 'vendedor') {
    query += ` WHERE a.user_id = ${req.user.id}`;
  } else if (req.user.role === 'supervisor') {
    query += ` WHERE a.user_id IN (SELECT id FROM users WHERE supervisor_id = ${req.user.id} OR id = ${req.user.id})`;
  }

  query += ' ORDER BY a.created_at DESC LIMIT 50';
  res.json(db.prepare(query).all());
});

module.exports = router;
