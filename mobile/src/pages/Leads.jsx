import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { PIPELINE_STATUSES, getStatusInfo } from '../utils/constants';
import toast from 'react-hot-toast';

export default function Leads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [operators, setOperators] = useState([]);
  const [plans, setPlans] = useState([]);
  const [sources, setSources] = useState([]);

  useEffect(() => { loadLeads(); loadConfig(); }, [search, statusFilter]);

  const loadConfig = async () => {
    try {
      const [ops, pls, src] = await Promise.all([
        api.get('/config/operators'), api.get('/config/plans'), api.get('/config/sources')
      ]);
      setOperators(ops); setPlans(pls); setSources(src);
    } catch (e) {}
  };

  const loadLeads = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const data = await api.get(`/leads?${params}`);
      setLeads(data.leads || data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 bg-white border-b space-y-2 sticky top-0 z-10">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar nombre, cédula, teléfono..."
          className="input-field text-sm" />
        {/* Status filter chips */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button onClick={() => setStatusFilter('')}
            className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors
              ${!statusFilter ? 'bg-claro-red text-white' : 'bg-gray-100 text-gray-600'}`}>
            Todos
          </button>
          {PIPELINE_STATUSES.map(s => (
            <button key={s.key} onClick={() => setStatusFilter(s.key)}
              className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors
                ${statusFilter === s.key ? 'bg-claro-red text-white' : 'bg-gray-100 text-gray-600'}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lead list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div>
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-2">📭</p>
            <p className="text-sm">No se encontraron leads</p>
          </div>
        ) : (
          <div className="divide-y">
            {leads.map(lead => {
              const status = getStatusInfo(lead.pipeline_status);
              return (
                <button key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-gray-50">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dotColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{lead.full_name}</p>
                    <p className="text-xs text-gray-500">{lead.phone_primary} · {lead.operator_name || 'Sin operador'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
                    {lead.claro_plan_name && <p className="text-[10px] text-claro-red mt-0.5">{lead.claro_plan_name}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB - New Lead */}
      <button onClick={() => setShowNew(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-claro-red text-white rounded-full shadow-lg flex items-center justify-center text-2xl active:bg-claro-red-dark z-20">
        +
      </button>

      {/* New Lead Modal */}
      {showNew && (
        <NewLeadModal operators={operators} plans={plans} sources={sources}
          onClose={() => setShowNew(false)} onSave={() => { setShowNew(false); loadLeads(); }} />
      )}
    </div>
  );
}

function NewLeadModal({ operators, plans, sources, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name: '', cedula: '', phone_primary: '', phone_secondary: '', email: '',
    operator_origin_id: '', current_plan: '', claro_plan_id: '', source_id: '',
    pipeline_status: 'lead_nuevo', notes: '', lines_to_port: ''
  });
  const [prospectPlans, setProspectPlans] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const prospectTotal = prospectPlans.reduce((sum, p) => sum + (parseFloat(p.plan_price) || 0), 0);

  const addPlan = () => setProspectPlans(prev => [...prev, { plan_name: '', plan_price: '' }]);
  const removePlan = (i) => setProspectPlans(prev => prev.filter((_, idx) => idx !== i));
  const updatePlan = (i, field, val) => setProspectPlans(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.phone_primary) { toast.error('Nombre y teléfono son requeridos'); return; }
    // Validate plans
    for (let i = 0; i < prospectPlans.length; i++) {
      if (!prospectPlans[i].plan_name?.trim()) { toast.error(`Plan ${i+1}: ingrese el nombre`); return; }
      if (!prospectPlans[i].plan_price && prospectPlans[i].plan_price !== 0) { toast.error(`Plan ${i+1}: ingrese la tarifa`); return; }
    }
    setSaving(true);
    try {
      await api.post('/leads', { ...form, prospect_plans: prospectPlans });
      toast.success('Lead creado');
      onSave();
    } catch (err) { toast.error(err.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h3 className="font-semibold text-lg">Nuevo Lead</h3>
          <button onClick={onClose} className="text-gray-400 text-xl p-2">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <input className="input-field" placeholder="Nombre completo *" value={form.full_name}
            onChange={e => set('full_name', e.target.value)} required />
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field" placeholder="Cédula / RUC" value={form.cedula}
              onChange={e => set('cedula', e.target.value)} />
            <input className="input-field" placeholder="Teléfono *" type="tel" value={form.phone_primary}
              onChange={e => set('phone_primary', e.target.value)} required />
          </div>
          <input className="input-field" placeholder="Email" type="email" value={form.email}
            onChange={e => set('email', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className="select-field" value={form.operator_origin_id} onChange={e => set('operator_origin_id', e.target.value)}>
              <option value="">Operador origen</option>
              {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select className="select-field" value={form.claro_plan_id} onChange={e => set('claro_plan_id', e.target.value)}>
              <option value="">Plan Claro</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <select className="select-field" value={form.source_id} onChange={e => set('source_id', e.target.value)}>
            <option value="">Fuente del lead</option>
            {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          {/* Prospección */}
          <div className="border-t pt-3">
            <p className="text-sm font-semibold text-gray-700 mb-2">Prospección</p>
            <input className="input-field" placeholder="Líneas a portar" type="number" min="0" value={form.lines_to_port}
              onChange={e => set('lines_to_port', e.target.value)} />
            <div className="flex items-center justify-between mt-2 mb-1">
              <p className="text-xs text-gray-500">Planes prospectados</p>
              <button type="button" onClick={addPlan} className="text-xs text-green-600 font-medium">+ Agregar</button>
            </div>
            {prospectPlans.map((pp, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input className="input-field flex-1 text-sm" placeholder="Nombre plan" value={pp.plan_name}
                  onChange={e => updatePlan(i, 'plan_name', e.target.value)} />
                <input className="input-field w-24 text-sm" placeholder="$0.00" type="number" min="0" step="0.01"
                  value={pp.plan_price} onChange={e => updatePlan(i, 'plan_price', e.target.value)} />
                <button type="button" onClick={() => removePlan(i)} className="text-red-400 p-1">✕</button>
              </div>
            ))}
            {prospectPlans.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-2 flex justify-between items-center">
                <span className="text-xs text-gray-500">Total prospectado:</span>
                <span className="text-sm font-bold text-claro-red">${prospectTotal.toFixed(2)}</span>
              </div>
            )}
          </div>

          <textarea className="input-field" placeholder="Notas" rows={2} value={form.notes}
            onChange={e => set('notes', e.target.value)} />
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? 'Guardando...' : 'Crear Lead'}
          </button>
        </form>
      </div>
    </div>
  );
}
