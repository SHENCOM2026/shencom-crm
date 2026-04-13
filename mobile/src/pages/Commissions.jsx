import { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function Commissions() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => { loadCommissions(); }, [month]);

  const loadCommissions = async () => {
    setLoading(true);
    try {
      const [year, m] = month.split('-');
      const start = `${year}-${m}-01`;
      const end = new Date(parseInt(year), parseInt(m), 0).toISOString().split('T')[0];
      const result = await api.get(`/commissions/calculate?period_start=${start}&period_end=${end}`);
      setData(result);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const total = data?.vendors?.reduce((s, v) => s + (v.total_commission || 0), 0) || 0;
  const totalPort = data?.vendors?.reduce((s, v) => s + (v.portabilities || 0), 0) || 0;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">Comisiones</h1>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="text-sm border rounded-lg px-2 py-1" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card text-center">
              <p className="text-xs text-gray-500">Total Comisiones</p>
              <p className="text-2xl font-bold text-green-600 mt-1">${total.toFixed(2)}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-gray-500">Portabilidades</p>
              <p className="text-2xl font-bold text-claro-red mt-1">{totalPort}</p>
            </div>
          </div>

          {/* Vendor breakdown */}
          {data?.vendors?.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-700">Desglose por vendedor</h2>
              {data.vendors.map((v, i) => (
                <div key={i} className="card flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{v.vendor_name}</p>
                    <p className="text-xs text-gray-500">{v.portabilities} portabilidades · Meta: {v.goal || 0}</p>
                    {v.goal > 0 && (
                      <div className="w-32 h-1.5 bg-gray-200 rounded-full mt-1.5">
                        <div className="h-full bg-claro-red rounded-full transition-all"
                          style={{ width: `${Math.min((v.portabilities / v.goal) * 100, 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">${(v.total_commission || 0).toFixed(2)}</p>
                    {v.over_commission > 0 && (
                      <p className="text-[10px] text-orange-500">+${v.over_commission.toFixed(2)} bono</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">💰</p>
              <p className="text-sm">Sin datos para este periodo</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
