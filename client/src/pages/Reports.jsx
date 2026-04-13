import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#DA291C', '#333333', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];

const reportTypes = [
  { id: 'daily', name: 'Reporte Diario de Gestión', desc: 'Llamadas y resultados por vendedor' },
  { id: 'portabilities', name: 'Portabilidades', desc: 'Portabilidades completadas por periodo' },
  { id: 'by-source', name: 'Leads por Fuente', desc: 'Análisis de conversión por fuente' },
  { id: 'pipeline-time', name: 'Tiempo en Pipeline', desc: 'Días promedio para cerrar un lead' },
  { id: 'aging', name: 'Aging de Leads', desc: 'Leads sin gestión reciente' },
];

export default function Reports() {
  const [activeReport, setActiveReport] = useState('daily');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => { fetchReport(); }, [activeReport, dateRange]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = `start=${dateRange.start}&end=${dateRange.end}&date=${dateRange.end}`;
      const res = await api.get(`/reports/${activeReport}?${params}`);
      setData(res);
    } catch (e) { toast.error('Error cargando reporte'); }
    finally { setLoading(false); }
  };

  const handleExport = async (format) => {
    const exportable = ['daily', 'portabilities', 'by-source'];
    if (!exportable.includes(activeReport)) {
      toast.error('Este reporte no soporta exportación aún');
      return;
    }
    try {
      const params = `start=${dateRange.start}&end=${dateRange.end}&date=${dateRange.end}`;
      await api.download(`/reports/export/${activeReport}?${params}`, `reporte_${activeReport}.xlsx`);
      toast.success('Reporte exportado');
    } catch (e) { toast.error('Error al exportar'); }
  };

  const renderReport = () => {
    if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>;
    if (!data) return null;

    switch (activeReport) {
      case 'daily':
        return (
          <div className="space-y-4">
            {Array.isArray(data) && data.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Gestiones por Vendedor</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="vendedor" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="llamadas" name="Llamadas" fill="#DA291C" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="contactos_efectivos" name="Efectivas" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Vendedor</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Gestiones</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Llamadas</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Efectivas</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">No Contesta</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Ventas</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(Array.isArray(data) ? data : []).map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{r.vendedor}</td>
                      <td className="px-4 py-3 text-center">{r.total_gestiones}</td>
                      <td className="px-4 py-3 text-center">{r.llamadas}</td>
                      <td className="px-4 py-3 text-center">{r.contactos_efectivos}</td>
                      <td className="px-4 py-3 text-center">{r.no_contesta}</td>
                      <td className="px-4 py-3 text-center font-semibold text-green-600">{r.ventas}</td>
                    </tr>
                  ))}
                  {(!Array.isArray(data) || data.length === 0) && (
                    <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">Sin datos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'portabilities':
        return (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Teléfono</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Operador</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Plan Claro</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Vendedor</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">N° Solicitud</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">F. Activación</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(Array.isArray(data) ? data : []).map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.cliente}</td>
                    <td className="px-4 py-3">{r.telefono}</td>
                    <td className="px-4 py-3">{r.operador_origen || '—'}</td>
                    <td className="px-4 py-3">{r.plan_claro || '—'}</td>
                    <td className="px-4 py-3">{r.vendedor}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.numero_solicitud || '—'}</td>
                    <td className="px-4 py-3">{r.fecha_activacion || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold">${(r.comision || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {(!Array.isArray(data) || data.length === 0) && (
                  <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );

      case 'by-source':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Array.isArray(data) && data.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribución por Fuente</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={data.map(d => ({ name: d.fuente || 'Sin fuente', value: d.total }))}
                      cx="50%" cy="50%" outerRadius={100} dataKey="value"
                      label={({ name, percent }) => percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''}>
                      {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Fuente</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Total</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Exitosas</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">Tasa Conv.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(Array.isArray(data) ? data : []).map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{r.fuente || 'Sin fuente'}</td>
                      <td className="px-4 py-3 text-center">{r.total}</td>
                      <td className="px-4 py-3 text-center">{r.exitosas}</td>
                      <td className="px-4 py-3 text-center font-semibold">{r.tasa_conversion}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'pipeline-time':
        return (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Tiempo Promedio en Pipeline</h3>
            {data ? (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-claro-red">{data.avg_days || 0}</p>
                  <p className="text-sm text-gray-500 mt-1">Promedio (días)</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">{data.min_days || 0}</p>
                  <p className="text-sm text-gray-500 mt-1">Mínimo</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-amber-600">{data.max_days || 0}</p>
                  <p className="text-sm text-gray-500 mt-1">Máximo</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-700">{data.total || 0}</p>
                  <p className="text-sm text-gray-500 mt-1">Portabilidades</p>
                </div>
              </div>
            ) : <p className="text-gray-500 text-center">Sin datos</p>}
          </div>
        );

      case 'aging':
        return (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Lead</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Vendedor</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Días sin Gestión</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Última Gestión</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(Array.isArray(data) ? data : []).map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.full_name}</td>
                    <td className="px-4 py-3 text-gray-500">{r.vendedor || '—'}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{r.pipeline_status}</span></td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        r.dias_sin_gestion > 7 ? 'bg-red-100 text-red-700' :
                        r.dias_sin_gestion > 3 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>{r.dias_sin_gestion} días</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.ultima_gestion || 'Nunca'}</td>
                  </tr>
                ))}
                {(!Array.isArray(data) || data.length === 0) && (
                  <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500">Sin leads pendientes</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <div className="flex items-center gap-3">
          <input type="date" value={dateRange.start} onChange={e => setDateRange(d => ({ ...d, start: e.target.value }))}
            className="text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-claro-red outline-none" />
          <span className="text-gray-400">—</span>
          <input type="date" value={dateRange.end} onChange={e => setDateRange(d => ({ ...d, end: e.target.value }))}
            className="text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-claro-red outline-none" />
          <button onClick={() => handleExport('excel')} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">
            ⬇ Excel
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {reportTypes.map(rt => (
          <button key={rt.id} onClick={() => setActiveReport(rt.id)}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeReport === rt.id ? 'bg-claro-red text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}>
            <div>{rt.name}</div>
            <div className={`text-xs ${activeReport === rt.id ? 'text-red-200' : 'text-gray-400'}`}>{rt.desc}</div>
          </button>
        ))}
      </div>

      {renderReport()}
    </div>
  );
}
