const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// List users
router.get('/', (req, res) => {
  let query = `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.supervisor_id,
    u.monthly_portability_goal, u.daily_call_goal, u.active, u.created_at,
    u.modified_by, u.modified_at,
    s.full_name as supervisor_name,
    m.full_name as modified_by_name
    FROM users u LEFT JOIN users s ON u.supervisor_id = s.id
    LEFT JOIN users m ON u.modified_by = m.id`;

  if (req.user.role === 'supervisor') {
    query += ` WHERE u.supervisor_id = ${req.user.id} OR u.id = ${req.user.id}`;
  } else if (req.user.role === 'vendedor') {
    query += ` WHERE u.id = ${req.user.id}`;
  }

  query += ' ORDER BY u.role, u.full_name';
  const users = db.prepare(query).all();
  res.json(users);
});

// Get vendors for assignment
router.get('/vendors', (req, res) => {
  let query = `SELECT id, full_name, supervisor_id FROM users WHERE role = 'vendedor' AND active = 1`;
  if (req.user.role === 'supervisor') {
    query += ` AND supervisor_id = ${req.user.id}`;
  }
  query += ' ORDER BY full_name';
  res.json(db.prepare(query).all());
});

// Get supervisors
router.get('/supervisors', (req, res) => {
  const supervisors = db.prepare(
    "SELECT id, full_name FROM users WHERE role = 'supervisor' AND active = 1 ORDER BY full_name"
  ).all();
  res.json(supervisors);
});

// Create user
router.post('/', requireRole('gerente'), (req, res) => {
  const { username, password, full_name, email, phone, role, supervisor_id, monthly_portability_goal, daily_call_goal } = req.body;

  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Campos requeridos: username, password, full_name, role' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) {
    return res.status(400).json({ error: 'El nombre de usuario ya existe' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, password, full_name, email, phone, role, supervisor_id, monthly_portability_goal, daily_call_goal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(username, hashed, full_name, email || null, phone || null, role, supervisor_id || null,
    monthly_portability_goal || 30, daily_call_goal || 40);

  db.prepare('INSERT INTO user_activity_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(req.user.id, 'create_user', `Created user: ${username}`);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Usuario creado' });
});

// Update user
router.put('/:id', requireRole('gerente'), (req, res) => {
  const { full_name, email, phone, role, supervisor_id, monthly_portability_goal, daily_call_goal, active, password } = req.body;
  const userId = req.params.id;

  // Prevent gerente from changing their own password through this endpoint
  if (password && parseInt(userId) === req.user.id) {
    return res.status(400).json({ error: 'No puede cambiar su propia contraseña desde este panel. Use su perfil.' });
  }

  let query = `UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?, supervisor_id = ?,
    monthly_portability_goal = ?, daily_call_goal = ?, active = ?,
    modified_by = ?, modified_at = datetime('now'), updated_at = datetime('now')`;
  let params = [full_name, email || null, phone || null, role, supervisor_id || null,
    monthly_portability_goal || 30, daily_call_goal || 40, active !== undefined ? active : 1,
    req.user.id];

  if (password) {
    query += ', password = ?';
    params.push(bcrypt.hashSync(password, 10));
  }

  query += ' WHERE id = ?';
  params.push(userId);

  db.prepare(query).run(...params);

  db.prepare('INSERT INTO user_activity_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(req.user.id, 'update_user', `Updated user ID: ${userId}, fields: ${Object.keys(req.body).filter(k => k !== 'password').join(', ')}`);

  res.json({ message: 'Usuario actualizado' });
});

// Delete user
router.delete('/:id', requireRole('gerente'), (req, res) => {
  const userId = parseInt(req.params.id);

  // Cannot delete yourself
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'No puede eliminarse a sí mismo.' });
  }

  const user = db.prepare('SELECT id, full_name, username FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  // Check if user has leads assigned as vendor (NOT NULL constraint)
  const leadsCount = db.prepare('SELECT COUNT(*) as count FROM leads WHERE vendor_id = ?').get(userId).count;
  if (leadsCount > 0) {
    return res.status(400).json({
      error: `No se puede eliminar: el usuario tiene ${leadsCount} lead(s) asignado(s). Reasigne los leads primero.`
    });
  }

  const deleteUser = db.transaction(() => {
    // Remove supervisor reference from other users
    db.prepare('UPDATE users SET supervisor_id = NULL WHERE supervisor_id = ?').run(userId);
    // Remove supervisor reference from leads
    db.prepare('UPDATE leads SET supervisor_id = NULL WHERE supervisor_id = ?').run(userId);
    // Delete notifications
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
    // Delete activity log entries
    db.prepare('DELETE FROM user_activity_log WHERE user_id = ?').run(userId);
    // Delete lead activities by this user
    db.prepare('DELETE FROM lead_activities WHERE user_id = ?').run(userId);
    // Delete the user
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  try {
    deleteUser();
    // Log the deletion
    db.prepare('INSERT INTO user_activity_log (user_id, action, details) VALUES (?, ?, ?)')
      .run(req.user.id, 'delete_user', `Deleted user: ${user.username} (${user.full_name})`);
    res.json({ message: `Usuario "${user.full_name}" eliminado exitosamente.` });
  } catch (e) {
    console.error('Error deleting user:', e);
    res.status(500).json({ error: 'Error al eliminar el usuario.' });
  }
});

// Get user activity log
router.get('/:id/activity', (req, res) => {
  const logs = db.prepare(
    'SELECT * FROM user_activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'
  ).all(req.params.id);
  res.json(logs);
});

module.exports = router;
