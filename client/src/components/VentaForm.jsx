import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

const SECTION = ({ title, children }) => (
  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
    <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 border-b pb-1">{title}</h4>
    {children}
  </div>
);

const Field = ({ label, children, half }) => (
  <div className={half ? 'col-span-1' : 'col-span-2 sm:col-span-1'}>
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    {children}
  </div>
);

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none bg-white';
const sel = inp + ' cursor-pointer';

function DocUpload({ leadId }) {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try { setDocs(await api.get(`/leads/${leadId}/documents`)); } catch (e) {}
  };

  useEffect(() => { if (leadId) load(); }, [leadId]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      await api.upload(`/leads/${leadId}/documents`, fd);
      toast.success('PDF subido');
      load();
    } catch (err) { toast.error(err.message || 'Error al subir'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleView = (doc) => {
    const token = localStorage.getItem('token');
    fetch(`/api/leads/${leadId}/documents/${doc.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.blob()).then(blob => {
      window.open(URL.createObjectURL(blob), '_blank');
    }).catch(() => toast.error('Error al abrir'));
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/leads/${leadId}/documents/${id}`);
      setDocs(d => d.filter(x => x.id !== id));
      toast.success('Eliminado');
    } catch { toast.error('Error al eliminar'); }
  };

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 border-b pb-1">Documentos Adjuntos (PDF)</h4>
      <label className={`flex items-center gap-2 w-full px-3 py-2.5 border-2 border-dashed rounded-lg text-sm cursor-pointer transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-claro-red hover:text-claro-red border-gray-300 text-gray-500'}`}>
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {uploading ? 'Subiendo...' : 'Subir cédula, contrato u otros requisitos en PDF'}
        <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
      {docs.length > 0 ? (
        <div className="space-y-1.5">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between p-2.5 bg-white border rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{doc.original_name}</p>
                  <p className="text-xs text-gray-400">{Math.round(doc.file_size / 1024)} KB · {doc.uploader_name}</p>
                </div>
              </div>
              <div className="flex gap-3 flex-shrink-0 ml-2">
                <button type="button" onClick={() => handleView(doc)} className="text-xs text-blue-600 hover:underline">Ver</button>
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

const EMPTY_LINEA = { usuario: '', numero_portar: '', tipo_transaccion: 'PORTABILIDAD', tarifa: '', bp: '', equipo: '', financiamiento: '', feature: '', codigo_feature: '' };

// Parse bulk-paste text into lineas array.
// Accepts TSV (from Excel), semicolon-separated, or pipe-separated values.
// Expected column order: usuario, numero_portar, tipo_transaccion, tarifa, bp, equipo, financiamiento, feature, codigo_feature
function parseBulkLineas(text) {
  if (!text || !text.trim()) return [];
  const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  return rows.map(row => {
    // Prefer tabs (Excel paste); fallback to ; or | for manual typing
    let parts;
    if (row.includes('\t')) parts = row.split('\t');
    else if (row.includes(';')) parts = row.split(';');
    else if (row.includes('|')) parts = row.split('|');
    else parts = [row]; // only usuario
    parts = parts.map(p => (p || '').trim());
    const tipoRaw = (parts[2] || '').toUpperCase();
    const tipo = tipoRaw.includes('NUEVA') || tipoRaw.startsWith('N') ? 'LINEA NUEVA' : 'PORTABILIDAD';
    return {
      usuario: parts[0] || '',
      numero_portar: parts[1] || '',
      tipo_transaccion: tipo,
      tarifa: parts[3] || '',
      bp: parts[4] || '',
      equipo: parts[5] || '',
      financiamiento: parts[6] || '',
      feature: parts[7] || '',
      codigo_feature: parts[8] || '',
    };
  });
}

export default function VentaForm({ isOpen, onClose, lead }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  useEffect(() => {
    if (isOpen && lead?.id) {
      setLoading(true);
      api.get(`/leads/${lead.id}/sale-form`)
        .then(data => setForm(data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, lead?.id]);

  if (!isOpen) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setLinea = (i, k, v) => setForm(f => {
    const lineas = [...(f.lineas || [EMPTY_LINEA])];
    lineas[i] = { ...lineas[i], [k]: v };
    return { ...f, lineas };
  });
  const addLinea = () => setForm(f => ({ ...f, lineas: [...(f.lineas || []), { ...EMPTY_LINEA, usuario: f.titular || '' }] }));
  const removeLinea = (i) => setForm(f => ({ ...f, lineas: (f.lineas || []).filter((_, idx) => idx !== i) }));

  const applyBulk = (mode) => {
    const parsed = parseBulkLineas(bulkText);
    if (parsed.length === 0) {
      toast.error('No se detectaron líneas. Pegá datos desde Excel o WhatsApp.');
      return;
    }
    setForm(f => ({
      ...f,
      lineas: mode === 'replace' ? parsed : [...(f.lineas || []), ...parsed]
    }));
    setBulkText('');
    setBulkOpen(false);
    toast.success(`${parsed.length} línea${parsed.length > 1 ? 's' : ''} ${mode === 'replace' ? 'cargadas' : 'agregadas'}`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/leads/${lead.id}/sale-form`, form);
      toast.success('Formulario guardado');
    } catch (e) { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const handlePrint = () => {
    window.print();
  };

  const lineas = form.lineas || [{ ...EMPTY_LINEA, usuario: form.titular || '', numero_portar: form.celular || '' }];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col print:shadow-none print:max-h-none print:rounded-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0 print:hidden">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Formulario de Ingreso de Venta</h2>
            <p className="text-sm text-gray-500">{lead?.full_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Imprimir
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-claro-red text-white rounded-lg text-sm font-medium hover:bg-claro-red-dark disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl ml-1">✕</button>
          </div>
        </div>

        {/* Print header (only visible when printing) */}
        <div className="hidden print:block p-6 border-b">
          <h1 className="text-xl font-bold text-center">FORMULARIO DE SOLICITUD DE PORTABILIDAD / INGRESO</h1>
          <p className="text-center text-sm text-gray-600 mt-1">{lead?.full_name}</p>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 print:overflow-visible">

            {/* 1. DATOS DE NEGOCIACIÓN */}
            <SECTION title="1. Datos de Negociación">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Negociación con PAYBACK">
                  <select value={form.payback || 'NO'} onChange={e => set('payback', e.target.value)} className={sel}>
                    <option value="NO">NO</option>
                    <option value="SI">SI</option>
                  </select>
                </Field>
                <Field label="Tipo de Contrato">
                  <select value={form.tipo_contrato || 'NUEVO'} onChange={e => set('tipo_contrato', e.target.value)} className={sel}>
                    <option value="NUEVO">NUEVO</option>
                    <option value="ADICIONAL">ADICIONAL</option>
                  </select>
                </Field>
                {form.tipo_contrato === 'ADICIONAL' && (
                  <Field label="Número de Cuenta (contrato adicional)">
                    <input value={form.numero_cuenta || ''} onChange={e => set('numero_cuenta', e.target.value)} className={inp} />
                  </Field>
                )}
                <Field label="Nombre del Titular *">
                  <input value={form.titular || ''} onChange={e => set('titular', e.target.value)} className={inp} />
                </Field>
                <Field label="RUC / Cédula *">
                  <input value={form.ruc_ci || ''} onChange={e => set('ruc_ci', e.target.value)} className={inp} />
                </Field>
                <Field label="Fecha de nacimiento (DD/MM/AAAA)">
                  <input value={form.fecha_nacimiento || ''} onChange={e => set('fecha_nacimiento', e.target.value)} placeholder="DD/MM/AAAA" className={inp} />
                </Field>
                <Field label="Identificación Rep. Legal (solo Jurídico)">
                  <input value={form.id_rep_legal || ''} onChange={e => set('id_rep_legal', e.target.value)} className={inp} />
                </Field>
                <Field label="Representante Legal (solo Jurídico)">
                  <input value={form.rep_legal || ''} onChange={e => set('rep_legal', e.target.value)} className={inp} />
                </Field>
                <Field label="Fecha Vcto. Nombramiento (DD/MM/AAAA)">
                  <input value={form.fecha_vcto || ''} onChange={e => set('fecha_vcto', e.target.value)} placeholder="DD/MM/AAAA" className={inp} />
                </Field>
              </div>
            </SECTION>

            {/* 2. REFERENCIAS DOMICILIARIAS */}
            <SECTION title="2. Referencias Domiciliarias">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ciudad">
                  <input value={form.ciudad || ''} onChange={e => set('ciudad', e.target.value)} className={inp} />
                </Field>
                <Field label="Provincia">
                  <input value={form.provincia || ''} onChange={e => set('provincia', e.target.value)} className={inp} />
                </Field>
                <Field label="Cod. de Área">
                  <input value={form.cod_area || ''} onChange={e => set('cod_area', e.target.value)} className={inp} />
                </Field>
                <Field label="Teléfono fijo">
                  <input value={form.telefono || ''} onChange={e => set('telefono', e.target.value)} className={inp} />
                </Field>
                <Field label="Número celular *">
                  <input value={form.celular || ''} onChange={e => set('celular', e.target.value)} className={inp} />
                </Field>
                <Field label="Correo electrónico (facturación)">
                  <input type="email" value={form.correo || ''} onChange={e => set('correo', e.target.value)} className={inp} />
                </Field>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
                  <input value={form.direccion || ''} onChange={e => set('direccion', e.target.value)} className={inp} />
                </div>
              </div>
            </SECTION>

            {/* 3. FORMA DE PAGO */}
            <SECTION title="3. Forma de Pago">
              <div className="flex gap-4 mb-3">
                {['BANCO', 'TARJETA'].map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="forma_pago" value={opt}
                      checked={(form.forma_pago || 'BANCO') === opt}
                      onChange={() => set('forma_pago', opt)}
                      className="accent-claro-red" />
                    {opt === 'BANCO' ? 'Débito bancario' : 'Tarjeta de crédito'}
                  </label>
                ))}
              </div>

              {(form.forma_pago || 'BANCO') === 'BANCO' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Banco (nombre de la institución)">
                    <input value={form.banco_nombre || ''} onChange={e => set('banco_nombre', e.target.value)} className={inp} />
                  </Field>
                  <Field label="Tipo de cuenta">
                    <select value={form.tipo_cuenta || 'AHORROS'} onChange={e => set('tipo_cuenta', e.target.value)} className={sel}>
                      <option value="AHORROS">AHORROS</option>
                      <option value="CORRIENTE">CORRIENTE</option>
                    </select>
                  </Field>
                  <Field label="No. de cuenta">
                    <input value={form.no_cuenta || ''} onChange={e => set('no_cuenta', e.target.value)} className={inp} />
                  </Field>
                  <Field label="Ced/RUC dueño de cuenta">
                    <input value={form.ced_dueno_cta || ''} onChange={e => set('ced_dueno_cta', e.target.value)} className={inp} />
                  </Field>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del dueño de cuenta</label>
                    <input value={form.nombre_dueno_cta || ''} onChange={e => set('nombre_dueno_cta', e.target.value)} className={inp} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Emisor de la T/C">
                    <input value={form.tc_emisor || ''} onChange={e => set('tc_emisor', e.target.value)} className={inp} />
                  </Field>
                  <Field label="No. de Tarjeta">
                    <input value={form.no_tarjeta || ''} onChange={e => set('no_tarjeta', e.target.value)} className={inp} />
                  </Field>
                  <Field label="Fecha de caducidad (DD/MM/AAAA)">
                    <input value={form.fecha_caducidad || ''} onChange={e => set('fecha_caducidad', e.target.value)} placeholder="DD/MM/AAAA" className={inp} />
                  </Field>
                  <Field label="Cod. de Seguridad">
                    <input value={form.cod_seguridad || ''} onChange={e => set('cod_seguridad', e.target.value)} className={inp} />
                  </Field>
                </div>
              )}
            </SECTION>

            {/* 4. LUGAR DE ENTREGA DE CHIPS */}
            <SECTION title="4. Lugar de Entrega de Chips">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lugar de entrega">
                  <select value={form.lugar_entrega || ''} onChange={e => set('lugar_entrega', e.target.value)} className={sel}>
                    <option value="">Seleccionar...</option>
                    <option value="AGENCIA">Retira en agencia</option>
                    <option value="DOMICILIO">Envío a domicilio</option>
                  </select>
                </Field>
                <Field label="Ciudad de entrega">
                  <input value={form.ciudad_entrega || ''} onChange={e => set('ciudad_entrega', e.target.value)} className={inp} />
                </Field>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Dirección de entrega</label>
                  <input value={form.direccion_entrega || ''} onChange={e => set('direccion_entrega', e.target.value)} className={inp} />
                </div>
                <Field label="Contacto">
                  <input value={form.contacto_entrega || ''} onChange={e => set('contacto_entrega', e.target.value)} className={inp} />
                </Field>
              </div>
            </SECTION>

            {/* 5. GESTORES */}
            <SECTION title="5. Gestores *888 / *611">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre">
                  <input value={form.gestor_nombre || ''} onChange={e => set('gestor_nombre', e.target.value)} className={inp} />
                </Field>
                <Field label="Cédula">
                  <input value={form.gestor_ci || ''} onChange={e => set('gestor_ci', e.target.value)} className={inp} />
                </Field>
                <Field label="Celular">
                  <input value={form.gestor_celular || ''} onChange={e => set('gestor_celular', e.target.value)} className={inp} />
                </Field>
                <Field label="Correo">
                  <input type="email" value={form.gestor_correo || ''} onChange={e => set('gestor_correo', e.target.value)} className={inp} />
                </Field>
              </div>
            </SECTION>

            {/* 6. LÍNEAS */}
            <SECTION title="6. Líneas a Portar / Nuevas">
              <div className="space-y-3">
                {/* Bulk paste */}
                <div className="print:hidden">
                  <button
                    type="button"
                    onClick={() => setBulkOpen(v => !v)}
                    className="w-full flex items-center justify-center gap-2 py-2 border border-blue-300 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100"
                  >
                    📋 {bulkOpen ? 'Cerrar pegado en bloque' : 'Pegar varias líneas desde Excel'}
                  </button>
                  {bulkOpen && (
                    <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-blue-900 leading-relaxed">
                        Copia las filas desde Excel/Sheets y pégalas aquí. <strong>Orden de columnas:</strong>
                        <br />
                        <span className="font-mono text-[11px]">Usuario · Número · Tipo · Tarifa · BP · Equipo · Financiamiento · Feature · Código Feature</span>
                        <br />
                        <span className="text-blue-700">Tipo admite "PORTABILIDAD" o "LINEA NUEVA". Columnas faltantes quedan vacías.</span>
                      </p>
                      <textarea
                        value={bulkText}
                        onChange={e => setBulkText(e.target.value)}
                        rows={6}
                        placeholder={'Juan Pérez\t0999111222\tPORTABILIDAD\t$25\tBP01\tiPhone 13\tFinanciado\t...\t...\nMaría López\t0988333444\tLINEA NUEVA\t$35\t...'}
                        className="w-full px-3 py-2 border border-blue-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-claro-red outline-none bg-white"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => applyBulk('replace')}
                          className="px-3 py-1.5 bg-claro-red text-white rounded-lg text-xs font-semibold hover:bg-claro-red-dark"
                        >
                          Reemplazar líneas existentes
                        </button>
                        <button
                          type="button"
                          onClick={() => applyBulk('append')}
                          className="px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-50"
                        >
                          Agregar al final
                        </button>
                        <button
                          type="button"
                          onClick={() => { setBulkText(''); setBulkOpen(false); }}
                          className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {lineas.map((l, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 bg-white space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500">Línea {i + 1}</span>
                      {lineas.length > 1 && (
                        <button type="button" onClick={() => removeLinea(i)} className="text-xs text-red-500 hover:text-red-700">Eliminar</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Usuario / Nombre</label>
                        <input value={l.usuario || ''} onChange={e => setLinea(i, 'usuario', e.target.value)} className={inp} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Número a portarse</label>
                        <input value={l.numero_portar || ''} onChange={e => setLinea(i, 'numero_portar', e.target.value)} className={inp} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de transacción</label>
                        <select value={l.tipo_transaccion || 'PORTABILIDAD'} onChange={e => setLinea(i, 'tipo_transaccion', e.target.value)} className={sel}>
                          <option value="PORTABILIDAD">PORTABILIDAD</option>
                          <option value="LINEA NUEVA">LÍNEA NUEVA</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tarifa</label>
                        <input value={l.tarifa || ''} onChange={e => setLinea(i, 'tarifa', e.target.value)} className={inp} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">BP (Guía Comercial)</label>
                        <input value={l.bp || ''} onChange={e => setLinea(i, 'bp', e.target.value)} className={inp} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Equipo</label>
                        <input value={l.equipo || ''} onChange={e => setLinea(i, 'equipo', e.target.value)} className={inp} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Financiamiento</label>
                        <input value={l.financiamiento || ''} onChange={e => setLinea(i, 'financiamiento', e.target.value)} className={inp} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Feature</label>
                        <input value={l.feature || ''} onChange={e => setLinea(i, 'feature', e.target.value)} className={inp} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Código Feature (Guía Comercial)</label>
                        <input value={l.codigo_feature || ''} onChange={e => setLinea(i, 'codigo_feature', e.target.value)} className={inp} />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addLinea}
                  className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-claro-red hover:text-claro-red transition-colors"
                >
                  + Agregar línea
                </button>
              </div>
            </SECTION>

            {/* 7. DOCUMENTOS */}
            <div className="print:hidden">
              <DocUpload leadId={lead?.id} />
            </div>

          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 justify-end px-5 py-4 border-t flex-shrink-0 print:hidden">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cerrar</button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-claro-red text-white rounded-lg text-sm font-medium hover:bg-claro-red-dark disabled:opacity-60"
          >
            {saving ? 'Guardando...' : 'Guardar formulario'}
          </button>
        </div>
      </div>
    </div>
  );
}
