import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

function UserModal({ isOpen, onClose, onSave, editUser, supervisors }) {
  const [form, setForm] = useState({
    username: '', password: '', full_name: '', email: '', role: 'vendedor',
    supervisor_id: '', monthly_portability_goal: 30, daily_call_goal: 40, active: true
  });

  useEffect(() => {
    if (editUser) {
      setForm({ ...editUser, password: '', active: !!editUser.active });
    } else {
      setForm({ username: '', password: '', full_name: '', email: '', role: 'vendedor',
        supervisor_id: '', monthly_portability_goal: 30, daily_call_goal: 40, active: true });
    }
  }, [editUser, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...form };
      if (!data.password && editUser) delete data.password;
      if (editUser) {
        await api.put(`/users/${editUser.id}`, data);
        toast.success('Usuario actualizado');
      } else {
        await api.post('/users', data);
        toast.success('Usuario creado');
      }
      onSave(); onClose();
    } catch (err) { toast.error(err.message || 'Error al guardar'); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">{editUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
              <input type="text" value={form.full_name} onChange={e => set('full_name', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuario *</label>
              <input type="text" value={form.username} onChange={e => set('username', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" required disabled={!!editUser} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{editUser ? 'Nueva contraseña (opcional)' : 'Contraseña *'}</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" required={!editUser} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select value={form.role} onChange={e => set('role', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none">
                <option value="vendedor">Vendedor</option>
                <option value="supervisor">Supervisor</option>
                <option value="gerente">Gerente</option>
              </select>
            </div>
            {form.role === 'vendedor' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
                <select value={form.supervisor_id || ''} onChange={e => set('supervisor_id', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none">
                  <option value="">Sin asignar</option>
                  {supervisors.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meta portabilidades/mes</label>
              <input type="number" value={form.monthly_portability_goal} onChange={e => set('monthly_portability_goal', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meta llamadas/día</label>
              <input type="number" value={form.daily_call_goal} onChange={e => set('daily_call_goal', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-claro-red outline-none" />
            </div>
          </div>
          {editUser && (
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} id="active" className="rounded" />
              <label htmlFor="active" className="text-sm text-gray-700">Usuario activo</label>
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" className="px-4 py-2 bg-claro-red text-white rounded-lg hover:bg-claro-red-dark">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActivityLogModal({ isOpen, onClose, userId, userName }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    if (isOpen && userId) {
      api.get(`/users/${userId}/activity`).then(setLogs).catch(() => {});
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
          <h3 className="text-lg font-semibold">Actividad: {userName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-5 space-y-2">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-3 text-sm border-b pb-2">
              <span className="text-gray-400 text-xs whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</span>
              <span className="text-gray-700">{log.action}{log.details ? ` — ${log.details}` : ''}</span>
            </div>
          ))}
          {logs.length === 0 && <p className="text-center text-gray-500">Sin actividad registrada</p>}
        </div>
      </div>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showLog, setShowLog] = useState({ open: false, userId: null, userName: '' });

  const fetchUsers = async () => {
    try { setUsers(await api.get('/users')); }
    catch (e) { toast.error('Error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const supervisors = users.filter(u => u.role === 'supervisor');
  const roleColors = { gerente: 'bg-purple-100 text-purple-700', supervisor: 'bg-blue-100 text-blue-700', vendedor: 'bg-green-100 text-green-700' };

  // Group by supervisor
  const supervisorGroups = {};
  supervisors.forEach(s => {
    supervisorGroups[s.id] = { supervisor: s, vendedores: users.filter(u => u.role === 'vendedor' && u.supervisor_id === s.id) };
  });
  const unassigned = users.filter(u => u.role === 'vendedor' && !u.supervisor_id);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claro-red"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Administración de Usuarios</h1>
        <button onClick={() => { setEditingUser(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-claro-red text-white rounded-lg text-sm hover:bg-claro-red-dark">
          + Nuevo Usuario
        </button>
      </div>

      {/* Gerentes */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h3 className="font-semibold text-gray-700 mb-3">Gerencia</h3>
        <div className="space-y-2">
          {users.filter(u => u.role === 'gerente').map(u => (
            <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-200 rounded-full flex items-center justify-center text-purple-700 text-sm font-bold">{u.full_name.charAt(0)}</div>
                <div>
                  <p className="font-medium text-sm">{u.full_name}</p>
                  <p className="text-xs text-gray-500">@{u.username}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${roleColors[u.role]}`}>{u.role}</span>
              </div>
              <button onClick={() => setShowLog({ open: true, userId: u.id, userName: u.full_name })} className="text-xs text-gray-500 hover:text-gray-700">Ver actividad</button>
            </div>
          ))}
        </div>
      </div>

      {/* Supervisor teams */}
      {Object.values(supervisorGroups).map(({ supervisor, vendedores }) => (
        <div key={supervisor.id} className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-gray-700">Equipo: {supervisor.full_name}</h3>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${roleColors.supervisor}`}>Supervisor</span>
              {!supervisor.active && <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-600">Inactivo</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setEditingUser(supervisor); setShowModal(true); }} className="text-xs text-gray-500 hover:text-gray-700">Editar</button>
              <button onClick={() => setShowLog({ open: true, userId: supervisor.id, userName: supervisor.full_name })} className="text-xs text-gray-500 hover:text-gray-700">Actividad</button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">Meta: {supervisor.monthly_portability_goal} port/mes | {supervisor.daily_call_goal} llamadas/día</p>
          <div className="space-y-2">
            {vendedores.map(v => (
              <div key={v.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-green-200 rounded-full flex items-center justify-center text-green-700 text-xs font-bold">{v.full_name.charAt(0)}</div>
                  <div>
                    <p className="font-medium text-sm">{v.full_name} {!v.active ? <span className="text-red-500 text-xs">(Inactivo)</span> : ''}</p>
                    <p className="text-xs text-gray-500">@{v.username} | Meta: {v.monthly_portability_goal} port | {v.daily_call_goal} llam/día</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setEditingUser(v); setShowModal(true); }} className="text-xs text-gray-500 hover:text-gray-700">Editar</button>
                  <button onClick={() => setShowLog({ open: true, userId: v.id, userName: v.full_name })} className="text-xs text-gray-500 hover:text-gray-700">Actividad</button>
                </div>
              </div>
            ))}
            {vendedores.length === 0 && <p className="text-sm text-gray-400 text-center py-2">Sin vendedores asignados</p>}
          </div>
        </div>
      ))}

      {/* Unassigned */}
      {unassigned.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="font-semibold text-gray-700 mb-3">Vendedores sin Supervisor</h3>
          <div className="space-y-2">
            {unassigned.map(v => (
              <div key={v.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-yellow-200 rounded-full flex items-center justify-center text-yellow-700 text-xs font-bold">{v.full_name.charAt(0)}</div>
                  <div>
                    <p className="font-medium text-sm">{v.full_name}</p>
                    <p className="text-xs text-gray-500">@{v.username}</p>
                  </div>
                </div>
                <button onClick={() => { setEditingUser(v); setShowModal(true); }} className="text-xs text-gray-500 hover:text-gray-700">Editar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <UserModal isOpen={showModal} onClose={() => setShowModal(false)} onSave={fetchUsers} editUser={editingUser} supervisors={supervisors} />
      <ActivityLogModal isOpen={showLog.open} onClose={() => setShowLog({ open: false, userId: null, userName: '' })} userId={showLog.userId} userName={showLog.userName} />
    </div>
  );
}
