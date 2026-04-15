const express = require('express');
const db = require('../database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

const router = express.Router();
router.use(authMiddleware);

// --- Claro Plans ---
router.get('/plans', (req, res) => {
  res.json(db.prepare('SELECT * FROM claro_plans ORDER BY price').all());
});

router.post('/plans', requireRole('gerente'), (req, res) => {
  const { name, price, commission, description } = req.body;
  const result = db.prepare('INSERT INTO claro_plans (name, price, commission, description) VALUES (?, ?, ?, ?)')
    .run(name, price, commission, description || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/plans/:id', requireRole('gerente'), (req, res) => {
  const { name, price, commission, description, active } = req.body;
  db.prepare('UPDATE claro_plans SET name = ?, price = ?, commission = ?, description = ?, active = ? WHERE id = ?')
    .run(name, price, commission, description, active !== undefined ? active : 1, req.params.id);
  res.json({ message: 'Plan actualizado' });
});

router.delete('/plans/:id', requireRole('gerente'), (req, res) => {
  db.prepare('DELETE FROM claro_plans WHERE id = ?').run(req.params.id);
  res.json({ message: 'Plan eliminado' });
});

// --- Operators ---
router.get('/operators', (req, res) => {
  res.json(db.prepare('SELECT * FROM origin_operators ORDER BY name').all());
});

router.post('/operators', requireRole('gerente'), (req, res) => {
  const result = db.prepare('INSERT INTO origin_operators (name) VALUES (?)').run(req.body.name);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/operators/:id', requireRole('gerente'), (req, res) => {
  db.prepare('UPDATE origin_operators SET name = ?, active = ? WHERE id = ?')
    .run(req.body.name, req.body.active !== undefined ? req.body.active : 1, req.params.id);
  res.json({ message: 'Operador actualizado' });
});

router.delete('/operators/:id', requireRole('gerente'), (req, res) => {
  db.prepare('DELETE FROM origin_operators WHERE id = ?').run(req.params.id);
  res.json({ message: 'Operador eliminado' });
});

// --- Lead Sources ---
router.get('/sources', (req, res) => {
  res.json(db.prepare('SELECT * FROM lead_sources ORDER BY name').all());
});

router.post('/sources', requireRole('gerente'), (req, res) => {
  const result = db.prepare('INSERT INTO lead_sources (name) VALUES (?)').run(req.body.name);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/sources/:id', requireRole('gerente'), (req, res) => {
  db.prepare('UPDATE lead_sources SET name = ?, active = ? WHERE id = ?')
    .run(req.body.name, req.body.active !== undefined ? req.body.active : 1, req.params.id);
  res.json({ message: 'Fuente actualizada' });
});

router.delete('/sources/:id', requireRole('gerente'), (req, res) => {
  db.prepare('DELETE FROM lead_sources WHERE id = ?').run(req.params.id);
  res.json({ message: 'Fuente eliminada' });
});

// --- Rejection Reasons ---
router.get('/rejection-reasons', (req, res) => {
  res.json(db.prepare('SELECT * FROM rejection_reasons ORDER BY name').all());
});

router.post('/rejection-reasons', requireRole('gerente'), (req, res) => {
  const result = db.prepare('INSERT INTO rejection_reasons (name) VALUES (?)').run(req.body.name);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/rejection-reasons/:id', requireRole('gerente'), (req, res) => {
  db.prepare('UPDATE rejection_reasons SET name = ?, active = ? WHERE id = ?')
    .run(req.body.name, req.body.active !== undefined ? req.body.active : 1, req.params.id);
  res.json({ message: 'Motivo actualizado' });
});

router.delete('/rejection-reasons/:id', requireRole('gerente'), (req, res) => {
  db.prepare('DELETE FROM rejection_reasons WHERE id = ?').run(req.params.id);
  res.json({ message: 'Motivo eliminado' });
});

// --- WhatsApp Config ---
router.get('/whatsapp', (req, res) => {
  const rows = db.prepare("SELECT config_key, config_value FROM app_config WHERE config_key LIKE 'whatsapp_%'").all();
  const config = {};
  rows.forEach(r => {
    const key = r.config_key.replace('whatsapp_', '');
    config[key] = r.config_value;
  });
  res.json(config);
});

router.put('/whatsapp', requireRole('gerente'), (req, res) => {
  const { country_code, message_template } = req.body;
  const upsert = db.prepare(
    "INSERT INTO app_config (config_key, config_value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value, updated_at = excluded.updated_at"
  );
  if (country_code !== undefined) upsert.run('whatsapp_country_code', country_code.toString().trim());
  if (message_template !== undefined) upsert.run('whatsapp_message_template', message_template.trim());
  res.json({ message: 'Configuración de WhatsApp guardada' });
});

// --- Database Backup ---
router.get('/backup', requireRole('gerente'), (req, res) => {
  const dbPath = db.dbPath || path.join(__dirname, '..', '..', 'shencom.db');
  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ error: 'Base de datos no encontrada' });
  }
  res.setHeader('Content-Disposition', `attachment; filename=shencom_backup_${new Date().toISOString().split('T')[0]}.db`);
  res.setHeader('Content-Type', 'application/octet-stream');
  const stream = fs.createReadStream(dbPath);
  stream.pipe(res);
});

module.exports = router;
