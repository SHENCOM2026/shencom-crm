import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { getStatusInfo, PIPELINE_STATUSES, ACTIVITY_TYPES, ACTIVITY_RESULTS, formatDateTime } from '../utils/constants';
import toast from 'react-hot-toast';

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [tab, setTab] = useState('info');
  const [showActivity, setShowActivity] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadLead(); }, [id]);

  const loadLead = async () => {
    try {
      const [l, acts] = await Promise.all([
        api.get(`/leads/${id}`),
        api.get(`/activities/lead/${id}`)
      ]);
      setLead(l);
      setActivities(acts || []);
    } catch (e) { toast.error('Error al cargar lead'); }
    setLoading(false);
  };

  const updateStatus = async (newStatus) => {
    try {
      await api.put(`/leads/${id}`, { ...lead, pipeline_status: newStatus });
      toast.success('Estado actualizado');
      loadLead();
    } catch (e) { toast.error(e.message); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>;
  if (!lead) return <div className="text-center py-20 text-gray-400">Lead no encontrado</div>;

  const status = getStatusInfo(lead.pipeline_status);
  const phone = lead.phone_primary?.replace(/\D/g, '');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b p-4">
        <button onClick={() => navigate(-1)} className="text-claro-red text-sm mb-2 flex items-center gap-1">
          ← Volver
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold">{lead.full_name}</h1>
            <p className="text-sm text-gray-500">{lead.phone_primary} · {lead.operator_name || ''}</p>
            {lead.claro_plan_name && <p className="text-xs text-claro-red mt-0.5">{lead.claro_plan_name}</p>}
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 mt-3">
          <a href={`tel:${phone}`} className="flex-1 btn-primary text-center text-sm py-2 rounded-xl">📞 Llamar</a>
          <a href={`https://wa.me/593${phone?.slice(-9)}`} target="_blank" rel="noreferrer"
            className="flex-1 bg-green-500 text-white text-center text-sm py-2 rounded-xl font-medium">💬 WhatsApp</a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b">
        {['info', 'gestiones'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors
              ${tab === t ? 'border-claro-red text-claro-red' : 'border-transparent text-gray-400'}`}>
            {t === 'info' ? '📋 Info' : `📝 Gestiones (${activities.length})`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab === 'info' ? (
          <>
            <InfoRow label="Cédula / RUC" value={lead.cedula} />
            <InfoRow label="Tel. secundario" value={lead.phone_secondary} />
            <InfoRow label="Email" value={lead.email} />
            <InfoRow label="Operador origen" value={lead.operator_name} />
            <InfoRow label="Plan actual" value={lead.current_plan} />
            <InfoRow label="Plan Claro ofrecido" value={lead.claro_plan_name} />
            <InfoRow label="Fuente" value={lead.source_name} />
            <InfoRow label="Vendedor" value={lead.vendor_name} />
            <InfoRow label="Creado" value={formatDateTime(lead.created_at)} />

            {/* Prospect data */}
            {(lead.lines_to_port > 0 || (lead.prospect_plans && lead.prospect_plans.length > 0)) && (
              <div className="card">
                <p className="text-xs text-gray-500 mb-2 font-medium">Prospección</p>
                {lead.lines_to_port > 0 && (
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Líneas a portar:</span>
                    <span className="font-semibold">{lead.lines_to_port}</span>
                  </div>
                )}
                {lead.prospect_plans && lead.prospect_plans.map((pp, i) => (
                  <div key={i} className="flex justify-between text-sm bg-gray-50 rounded px-2 py-1 mb-1">
                    <span className="text-gray-700 truncate">{pp.plan_name}</span>
                    <span className="font-medium ml-2">${parseFloat(pp.plan_price).toFixed(2)}</span>
                  </div>
                ))}
                {lead.prospect_total > 0 && (
                  <div className="flex justify-between text-sm bg-red-50 rounded-lg px-3 py-2 mt-1">
                    <span className="text-claro-red font-medium">Total:</span>
                    <span className="text-claro-red font-bold">${parseFloat(lead.prospect_total).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {lead.notes && <div className="card"><p className="text-xs text-gray-500 mb-1">Notas</p><p className="text-sm">{lead.notes}</p></div>}

            {/* Change status */}
            <div className="card">
              <p className="text-xs text-gray-500 mb-2">Cambiar estado</p>
              <select value={lead.pipeline_status} onChange={e => updateStatus(e.target.value)}
                className="select-field text-sm">
                {PIPELINE_STATUSES.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
              </select>
            </div>
          </>
        ) : (
          <>
            {activities.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <p className="text-3xl mb-2">📝</p>
                <p className="text-sm">Sin gestiones registradas</p>
              </div>
            ) : (
              activities.map(act => (
                <div key={act.id} className="card">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      {ACTIVITY_TYPES.find(t => t.key === act.activity_type)?.icon}{' '}
                      {ACTIVITY_TYPES.find(t => t.key === act.activity_type)?.label}
                    </span>
                    <span className="text-[10px] text-gray-400">{formatDateTime(act.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {ACTIVITY_RESULTS.find(r => r.key === act.result)?.label}
                    {act.duration ? ` · ${act.duration} min` : ''}
                  </p>
                  {act.notes && <p className="text-sm mt-1 text-gray-700">{act.notes}</p>}
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* FAB - Register activity */}
      <button onClick={() => setShowActivity(true)}
        className="fixed bottom-6 right-4 bg-claro-red text-white rounded-full shadow-lg px-5 py-3 flex items-center gap-2 text-sm font-medium active:bg-claro-red-dark z-20">
        📝 Registrar gestión
      </button>

      {showActivity && (
        <ActivityModal leadId={id} onClose={() => setShowActivity(false)} onSave={() => { setShowActivity(false); loadLead(); }} />
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 text-right">{value}</span>
    </div>
  );
}

function ActivityModal({ leadId, onClose, onSave }) {
  const [form, setForm] = useState({
    activity_type: 'llamada_saliente', result: 'contacto_efectivo',
    duration: '', notes: '', next_action: ''
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/activities', { ...form, lead_id: leadId, duration: form.duration ? parseInt(form.duration) : null });
      toast.success('Gestión registrada');
      onSave();
    } catch (err) { toast.error(err.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h3 className="font-semibold">Nueva Gestión</h3>
          <button onClick={onClose} className="text-gray-400 text-xl p-2">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
            <div className="grid grid-cols-3 gap-1.5">
              {ACTIVITY_TYPES.map(t => (
                <button key={t.key} type="button" onClick={() => set('activity_type', t.key)}
                  className={`p-2 rounded-xl text-xs text-center transition-colors
                    ${form.activity_type === t.key ? 'bg-claro-red text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {t.icon}<br/>{t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Resultado</label>
            <select className="select-field text-sm" value={form.result} onChange={e => set('result', e.target.value)}>
              {ACTIVITY_RESULTS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          {form.activity_type.includes('llamada') && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Duración (min)</label>
              <input type="number" className="input-field text-sm" placeholder="Minutos"
                value={form.duration} onChange={e => set('duration', e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notas</label>
            <textarea className="input-field text-sm" rows={3} placeholder="Describe la gestión..."
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? 'Guardando...' : 'Registrar Gestión'}
          </button>
        </form>
      </div>
    </div>
  );
}
