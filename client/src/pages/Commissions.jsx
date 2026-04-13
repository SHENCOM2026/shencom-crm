import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Commissions() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodStart, setPeriodStart] = useState(() => new Date().toISOString().substring(0, 7) + '-01');
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => { fetchCommissions(); }, [periodStart, periodEnd]);

  const fetchCommissions = async () => {
    try {
      const res = await api.get(`/commissions/calculate?period_start=${periodStart}&period_end=${periodEnd}`);
      setData(res);
    } catch (e) { toast.error('Error cargando comisiones'); }
    finally { setLoading(false); }
  };

  const handleExport = async () => {
    try {
      await api.download(`/commissions/export?period_start=${periodStart}&period_end=${periodEnd}`, `comisiones_${periodStart}.xlsx`);
      toast.success('Reporte exportado');
    } catch (e) { toast.error('Error al exportar'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>;

  const results = data?.results || [];
  const chartData = results.map(r => ({ name: r.vendor_name.split(' ')[0], comision: r.total_commission, portabilidades: r.total_portabilities }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Comisiones</h1>
        <div className="flex items-center gap-3">
          <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-claro-red outline-none" />
          <span className="text-gray-400">—</span>
          <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-claro-red outline-none" />
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">
            ⬇ Excel
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <p className="text-sm text-gray-500">Total Portabilidades</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{results.reduce((s, r) => s + r.total_portabilities, 0)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <p className="text-sm text-gray-500">Total Comisiones</p>
          <p className="text-2xl font-bold text-claro-red mt-1">${(data?.total || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <p className="text-sm text-gray-500">Promedio por Vendedor</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">${results.length ? (data.total / results.length).toFixed(2) : '0.00'}</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Comisiones por Vendedor</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, 'Comisión']} />
              <Bar dataKey="comision" fill="#DA291C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detail Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Vendedor</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Portabilidades</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Meta</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">% Meta</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Com. Base</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Sobre-com.</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {results.map(r => {
              const pctMeta = r.goal > 0 ? ((r.total_portabilities / r.goal) * 100).toFixed(0) : 0;
              return (
                <tr key={r.vendor_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.vendor_name}</td>
                  <td className="px-4 py-3 text-center">{r.total_portabilities}</td>
                  <td className="px-4 py-3 text-center">{r.goal}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      pctMeta >= 100 ? 'bg-green-100 text-green-700' :
                      pctMeta >= 80 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>{pctMeta}%</span>
                  </td>
                  <td className="px-4 py-3 text-right">${r.base_commission.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">${r.over_commission.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-claro-red">${r.total_commission.toFixed(2)}</td>
                </tr>
              );
            })}
            {results.length === 0 && (
              <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-500">Sin datos para este periodo</td></tr>
            )}
          </tbody>
        </table>

        {/* Expandable breakdowns */}
        {results.filter(r => r.portabilities.length > 0).map(r => (
          <details key={`bd-${r.vendor_id}`} className="border-t">
            <summary className="px-4 py-2 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-50">
              Desglose: {r.vendor_name} ({r.portabilities.length} portabilidades)
            </summary>
            <div className="px-4 pb-3">
              <table className="w-full text-xs">
                <thead><tr className="text-gray-500">
                  <th className="py-1 text-left">Cliente</th>
                  <th className="py-1 text-left">Plan</th>
                  <th className="py-1 text-left">Fecha</th>
                  <th className="py-1 text-right">Comisión</th>
                </tr></thead>
                <tbody>
                  {r.portabilities.map(p => (
                    <tr key={p.id}>
                      <td className="py-1">{p.lead_name}</td>
                      <td className="py-1">{p.plan_name}</td>
                      <td className="py-1">{p.activation_date}</td>
                      <td className="py-1 text-right">${p.plan_commission.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
