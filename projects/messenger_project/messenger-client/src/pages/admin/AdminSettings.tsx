import { useState, useEffect } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Settings {
  maxFileSize?: string;
  maxFileSizeMb?: number;
  [key: string]: unknown;
}

export default function AdminSettings() {
  const { admin } = useAdminAuth();
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maxFileSize, setMaxFileSize] = useState('');
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passMsg, setPassMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const hdrs: Record<string, string> = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
      try {
        const res = await fetch(`${API}/api/admin/settings`, { headers: hdrs });
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
          setMaxFileSize(data.maxFileSize || '50mb');
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [admin?.token]);

  const handleSave = async () => {
    setSaving(true);
    const hdrs: Record<string, string> = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      const res = await fetch(`${API}/api/admin/settings`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify({ maxFileSize }),
      });
      if (res.ok) setSettings(await res.json());
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg('');
    const hdrs: Record<string, string> = { 'Content-Type': 'application/json', 'x-admin-token': admin?.token || '' };
    try {
      const res = await fetch(`${API}/api/admin/change-password`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPassMsg('Пароль изменён');
      setOldPass('');
      setNewPass('');
    } catch (err) {
      setPassMsg(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Настройки сервера</h1>

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Лимиты</h2>
        <div className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Максимальный размер файла</label>
            <div className="flex gap-3">
              <input value={maxFileSize} onChange={e => setMaxFileSize(e.target.value)}
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                placeholder="50mb" />
              <button onClick={handleSave} disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white px-4 py-2 rounded-lg text-sm">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>

        {Object.keys(settings).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="text-gray-400 text-xs mb-2">Текущие настройки:</div>
            <pre className="text-gray-300 text-xs bg-gray-900 rounded-lg p-3 overflow-auto">
              {JSON.stringify(settings, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Смена пароля</h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <input type="password" placeholder="Текущий пароль" value={oldPass} onChange={e => setOldPass(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" required />
          <input type="password" placeholder="Новый пароль (мин. 4 символа)" value={newPass} onChange={e => setNewPass(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white" required minLength={4} />
          {passMsg && <div className={`text-sm ${passMsg.includes('изменён') ? 'text-green-400' : 'text-red-400'}`}>{passMsg}</div>}
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
            Изменить пароль
          </button>
        </form>
      </div>
    </div>
  );
}
