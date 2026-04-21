import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../utils/api';
import { PIPELINE_STATUSES, getStatusInfo, formatDate } from '../utils/constants';
import toast from 'react-hot-toast';

/* ───── Sales Documents Panel ───── */
function SalesDocuments({ leadId }) {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);

  const loadDocs = async () => {
    try {
      const data = await api.get(`/leads/${leadId}/documents`);
      setDocs(data);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { if (leadId) loadDocs(); }, [leadId]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    try {
      await api.upload(`/leads/${leadId}/documents`, formData);
      toast.success('Documento subido');
      await loadDocs();
    } catch (err) {
      toast.error(err.message || 'Error al subir documento');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (docId) => {
    try {
      await api.delete(`/leads/${leadId}/documents/${docId}`);
      setDocs(prev => prev.filter(d => d.id !== docId));
      toast.success('Documento eliminado');
    } catch (err) {
      toast.error('Error al eliminar');
    }
  };

  const handleViewDoc = (doc) => {
    const token = localStorage.getItem('token');
    fetch(`/api/leads/${leadId}/documents/${doc.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      })
      .catch(() => toast.error('Error al abrir documento'));
  };

  const handleDownloadFormato = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/leads/${leadId}/formato`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { toast.error('Error al generar formato'); return; }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `FORMATO_INGRESO_${leadId}.xlsx`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast.error('Error al descargar formato');
    }
  };

  return (
    <div className="border-t pt-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Documentos de Venta
        </h4>
        <button
          type="button"
          onClick={handleDownloadFormato}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Formato de Ingreso (.xlsx)
        </button>
      </div>

      {/* Upload PDF */}
      <label className={`flex items-center gap-2 w-full px-3 py-2.5 border-2 border-dashed rounded-lg text-sm cursor-pointer transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-claro-red hover:text-claro-red border-gray-300 text-gray-500'}`}>
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {uploading ? 'Subiendo documento...' : 'Subir PDF de requisitos (clic o arrastrar)'}
        <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>

      {/* Document list */}
      {docs.length > 0 ? (
        <div className="space-y-1.5">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between p-2.5 bg-red-50 border border-red-100 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{doc.original_name}</p>
                  <p className="text-xs text-gray-400">{Math.round(doc.file_size / 1024)} KB — {doc.uploader_name}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0 ml-2">
                <button type="button" onClick={() => handleViewDoc(doc)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Ver</button>
                <button type="button" onClick={() => handleDelete(doc.id)} className="text-xs text-red-500 hover:text-red-700">✕</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center py-1">Sin documentos adjuntos</p>
      )}
    </div>
  );
}

/* ───── Lead Form Modal ───── */
function LeadModal({ isOpen, onClose, onSave, lead, vendors, supervisors, plans, operators, sources }) {
  const [form, setForm] = useState({});
  const [prospectPlans, setProspectPlans] = useState([]);
  const [planErrors, setPlanErrors] = useState('');

  useEffect(() => {
    if (lead) {
      setForm({ ...lead });
      // Load existing prospect plans when editing
      if (lead.id) {
        api.get(`/leads/${lead.id}`).then(data => {
          setProspectPlans(data.prospect_plans || []);
        }).catch(() => {});
      }
    } else {
      setForm({
        full_name: '', cedula: '', phone_primary: '', phone_secondary: '', email: '',
        operator_origin_id: '', current_plan: '', claro_plan_id: '',
        vendor_id: '', supervisor_id: '', source_id: '',
        pipeline_status: 'lead_nuevo', next_followup: '', notes: '',
        lines_to_port: ''
      });
      setProspectPlans([]);
    }
    setPlanErrors('');
  }, [lead, isOpen]);

  if (!isOpen) return null;

  const prospectTotal = prospectPlans.reduce((sum, p) => sum + (parseFloat(p.plan_price) || 0), 0);

  const addProspectPlan = () => {
    setProspectPlans(prev => [...prev, { plan_name: '', plan_price: '' }]);
  };

  const removeProspectPlan = (index) => {
    setProspectPlans(prev => prev.filter((_, i) => i !== index));
  };

  const updateProspectPlan = (index, field, value) => {
    setProspectPlans(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPlanErrors('');

    // Validate prospect plans
    if (prospectPlans.length > 0) {
      for (let i = 0; i < prospectPlans.length; i++) {
        if (!prospectPlans[i].plan_name?.trim()) {
          setPlanErrors(`Plan ${i + 1}: ingrese el nombre del plan`);
          return;
        }
        if (!prospectPlans[i].plan_price && prospectPlans[i].plan_price !== 0) {
          setPlanErrors(`Plan ${i + 1}: ingrese la tarifa`);
          return;
        }
      }
    }
    if (parseInt(form.lines_to_port) > 0 && prospectPlans.length > 0 && prospectTotal <= 0) {
      setPlanErrors('El valor total no puede ser $0 si hay líneas registradas');
      return;
    }

    try {
      const data = { ...form, prospect_plans: prospectPlans };
      if (lead) {
        await api.put(`/leads/${lead.id}`, data);
        toast.success('Lead actualizado');
      } else {
        await api.post('/leads', data);
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

          {/* ── Prospección de líneas y planes ── */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">Prospección de Líneas</h4>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Líneas a portar</label>
              <input type="number" min="0" step="1" value={form.lines_to_port || ''} onChange={e => set('lines_to_port', e.target.value)}
                placeholder="Ej: 3"
                className="w-full sm:w-40 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
            </div>

            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Planes prospectados</label>
              <button type="button" onClick={addProspectPlan}
                className="text-xs px-2.5 py-1 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-medium">
                + Agregar plan
              </button>
            </div>
            {prospectPlans.length > 0 && (
              <div className="space-y-2 mb-3">
                {prospectPlans.map((pp, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="text" value={pp.plan_name} onChange={e => updateProspectPlan(i, 'plan_name', e.target.value)}
                      placeholder="Nombre / tipo de plan"
                      className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none" />
                    <div className="relative w-32">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input type="number" min="0" step="0.01" value={pp.plan_price} onChange={e => updateProspectPlan(i, 'plan_price', e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-6 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none" />
                    </div>
                    <button type="button" onClick={() => removeProspectPlan(i)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar plan">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {prospectPlans.length === 0 && (
              <p className="text-xs text-gray-400 mb-3">No hay planes agregados. Presione "+ Agregar plan" para iniciar.</p>
            )}

            {planErrors && <p className="text-xs text-red-600 mb-2">{planErrors}</p>}

            <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Valor total prospectado:</span>
              <span className="text-lg font-bold text-claro-red">${prospectTotal.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
          </div>

          {/* Documents section — only when editing existing lead */}
          {lead?.id && <SalesDocuments leadId={lead.id} />}

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
  const [searchParams] = useSearchParams();
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
  const [filters, setFilters] = useState({ status: [], vendor_id: [], operator_id: '', source_id: '', date_from: '', date_to: '', value_min: '', value_max: '' });
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showVendorMenu, setShowVendorMenu] = useState(false);
  const [valorSort, setValorSort] = useState(null); // null | 'asc' | 'desc'
  const [showValorMenu, setShowValorMenu] = useState(false);

  const fetchLeads = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      Object.entries(filters).forEach(([k, v]) => {
        if (Array.isArray(v)) { if (v.length > 0) params.set(k, v.join(',')); }
        else if (v) params.set(k, v);
      });
      const importId = searchParams.get('import_id');
      if (importId) params.set('import_id', importId);
      const data = await api.get(`/leads?${params}`);
      setLeads(data);
    } catch (e) { toast.error('Error cargando leads'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLeads(); }, [search, filters, searchParams]);
  useEffect(() => {
    if (!showStatusMenu) return;
    const handler = (e) => { if (!e.target.closest('.status-menu-wrap')) setShowStatusMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showStatusMenu]);
  useEffect(() => {
    if (!showVendorMenu) return;
    const handler = (e) => { if (!e.target.closest('.vendor-menu-wrap')) setShowVendorMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVendorMenu]);
  useEffect(() => {
    Promise.all([
      api.get('/users/vendors').then(setVendors),
      api.get('/users/supervisors').then(setSupervisors),
      api.get('/config/plans').then(setPlans),
      api.get('/config/operators').then(setOperators),
      api.get('/config/sources').then(setSources),
    ]).catch(() => {});
  }, []);

  const sortedLeads = useMemo(() => {
    if (!valorSort) return leads;
    return [...leads].sort((a, b) => {
      const aVal = parseFloat(a.prospect_total) || 0;
      const bVal = parseFloat(b.prospect_total) || 0;
      const aNull = !a.prospect_total || a.prospect_total === 0;
      const bNull = !b.prospect_total || b.prospect_total === 0;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      return valorSort === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [leads, valorSort]);

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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Leads</h1>
          {searchParams.get('import_id') && (
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
              Filtrado por importación #{searchParams.get('import_id')}
              <button onClick={() => navigate('/leads')} className="ml-2 text-blue-500 hover:text-blue-800">&times;</button>
            </span>
          )}
        </div>
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
          <div className="relative status-menu-wrap">
            <button
              onClick={() => setShowStatusMenu(p => !p)}
              className={`text-sm border rounded-lg px-3 py-2 flex items-center gap-2 bg-white hover:bg-gray-50 ${filters.status.length > 0 ? 'border-claro-red text-claro-red' : 'text-gray-700'}`}
            >
              {filters.status.length === 0
                ? 'Todos los estados'
                : filters.status.length === 1
                  ? PIPELINE_STATUSES.find(s => s.key === filters.status[0])?.label
                  : `${filters.status.length} estados`}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showStatusMenu && (
              <div className="absolute z-30 mt-1 bg-white border rounded-xl shadow-lg min-w-[200px]">
                <div className="p-2 border-b flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Filtrar por estado</span>
                  {filters.status.length > 0 && (
                    <button onClick={() => setFilters(f => ({ ...f, status: [] }))} className="text-xs text-claro-red hover:underline">Limpiar</button>
                  )}
                </div>
                <div className="py-1 max-h-64 overflow-y-auto">
                  {PIPELINE_STATUSES.map(s => {
                    const checked = filters.status.includes(s.key);
                    return (
                      <label key={s.key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={checked}
                          onChange={() => setFilters(f => ({
                            ...f,
                            status: checked ? f.status.filter(x => x !== s.key) : [...f.status, s.key]
                          }))}
                          className="rounded accent-claro-red" />
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.color || 'bg-gray-100 text-gray-700'}`}>{s.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
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
            <div className="relative vendor-menu-wrap">
              <button
                onClick={() => setShowVendorMenu(p => !p)}
                className={`text-sm border rounded-lg px-3 py-2 flex items-center gap-2 bg-white hover:bg-gray-50 ${filters.vendor_id.length > 0 ? 'border-claro-red text-claro-red' : 'text-gray-700'}`}
              >
                {filters.vendor_id.length === 0
                  ? 'Todos los vendedores'
                  : filters.vendor_id.length === 1
                    ? vendors.find(v => String(v.id) === String(filters.vendor_id[0]))?.full_name
                    : `${filters.vendor_id.length} vendedores`}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showVendorMenu && (
                <div className="absolute z-30 mt-1 bg-white border rounded-xl shadow-lg min-w-[200px]">
                  <div className="p-2 border-b flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Filtrar por vendedor</span>
                    {filters.vendor_id.length > 0 && (
                      <button onClick={() => setFilters(f => ({ ...f, vendor_id: [] }))} className="text-xs text-claro-red hover:underline">Limpiar</button>
                    )}
                  </div>
                  <div className="py-1 max-h-64 overflow-y-auto">
                    {vendors.map(v => {
                      const checked = filters.vendor_id.includes(String(v.id));
                      return (
                        <label key={v.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={checked}
                            onChange={() => setFilters(f => ({
                              ...f,
                              vendor_id: checked ? f.vendor_id.filter(x => x !== String(v.id)) : [...f.vendor_id, String(v.id)]
                            }))}
                            className="rounded accent-claro-red" />
                          <span className="text-sm text-gray-700">{v.full_name}</span>
                        </label>
                      );
                    })}
                    {vendors.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">Sin vendedores</div>}
                  </div>
                </div>
              )}
            </div>
          )}
          <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
            className="text-sm border rounded-lg px-3 py-2" />
          <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
            className="text-sm border rounded-lg px-3 py-2" />
          <input type="number" placeholder="$ Mín" step="0.01" min="0" value={filters.value_min}
            onChange={e => setFilters(f => ({ ...f, value_min: e.target.value }))}
            className="text-sm border rounded-lg px-3 py-2 w-24" />
          <input type="number" placeholder="$ Máx" step="0.01" min="0" value={filters.value_max}
            onChange={e => setFilters(f => ({ ...f, value_max: e.target.value }))}
            className="text-sm border rounded-lg px-3 py-2 w-24" />
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
                <th className="px-4 py-3 text-right font-semibold text-gray-600 relative">
                  <button onClick={() => setShowValorMenu(v => !v)}
                    className={`inline-flex items-center gap-1 hover:text-claro-red transition-colors ${valorSort ? 'text-claro-red' : ''}`}>
                    Valor ($)
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    {valorSort === 'desc' && <span className="text-xs">↓</span>}
                    {valorSort === 'asc' && <span className="text-xs">↑</span>}
                  </button>
                  {showValorMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowValorMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-52">
                        <button onClick={() => { setValorSort('desc'); setShowValorMenu(false); }}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${valorSort === 'desc' ? 'bg-red-50 text-claro-red font-medium' : 'text-gray-700'}`}>
                          <span>↓</span> Mayor a menor
                          {valorSort === 'desc' && <span className="ml-auto text-claro-red">✓</span>}
                        </button>
                        <button onClick={() => { setValorSort('asc'); setShowValorMenu(false); }}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${valorSort === 'asc' ? 'bg-red-50 text-claro-red font-medium' : 'text-gray-700'}`}>
                          <span>↑</span> Menor a mayor
                          {valorSort === 'asc' && <span className="ml-auto text-claro-red">✓</span>}
                        </button>
                        {valorSort && (
                          <>
                            <div className="border-t border-gray-100 my-1" />
                            <button onClick={() => { setValorSort(null); setShowValorMenu(false); }}
                              className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 text-gray-500">
                              <span>✕</span> Quitar ordenamiento
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Creado</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedLeads.map(lead => {
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
                    <td className="px-4 py-3 text-right font-medium">
                      {lead.prospect_total > 0
                        ? <span className="text-green-600">${parseFloat(lead.prospect_total).toFixed(2)}</span>
                        : <span className="text-gray-400">$0.00</span>}
                    </td>
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
