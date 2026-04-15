import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { PIPELINE_STATUSES } from '../utils/constants';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const CRM_FIELDS = [
  { key: 'full_name', label: 'Nombre completo', required: false, aliases: ['nombre', 'name', 'cliente', 'contacto', 'nombre_completo', 'nombres'] },
  { key: 'phone_primary', label: 'Teléfono', required: true, aliases: ['celular', 'phone', 'numero', 'movil', 'tel', 'telefono', 'teléfono', 'número', 'móvil'] },
  { key: 'city', label: 'Ciudad', required: false, aliases: ['ciudad', 'city', 'localidad', 'zona'] },
  { key: 'operator_origin', label: 'Operadora origen', required: false, aliases: ['operadora', 'carrier', 'empresa', 'proveedor', 'operadora_origen'] },
  { key: 'current_plan', label: 'Plan actual', required: false, aliases: ['plan', 'plan_actual', 'tarifa'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email', 'correo', 'mail'] },
];

function normalize(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function autoMapColumns(headers) {
  const mapping = {};
  headers.forEach((h, i) => {
    const norm = normalize(h);
    for (const field of CRM_FIELDS) {
      if (Object.values(mapping).includes(field.key)) continue;
      const match = field.aliases.some(a => normalize(a) === norm || norm.includes(normalize(a)));
      if (match) {
        mapping[i] = field.key;
        break;
      }
    }
  });
  return mapping;
}

const STEPS = ['upload', 'map', 'assign', 'duplicates', 'confirm', 'importing', 'results'];

export default function Import() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('import'); // 'import' | 'history'
  const [step, setStep] = useState(0); // index into STEPS

  // Upload state
  const [file, setFile] = useState(null);
  const [rawData, setRawData] = useState([]); // all rows as arrays
  const [headers, setHeaders] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState('');

  // Mapping state
  const [columnMap, setColumnMap] = useState({}); // colIndex -> crmFieldKey
  const [autoMapped, setAutoMapped] = useState({}); // colIndex -> true if auto-mapped

  // Assignment state
  const [vendors, setVendors] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [sources, setSources] = useState([]);
  const [assignment, setAssignment] = useState({
    vendor_ids: [], distribute: false, campaign_id: '', source_id: '', batch_notes: ''
  });

  // Duplicates state
  const [duplicates, setDuplicates] = useState({}); // phone -> existing lead info
  const [dupActions, setDupActions] = useState({}); // phone -> 'skip'|'replace'|'merge'

  // Import state
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState(null);

  // History state
  const [history, setHistory] = useState([]);

  // Load config data on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [v, c, s] = await Promise.all([
          api.get('/users'),
          api.get('/config/campaigns'),
          api.get('/config/sources'),
        ]);
        setVendors(v.filter(u => u.active));
        setCampaigns(c.filter(c => c.active));
        setSources(s.filter(s => s.active));
      } catch (e) { /* ignore */ }
    };
    load();
  }, []);

  const fetchHistory = async () => {
    try {
      const data = await api.get('/imports/history');
      setHistory(data);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { if (tab === 'history') fetchHistory(); }, [tab]);

  // --- File parsing ---
  const parseFile = useCallback((f) => {
    setParseError('');
    if (f.size > 10 * 1024 * 1024) {
      setParseError('El archivo excede el tamaño máximo de 10 MB');
      return;
    }
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setParseError('Formato no soportado. Use .xlsx, .xls o .csv');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (json.length < 2) {
          setParseError('El archivo está vacío o solo tiene encabezados');
          return;
        }

        const hdrs = json[0].map(h => String(h).trim());
        const rows = json.slice(1).filter(r => r.some(cell => cell !== ''));

        setHeaders(hdrs);
        setRawData(rows);
        setFile(f);

        // Auto-map
        const map = autoMapColumns(hdrs);
        setColumnMap(map);
        setAutoMapped({ ...map });

        setStep(0); // stay on upload to show preview
      } catch (err) {
        setParseError('Error al leer el archivo: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) parseFile(f);
  }, [parseFile]);

  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    if (f) parseFile(f);
  };

  // --- Build mapped leads from raw data ---
  const getMappedLeads = () => {
    const reverseMap = {};
    Object.entries(columnMap).forEach(([col, field]) => {
      if (field) reverseMap[field] = parseInt(col);
    });

    return rawData.map(row => {
      const lead = {};
      CRM_FIELDS.forEach(f => {
        const colIdx = reverseMap[f.key];
        lead[f.key] = colIdx !== undefined ? String(row[colIdx] || '').trim() : '';
      });
      return lead;
    });
  };

  // --- Step: Check duplicates ---
  const checkDuplicates = async () => {
    const leads = getMappedLeads();
    const phoneCol = Object.entries(columnMap).find(([, v]) => v === 'phone_primary');
    if (!phoneCol) return;

    const phones = leads.map(l => l.phone_primary.replace(/\D/g, '')).filter(Boolean);
    try {
      const dups = await api.post('/imports/check-duplicates', { phones });
      setDuplicates(dups);
      const actions = {};
      Object.keys(dups).forEach(p => { actions[p] = 'skip'; });
      setDupActions(actions);
      return dups;
    } catch (e) {
      toast.error('Error al verificar duplicados');
      return {};
    }
  };

  // --- Step: Execute import ---
  const executeImport = async () => {
    setStep(5); // 'importing'
    setImportProgress(10);
    const leads = getMappedLeads();

    try {
      setImportProgress(30);
      const result = await api.post('/imports', {
        leads,
        assignment: {
          vendor_ids: assignment.distribute ? assignment.vendor_ids : [assignment.vendor_ids[0]],
          campaign_id: parseInt(assignment.campaign_id),
          source_id: assignment.source_id ? parseInt(assignment.source_id) : null,
          batch_notes: assignment.batch_notes || null,
        },
        duplicates: dupActions,
        file_name: file?.name || 'import.xlsx',
      });
      setImportProgress(100);
      setImportResults(result);
      setStep(6); // 'results'
    } catch (e) {
      toast.error(e.message || 'Error al importar');
      setStep(4); // back to confirm
    }
  };

  // --- Navigation ---
  const canAdvance = () => {
    if (step === 0) return file && rawData.length > 0;
    if (step === 1) return Object.values(columnMap).includes('phone_primary');
    if (step === 2) return assignment.campaign_id && assignment.vendor_ids.length > 0;
    if (step === 3) return true;
    if (step === 4) return true;
    return false;
  };

  const handleNext = async () => {
    if (step === 2) {
      // After assignment, check duplicates
      const dups = await checkDuplicates();
      if (dups && Object.keys(dups).length > 0) {
        setStep(3); // show duplicates
      } else {
        setStep(4); // skip to confirm
      }
    } else if (step === 4) {
      executeImport();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleBack = () => {
    if (step === 4 && Object.keys(duplicates).length === 0) {
      setStep(2); // skip duplicates step going back
    } else {
      setStep(s => s - 1);
    }
  };

  const resetWizard = () => {
    setStep(0); setFile(null); setRawData([]); setHeaders([]);
    setColumnMap({}); setAutoMapped({}); setParseError('');
    setAssignment({ vendor_ids: [], distribute: false, campaign_id: '', source_id: '', batch_notes: '' });
    setDuplicates({}); setDupActions({}); setImportResults(null); setImportProgress(0);
  };

  // --- Operator warning ---
  const operatorWarnings = () => {
    const opCol = Object.entries(columnMap).find(([, v]) => v === 'operator_origin');
    if (!opCol) return [];
    const colIdx = parseInt(opCol[0]);
    const validOps = ['movistar', 'tigo'];
    const invalid = new Set();
    rawData.forEach(row => {
      const val = normalize(String(row[colIdx] || ''));
      if (val && !validOps.some(o => val.includes(o))) invalid.add(String(row[colIdx]));
    });
    return [...invalid];
  };

  const getStatusLabel = (key) => {
    const s = PIPELINE_STATUSES.find(p => p.key === key);
    return s ? s.label : key;
  };

  // ======================== RENDER ========================
  const stepName = STEPS[step];

  return (
    <div className="space-y-6">
      {/* Header with tabs */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Importar Base de Datos</h1>
        <div className="flex bg-gray-200 rounded-lg p-1">
          <button onClick={() => { setTab('import'); }} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${tab === 'import' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}>
            Importar
          </button>
          <button onClick={() => { setTab('history'); }} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${tab === 'history' ? 'bg-white shadow text-gray-900' : 'text-gray-600'}`}>
            Historial
          </button>
        </div>
      </div>

      {tab === 'history' ? (
        <HistoryTab history={history} navigate={navigate} />
      ) : (
        <>
          {/* Step indicator */}
          {step < 5 && (
            <div className="flex items-center gap-2 text-sm">
              {['Archivo', 'Mapeo', 'Asignación', 'Duplicados', 'Confirmar'].map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i < step ? 'bg-green-500 text-white' : i === step ? 'bg-claro-red text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span className={i === step ? 'font-semibold text-gray-900' : 'text-gray-400'}>{label}</span>
                  {i < 4 && <div className="w-8 h-0.5 bg-gray-200" />}
                </div>
              ))}
            </div>
          )}

          {/* STEP 1: Upload */}
          {stepName === 'upload' && (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                  dragOver ? 'border-claro-red bg-red-50' : 'border-gray-300 hover:border-gray-400'
                }`}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
              >
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="mt-4 text-gray-600">Arrastra tu archivo aquí o</p>
                <label className="mt-2 inline-block px-4 py-2 bg-claro-red text-white rounded-lg text-sm cursor-pointer hover:bg-claro-red-dark">
                  Seleccionar archivo
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />
                </label>
                <p className="mt-2 text-xs text-gray-400">Formatos: .xlsx, .xls, .csv — Máximo 10 MB</p>
              </div>

              {parseError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{parseError}</div>
              )}

              {file && rawData.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-700">Vista previa: {file.name}</h3>
                      <p className="text-sm text-gray-500">{rawData.length} filas detectadas, {headers.length} columnas</p>
                    </div>
                    <button onClick={resetWizard} className="text-sm text-gray-500 hover:text-red-600">Cambiar archivo</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                          {headers.map((h, i) => (
                            <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rawData.slice(0, 5).map((row, ri) => (
                          <tr key={ri} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{ri + 1}</td>
                            {headers.map((_, ci) => (
                              <td key={ci} className="px-3 py-2 text-gray-700 max-w-[200px] truncate">{row[ci]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rawData.length > 5 && <p className="text-xs text-gray-400 text-center">... y {rawData.length - 5} filas más</p>}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Column Mapping */}
          {stepName === 'map' && (
            <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-700 mb-1">Mapeo de Columnas</h3>
                <p className="text-sm text-gray-500">Relaciona las columnas del archivo con los campos del CRM. El campo Teléfono es obligatorio.</p>
              </div>
              <div className="space-y-3">
                {headers.map((h, i) => {
                  const isAuto = autoMapped[i] !== undefined;
                  const isMapped = columnMap[i] !== undefined && columnMap[i] !== '';
                  return (
                    <div key={i} className={`flex items-center gap-4 p-3 rounded-lg border ${
                      isMapped ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'
                    }`}>
                      <div className="w-1/3">
                        <span className="text-sm font-medium text-gray-700">{h}</span>
                        <span className="text-xs text-gray-400 ml-2">(col {i + 1})</span>
                      </div>
                      <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                      <select
                        value={columnMap[i] || ''}
                        onChange={(e) => setColumnMap(prev => {
                          const next = { ...prev };
                          if (e.target.value) next[i] = e.target.value;
                          else delete next[i];
                          return next;
                        })}
                        className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none"
                      >
                        <option value="">— ignorar —</option>
                        {CRM_FIELDS.map(f => {
                          const usedBy = Object.entries(columnMap).find(([col, val]) => val === f.key && parseInt(col) !== i);
                          return (
                            <option key={f.key} value={f.key} disabled={!!usedBy}>
                              {f.label} {f.required ? '(requerido)' : ''} {usedBy ? '(ya asignado)' : ''}
                            </option>
                          );
                        })}
                      </select>
                      {isAuto && isMapped && <span className="text-xs text-green-600 font-medium whitespace-nowrap">Auto</span>}
                    </div>
                  );
                })}
              </div>

              {!Object.values(columnMap).includes('phone_primary') && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                  El campo <strong>Teléfono</strong> debe estar mapeado para continuar.
                </div>
              )}

              {operatorWarnings().length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-yellow-800 text-sm">
                  <strong>Advertencia:</strong> Se encontraron operadoras no estándar: {operatorWarnings().join(', ')}. Los valores esperados son "Movistar" o "Tigo".
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Assignment */}
          {stepName === 'assign' && (
            <div className="bg-white rounded-xl shadow-sm border p-5 space-y-5">
              <h3 className="font-semibold text-gray-700">Asignación Masiva</h3>

              {/* Vendor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Agente responsable</label>
                <div className="flex items-center gap-3 mb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={assignment.distribute}
                      onChange={e => setAssignment(a => ({ ...a, distribute: e.target.checked, vendor_ids: e.target.checked ? a.vendor_ids : a.vendor_ids.slice(0, 1) }))}
                      className="rounded" />
                    Distribuir equitativamente (round-robin)
                  </label>
                </div>
                {assignment.distribute ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {vendors.filter(v => v.role === 'vendedor').map(v => (
                      <label key={v.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${
                        assignment.vendor_ids.includes(v.id) ? 'border-claro-red bg-red-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}>
                        <input type="checkbox" checked={assignment.vendor_ids.includes(v.id)}
                          onChange={(e) => {
                            setAssignment(a => ({
                              ...a,
                              vendor_ids: e.target.checked
                                ? [...a.vendor_ids, v.id]
                                : a.vendor_ids.filter(id => id !== v.id)
                            }));
                          }} className="rounded" />
                        {v.full_name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <select value={assignment.vendor_ids[0] || ''}
                    onChange={e => setAssignment(a => ({ ...a, vendor_ids: [parseInt(e.target.value)] }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none">
                    <option value="">Seleccione un agente...</option>
                    {vendors.filter(v => v.role === 'vendedor').map(v => (
                      <option key={v.id} value={v.id}>{v.full_name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Campaign */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campaña <span className="text-red-500">*</span></label>
                <select value={assignment.campaign_id}
                  onChange={e => setAssignment(a => ({ ...a, campaign_id: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none">
                  <option value="">Seleccione una campaña...</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {campaigns.length === 0 && (
                  <p className="text-xs text-yellow-600 mt-1">No hay campañas creadas. Vaya a Configuración para agregar una.</p>
                )}
              </div>

              {/* Status & Pipeline (fixed) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado inicial</label>
                  <input type="text" value="Sin gestionar" disabled className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-100 text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Etapa del pipeline</label>
                  <input type="text" value="Lead Nuevo" disabled className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-100 text-gray-500" />
                </div>
              </div>

              {/* Source */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fuente</label>
                <select value={assignment.source_id}
                  onChange={e => setAssignment(a => ({ ...a, source_id: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none">
                  <option value="">Seleccione una fuente...</option>
                  {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Batch notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas de lote (opcional)</label>
                <textarea value={assignment.batch_notes}
                  onChange={e => setAssignment(a => ({ ...a, batch_notes: e.target.value }))}
                  placeholder="Estas notas se agregarán a todos los leads importados..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none" />
              </div>
            </div>
          )}

          {/* STEP 4: Duplicates */}
          {stepName === 'duplicates' && (
            <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-700">Duplicados Detectados</h3>
                  <p className="text-sm text-gray-500">{Object.keys(duplicates).length} número(s) ya existen en el CRM</p>
                </div>
                <div className="flex gap-2">
                  {['skip', 'replace', 'merge'].map(action => (
                    <button key={action} onClick={() => {
                      const all = {};
                      Object.keys(duplicates).forEach(p => all[p] = action);
                      setDupActions(all);
                    }} className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50">
                      Todos: {action === 'skip' ? 'Omitir' : action === 'replace' ? 'Reemplazar' : 'Fusionar'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {Object.entries(duplicates).map(([phone, existing]) => {
                  const incoming = getMappedLeads().find(l => l.phone_primary.replace(/\D/g, '') === phone);
                  return (
                    <div key={phone} className="border rounded-lg p-4">
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-1">Teléfono</p>
                          <p className="text-sm font-mono">{phone}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-blue-600 mb-1">Existente en CRM</p>
                          <p className="text-sm font-medium">{existing.full_name}</p>
                          <p className="text-xs text-gray-500">{getStatusLabel(existing.pipeline_status)} — {existing.vendor_name}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-orange-600 mb-1">Entrante (archivo)</p>
                          <p className="text-sm font-medium">{incoming?.full_name || '—'}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {[
                          { val: 'skip', label: 'Omitir', desc: 'No importar', color: 'gray' },
                          { val: 'replace', label: 'Reemplazar', desc: 'Sobrescribir datos', color: 'red' },
                          { val: 'merge', label: 'Fusionar', desc: 'Solo campos vacíos', color: 'blue' },
                        ].map(opt => (
                          <button key={opt.val}
                            onClick={() => setDupActions(prev => ({ ...prev, [phone]: opt.val }))}
                            className={`flex-1 p-2 rounded-lg border text-sm transition ${
                              dupActions[phone] === opt.val
                                ? `border-${opt.color}-500 bg-${opt.color}-50 font-medium`
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}>
                            <div className="font-medium">{opt.label}</div>
                            <div className="text-xs text-gray-500">{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-3 flex gap-6 text-sm">
                <span>Omitir: <strong>{Object.values(dupActions).filter(a => a === 'skip').length}</strong></span>
                <span>Reemplazar: <strong>{Object.values(dupActions).filter(a => a === 'replace').length}</strong></span>
                <span>Fusionar: <strong>{Object.values(dupActions).filter(a => a === 'merge').length}</strong></span>
              </div>
            </div>
          )}

          {/* STEP 5: Confirm */}
          {stepName === 'confirm' && (
            <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
              <h3 className="font-semibold text-gray-700">Confirmar Importación</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between p-2 bg-gray-50 rounded"><span className="text-gray-500">Archivo:</span><span className="font-medium">{file?.name}</span></div>
                  <div className="flex justify-between p-2 bg-gray-50 rounded"><span className="text-gray-500">Total registros:</span><span className="font-medium">{rawData.length}</span></div>
                  <div className="flex justify-between p-2 bg-gray-50 rounded"><span className="text-gray-500">Nuevos:</span><span className="font-medium text-green-600">{rawData.length - Object.keys(duplicates).length}</span></div>
                  <div className="flex justify-between p-2 bg-gray-50 rounded"><span className="text-gray-500">Duplicados:</span><span className="font-medium text-yellow-600">{Object.keys(duplicates).length}</span></div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between p-2 bg-gray-50 rounded"><span className="text-gray-500">Campaña:</span><span className="font-medium">{campaigns.find(c => c.id == assignment.campaign_id)?.name || '—'}</span></div>
                  <div className="flex justify-between p-2 bg-gray-50 rounded"><span className="text-gray-500">Agente(s):</span><span className="font-medium">{
                    assignment.distribute
                      ? `${assignment.vendor_ids.length} agentes (round-robin)`
                      : vendors.find(v => v.id === assignment.vendor_ids[0])?.full_name || '—'
                  }</span></div>
                  <div className="flex justify-between p-2 bg-gray-50 rounded"><span className="text-gray-500">Fuente:</span><span className="font-medium">{sources.find(s => s.id == assignment.source_id)?.name || 'Sin fuente'}</span></div>
                  <div className="flex justify-between p-2 bg-gray-50 rounded"><span className="text-gray-500">Estado inicial:</span><span className="font-medium">Lead Nuevo</span></div>
                </div>
              </div>

              {Object.keys(duplicates).length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                  <strong>Resolución de duplicados:</strong>{' '}
                  {Object.values(dupActions).filter(a => a === 'skip').length} omitir,{' '}
                  {Object.values(dupActions).filter(a => a === 'replace').length} reemplazar,{' '}
                  {Object.values(dupActions).filter(a => a === 'merge').length} fusionar
                </div>
              )}
            </div>
          )}

          {/* STEP 6: Importing (progress) */}
          {stepName === 'importing' && (
            <div className="bg-white rounded-xl shadow-sm border p-12 text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-claro-red mx-auto" />
              <h3 className="font-semibold text-gray-700 text-lg">Importando registros...</h3>
              <div className="w-full bg-gray-200 rounded-full h-3 max-w-md mx-auto">
                <div className="bg-claro-red h-3 rounded-full transition-all duration-500" style={{ width: `${importProgress}%` }} />
              </div>
              <p className="text-sm text-gray-500">Procesando {rawData.length} registros</p>
            </div>
          )}

          {/* STEP 7: Results */}
          {stepName === 'results' && importResults && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-sm border p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900">Importación Completada</h3>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-2xl mx-auto">
                  {[
                    { label: 'Total', value: importResults.total, color: 'gray' },
                    { label: 'Creados', value: importResults.created, color: 'green' },
                    { label: 'Reemplazados', value: importResults.replaced, color: 'blue' },
                    { label: 'Fusionados', value: importResults.merged, color: 'purple' },
                    { label: 'Omitidos', value: importResults.skipped, color: 'yellow' },
                  ].map(s => (
                    <div key={s.label} className={`p-3 rounded-lg bg-${s.color}-50 border border-${s.color}-200`}>
                      <div className={`text-2xl font-bold text-${s.color}-700`}>{s.value}</div>
                      <div className="text-xs text-gray-600">{s.label}</div>
                    </div>
                  ))}
                </div>

                {importResults.errors && importResults.errors.length > 0 && (
                  <div className="text-left max-w-2xl mx-auto">
                    <h4 className="font-semibold text-red-700 mb-2">Errores ({importResults.errors.length})</h4>
                    <div className="bg-red-50 border border-red-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                      <table className="min-w-full text-sm">
                        <thead><tr className="bg-red-100"><th className="px-3 py-1.5 text-left">Fila</th><th className="px-3 py-1.5 text-left">Teléfono</th><th className="px-3 py-1.5 text-left">Error</th></tr></thead>
                        <tbody>
                          {importResults.errors.map((e, i) => (
                            <tr key={i} className="border-t border-red-100"><td className="px-3 py-1.5">{e.row}</td><td className="px-3 py-1.5 font-mono">{e.phone}</td><td className="px-3 py-1.5">{e.error}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 justify-center pt-2">
                  <button onClick={resetWizard} className="px-4 py-2 bg-claro-red text-white rounded-lg text-sm hover:bg-claro-red-dark">
                    Nueva importación
                  </button>
                  <button onClick={() => navigate(`/leads?import_id=${importResults.importId}`)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    Ver leads importados
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          {step < 5 && (
            <div className="flex justify-between">
              <button onClick={step === 0 ? undefined : handleBack} disabled={step === 0}
                className={`px-4 py-2 rounded-lg text-sm ${step === 0 ? 'text-gray-300' : 'text-gray-600 hover:bg-gray-100'}`}>
                Atrás
              </button>
              <button onClick={handleNext} disabled={!canAdvance()}
                className={`px-6 py-2 rounded-lg text-sm font-medium text-white ${
                  canAdvance() ? 'bg-claro-red hover:bg-claro-red-dark' : 'bg-gray-300 cursor-not-allowed'
                }`}>
                {step === 4 ? 'Confirmar importación' : 'Siguiente'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- History Tab Component ---
function HistoryTab({ history, navigate }) {
  if (history.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
        <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
        <p className="mt-4 text-gray-500">No hay importaciones registradas</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Usuario</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Archivo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Campaña</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Total</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-green-600">Nuevos</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-blue-600">Reemp.</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-purple-600">Fusion.</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-yellow-600">Omitidos</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-red-600">Errores</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {history.map(h => (
              <tr key={h.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">{new Date(h.created_at).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="px-4 py-3">{h.user_name}</td>
                <td className="px-4 py-3 max-w-[200px] truncate font-mono text-xs">{h.file_name}</td>
                <td className="px-4 py-3">{h.campaign_name || '—'}</td>
                <td className="px-4 py-3 text-center font-medium">{h.total_records}</td>
                <td className="px-4 py-3 text-center text-green-600">{h.new_records}</td>
                <td className="px-4 py-3 text-center text-blue-600">{h.replaced_records}</td>
                <td className="px-4 py-3 text-center text-purple-600">{h.merged_records}</td>
                <td className="px-4 py-3 text-center text-yellow-600">{h.skipped_records}</td>
                <td className="px-4 py-3 text-center text-red-600">{h.error_records}</td>
                <td className="px-4 py-3">
                  <button onClick={() => navigate(`/leads?import_id=${h.id}`)} className="text-xs text-claro-red hover:underline">
                    Ver leads
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
