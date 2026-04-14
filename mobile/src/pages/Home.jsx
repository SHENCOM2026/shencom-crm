import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { getStatusInfo, timeAgo } from '../utils/constants';

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState(null);
  const [pendingLeads, setPendingLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [k, leads] = await Promise.all([
        api.get('/dashboard/kpis'),
        api.get('/leads?limit=10')
      ]);
      setKpis(k);
      // Show leads that need follow-up
      const pending = (leads.leads || leads || []).filter(l =>
        l.next_followup && new Date(l.next_followup) <= new Date()
      ).slice(0, 5);
      setPendingLeads(pending);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>;

  const today = new Date().toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="p-4 space-y-4">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Hola, {user?.full_name?.split(' ')[0]} 👋</h1>
        <p className="text-sm text-gray-500 capitalize">{today}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard title="Leads Hoy" value={kpis?.leads?.today || 0} icon="👥" color="bg-blue-50 text-blue-700" />
        <KpiCard title="Ventas" value={kpis?.sales?.month || 0}
          subtitle={`Meta: ${kpis?.sales?.goal || 0}`} icon="✅" color="bg-purple-50 text-purple-700" />
        <KpiCard title="Conversión" value={`${(kpis?.conversionRate || 0).toFixed(0)}%`}
          icon="📈" color="bg-orange-50 text-orange-700" />
        <KpiCard title="Pipeline USD" value={`$${(kpis?.pipelineOpenUSD || 0).toFixed(0)}`}
          icon="📋" color="bg-green-50 text-green-700" />
      </div>

      {/* Comisiones */}
      <div className="card">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Comisiones este mes</p>
          <span className="text-2xl font-bold text-green-600">${(kpis?.estimatedCommissions || 0).toFixed(2)}</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => navigate('/leads')}
          className="card flex flex-col items-center gap-1 py-3 active:bg-gray-50">
          <span className="text-2xl">➕</span>
          <span className="text-xs text-gray-600">Nuevo Lead</span>
        </button>
        <button onClick={() => navigate('/pipeline')}
          className="card flex flex-col items-center gap-1 py-3 active:bg-gray-50">
          <span className="text-2xl">📊</span>
          <span className="text-xs text-gray-600">Pipeline</span>
        </button>
        <button onClick={() => navigate('/commissions')}
          className="card flex flex-col items-center gap-1 py-3 active:bg-gray-50">
          <span className="text-2xl">💰</span>
          <span className="text-xs text-gray-600">Comisiones</span>
        </button>
      </div>

      {/* Pending Follow-ups */}
      {pendingLeads.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">⏰ Seguimientos pendientes</h2>
          <div className="space-y-2">
            {pendingLeads.map(lead => {
              const status = getStatusInfo(lead.pipeline_status);
              return (
                <button key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)}
                  className="card w-full text-left flex items-center gap-3 active:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{lead.full_name}</p>
                    <p className="text-xs text-gray-500">{lead.phone_primary}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ title, value, subtitle, icon, color }) {
  return (
    <div className="card flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{title}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <span className={`text-2xl font-bold ${color.split(' ')[1] || 'text-gray-900'}`}>{value}</span>
      {subtitle && <span className="text-[10px] text-gray-400 mt-0.5">{subtitle}</span>}
    </div>
  );
}
