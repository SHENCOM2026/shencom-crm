const bcrypt = require('bcryptjs');
const db = require('./database');

function seed() {
  // One-time migrations (run regardless of seed state)
  try {
    const renamed = db.prepare(
      "UPDATE lead_sources SET name = ? WHERE name = ?"
    ).run('Campaña redes sociales', 'Queja redes sociales');
    if (renamed.changes > 0) {
      console.log(`[migration] renamed lead_source: Queja redes sociales -> Campaña redes sociales (${renamed.changes} row)`);
    }
  } catch (e) {
    console.error('[migration] lead_source rename failed:', e.message);
  }

  // Check if already seeded
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (adminExists) {
    console.log('Database already seeded.');
    return;
  }

  console.log('Seeding database...');

  // Create admin user
  const hashedPassword = bcrypt.hashSync('shencom2026', 10);
  db.prepare(`
    INSERT INTO users (username, password, full_name, email, role)
    VALUES (?, ?, ?, ?, ?)
  `).run('admin', hashedPassword, 'Administrador SHENCOM', 'admin@shencom.ec', 'gerente');

  // Seed origin operators
  const operators = ['Movistar', 'CNT', 'Tuenti'];
  const insertOperator = db.prepare('INSERT INTO origin_operators (name) VALUES (?)');
  operators.forEach(op => insertOperator.run(op));

  // Seed lead sources
  const sources = [
    'Campaña redes sociales', 'Referido', 'Base de datos',
    'Llamada fría', 'WhatsApp entrante', 'Otro'
  ];
  const insertSource = db.prepare('INSERT INTO lead_sources (name) VALUES (?)');
  sources.forEach(s => insertSource.run(s));

  // Seed rejection reasons
  const reasons = [
    'No interesado', 'Precio alto', 'Ya renovó con operador actual',
    'Problemas de cobertura', 'Documentación incompleta', 'Número no elegible',
    'No contactable', 'Otro'
  ];
  const insertReason = db.prepare('INSERT INTO rejection_reasons (name) VALUES (?)');
  reasons.forEach(r => insertReason.run(r));

  // Seed Claro plans
  const plans = [
    { name: 'Plan Claro MAX 15GB', price: 15.99, commission: 8.00, description: '15GB datos + redes sociales ilimitadas' },
    { name: 'Plan Claro MAX 25GB', price: 22.99, commission: 12.00, description: '25GB datos + redes sociales ilimitadas + 100 min' },
    { name: 'Plan Claro MAX 40GB', price: 29.99, commission: 15.00, description: '40GB datos + todo ilimitado' },
    { name: 'Plan Claro MAX 60GB', price: 39.99, commission: 20.00, description: '60GB datos + todo ilimitado + roaming' },
    { name: 'Plan Claro MAX 100GB', price: 55.99, commission: 28.00, description: '100GB datos + todo ilimitado + roaming + HBO' }
  ];
  const insertPlan = db.prepare(
    'INSERT INTO claro_plans (name, price, commission, description) VALUES (?, ?, ?, ?)'
  );
  plans.forEach(p => insertPlan.run(p.name, p.price, p.commission, p.description));

  // Seed commission config
  db.prepare(`
    INSERT INTO commission_config (period_type, overcommission_threshold_pct, overcommission_multiplier)
    VALUES (?, ?, ?)
  `).run('mensual', 120, 1.5);

  console.log('Database seeded successfully!');
}

module.exports = seed;
