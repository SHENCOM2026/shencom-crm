import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

function CRUDSection({ title, items, fields, onSave, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [showForm, setShowForm] = useState(false);

  const startEdit = (item) => { setEditing(item.id); setForm({ ...item }); setShowForm(true); };
  const startNew = () => {
    setEditing(null);
    const empty = {};
    fields.forEach(f => empty[f.key] = f.default || '');
    setForm(empty);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      await onSave(form, editing);
      setShowForm(false);
      setEditing(null);
    } catch (e) { toast.error('Error al guardar'); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-gray-700">{title}</h3>
        <button onClick={startNew} className="px-2.5 py-1 bg-claro-red text-white rounded-lg text-xs hover:bg-claro-red-dark">+ Agregar</button>
      </div>

      {showForm && (
        <div className="p-4 border-b bg-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {fields.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                <input type={f.type || 'text'} step={f.step} value={form[f.key] || ''}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-claro-red outline-none" />
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end mt-3">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-gray-600 text-sm hover:bg-gray-200 rounded-lg">Cancelar</button>
            <button onClick={handleSave} className="px-3 py-1.5 bg-claro-red text-white text-sm rounded-lg hover:bg-claro-red-dark">{editing ? 'Actualizar' : 'Crear'}</button>
          </div>
        </div>
      )}

      <div className="divide-y">
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between p-3 hover:bg-gray-50">
            <div className="flex-1 flex gap-4 text-sm">
              {fields.map((f, i) => (
                <span key={f.key} className={i === 0 ? 'font-medium' : 'text-gray-500'}>
                  {f.prefix || ''}{item[f.key]}{f.suffix || ''}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => startEdit(item)} className="text-xs text-gray-500 hover:text-gray-700">Editar</button>
              <button onClick={() => { if (confirm('¿Eliminar?')) onDelete(item.id); }} className="text-xs text-red-500 hover:text-red-700">Eliminar</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="p-4 text-center text-gray-500 text-sm">Sin registros</div>}
      </div>
    </div>
  );
}

export default function Settings() {
  const [plans, setPlans] = useState([]);
  const [operators, setOperators] = useState([]);
  const [sources, setSources] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [users, setUsers] = useState([]);
  const [commConfig, setCommConfig] = useState({
    period_type: 'mensual', overcommission_threshold_pct: 120, overcommission_multiplier: 1.5
  });
  const [loading, setLoading] = useState(true);
  const [deletingUser, setDeletingUser] = useState(null);

  // Get current user from localStorage
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isGerente = currentUser.role === 'gerente';

  const fetchAll = async () => {
    try {
      const promises = [
        api.get('/config/plans'),
        api.get('/config/operators'),
        api.get('/config/sources'),
        api.get('/config/rejection-reasons'),
        api.get('/commissions/config'),
      ];
      if (isGerente) promises.push(api.get('/users'));
      const results = await Promise.all(promises);
      setPlans(results[0]); setOperators(results[1]); setSources(results[2]); setReasons(results[3]);
      if (results[4]) setCommConfig(results[4]);
      if (isGerente && results[5]) setUsers(results[5]);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  // Plans
  const handlePlanSave = async (form, editId) => {
    if (editId) await api.put(`/config/plans/${editId}`, form);
    else await api.post('/config/plans', form);
    toast.success('Plan guardado'); fetchAll();
  };
  const handlePlanDelete = async (id) => { await api.delete(`/config/plans/${id}`); toast.success('Eliminado'); fetchAll(); };

  // Operators
  const handleOpSave = async (form, editId) => {
    if (editId) await api.put(`/config/operators/${editId}`, form);
    else await api.post('/config/operators', form);
    toast.success('Guardado'); fetchAll();
  };
  const handleOpDelete = async (id) => { await api.delete(`/config/operators/${id}`); toast.success('Eliminado'); fetchAll(); };

  // Sources
  const handleSrcSave = async (form, editId) => {
    if (editId) await api.put(`/config/sources/${editId}`, form);
    else await api.post('/config/sources', form);
    toast.success('Guardado'); fetchAll();
  };
  const handleSrcDelete = async (id) => { await api.delete(`/config/sources/${id}`); toast.success('Eliminado'); fetchAll(); };

  // Rejection reasons
  const handleReasonSave = async (form, editId) => {
    if (editId) await api.put(`/config/rejection-reasons/${editId}`, form);
    else await api.post('/config/rejection-reasons', form);
    toast.success('Guardado'); fetchAll();
  };
  const handleReasonDelete = async (id) => { await api.delete(`/config/rejection-reasons/${id}`); toast.success('Eliminado'); fetchAll(); };

  const handleCommConfigSave = async () => {
    try {
      await api.put('/commissions/config', commConfig);
      toast.success('Configuración guardada');
    } catch (e) { toast.error('Error'); }
  };

  const handleBackup = async () => {
    try {
      await api.download('/config/backup', `shencom_backup_${new Date().toISOString().split('T')[0]}.db`);
      toast.success('Backup descargado');
    } catch (e) { toast.error('Error al descargar backup'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configuración del Sistema</h1>

      <CRUDSection title="Catálogo de Planes Claro" items={plans}
        fields={[
          { key: 'name', label: 'Nombre', default: '' },
          { key: 'price', label: 'Precio/mes ($)', type: 'number', step: '0.01', default: '0', prefix: '$' },
          { key: 'commission', label: 'Comisión ($)', type: 'number', step: '0.01', default: '0', prefix: '$' },
        ]}
        onSave={handlePlanSave} onDelete={handlePlanDelete} />

      <CRUDSection title="Operadores Origen" items={operators}
        fields={[{ key: 'name', label: 'Nombre', default: '' }]}
        onSave={handleOpSave} onDelete={handleOpDelete} />

      <CRUDSection title="Fuentes de Leads" items={sources}
        fields={[{ key: 'name', label: 'Nombre', default: '' }]}
        onSave={handleSrcSave} onDelete={handleSrcDelete} />

      <CRUDSection title="Motivos de Rechazo" items={reasons}
        fields={[{ key: 'name', label: 'Nombre', default: '' }]}
        onSave={handleReasonSave} onDelete={handleReasonDelete} />

      {/* Commission Config */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h3 className="font-semibold text-gray-700 mb-4">Parámetros de Comisiones</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Umbral sobre-comisión (% meta)</label>
            <div className="flex items-center gap-2">
              <input type="number" value={commConfig.overcommission_threshold_pct}
                onChange={e => setCommConfig(c => ({ ...c, overcommission_threshold_pct: parseFloat(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
              <span className="text-gray-500 text-sm">%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Al superar este % de la meta, se activa la sobre-comisión</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Multiplicador sobre-comisión</label>
            <div className="flex items-center gap-2">
              <input type="number" step="0.1" value={commConfig.overcommission_multiplier}
                onChange={e => setCommConfig(c => ({ ...c, overcommission_multiplier: parseFloat(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
              <span className="text-gray-500 text-sm">x</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Periodo de liquidación</label>
            <select value={commConfig.period_type}
              onChange={e => setCommConfig(c => ({ ...c, period_type: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none">
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <button onClick={handleCommConfigSave} className="px-4 py-2 bg-claro-red text-white rounded-lg text-sm hover:bg-claro-red-dark">
            Guardar Configuración
          </button>
        </div>
      </div>

      {/* User Management - Delete */}
      {isGerente && (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <h3 className="font-semibold text-gray-700">Eliminar Usuarios</h3>
              <p className="text-xs text-gray-400 mt-0.5">Solo usuarios sin leads asignados pueden ser eliminados</p>
            </div>
            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-lg">Solo Gerente</span>
          </div>
          <div className="divide-y">
            {users.filter(u => u.id !== currentUser.id).map(user => (
              <div key={user.id} className="flex items-center justify-between p-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                    user.role === 'gerente' ? 'bg-purple-500' : user.role === 'supervisor' ? 'bg-blue-500' : 'bg-green-500'
                  }`}>
                    {user.full_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-800">{user.full_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">@{user.username}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        user.role === 'gerente' ? 'bg-purple-100 text-purple-700' :
                        user.role === 'supervisor' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>{user.role}</span>
                      {!user.active && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">inactivo</span>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setDeletingUser(user)}
                  className="px-3 py-1.5 text-xs text-red-600 border border-red-300 rounded-lg hover:bg-red-50 hover:border-red-400 transition-colors"
                >
                  Eliminar
                </button>
              </div>
            ))}
            {users.filter(u => u.id !== currentUser.id).length === 0 && (
              <div className="p-4 text-center text-gray-500 text-sm">No hay otros usuarios para gestionar</div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Confirmar eliminación</h3>
                <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-1">
              ¿Está seguro que desea eliminar al usuario <strong>{deletingUser.full_name}</strong>?
            </p>
            <p className="text-xs text-gray-400 mb-5">
              Se eliminarán sus notificaciones, registros de actividad y referencias de supervisión.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await api.delete(`/users/${deletingUser.id}`);
                    toast.success(res.message || 'Usuario eliminado');
                    setDeletingUser(null);
                    fetchAll();
                  } catch (e) {
                    toast.error(e.message || 'Error al eliminar usuario');
                  }
                }}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h3 className="font-semibold text-gray-700 mb-3">Backup de Base de Datos</h3>
        <p className="text-sm text-gray-500 mb-3">Descarga una copia del archivo SQLite.</p>
        <button onClick={handleBackup} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700">
          ⬇ Descargar Backup (.db)
        </button>
      </div>
    </div>
  );
}
