const express = require('express');
const db = require('../database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const ExcelJS = require('exceljs');

const router = express.Router();
router.use(authMiddleware);

// Get commission config
router.get('/config', (req, res) => {
  const config = db.prepare('SELECT * FROM commission_config ORDER BY id DESC LIMIT 1').get();
  res.json(config);
});

// Update commission config
router.put('/config', requireRole('gerente'), (req, res) => {
  const { period_type, overcommission_threshold_pct, overcommission_multiplier } = req.body;
  db.prepare(`UPDATE commission_config SET period_type = ?, overcommission_threshold_pct = ?,
    overcommission_multiplier = ?, updated_at = datetime('now') WHERE id = 1`)
    .run(period_type, overcommission_threshold_pct, overcommission_multiplier);
  res.json({ message: 'Configuración actualizada' });
});

// Calculate commissions
router.get('/calculate', (req, res) => {
  const { period_start, period_end } = req.query;
  const monthStart = period_start || new Date().toISOString().substring(0, 7) + '-01';
  const monthEnd = period_end || new Date().toISOString().split('T')[0];

  const config = db.prepare('SELECT * FROM commission_config ORDER BY id DESC LIMIT 1').get();

  let vendorFilter = '';
  if (req.user.role === 'vendedor') {
    vendorFilter = `AND u.id = ${req.user.id}`;
  } else if (req.user.role === 'supervisor') {
    vendorFilter = `AND u.supervisor_id = ${req.user.id}`;
  }

  const vendors = db.prepare(`
    SELECT u.id, u.full_name, u.monthly_portability_goal as goal
    FROM users u
    WHERE u.role = 'vendedor' AND u.active = 1 ${vendorFilter}
    ORDER BY u.full_name
  `).all();

  const results = vendors.map(vendor => {
    // Get portabilities with plan details
    const portabilities = db.prepare(`
      SELECT l.id, l.full_name as lead_name, l.phone_primary, cp.name as plan_name,
        cp.commission as plan_commission, l.activation_date
      FROM leads l
      JOIN claro_plans cp ON l.claro_plan_id = cp.id
      WHERE l.vendor_id = ? AND l.pipeline_status = 'portabilidad_exitosa'
        AND date(l.activation_date) >= ? AND date(l.activation_date) <= ?
      ORDER BY l.activation_date
    `).all(vendor.id, monthStart, monthEnd);

    const totalPortabilities = portabilities.length;
    const threshold = Math.ceil(vendor.goal * (config.overcommission_threshold_pct / 100));

    let baseCommission = 0;
    let overCommission = 0;

    portabilities.forEach((p, idx) => {
      if (idx < threshold) {
        baseCommission += p.plan_commission;
      } else {
        overCommission += p.plan_commission * config.overcommission_multiplier;
      }
    });

    return {
      vendor_id: vendor.id,
      vendor_name: vendor.full_name,
      goal: vendor.goal,
      threshold,
      total_portabilities: totalPortabilities,
      base_commission: Math.round(baseCommission * 100) / 100,
      over_commission: Math.round(overCommission * 100) / 100,
      total_commission: Math.round((baseCommission + overCommission) * 100) / 100,
      exceeded_goal: totalPortabilities > threshold,
      portabilities
    };
  });

  res.json({
    period: { start: monthStart, end: monthEnd },
    config,
    results,
    total: Math.round(results.reduce((s, r) => s + r.total_commission, 0) * 100) / 100
  });
});

// Export commissions to Excel
router.get('/export', async (req, res) => {
  const { period_start, period_end } = req.query;
  const monthStart = period_start || new Date().toISOString().substring(0, 7) + '-01';
  const monthEnd = period_end || new Date().toISOString().split('T')[0];

  const config = db.prepare('SELECT * FROM commission_config ORDER BY id DESC LIMIT 1').get();

  let vendorFilter = '';
  if (req.user.role === 'supervisor') {
    vendorFilter = `AND u.supervisor_id = ${req.user.id}`;
  }

  const vendors = db.prepare(`
    SELECT u.id, u.full_name, u.monthly_portability_goal as goal
    FROM users u WHERE u.role = 'vendedor' AND u.active = 1 ${vendorFilter}
    ORDER BY u.full_name
  `).all();

  const workbook = new ExcelJS.Workbook();

  // Summary sheet
  const summarySheet = workbook.addWorksheet('Resumen Comisiones');
  summarySheet.columns = [
    { header: 'Vendedor', key: 'vendor', width: 30 },
    { header: 'Meta', key: 'goal', width: 10 },
    { header: 'Portabilidades', key: 'ports', width: 15 },
    { header: 'Comisión Base', key: 'base', width: 15 },
    { header: 'Sobrecomisión', key: 'over', width: 15 },
    { header: 'Total', key: 'total', width: 15 }
  ];

  let grandTotal = 0;
  vendors.forEach(vendor => {
    const ports = db.prepare(`
      SELECT l.id, cp.commission
      FROM leads l JOIN claro_plans cp ON l.claro_plan_id = cp.id
      WHERE l.vendor_id = ? AND l.pipeline_status = 'portabilidad_exitosa'
        AND date(l.activation_date) >= ? AND date(l.activation_date) <= ?
    `).all(vendor.id, monthStart, monthEnd);

    const threshold = Math.ceil(vendor.goal * (config.overcommission_threshold_pct / 100));
    let base = 0, over = 0;
    ports.forEach((p, i) => {
      if (i < threshold) base += p.commission;
      else over += p.commission * config.overcommission_multiplier;
    });

    const total = Math.round((base + over) * 100) / 100;
    grandTotal += total;

    summarySheet.addRow({
      vendor: vendor.full_name, goal: vendor.goal,
      ports: ports.length, base: base.toFixed(2),
      over: over.toFixed(2), total: total.toFixed(2)
    });
  });

  summarySheet.addRow({});
  summarySheet.addRow({ vendor: 'TOTAL', total: grandTotal.toFixed(2) });

  // Style header
  summarySheet.getRow(1).font = { bold: true };
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDA291C' } };
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=comisiones_${monthStart}_${monthEnd}.xlsx`);
  await workbook.xlsx.write(res);
});

module.exports = router;
