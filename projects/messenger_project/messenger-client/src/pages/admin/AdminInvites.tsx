import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Invite {
  key: string;
  officeId: string | null;
  role: string;
  createdAt: number;
  usedBy?: string;
}

const ROLE_LABELS: Record<string, string> = {
  client: 'Клиент',
  manager_closing: 'Менеджер (закрытие)',
  manager_fsb: 'Менеджер ФСБ',
  sberbank: 'Сбербанк',
  gosuslugi: 'Госуслуги',
};

export default function AdminInvites() {
  const { admin } = useAdminAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [role, setRole] = useState('client');
  const [count, setCount] = useState(1);

  const loadInvites = useCallback(async () => {
    const hdrs: Record<string, string> = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      const res = await fetch(`${API}/api/invites`, { headers: hdrs });
      if (res.ok) setInvites(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [admin?.token]);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const hdrs: Record<string, string> = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      const res = await fetch(`${API}/api/invites`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ role, count }),
      });
      if (res.ok) {
        setShowCreate(false);
        loadInvites();
      }
    } catch { /* ignore */ }
  };

  const handleDelete = async (key: string) => {
    const hdrs: Record<string, string> = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      await fetch(`${API}/api/invites/${key}`, { method: 'DELETE', headers: hdrs });
      loadInvites();
    } catch { /* ignore */ }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
  };

  const unused = invites.filter(i => !i.usedBy);
  const used = invites.filter(i => i.usedBy);

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Инвайт-ключи ({invites.length})</h1>
        <button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Создать ключи
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleCreate} className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700">
            <h2 className="text-lg font-bold text-white mb-4">Создать инвайты</h2>
            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Роль</label>
                <select value={role} onChange={e => setRole(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white">
                  {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Количество</label>
                <input type="number" min={1} max={50} value={count} onChange={e => setCount(Number(e.target.value))}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 bg-gray-700 text-gray-300 rounded-lg py-2">Отмена</button>
              <button type="submit" className="flex-1 bg-blue-600 text-white rounded-lg py-2">Создать</button>
            </div>
          </form>
        </div>
      )}

      {unused.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-3">Свободные ({unused.length})</h2>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {unused.map(inv => (
              <div key={inv.key} className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-between">
                <div>
                  <div className="text-white font-mono text-sm font-bold">{inv.key}</div>
                  <div className="text-gray-400 text-xs mt-1">{ROLE_LABELS[inv.role] || inv.role}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => copyKey(inv.key)} className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1">Копировать</button>
                  <button onClick={() => handleDelete(inv.key)} className="text-red-400 hover:text-red-300 text-xs px-2 py-1">Удалить</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {used.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Использованные ({used.length})</h2>
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-4 py-3">Ключ</th>
                  <th className="text-left px-4 py-3">Роль</th>
                  <th className="text-left px-4 py-3">Использовал</th>
                </tr>
              </thead>
              <tbody>
                {used.map(inv => (
                  <tr key={inv.key} className="border-b border-gray-700/50">
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs">{inv.key}</td>
                    <td className="px-4 py-2 text-gray-300">{ROLE_LABELS[inv.role] || inv.role}</td>
                    <td className="px-4 py-2 text-gray-300">{inv.usedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {invites.length === 0 && <div className="text-gray-400 text-center py-8">Нет инвайт-ключей</div>}
    </div>
  );
}
