import { useState, useEffect } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface SystemLoad {
  uptimeSec: number;
  serverUptimeSec: number;
  cpuCount: number;
  loadAvg: { '1m': number; '5m': number; '15m': number };
  loadPct: number;
  memory: { totalMb: number; freeMb: number; usedMb: number; usedPct: number };
  process: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  socketsConnected: number;
  adminTokens: number;
  nodeVersion: string;
  platform: string;
}

interface UserIP {
  username: string;
  name: string;
  chatId: string | null;
  role: string | null;
  ip: string;
  lastSeen: number;
  online: boolean;
  officeName: string | null;
}

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}д ${h}ч ${m}м`;
}

export default function AdminSystem() {
  const { admin } = useAdminAuth();
  const [system, setSystem] = useState<SystemLoad | null>(null);
  const [userIPs, setUserIPs] = useState<UserIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'system' | 'ips'>('system');

  useEffect(() => {
    const load = async () => {
      const hdrs: Record<string, string> = { 'x-admin-token': admin?.token || '' };
      try {
        const [sysRes, ipsRes] = await Promise.all([
          fetch(`${API}/api/admin/system-load`, { headers: hdrs }),
          fetch(`${API}/api/admin/user-ips`, { headers: hdrs }),
        ]);
        if (sysRes.ok) setSystem(await sysRes.json());
        if (ipsRes.ok) setUserIPs(await ipsRes.json());
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [admin?.token]);

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Система</h1>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('system')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'system' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
          Нагрузка
        </button>
        <button onClick={() => setTab('ips')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'ips' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
          IP пользователей ({userIPs.length})
        </button>
      </div>

      {tab === 'system' && system && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-gray-400 text-sm mb-3">CPU</h3>
            <div className="text-white text-2xl font-bold mb-2">{system.loadPct}%</div>
            <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
              <div className={`h-2 rounded-full ${system.loadPct > 80 ? 'bg-red-500' : system.loadPct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, system.loadPct)}%` }} />
            </div>
            <div className="text-gray-400 text-xs">{system.cpuCount} ядер | Load: {system.loadAvg['1m'].toFixed(2)}</div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-gray-400 text-sm mb-3">Память</h3>
            <div className="text-white text-2xl font-bold mb-2">{system.memory.usedPct}%</div>
            <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
              <div className={`h-2 rounded-full ${system.memory.usedPct > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${system.memory.usedPct}%` }} />
            </div>
            <div className="text-gray-400 text-xs">{system.memory.usedMb} / {system.memory.totalMb} MB</div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-gray-400 text-sm mb-3">Процесс Node.js</h3>
            <div className="text-white text-lg font-bold mb-1">{system.process.rssMb} MB RSS</div>
            <div className="text-gray-400 text-xs">Heap: {system.process.heapUsedMb} / {system.process.heapTotalMb} MB</div>
            <div className="text-gray-400 text-xs mt-1">{system.nodeVersion}</div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-gray-400 text-sm mb-3">Аптайм</h3>
            <div className="text-white text-lg font-bold mb-1">{formatUptime(system.uptimeSec)}</div>
            <div className="text-gray-400 text-xs">Сервер: {formatUptime(system.serverUptimeSec)}</div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-gray-400 text-sm mb-3">Соединения</h3>
            <div className="text-white text-2xl font-bold mb-1">{system.socketsConnected}</div>
            <div className="text-gray-400 text-xs">WebSocket соединений</div>
            <div className="text-gray-400 text-xs mt-1">Админ-сессий: {system.adminTokens}</div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-gray-400 text-sm mb-3">Платформа</h3>
            <div className="text-white text-sm font-mono">{system.platform}</div>
          </div>
        </div>
      )}

      {tab === 'ips' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left px-4 py-3">Пользователь</th>
                <th className="text-left px-4 py-3">IP</th>
                <th className="text-left px-4 py-3">Роль</th>
                <th className="text-left px-4 py-3">Офис</th>
                <th className="text-left px-4 py-3">Статус</th>
                <th className="text-left px-4 py-3">Последний визит</th>
              </tr>
            </thead>
            <tbody>
              {userIPs.map(u => (
                <tr key={u.username} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{u.name}</div>
                    <div className="text-gray-400 text-xs">@{u.username}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 font-mono text-xs">{u.ip}</td>
                  <td className="px-4 py-3 text-gray-300 text-xs">{u.role || '—'}</td>
                  <td className="px-4 py-3 text-gray-300 text-xs">{u.officeName || '—'}</td>
                  <td className="px-4 py-3">
                    {u.online ? (
                      <span className="text-green-400 text-xs">Онлайн</span>
                    ) : (
                      <span className="text-gray-500 text-xs">Офлайн</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {u.lastSeen ? new Date(u.lastSeen).toLocaleString('ru-RU') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {userIPs.length === 0 && <div className="text-gray-400 text-center py-8">Нет данных</div>}
        </div>
      )}
    </div>
  );
}
