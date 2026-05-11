import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface UserEntry {
  id: number;
  chatId: string;
  username: string;
  name: string;
  avatar: string;
  role: string;
  officeId: string | null;
  lastActive: number;
  banned?: boolean;
  bio?: string;
}

const ROLE_LABELS: Record<string, string> = {
  client: 'Клиент',
  manager_closing: 'Менеджер (закрытие)',
  manager_fsb: 'Менеджер ФСБ',
  sberbank: 'Сбербанк',
  gosuslugi: 'Госуслуги',
  user: 'Пользователь',
};

const VALID_ROLES = ['client', 'manager_closing', 'manager_fsb', 'sberbank', 'gosuslugi'];

export default function AdminUsers() {
  const { admin } = useAdminAuth();
  const [users, setUsers] = useState<Record<string, UserEntry>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'client', officeId: '' });
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    const hdrs = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      const res = await fetch(`${API}/api/users`, { headers: hdrs });
      setUsers(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [admin?.token]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const hdrs = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      const res = await fetch(`${API}/api/admin/users`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowCreate(false);
      setForm({ username: '', password: '', name: '', role: 'client', officeId: '' });
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const handleUpdate = async (username: string, updates: Record<string, unknown>) => {
    const hdrs = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      const res = await fetch(`${API}/api/admin/users/${username}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify(updates),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setEditUser(null);
      loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const toggleBan = (username: string, currentBanned: boolean) => {
    handleUpdate(username, { banned: !currentBanned });
  };

  const filtered = Object.values(users).filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.chatId.includes(search)
  );

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Пользователи ({Object.keys(users).length})</h1>
        <button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Создать
        </button>
      </div>

      <input
        type="text" placeholder="Поиск по имени, логину или ID..."
        value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleCreate} className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-lg font-bold text-white mb-4">Новый пользователь</h2>
            {error && <div className="text-red-400 text-sm mb-3">{error}</div>}
            <div className="space-y-3">
              <input placeholder="Имя" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" required />
              <input placeholder="Логин" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" required />
              <input placeholder="Пароль" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" required />
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                {VALID_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
              </select>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 bg-gray-700 text-gray-300 rounded-lg py-2">Отмена</button>
              <button type="submit" className="flex-1 bg-blue-600 text-white rounded-lg py-2">Создать</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="text-left px-4 py-3">Пользователь</th>
              <th className="text-left px-4 py-3">Роль</th>
              <th className="text-left px-4 py-3">ID чата</th>
              <th className="text-left px-4 py-3">Статус</th>
              <th className="text-right px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.username} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                      {u.avatar || u.name[0]}
                    </div>
                    <div>
                      <div className="text-white font-medium">{u.name}</div>
                      <div className="text-gray-400 text-xs">@{u.username}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-300">{ROLE_LABELS[u.role] || u.role}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{u.chatId}</td>
                <td className="px-4 py-3">
                  {u.banned ? (
                    <span className="text-red-400 text-xs bg-red-400/10 px-2 py-1 rounded">Заблокирован</span>
                  ) : (
                    <span className="text-green-400 text-xs bg-green-400/10 px-2 py-1 rounded">Активен</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => setEditUser(editUser === u.username ? null : u.username)}
                      className="text-blue-400 hover:text-blue-300 text-xs">Редактировать</button>
                    <button onClick={() => toggleBan(u.username, !!u.banned)}
                      className={`text-xs ${u.banned ? 'text-green-400 hover:text-green-300' : 'text-red-400 hover:text-red-300'}`}>
                      {u.banned ? 'Разбан' : 'Бан'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-gray-400 text-center py-8">Пользователи не найдены</div>}
      </div>

      {editUser && users[editUser] && (
        <EditUserModal
          user={users[editUser]}
          onClose={() => setEditUser(null)}
          onSave={(updates) => handleUpdate(editUser, updates)}
        />
      )}
    </div>
  );
}

function EditUserModal({ user, onClose, onSave }: { user: UserEntry; onClose: () => void; onSave: (u: Record<string, unknown>) => void }) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
        <h2 className="text-lg font-bold text-white mb-4">Редактировать: {user.username}</h2>
        <div className="space-y-3">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Имя</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Роль</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
              {VALID_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Новый пароль (оставьте пустым)</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" placeholder="••••••••" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 bg-gray-700 text-gray-300 rounded-lg py-2">Отмена</button>
          <button onClick={() => {
            const updates: Record<string, unknown> = {};
            if (name !== user.name) updates.name = name;
            if (role !== user.role) updates.role = role;
            if (password) updates.password = password;
            onSave(updates);
          }} className="flex-1 bg-blue-600 text-white rounded-lg py-2">Сохранить</button>
        </div>
      </div>
    </div>
  );
}
