import { useState } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';

interface Props {
  children: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Дашборд', icon: '📊' },
  { id: 'users', label: 'Пользователи', icon: '👥' },
  { id: 'offices', label: 'Офисы', icon: '🏢', superOnly: true },
  { id: 'invites', label: 'Инвайты', icon: '🔑' },
  { id: 'chats', label: 'Чаты', icon: '💬' },
  { id: 'logs', label: 'Журнал', icon: '📋' },
  { id: 'settings', label: 'Настройки', icon: '⚙️', superOnly: true },
  { id: 'system', label: 'Система', icon: '🖥️', superOnly: true },
];

export default function AdminLayout({ children, activePage, onNavigate }: Props) {
  const { admin, logout, isSuperAdmin } = useAdminAuth();
  const [collapsed, setCollapsed] = useState(false);

  const filteredNav = NAV_ITEMS.filter(item => !item.superOnly || isSuperAdmin);

  return (
    <div className="min-h-screen bg-gray-900 flex">
      <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-gray-800 border-r border-gray-700 flex flex-col transition-all duration-200`}>
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          {!collapsed && <span className="text-white font-bold text-lg">Админка</span>}
          <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-white p-1">
            {collapsed ? '→' : '←'}
          </button>
        </div>

        <nav className="flex-1 py-2">
          {filteredNav.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                activePage === item.id
                  ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-400'
                  : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-700">
          {!collapsed && (
            <div className="mb-3">
              <div className="text-white text-sm font-medium">{admin?.role === 'superadmin' ? 'Суперадмин' : admin?.officeName || 'Админ офиса'}</div>
              <div className="text-gray-400 text-xs">{admin?.role}</div>
            </div>
          )}
          <button onClick={logout} className="w-full text-red-400 hover:text-red-300 text-sm flex items-center gap-2 px-1 py-1">
            <span>🚪</span>
            {!collapsed && <span>Выйти</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
