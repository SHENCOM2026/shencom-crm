import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { ACTIVITY_TYPES, ACTIVITY_RESULTS, getStatusInfo, formatDate, formatDateTime } from '../utils/constants';
import toast from 'react-hot-toast';

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showActivity, setShowActivity] = useState(false);
  const [actForm, setActForm] = useState({
    activity_type: 'llamada_saliente', duration_minutes: '', result: 'contacto_efectivo',
    notes: '', next_action: '', next_action_date: ''
  });

  useEffect(() => { fetchLead(); }, [id]);

  const fetchLead = async () => {
    try {
      const data = await api.get(`/leads/${id}`);
      setLead(data);
    } catch (e) {
      toast.error('Lead no encontrado');
      navigate('/leads');
    } finally { setLoading(false); }
  };

  const handleAddActivity = async (e) => {
    e.preventDefault();
    try {
      await api.post('/activities', { ...actForm, lead_id: parseInt(id) });
      toast.success('Gestión registrada');
      setShowActivity(false);
      setActForm({ activity_type: 'llamada_saliente', duration_minutes: '', result: 'contacto_efectivo', notes: '', next_action: '', next_action_date: '' });
      fetchLead();
    } catch (err) { toast.error('Error al registrar gestión'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>;
  if (!lead) return null;

  const statusInfo = getStatusInfo(lead.pipeline_status);
  const activities = lead.activities || [];

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/leads')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm">
        ← Volver a Leads
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Info */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h2 className="text-xl font-bold text-gray-900 mb-1">{lead.full_name}</h2>
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>

            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 text-sm">📞 <span>{lead.phone_primary}</span></div>
              {lead.phone_secondary && <div className="flex items-center gap-3 text-sm">📱 <span>{lead.phone_secondary} (sec.)</span></div>}
              {lead.email && <div className="flex items-center gap-3 text-sm">📧 <span>{lead.email}</span></div>}
              {lead.vendor_name && <div className="flex items-center gap-3 text-sm">👤 <span>{lead.vendor_name}</span></div>}
              {lead.next_followup && <div className="flex items-center gap-3 text-sm text-amber-600">⏰ <span>{formatDateTime(lead.next_followup)}</span></div>}
            </div>

            <div className="mt-4 pt-4 border-t space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Cédula/RUC:</span><span>{lead.cedula || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Operador:</span><span>{lead.operator_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Plan actual:</span><span>{lead.current_plan || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Plan ofrecido:</span><span>{lead.claro_plan_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Fuente:</span><span>{lead.source_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Creado:</span><span>{formatDate(lead.created_at)}</span></div>
              {lead.claro_request_number && <div className="flex justify-between"><span className="text-gray-500">N° Solicitud:</span><span className="font-mono">{lead.claro_request_number}</span></div>}
              {lead.activation_date && <div className="flex justify-between"><span className="text-gray-500">F. Activación:</span><span>{formatDate(lead.activation_date)}</span></div>}
            </div>

            {lead.notes && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-gray-500 font-medium mb-1">Notas:</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Activities */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Historial de Gestiones</h3>
            <button onClick={() => setShowActivity(!showActivity)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-claro-red text-white rounded-lg text-sm hover:bg-claro-red-dark">
              + Nueva Gestión
            </button>
          </div>

          {showActivity && (
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <form onSubmit={handleAddActivity} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                    <select value={actForm.activity_type} onChange={e => setActForm(f => ({ ...f, activity_type: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none">
                      {ACTIVITY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                  {actForm.activity_type.includes('llamada') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Duración (min)</label>
                      <input type="number" value={actForm.duration_minutes} onChange={e => setActForm(f => ({ ...f, duration_minutes: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none" />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Resultado</label>
                    <select value={actForm.result} onChange={e => setActForm(f => ({ ...f, result: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none">
                      {ACTIVITY_RESULTS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Próxima acción</label>
                    <input type="text" value={actForm.next_action} onChange={e => setActForm(f => ({ ...f, next_action: e.target.value }))}
                      placeholder="Ej: Llamar para confirmar docs"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha próxima acción</label>
                    <input type="datetime-local" value={actForm.next_action_date} onChange={e => setActForm(f => ({ ...f, next_action_date: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <textarea value={actForm.notes} onChange={e => setActForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none" />
                </div>
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setShowActivity(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
                  <button type="submit" className="px-4 py-2 bg-claro-red text-white rounded-lg text-sm hover:bg-claro-red-dark">Registrar</button>
                </div>
              </form>
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-3">
            {activities.map(act => {
              const typeInfo = ACTIVITY_TYPES.find(t => t.key === act.activity_type);
              const resultInfo = ACTIVITY_RESULTS.find(r => r.key === act.result);
              return (
                <div key={act.id} className="bg-white rounded-xl shadow-sm border p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        act.activity_type.includes('llamada') ? 'bg-blue-100 text-blue-700' :
                        act.activity_type === 'whatsapp' ? 'bg-green-100 text-green-700' :
                        act.activity_type === 'email' ? 'bg-purple-100 text-purple-700' :
                        act.activity_type === 'cambio_estado' ? 'bg-gray-100 text-gray-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>{typeInfo?.label || act.activity_type}</span>
                      {resultInfo && (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          act.result === 'cerro_venta' ? 'bg-green-100 text-green-700' :
                          act.result === 'contacto_efectivo' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{resultInfo.label}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap ml-2">{formatDateTime(act.created_at)}</span>
                  </div>
                  {act.duration_minutes && <p className="text-xs text-gray-500 mb-1">Duración: {act.duration_minutes} min</p>}
                  {act.notes && <p className="text-sm text-gray-700 mt-1">{act.notes}</p>}
                  {act.next_action && (
                    <div className="mt-2 p-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                      <span className="font-medium">Próxima acción:</span> {act.next_action}
                      {act.next_action_date && ` — ${formatDateTime(act.next_action_date)}`}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">Por: {act.user_name}</p>
                </div>
              );
            })}
            {activities.length === 0 && (
              <div className="text-center text-gray-500 py-8 bg-white rounded-xl border">
                Sin gestiones registradas. Haz clic en "Nueva Gestión" para empezar.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
