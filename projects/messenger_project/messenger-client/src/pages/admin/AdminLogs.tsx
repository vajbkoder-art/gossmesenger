import { useState, useEffect } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface LogEntry {
  action: string;
  timestamp: number;
  details: Record<string, unknown>;
}

const ACTION_LABELS: Record<string, string> = {
  admin_login: 'Вход в админку',
  create_office: 'Создание офиса',
  update_office: 'Обновление офиса',
  delete_office: 'Удаление офиса',
  reset_office_password: 'Сброс пароля офиса',
  create_user: 'Создание пользователя',
  update_user: 'Обновление пользователя',
  delete_message: 'Удаление сообщения',
  update_settings: 'Обновление настроек',
  change_password: 'Смена пароля',
};

export default function AdminLogs() {
  const { admin } = useAdminAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/admin/logs`, {
          headers: { 'x-admin-token': admin?.token || '' },
        });
        if (res.ok) setLogs(await res.json());
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [admin?.token]);

  const filtered = logs.filter(l =>
    !filter || l.action.includes(filter) || JSON.stringify(l.details).toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Журнал действий ({logs.length})</h1>

      <input
        type="text" placeholder="Фильтр..."
        value={filter} onChange={e => setFilter(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          {filtered.length === 0 ? (
            <div className="text-gray-400 text-center py-8">Нет записей</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-800">
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-4 py-3">Время</th>
                  <th className="text-left px-4 py-3">Действие</th>
                  <th className="text-left px-4 py-3">Детали</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log, i) => (
                  <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('ru-RU')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white text-xs bg-gray-700 px-2 py-1 rounded">
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs font-mono max-w-md truncate">
                      {Object.entries(log.details || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
