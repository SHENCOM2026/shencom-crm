import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { PIPELINE_STATUSES, getStatusInfo, formatDate } from '../utils/constants';
import toast from 'react-hot-toast';
import {
  DndContext, PointerSensor, useSensor, useSensors, DragOverlay, useDroppable, useDraggable, rectIntersection
} from '@dnd-kit/core';

/* ───── Modal for Solicitud Enviada / Portabilidad Exitosa ───── */
function StatusModal({ isOpen, onClose, onSubmit, targetStatus }) {
  const [solicitudNum, setSolicitudNum] = useState('');
  const [activationDate, setActivationDate] = useState(new Date().toISOString().split('T')[0]);
  const [planId, setPlanId] = useState('');
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    if (isOpen && targetStatus === 'portabilidad_exitosa') {
      api.get('/config/plans').then(setPlans).catch(() => {});
    }
  }, [isOpen, targetStatus]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (targetStatus === 'solicitud_enviada') {
      onSubmit({ claro_request_number: solicitudNum });
    } else {
      onSubmit({ activation_date: activationDate, claro_plan_id: parseInt(planId) });
    }
    setSolicitudNum(''); setActivationDate(new Date().toISOString().split('T')[0]); setPlanId('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">
          {targetStatus === 'solicitud_enviada' ? 'Número de Solicitud Claro' : 'Datos de Activación'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {targetStatus === 'solicitud_enviada' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Número de solicitud</label>
              <input type="text" value={solicitudNum} onChange={e => setSolicitudNum(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" required autoFocus />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de activación</label>
                <input type="date" value={activationDate} onChange={e => setActivationDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan contratado</label>
                <select value={planId} onChange={e => setPlanId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" required>
                  <option value="">Seleccionar plan...</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name} - ${p.price}/mes</option>)}
                </select>
              </div>
            </>
          )}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" className="px-4 py-2 bg-claro-red text-white rounded-lg hover:bg-claro-red-dark">Confirmar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───── Draggable Lead Card ───── */
function LeadCard({ lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(lead.id),
    data: { status: lead.pipeline_status }
  });
  const style = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
    position: isDragging ? 'relative' : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="bg-white rounded-lg border p-3 mb-2 shadow-sm hover:shadow-md transition-shadow cursor-grab">
      <div className="flex items-start justify-between mb-1">
        <h4 className="font-medium text-sm text-gray-900 truncate">{lead.full_name}</h4>
        {lead.operator_name && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded ml-1 flex-shrink-0">{lead.operator_name}</span>}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-gray-500">📞 {lead.phone_primary}</p>
        {lead.vendor_name && <p className="text-xs text-gray-500">👤 {lead.vendor_name}</p>}
        {lead.next_followup && <p className="text-xs text-amber-600">⏰ {formatDate(lead.next_followup)}</p>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {lead.claro_plan_name && (
          <span className="text-xs bg-red-50 text-claro-red px-2 py-1 rounded-md">{lead.claro_plan_name}</span>
        )}
        {lead.prospect_total > 0 && (
          <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-md font-medium">${parseFloat(lead.prospect_total).toFixed(2)}</span>
        )}
        {lead.lines_to_port > 0 && (
          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md">{lead.lines_to_port} lín.</span>
        )}
      </div>
    </div>
  );
}

/* ───── Droppable Column ───── */
function Column({ status, leads }) {
  const info = getStatusInfo(status);
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className={`flex-shrink-0 w-72 rounded-xl border flex flex-col transition-colors ${isOver ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' : 'bg-gray-50 border-gray-200'}`} style={{ maxHeight: 'calc(100vh - 220px)' }}>
      <div className="p-3 border-b bg-white rounded-t-xl flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${info.dotColor}`} />
          <h3 className="font-semibold text-sm text-gray-700">{info.label}</h3>
          <span className="ml-auto bg-gray-200 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full">{leads.length}</span>
        </div>
      </div>
      <div ref={setNodeRef} className="p-2 overflow-y-auto flex-1" style={{ minHeight: 100 }}>
        {leads.map(lead => <LeadCard key={lead.id} lead={lead} />)}
        {leads.length === 0 && <div className="text-center text-gray-400 text-sm py-8">Sin leads</div>}
      </div>
    </div>
  );
}

/* ───── Main Pipeline Component ───── */
export default function Pipeline() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState({ open: false, leadId: null, targetStatus: '' });
  const [vendors, setVendors] = useState([]);
  const [vendorFilter, setVendorFilter] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (vendorFilter) params.set('vendor_id', vendorFilter);
      const data = await api.get(`/leads?${params}`);
      setLeads(data);
    } catch (e) { toast.error('Error cargando leads'); }
    finally { setLoading(false); }
  }, [search, vendorFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => {
    if (user?.role !== 'vendedor') {
      api.get('/users/vendors').then(setVendors).catch(() => {});
    }
  }, [user]);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;

    const leadId = parseInt(active.id);
    const currentLead = leads.find(l => l.id === leadId);
    if (!currentLead) return;

    // over.id is always a column status key (since only columns are droppable now)
    const targetStatus = over.id;

    if (!targetStatus || targetStatus === currentLead.pipeline_status) return;

    // Check if needs modal
    if (targetStatus === 'solicitud_enviada' || targetStatus === 'portabilidad_exitosa') {
      setModal({ open: true, leadId, targetStatus });
      return;
    }

    // Optimistic update
    const previousStatus = currentLead.pipeline_status;
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, pipeline_status: targetStatus } : l));
    try {
      await api.patch(`/leads/${leadId}/status`, { pipeline_status: targetStatus });
      toast.success(`Movido a "${getStatusInfo(targetStatus).label}"`);
    } catch (e) {
      // Rollback on failure
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, pipeline_status: previousStatus } : l));
      toast.error('Error al mover lead');
    }
  };

  const handleModalSubmit = async (data) => {
    try {
      await api.patch(`/leads/${modal.leadId}/status`, { pipeline_status: modal.targetStatus, ...data });
      setLeads(prev => prev.map(l => l.id === modal.leadId ? { ...l, pipeline_status: modal.targetStatus } : l));
      toast.success(`Movido a "${getStatusInfo(modal.targetStatus).label}"`);
      setModal({ open: false, leadId: null, targetStatus: '' });
    } catch (e) { toast.error('Error al actualizar'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Pipeline de Ventas</h1>
        <div className="flex items-center gap-2">
          <input type="text" placeholder="Buscar lead..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-claro-red outline-none w-48" />
          {user?.role !== 'vendedor' && (
            <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-claro-red outline-none">
              <option value="">Todos</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
            </select>
          )}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setView('kanban')} className={`px-2.5 py-1 rounded-md text-xs font-medium ${view === 'kanban' ? 'bg-white shadow-sm' : ''}`}>Kanban</button>
            <button onClick={() => setView('list')} className={`px-2.5 py-1 rounded-md text-xs font-medium ${view === 'list' ? 'bg-white shadow-sm' : ''}`}>Lista</button>
          </div>
        </div>
      </div>

      <StatusModal isOpen={modal.open} onClose={() => setModal({ open: false, leadId: null, targetStatus: '' })}
        onSubmit={handleModalSubmit} targetStatus={modal.targetStatus} />

      {view === 'kanban' ? (
        <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {PIPELINE_STATUSES.map(s => (
              <Column key={s.key} status={s.key} leads={leads.filter(l => l.pipeline_status === s.key)} />
            ))}
          </div>
        </DndContext>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Nombre</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Teléfono</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Operador</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Vendedor</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Próx. Seguimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leads.map(lead => {
                  const info = getStatusInfo(lead.pipeline_status);
                  return (
                    <tr key={lead.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{lead.full_name}</td>
                      <td className="px-4 py-3">{lead.phone_primary}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{lead.operator_name || '—'}</span></td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${info.color}`}>{info.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{lead.vendor_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(lead.next_followup)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
