import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch {
      toast.error('Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-claro-gray to-gray-900 flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-claro-red rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-3xl font-bold">S</span>
        </div>
        <h1 className="text-white text-2xl font-bold">SHENCOM</h1>
        <p className="text-gray-400 text-sm mt-1">CRM de Ventas - Claro Ecuador</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Iniciar Sesión</h2>
        <div>
          <label className="text-sm text-gray-600 mb-1 block">Usuario</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)}
            className="input-field" placeholder="Tu usuario" autoCapitalize="none" autoComplete="username" required />
        </div>
        <div>
          <label className="text-sm text-gray-600 mb-1 block">Contraseña</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="input-field" placeholder="Tu contraseña" autoComplete="current-password" required />
        </div>
        <button type="submit" disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2">
          {loading ? <span className="animate-spin">⏳</span> : 'Ingresar'}
        </button>
      </form>

      <p className="text-gray-500 text-xs mt-6">App Movil v1.0</p>
    </div>
  );
}
