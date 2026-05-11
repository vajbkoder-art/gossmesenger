import { useState, useEffect } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Stats {
  totalUsers: number;
  onlineUsers: number;
  totalMessages: number;
  totalChats: number;
  totalCalls: number;
  totalInvites: number;
  totalOffices?: number;
}

export default function AdminDashboard() {
  const { admin } = useAdminAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/admin/stats`, {
          headers: { 'x-admin-token': admin?.token || '' },
        });
        setStats(await res.json());
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [admin?.token]);

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  const cards = [
    { label: 'Пользователей', value: stats?.totalUsers || 0, color: 'bg-blue-600' },
    { label: 'Онлайн', value: stats?.onlineUsers || 0, color: 'bg-green-600' },
    { label: 'Сообщений', value: stats?.totalMessages || 0, color: 'bg-purple-600' },
    { label: 'Чатов', value: stats?.totalChats || 0, color: 'bg-cyan-600' },
    { label: 'Звонков', value: stats?.totalCalls || 0, color: 'bg-orange-600' },
    { label: 'Инвайтов', value: stats?.totalInvites || 0, color: 'bg-yellow-600' },
  ];

  if (stats?.totalOffices !== undefined) {
    cards.push({ label: 'Офисов', value: stats.totalOffices, color: 'bg-pink-600' });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Дашборд</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.label} className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <div className={`w-10 h-10 ${card.color} rounded-lg flex items-center justify-center text-white font-bold text-lg mb-3`}>
              {card.value}
            </div>
            <div className="text-gray-400 text-sm">{card.label}</div>
            <div className="text-white text-2xl font-bold mt-1">{card.value.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
