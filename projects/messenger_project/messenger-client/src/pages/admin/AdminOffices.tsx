import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Office {
  id: string;
  name: string;
  login: string;
  suspended: boolean;
  createdAt: number;
  userCount: number;
  inviteCount: number;
}

export default function AdminOffices() {
  const { admin } = useAdminAuth();
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', login: '', password: '' });
  const [error, setError] = useState('');

  const loadOffices = useCallback(async () => {
    const hdrs: Record<string, string> = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      const res = await fetch(`${API}/api/admin/offices`, { headers: hdrs });
      if (res.ok) setOffices(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [admin?.token]);

  useEffect(() => { loadOffices(); }, [loadOffices]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const hdrs: Record<string, string> = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      const res = await fetch(`${API}/api/admin/offices`, { method: 'POST', headers: hdrs, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowCreate(false);
      setForm({ name: '', login: '', password: '' });
      loadOffices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const toggleSuspend = async (office: Office) => {
    const hdrs: Record<string, string> = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      await fetch(`${API}/api/admin/offices/${office.id}`, {
        method: 'PUT', headers: hdrs, body: JSON.stringify({ suspended: !office.suspended }),
      });
      loadOffices();
    } catch { /* ignore */ }
  };

  const deleteOffice = async (office: Office) => {
    if (!confirm(`Удалить офис "${office.name}"?`)) return;
    const hdrs: Record<string, string> = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      await fetch(`${API}/api/admin/offices/${office.id}`, { method: 'DELETE', headers: hdrs });
      loadOffices();
    } catch { /* ignore */ }
  };

  const resetPassword = async (office: Office) => {
    const newPassword = prompt(`Новый пароль для офиса "${office.name}" (мин. 4 символа):`);
    if (!newPassword || newPassword.length < 4) return;
    const hdrs: Record<string, string> = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      const res = await fetch(`${API}/api/admin/offices/${office.id}/reset-password`, {
        method: 'POST', headers: hdrs, body: JSON.stringify({ newPassword }),
      });
      if (res.ok) alert('Пароль сброшен');
      else { const d = await res.json(); alert(d.error); }
    } catch { alert('Ошибка сети'); }
  };

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Офисы ({offices.length})</h1>
        <button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Создать офис
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleCreate} className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-lg font-bold text-white mb-4">Новый офис</h2>
            {error && <div className="text-red-400 text-sm mb-3">{error}</div>}
            <div className="space-y-3">
              <input placeholder="Название офиса" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" required />
              <input placeholder="Логин для входа" value={form.login} onChange={e => setForm({ ...form, login: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" required />
              <input placeholder="Пароль" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" required />
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 bg-gray-700 text-gray-300 rounded-lg py-2">Отмена</button>
              <button type="submit" className="flex-1 bg-blue-600 text-white rounded-lg py-2">Создать</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {offices.map(o => (
          <div key={o.id} className={`bg-gray-800 rounded-xl p-5 border ${o.suspended ? 'border-red-500/50' : 'border-gray-700'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-lg">{o.name}</h3>
              {o.suspended && <span className="text-red-400 text-xs bg-red-400/10 px-2 py-1 rounded">Приостановлен</span>}
            </div>
            <div className="text-gray-400 text-sm space-y-1 mb-4">
              <div>Логин: <span className="text-gray-300">{o.login}</span></div>
              <div>Пользователей: <span className="text-gray-300">{o.userCount}</span></div>
              <div>Инвайтов: <span className="text-gray-300">{o.inviteCount}</span></div>
              <div>Создан: <span className="text-gray-300">{new Date(o.createdAt).toLocaleDateString('ru-RU')}</span></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleSuspend(o)}
                className={`text-xs px-3 py-1.5 rounded ${o.suspended ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-400'}`}>
                {o.suspended ? 'Возобновить' : 'Приостановить'}
              </button>
              <button onClick={() => resetPassword(o)} className="text-xs px-3 py-1.5 rounded bg-blue-600/20 text-blue-400">
                Сброс пароля
              </button>
              <button onClick={() => deleteOffice(o)} className="text-xs px-3 py-1.5 rounded bg-red-600/20 text-red-400">
                Удалить
              </button>
            </div>
          </div>
        ))}
        {offices.length === 0 && <div className="text-gray-400 col-span-full text-center py-8">Нет офисов</div>}
      </div>
    </div>
  );
}
