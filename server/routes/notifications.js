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

  // High-value leads without activity for 24+ hours
  const highValueStale = db.prepare(`
    SELECT l.id, l.full_name, l.vendor_id, l.prospect_total
    FROM leads l
    WHERE l.pipeline_status NOT IN ('portabilidad_exitosa', 'rechazado_perdido')
      AND l.prospect_total >= 50
      AND julianday('now') - julianday(l.updated_at) >= 1
      AND l.id NOT IN (
        SELECT DISTINCT lead_id FROM notifications
        WHERE type = 'high_value_stale' AND date(created_at) = date('now')
      )
  `).all();

  highValueStale.forEach(lead => {
    insertNotif.run(lead.vendor_id, 'high_value_stale',
      `Lead de alto valor "$${lead.prospect_total.toFixed(2)}" - "${lead.full_name}" sin gestión reciente`, lead.id);
    count++;
  });

  // Vendor close to monthly goal (80%+)
  const monthStart = new Date().toISOString().substring(0, 7) + '-01';
  const vendorsNearGoal = db.prepare(`
    SELECT u.id, u.full_name, u.monthly_portability_goal as goal,
      (SELECT COUNT(*) FROM leads l WHERE l.vendor_id = u.id AND l.pipeline_status = 'portabilidad_exitosa'
       AND date(l.activation_date) >= ?) as sales
    FROM users u
    WHERE u.role = 'vendedor' AND u.active = 1
      AND u.monthly_portability_goal > 0
      AND u.id NOT IN (
        SELECT DISTINCT user_id FROM notifications
        WHERE type = 'near_goal' AND date(created_at) = date('now')
      )
  `).all(monthStart);

  vendorsNearGoal.forEach(v => {
    const pct = (v.sales / v.goal) * 100;
    if (pct >= 80 && pct < 100) {
      insertNotif.run(v.id, 'near_goal',
        `Estás al ${pct.toFixed(0)}% de tu meta mensual (${v.sales}/${v.goal}). ¡Sigue así!`, null);
      count++;
    } else if (pct >= 100) {
      insertNotif.run(v.id, 'near_goal',
        `¡Felicidades! Superaste tu meta mensual: ${v.sales}/${v.goal} ventas (${pct.toFixed(0)}%)`, null);
      count++;
    }
  });

  res.json({ generated: count });
});

module.exports = router;
