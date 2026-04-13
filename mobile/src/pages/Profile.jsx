import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="p-4 space-y-4">
      {/* User card */}
      <div className="card flex items-center gap-4">
        <div className="w-16 h-16 bg-claro-red rounded-full flex items-center justify-center">
          <span className="text-white text-2xl font-bold">{user?.full_name?.[0] || 'U'}</span>
        </div>
        <div>
          <h2 className="font-bold text-lg">{user?.full_name}</h2>
          <p className="text-sm text-gray-500">@{user?.username}</p>
          <span className="text-xs bg-claro-red/10 text-claro-red px-2 py-0.5 rounded-full capitalize">{user?.role}</span>
        </div>
      </div>

      {/* Info */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-sm text-gray-700">Información</h3>
        <div className="flex justify-between py-2 border-b border-gray-50">
          <span className="text-sm text-gray-500">Email</span>
          <span className="text-sm">{user?.email || '-'}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-gray-50">
          <span className="text-sm text-gray-500">Rol</span>
          <span className="text-sm capitalize">{user?.role}</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-sm text-gray-500">ID Usuario</span>
          <span className="text-sm">{user?.id}</span>
        </div>
      </div>

      {/* Links */}
      <div className="card space-y-1 p-0">
        <a href="/" target="_blank" rel="noreferrer"
          className="flex items-center justify-between p-4 active:bg-gray-50">
          <span className="text-sm">🖥️ Abrir CRM en PC</span>
          <span className="text-gray-300">›</span>
        </a>
      </div>

      {/* Logout */}
      <button onClick={handleLogout}
        className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-medium text-sm active:bg-red-100">
        Cerrar sesión
      </button>

      <p className="text-center text-xs text-gray-400 pt-4">
        SHENCOM CRM Mobile v1.0<br />
        Distribuidor Autorizado Claro Ecuador
      </p>
    </div>
  );
}
