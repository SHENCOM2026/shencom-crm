const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const ExcelJS = require('exceljs');
const { stringify } = require('csv-stringify/sync');

const router = express.Router();
router.use(authMiddleware);

function getVF(user) {
  if (user.role === 'vendedor') return `AND l.vendor_id = ${user.id}`;
  if (user.role === 'supervisor') return `AND l.vendor_id IN (SELECT id FROM users WHERE supervisor_id = ${user.id})`;
  return '';
}

function getAF(user) {
  if (user.role === 'vendedor') return `AND a.user_id = ${user.id}`;
  if (user.role === 'supervisor') return `AND a.user_id IN (SELECT id FROM users WHERE supervisor_id = ${user.id})`;
  return '';
}

// Daily management report
router.get('/daily', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const af = getAF(req.user);

  const data = db.prepare(`
    SELECT u.full_name as vendedor,
      COUNT(CASE WHEN a.activity_type IN ('llamada_saliente','llamada_entrante') THEN 1 END) as llamadas,
      COUNT(CASE WHEN a.result = 'contacto_efectivo' THEN 1 END) as contactos_efectivos,
      COUNT(CASE WHEN a.result = 'no_contesta' THEN 1 END) as no_contesta,
      COUNT(CASE WHEN a.result = 'cerro_venta' THEN 1 END) as ventas,
      COUNT(CASE WHEN a.result = 'agendo_callback' THEN 1 END) as callbacks,
      COUNT(*) as total_gestiones
    FROM lead_activities a
    JOIN users u ON a.user_id = u.id
    WHERE date(a.created_at) = ? ${af}
    GROUP BY u.id ORDER BY llamadas DESC
  `).all(date);

  res.json(data);
});

// Portability report
router.get('/portabilities', (req, res) => {
  const { start, end } = req.query;
  const vf = getVF(req.user);
  const dateStart = start || new Date().toISOString().substring(0, 7) + '-01';
  const dateEnd = end || new Date().toISOString().split('T')[0];

  const data = db.prepare(`
    SELECT l.full_name as cliente, l.phone_primary as telefono, l.cedula,
      o.name as operador_origen, cp.name as plan_claro, v.full_name as vendedor,
      l.claro_request_number as numero_solicitud, l.activation_date as fecha_activacion,
      cp.commission as comision
    FROM leads l
    JOIN users v ON l.vendor_id = v.id
    LEFT JOIN origin_operators o ON l.operator_origin_id = o.id
    LEFT JOIN claro_plans cp ON l.claro_plan_id = cp.id
    WHERE l.pipeline_status = 'portabilidad_exitosa'
      AND date(l.activation_date) >= ? AND date(l.activation_date) <= ? ${vf}
    ORDER BY l.activation_date DESC
  `).all(dateStart, dateEnd);

  res.json(data);
});

// Leads by source
router.get('/by-source', (req, res) => {
  const vf = getVF(req.user);
  const data = db.prepare(`
    SELECT ls.name as fuente,
      COUNT(*) as total,
      COUNT(CASE WHEN l.pipeline_status = 'portabilidad_exitosa' THEN 1 END) as exitosas,
      ROUND(COUNT(CASE WHEN l.pipeline_status = 'portabilidad_exitosa' THEN 1 END) * 100.0 / COUNT(*), 1) as tasa_conversion
    FROM leads l
    LEFT JOIN lead_sources ls ON l.source_id = ls.id
    WHERE 1=1 ${vf}
    GROUP BY l.source_id
    ORDER BY tasa_conversion DESC
  `).all();
  res.json(data);
});

// Pipeline aging
router.get('/aging', (req, res) => {
  const vf = getVF(req.user);
  const days = req.query.days || 2;

  const data = db.prepare(`
    SELECT l.id, l.full_name, l.phone_primary, l.pipeline_status,
      v.full_name as vendedor, l.updated_at as ultima_gestion,
      CAST(julianday('now') - julianday(l.updated_at) AS INTEGER) as dias_sin_gestion
    FROM leads l
    JOIN users v ON l.vendor_id = v.id
    WHERE l.pipeline_status NOT IN ('portabilidad_exitosa', 'rechazado_perdido')
      AND julianday('now') - julianday(l.updated_at) >= ? ${vf}
    ORDER BY dias_sin_gestion DESC
  `).all(days);

  res.json(data);
});

// Average pipeline time
router.get('/pipeline-time', (req, res) => {
  const vf = getVF(req.user);
  const data = db.prepare(`
    SELECT
      ROUND(AVG(julianday(l.activation_date) - julianday(l.created_at)), 1) as avg_days,
      MIN(CAST(julianday(l.activation_date) - julianday(l.created_at) AS INTEGER)) as min_days,
      MAX(CAST(julianday(l.activation_date) - julianday(l.created_at) AS INTEGER)) as max_days,
      COUNT(*) as total
    FROM leads l
    WHERE l.pipeline_status = 'portabilidad_exitosa'
      AND l.activation_date IS NOT NULL ${vf}
  `).get();
  res.json(data);
});

// Export report to Excel
router.get('/export/:type', async (req, res) => {
  const { type } = req.params;
  const { start, end, date } = req.query;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Reporte');

  let data = [];
  let columns = [];

  if (type === 'daily') {
    const af = getAF(req.user);
    const d = date || new Date().toISOString().split('T')[0];
    data = db.prepare(`
      SELECT u.full_name as Vendedor,
        COUNT(CASE WHEN a.activity_type IN ('llamada_saliente','llamada_entrante') THEN 1 END) as Llamadas,
        COUNT(CASE WHEN a.result = 'contacto_efectivo' THEN 1 END) as Contactos_Efectivos,
        COUNT(CASE WHEN a.result = 'no_contesta' THEN 1 END) as No_Contesta,
        COUNT(CASE WHEN a.result = 'cerro_venta' THEN 1 END) as Ventas,
        COUNT(*) as Total_Gestiones
      FROM lead_activities a JOIN users u ON a.user_id = u.id
      WHERE date(a.created_at) = ? ${af}
      GROUP BY u.id ORDER BY Llamadas DESC
    `).all(d);
    columns = [
      { header: 'Vendedor', key: 'Vendedor', width: 30 },
      { header: 'Llamadas', key: 'Llamadas', width: 12 },
      { header: 'Contactos Efectivos', key: 'Contactos_Efectivos', width: 18 },
      { header: 'No Contesta', key: 'No_Contesta', width: 12 },
      { header: 'Ventas', key: 'Ventas', width: 10 },
      { header: 'Total Gestiones', key: 'Total_Gestiones', width: 15 }
    ];
  } else if (type === 'portabilities') {
    const vf = getVF(req.user);
    const s = start || new Date().toISOString().substring(0, 7) + '-01';
    const e = end || new Date().toISOString().split('T')[0];
    data = db.prepare(`
      SELECT l.full_name as Cliente, l.cedula as Cedula, l.phone_primary as Telefono,
        o.name as Operador_Origen, cp.name as Plan_Claro, v.full_name as Vendedor,
        l.claro_request_number as Numero_Solicitud, l.activation_date as Fecha_Activacion,
        cp.commission as Comision
      FROM leads l JOIN users v ON l.vendor_id = v.id
      LEFT JOIN origin_operators o ON l.operator_origin_id = o.id
      LEFT JOIN claro_plans cp ON l.claro_plan_id = cp.id
      WHERE l.pipeline_status = 'portabilidad_exitosa'
        AND date(l.activation_date) >= ? AND date(l.activation_date) <= ? ${vf}
      ORDER BY l.activation_date DESC
    `).all(s, e);
    columns = [
      { header: 'Cliente', key: 'Cliente', width: 25 },
      { header: 'Cédula', key: 'Cedula', width: 15 },
      { header: 'Teléfono', key: 'Telefono', width: 15 },
      { header: 'Operador Origen', key: 'Operador_Origen', width: 15 },
      { header: 'Plan Claro', key: 'Plan_Claro', width: 25 },
      { header: 'Vendedor', key: 'Vendedor', width: 25 },
      { header: 'No. Solicitud', key: 'Numero_Solicitud', width: 15 },
      { header: 'Fecha Activación', key: 'Fecha_Activacion', width: 15 },
      { header: 'Comisión', key: 'Comision', width: 12 }
    ];
  } else if (type === 'by-source') {
    const vf = getVF(req.user);
    data = db.prepare(`
      SELECT COALESCE(ls.name, 'Sin fuente') as Fuente,
        COUNT(*) as Total_Leads,
        COUNT(CASE WHEN l.pipeline_status = 'portabilidad_exitosa' THEN 1 END) as Exitosas,
        ROUND(COUNT(CASE WHEN l.pipeline_status = 'portabilidad_exitosa' THEN 1 END) * 100.0 / COUNT(*), 1) as Tasa_Conversion
      FROM leads l LEFT JOIN lead_sources ls ON l.source_id = ls.id
      WHERE 1=1 ${vf} GROUP BY l.source_id ORDER BY Tasa_Conversion DESC
    `).all();
    columns = [
      { header: 'Fuente', key: 'Fuente', width: 25 },
      { header: 'Total Leads', key: 'Total_Leads', width: 12 },
      { header: 'Exitosas', key: 'Exitosas', width: 12 },
      { header: 'Tasa Conversión %', key: 'Tasa_Conversion', width: 18 }
    ];
  } else {
    return res.status(400).json({ error: 'Tipo de reporte inválido' });
  }

  sheet.columns = columns;
  data.forEach(row => sheet.addRow(row));

  // Style header
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDA291C' } };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=reporte_${type}_${new Date().toISOString().split('T')[0]}.xlsx`);
  await workbook.xlsx.write(res);
});

module.exports = router;
