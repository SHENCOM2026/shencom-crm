import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { api } from '../utils/api';
import { PIPELINE_STATUSES, getStatusInfo } from '../utils/constants';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = ['#3B82F6', '#EAB308', '#A855F7', '#F97316', '#06B6D4', '#22C55E', '#EF4444'];

function KPICard({ title, value, subtitle, icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className="p-2.5 bg-red-50 rounded-lg text-xl">{icon}</div>
      </div>
    </div>
  );
}

function USDCard({ title, value, icon, colorClass }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${colorClass || 'text-gray-900'}`}>${value.toFixed(2)}</p>
        </div>
        <div className="p-2.5 bg-green-50 rounded-lg text-xl">{icon}</div>
      </div>
    </div>
  );
}

function VendorDashboard() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState(null);
  const [pipelineDist, setPipelineDist] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [k, p] = await Promise.all([
          api.get('/dashboard/kpis'),
          api.get('/dashboard/pipeline')
        ]);
        setKpis(k);
        setPipelineDist(p.map(item => {
          const info = getStatusInfo(item.status);
          return { name: info.label, value: item.count };
        }));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>;

  const salesMonth = kpis?.sales?.month || 0;
  const goal = kpis?.sales?.goal || 0;
  const pctMeta = goal > 0 ? ((salesMonth / goal) * 100).toFixed(0) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mi Dashboard</h1>

      {kpis && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Leads Hoy" value={kpis.leads.today} subtitle={`Semana: ${kpis.leads.week} | Mes: ${kpis.leads.month}`} icon="👥" />
            <KPICard title="Mis Ventas" value={salesMonth} subtitle={`Meta: ${goal}`} icon="✅" />
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Avance Meta</p>
                  <p className={`text-2xl font-bold mt-1 ${pctMeta >= 100 ? 'text-green-600' : pctMeta >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>{pctMeta}%</p>
                </div>
                <div className="p-2.5 bg-red-50 rounded-lg text-xl">🎯</div>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full mt-3">
                <div className="h-full bg-claro-red rounded-full transition-all" style={{ width: `${Math.min(pctMeta, 100)}%` }} />
              </div>
            </div>
            <KPICard title="Comisiones Est." value={`$${kpis.estimatedCommissions.toFixed(2)}`} subtitle="Este mes" icon="💰" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <USDCard title="Mi Pipeline" value={kpis.pipelineOpenUSD} icon="📋" colorClass="text-blue-600" />
            <USDCard title="Mis Ventas USD" value={kpis.salesClosedUSD} icon="🏆" colorClass="text-green-600" />
            <USDCard title="Proyección USD" value={kpis.projectionTotalUSD} icon="🎯" colorClass="text-claro-red" />
          </div>
        </>
      )}

      {pipelineDist.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Mis Leads por Estado</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pipelineDist} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value"
                label={({ name, percent }) => percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''}>
                {pipelineDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState(null);
  const [pipelineDist, setPipelineDist] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [trend, setTrend] = useState({ calls: [], closings: [] });
  const [loading, setLoading] = useState(true);
  const [vendorFilter, setVendorFilter] = useState('');
  const [vendors, setVendors] = useState([]);

  if (user?.role === 'vendedor') return <VendorDashboard />;

  useEffect(() => {
    api.get('/users/vendors').then(setVendors).catch(() => {});
  }, []);

  useEffect(() => {
    fetchAll();
  }, [vendorFilter]);

  const fetchAll = async () => {
    try {
      const vParam = vendorFilter ? `?vendor_id=${vendorFilter}` : '';
      const [k, p, r, t] = await Promise.all([
        api.get(`/dashboard/kpis${vParam}`),
        api.get(`/dashboard/pipeline${vParam}`),
        api.get('/dashboard/ranking'),
        api.get('/dashboard/trend')
      ]);
      setKpis(k);
      setPipelineDist(p.map(item => {
        const info = getStatusInfo(item.status);
        return { name: info.label, value: item.count };
      }));
      setRanking(r);

      // Merge trend data
      const dayMap = {};
      t.calls.forEach(c => { dayMap[c.day] = { date: c.day.slice(5), calls: c.count, closings: 0 }; });
      t.closings.forEach(c => {
        if (dayMap[c.day]) dayMap[c.day].closings = c.count;
        else dayMap[c.day] = { date: c.day.slice(5), calls: 0, closings: c.count };
      });
      setTrend(Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>;

  const metaVsReal = ranking.map(v => ({
    name: v.name.split(' ')[0],
    meta: v.goal || 0,
    real: v.sales || 0
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Gerencial</h1>
        <select
          value={vendorFilter}
          onChange={e => setVendorFilter(e.target.value)}
          className="text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-claro-red outline-none"
        >
          <option value="">Todos los vendedores</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
        </select>
      </div>

      {kpis && (
        <>
          {/* KPI Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="Leads Hoy" value={kpis.leads.today} subtitle={`Semana: ${kpis.leads.week} | Mes: ${kpis.leads.month}`} icon="👥" />
            <KPICard title="Ventas" value={kpis.sales.month} subtitle={`Meta: ${kpis.sales.goal}`} icon="✅" />
            <KPICard title="Tasa Conversión" value={`${kpis.conversionRate}%`} subtitle="Leads → Venta" icon="📈" />
            <KPICard title="Comisiones Est." value={`$${kpis.estimatedCommissions.toFixed(2)}`} subtitle="Este mes" icon="💰" />
          </div>

          {/* USD Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <USDCard title="Pipeline abierto" value={kpis.pipelineOpenUSD} icon="📋" colorClass="text-blue-600" />
            <USDCard title="Ventas cerradas" value={kpis.salesClosedUSD} icon="🏆" colorClass="text-green-600" />
            <USDCard title="Proyección total USD" value={kpis.projectionTotalUSD} icon="🎯" colorClass="text-claro-red" />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Ventas por Vendedor (Ranking)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ranking.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="sales" name="Ventas" fill="#DA291C" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Daily Trend */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Tendencia Diaria (30 días)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="calls" name="Llamadas" stroke="#DA291C" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="closings" name="Cierres" stroke="#10B981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Pipeline Distribution */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribución de Leads por Estado</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pipelineDist}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) => percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''}
              >
                {pipelineDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Meta vs Real */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Meta vs Real por Vendedor</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metaVsReal.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="meta" name="Meta" fill="#E5E7EB" radius={[4, 4, 0, 0]} />
              <Bar dataKey="real" name="Real" fill="#DA291C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
