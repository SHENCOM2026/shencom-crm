import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const tabs = [
  { to: '/', icon: '🏠', label: 'Inicio', exact: true },
  { to: '/leads', icon: '👥', label: 'Leads' },
  { to: '/pipeline', icon: '📊', label: 'Pipeline' },
  { to: '/commissions', icon: '💰', label: 'Comisiones' },
  { to: '/profile', icon: '👤', label: 'Perfil' },
];

export default function MobileLayout() {
  const { user } = useAuth();
  const location = useLocation();
  // Hide bottom nav on lead detail page
  const hideNav = /^\/leads\/\d+/.test(location.pathname);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top header */}
      <header className="bg-claro-red text-white px-4 py-3 flex items-center justify-between pt-safe flex-shrink-0 safe-top">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-sm font-bold">S</div>
          <span className="font-bold text-lg">SHENCOM</span>
        </div>
        <div className="text-right">
          <p className="text-xs opacity-80">{user?.full_name}</p>
          <p className="text-[10px] opacity-60 capitalize">{user?.role}</p>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      {!hideNav && (
        <nav className="bg-white border-t border-gray-200 flex pb-safe flex-shrink-0">
          {tabs.map(tab => {
            const isActive = tab.exact
              ? location.pathname === '/' || location.pathname === ''
              : location.pathname.startsWith(tab.to);
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={`flex-1 flex flex-col items-center py-2 text-[10px] font-medium transition-colors
                  ${isActive ? 'text-claro-red' : 'text-gray-400'}`}
              >
                <span className="text-xl mb-0.5">{tab.icon}</span>
                {tab.label}
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}
