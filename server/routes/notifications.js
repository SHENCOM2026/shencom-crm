const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Get my notifications
router.get('/', (req, res) => {
  const notifications = db.prepare(`
    SELECT n.*, l.full_name as lead_name
    FROM notifications n
    LEFT JOIN leads l ON n.lead_id = l.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json(notifications);
});

// Get unread count
router.get('/unread-count', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id).c;
  res.json({ count });
});

// Mark as read
router.put('/:id/read', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ message: 'ok' });
});

// Mark all as read
router.put('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ message: 'ok' });
});

// Generate notifications for stale leads and expired callbacks
router.post('/generate', (req, res) => {
  // Leads without activity for 48+ hours
  const staleLeads = db.prepare(`
    SELECT l.id, l.full_name, l.vendor_id
    FROM leads l
    WHERE l.pipeline_status NOT IN ('portabilidad_exitosa', 'rechazado_perdido')
      AND julianday('now') - julianday(l.updated_at) >= 2
      AND l.id NOT IN (
        SELECT DISTINCT lead_id FROM notifications
        WHERE type = 'stale_lead' AND date(created_at) = date('now')
      )
  `).all();

  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, type, message, lead_id) VALUES (?, ?, ?, ?)
  `);

  let count = 0;
  staleLeads.forEach(lead => {
    insertNotif.run(lead.vendor_id, 'stale_lead',
      `Lead "${lead.full_name}" sin gestión por más de 48 horas`, lead.id);
    count++;
  });

  // Expired callbacks
  const expiredCallbacks = db.prepare(`
    SELECT l.id, l.full_name, l.vendor_id, l.next_followup
    FROM leads l
    WHERE l.next_followup IS NOT NULL
      AND datetime(l.next_followup) < datetime('now')
      AND l.pipeline_status NOT IN ('portabilidad_exitosa', 'rechazado_perdido')
      AND l.id NOT IN (
        SELECT DISTINCT lead_id FROM notifications
        WHERE type = 'expired_callback' AND date(created_at) = date('now')
      )
  `).all();

  expiredCallbacks.forEach(lead => {
    insertNotif.run(lead.vendor_id, 'expired_callback',
      `Callback vencido para "${lead.full_name}" (programado: ${lead.next_followup})`, lead.id);
    count++;
  });

  res.json({ generated: count });
});

module.exports = router;
