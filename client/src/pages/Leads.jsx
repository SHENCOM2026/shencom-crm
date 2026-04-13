import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { PIPELINE_STATUSES, getStatusInfo, formatDate } from '../utils/constants';
import toast from 'react-hot-toast';

/* ───── Lead Form Modal ───── */
function LeadModal({ isOpen, onClose, onSave, lead, vendors, supervisors, plans, operators, sources }) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (lead) {
      setForm({ ...lead });
    } else {
      setForm({
        full_name: '', cedula: '', phone_primary: '', phone_secondary: '', email: '',
        operator_origin_id: '', current_plan: '', claro_plan_id: '',
        vendor_id: '', supervisor_id: '', source_id: '',
        pipeline_status: 'lead_nuevo', next_followup: '', notes: ''
      });
    }
  }, [lead, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (lead) {
        await api.put(`/leads/${lead.id}`, form);
        toast.success('Lead actualizado');
      } else {
        await api.post('/leads', form);
        toast.success('Lead creado');
      }
      onSave();
      onClose();
    } catch (err) { toast.error(err.message || 'Error al guardar'); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">{lead ? 'Editar Lead' : 'Nuevo Lead'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
              <input type="text" value={form.full_name || ''} onChange={e => set('full_name', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cédula / RUC</label>
              <input type="text" value={form.cedula || ''} onChange={e => set('cedula', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono principal *</label>
              <input type="text" value={form.phone_primary || ''} onChange={e => set('phone_primary', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono secundario</label>
              <input type="text" value={form.phone_secondary || ''} onChange={e => set('phone_secondary', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Operador origen</label>
              <select value={form.operator_origin_id || ''} onChange={e => set('operator_origin_id', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none">
                <option value="">Seleccionar...</option>
                {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan actual</label>
              <input type="text" value={form.current_plan || ''} onChange={e => set('current_plan', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan Claro ofrecido</label>
              <select value={form.claro_plan_id || ''} onChange={e => set('claro_plan_id', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none">
                <option value="">Seleccionar...</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name} - ${p.price}/mes</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendedor asignado</label>
              <select value={form.vendor_id || ''} onChange={e => set('vendor_id', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none">
                <option value="">Sin asignar</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fuente del lead</label>
              <select value={form.source_id || ''} onChange={e => set('source_id', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none">
                <option value="">Seleccionar...</option>
                {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select value={form.pipeline_status || 'lead_nuevo'} onChange={e => set('pipeline_status', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none">
                {PIPELINE_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Próximo seguimiento</label>
              <input type="datetime-local" value={form.next_followup || ''} onChange={e => set('next_followup', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" className="px-4 py-2 bg-claro-red text-white rounded-lg hover:bg-claro-red-dark">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───── Bulk Assign Modal ───── */
function AssignModal({ isOpen, onClose, onAssign, vendors, count }) {
  const [vendorId, setVendorId] = useState('');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Asignar {count} lead(s) a vendedor</h3>
        <select value={vendorId} onChange={e => setVendorId(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg mb-4 focus:ring-2 focus:ring-claro-red outline-none">
          <option value="">Seleccionar vendedor...</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
        </select>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={() => { onAssign(parseInt(vendorId)); setVendorId(''); }} disabled={!vendorId}
            className="px-4 py-2 bg-claro-red text-white rounded-lg hover:bg-claro-red-dark disabled:opacity-50">Asignar</button>
        </div>
      </div>
    </div>
  );
}

/* ───── Main ───── */
export default function Leads() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [showAssign, setShowAssign] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [vendors, setVendors] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [plans, setPlans] = useState([]);
  const [operators, setOperators] = useState([]);
  const [sources, setSources] = useState([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', vendor_id: '', operator_id: '', source_id: '', date_from: '', date_to: '' });

  const fetchLeads = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const data = await api.get(`/leads?${params}`);
      setLeads(data);
    } catch (e) { toast.error('Error cargando leads'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLeads(); }, [search, filters]);
  useEffect(() => {
    Promise.all([
      api.get('/users/vendors').then(setVendors),
      api.get('/users/supervisors').then(setSupervisors),
      api.get('/config/plans').then(setPlans),
      api.get('/config/operators').then(setOperators),
      api.get('/config/sources').then(setSources),
    ]).catch(() => {});
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este lead?')) return;
    try {
      await api.delete(`/leads/${id}`);
      toast.success('Lead eliminado');
      fetchLeads();
    } catch (e) { toast.error(e.message); }
  };

  const handleExportCSV = async () => {
    try { await api.download('/leads/export/csv', 'leads_shencom.csv'); toast.success('CSV exportado'); }
    catch (e) { toast.error('Error al exportar'); }
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.upload('/leads/import', formData);
      toast.success(`${res.imported} importados, ${res.skipped} omitidos`);
      fetchLeads();
    } catch (err) { toast.error(err.message || 'Error al importar'); }
    e.target.value = '';
  };

  const handleBulkAssign = async (vendorId) => {
    try {
      await api.post('/leads/bulk-assign', { lead_ids: [...selected], vendor_id: vendorId });
      toast.success(`${selected.size} leads reasignados`);
      setSelected(new Set());
      setShowAssign(false);
      fetchLeads();
    } catch (e) { toast.error('Error'); }
  };

  const toggleSelect = (id) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  const toggleAll = () => {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map(l => l.id)));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Leads</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setEditingLead(null); setShowModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-claro-red text-white rounded-lg text-sm hover:bg-claro-red-dark">
            + Nuevo Lead
          </button>
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">
            ⬇ CSV
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">
            ⬆ Importar CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
          {selected.size > 0 && user?.role !== 'vendedor' && (
            <button onClick={() => setShowAssign(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm">
              Asignar ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input type="text" placeholder="Buscar nombre, cédula, teléfono..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none" />
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            className="text-sm border rounded-lg px-3 py-2">
            <option value="">Todos los estados</option>
            {PIPELINE_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={filters.operator_id} onChange={e => setFilters(f => ({ ...f, operator_id: e.target.value }))}
            className="text-sm border rounded-lg px-3 py-2">
            <option value="">Todos los operadores</option>
            {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select value={filters.source_id} onChange={e => setFilters(f => ({ ...f, source_id: e.target.value }))}
            className="text-sm border rounded-lg px-3 py-2">
            <option value="">Todas las fuentes</option>
            {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {user?.role !== 'vendedor' && (
            <select value={filters.vendor_id} onChange={e => setFilters(f => ({ ...f, vendor_id: e.target.value }))}
              className="text-sm border rounded-lg px-3 py-2">
              <option value="">Todos los vendedores</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
            </select>
          )}
          <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
            className="text-sm border rounded-lg px-3 py-2" />
          <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
            className="text-sm border rounded-lg px-3 py-2" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {user?.role !== 'vendedor' && (
                  <th className="px-3 py-3 w-10"><input type="checkbox" checked={selected.size === leads.length && leads.length > 0} onChange={toggleAll} className="rounded" /></th>
                )}
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Nombre</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Cédula</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Teléfono</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Operador</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Fuente</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Vendedor</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Creado</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map(lead => {
                const info = getStatusInfo(lead.pipeline_status);
                return (
                  <tr key={lead.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                    {user?.role !== 'vendedor' && (
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} className="rounded" />
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium">{lead.full_name}</td>
                    <td className="px-4 py-3 text-gray-500">{lead.cedula || '—'}</td>
                    <td className="px-4 py-3">{lead.phone_primary}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{lead.operator_name || '—'}</span></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{lead.source_name || '—'}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${info.color}`}>{info.label}</span></td>
                    <td className="px-4 py-3 text-gray-500">{lead.vendor_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(lead.created_at)}</td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setEditingLead(lead); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">✏️</button>
                      {user?.role !== 'vendedor' && (
                        <button onClick={() => handleDelete(lead.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500">🗑</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {leads.length === 0 && (
                <tr><td colSpan="10" className="px-4 py-8 text-center text-gray-500">No se encontraron leads</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LeadModal isOpen={showModal} onClose={() => setShowModal(false)} onSave={fetchLeads}
        lead={editingLead} vendors={vendors} supervisors={supervisors} plans={plans}
        operators={operators} sources={sources} />
      <AssignModal isOpen={showAssign} onClose={() => setShowAssign(false)} onAssign={handleBulkAssign}
        vendors={vendors} count={selected.size} />
    </div>
  );
}
