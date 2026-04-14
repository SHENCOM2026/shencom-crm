const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function getVendorFilter(user) {
  if (user.role === 'vendedor') return `AND l.vendor_id = ${user.id}`;
  if (user.role === 'supervisor') return `AND l.vendor_id IN (SELECT id FROM users WHERE supervisor_id = ${user.id})`;
  return '';
}

function getActivityVendorFilter(user) {
  if (user.role === 'vendedor') return `AND a.user_id = ${user.id}`;
  if (user.role === 'supervisor') return `AND a.user_id IN (SELECT id FROM users WHERE supervisor_id = ${user.id})`;
  return '';
}

router.get('/kpis', (req, res) => {
  const vf = getVendorFilter(req.user);
  const vendorFilter = req.query.vendor_id ? `AND l.vendor_id = ${req.query.vendor_id}` : vf;

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const monthStart = today.substring(0, 7) + '-01';

  // Lead counts
  const leadsToday = db.prepare(`SELECT COUNT(*) as c FROM leads l WHERE date(l.created_at) = ? ${vendorFilter}`).get(today).c;
  const leadsWeek = db.prepare(`SELECT COUNT(*) as c FROM leads l WHERE date(l.created_at) >= ? ${vendorFilter}`).get(weekAgo).c;
  const leadsMonth = db.prepare(`SELECT COUNT(*) as c FROM leads l WHERE date(l.created_at) >= ? ${vendorFilter}`).get(monthStart).c;

  // Ventas (portabilidades exitosas)
  const salesMonth = db.prepare(`SELECT COUNT(*) as c FROM leads l WHERE l.pipeline_status = 'portabilidad_exitosa' AND date(l.activation_date) >= ? ${vendorFilter}`).get(monthStart).c;

  // Monthly goal
  let goalTotal = 0;
  if (req.user.role === 'vendedor') {
    goalTotal = db.prepare('SELECT monthly_portability_goal FROM users WHERE id = ?').get(req.user.id).monthly_portability_goal;
  } else {
    const goalQuery = req.user.role === 'supervisor'
      ? `SELECT COALESCE(SUM(monthly_portability_goal), 0) as g FROM users WHERE supervisor_id = ${req.user.id} AND active = 1`
      : `SELECT COALESCE(SUM(monthly_portability_goal), 0) as g FROM users WHERE role = 'vendedor' AND active = 1`;
    goalTotal = db.prepare(goalQuery).get().g;
  }

  // Conversion rate
  const totalLeads = db.prepare(`SELECT COUNT(*) as c FROM leads l WHERE 1=1 ${vendorFilter}`).get().c;
  const closedLeads = db.prepare(`SELECT COUNT(*) as c FROM leads l WHERE l.pipeline_status = 'portabilidad_exitosa' ${vendorFilter}`).get().c;
  const conversionRate = totalLeads > 0 ? ((closedLeads / totalLeads) * 100).toFixed(1) : 0;

  // Estimated commissions
  const commissions = db.prepare(`
    SELECT COALESCE(SUM(cp.commission), 0) as total
    FROM leads l
    JOIN claro_plans cp ON l.claro_plan_id = cp.id
    WHERE l.pipeline_status = 'portabilidad_exitosa'
    AND date(l.activation_date) >= ? ${vendorFilter}
  `).get(monthStart).total;

  // Pipeline abierto (USD) - leads activos NO ganados
  const pipelineOpen = db.prepare(`
    SELECT COALESCE(SUM(l.prospect_total), 0) as total
    FROM leads l
    WHERE l.pipeline_status != 'portabilidad_exitosa'
    AND l.pipeline_status != 'rechazado_perdido' ${vendorFilter}
  `).get().total;

  // Ventas cerradas (USD) - leads ganados
  const salesClosed = db.prepare(`
    SELECT COALESCE(SUM(l.prospect_total), 0) as total
    FROM leads l
    WHERE l.pipeline_status = 'portabilidad_exitosa' ${vendorFilter}
  `).get().total;

  // Proyección total
  const projectionTotal = pipelineOpen + salesClosed;

  res.json({
    leads: { today: leadsToday, week: leadsWeek, month: leadsMonth },
    sales: { month: salesMonth, goal: goalTotal },
    conversionRate: parseFloat(conversionRate),
    estimatedCommissions: commissions,
    pipelineOpenUSD: pipelineOpen,
    salesClosedUSD: salesClosed,
    projectionTotalUSD: projectionTotal
  });
});

// Pipeline distribution
router.get('/pipeline', (req, res) => {
  const vf = getVendorFilter(req.user);
  const vendorFilter = req.query.vendor_id ? `AND l.vendor_id = ${req.query.vendor_id}` : vf;

  const data = db.prepare(`
    SELECT pipeline_status as status, COUNT(*) as count
    FROM leads l WHERE 1=1 ${vendorFilter}
    GROUP BY pipeline_status
  `).all();
  res.json(data);
});

// Ventas por vendedor (ranking)
router.get('/ranking', (req, res) => {
  const monthStart = new Date().toISOString().substring(0, 7) + '-01';
  let filter = '';
  if (req.user.role === 'supervisor') {
    filter = `AND l.vendor_id IN (SELECT id FROM users WHERE supervisor_id = ${req.user.id})`;
  }

  const data = db.prepare(`
    SELECT u.full_name as name, u.monthly_portability_goal as goal,
      COUNT(l.id) as sales
    FROM users u
    LEFT JOIN leads l ON l.vendor_id = u.id
      AND l.pipeline_status = 'portabilidad_exitosa'
      AND date(l.activation_date) >= ?
    WHERE u.role = 'vendedor' AND u.active = 1 ${filter.replace('l.vendor_id', 'u.id')}
    GROUP BY u.id
    ORDER BY sales DESC
  `).all(monthStart);
  res.json(data);
});

// Daily trend (last 30 days)
router.get('/trend', (req, res) => {
  const vf = getVendorFilter(req.user);
  const af = getActivityVendorFilter(req.user);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const calls = db.prepare(`
    SELECT date(a.created_at) as day, COUNT(*) as count
    FROM lead_activities a
    WHERE date(a.created_at) >= ? AND a.activity_type IN ('llamada_saliente','llamada_entrante') ${af}
    GROUP BY date(a.created_at) ORDER BY day
  `).all(thirtyDaysAgo);

  const closings = db.prepare(`
    SELECT date(l.activation_date) as day, COUNT(*) as count
    FROM leads l
    WHERE l.pipeline_status = 'portabilidad_exitosa' AND date(l.activation_date) >= ? ${vf}
    GROUP BY date(l.activation_date) ORDER BY day
  `).all(thirtyDaysAgo);

  res.json({ calls, closings });
});

module.exports = router;
