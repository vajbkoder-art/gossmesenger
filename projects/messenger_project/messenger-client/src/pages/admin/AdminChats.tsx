import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ChatEntry {
  owner: string;
  peer: string;
  name: string;
  lastMessage: string;
  time: string;
  messageCount: number;
}

interface ChatMessage {
  id: number;
  text: string;
  sender: string;
  time: string;
  type?: string;
}

export default function AdminChats() {
  const { admin } = useAdminAuth();
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewChat, setViewChat] = useState<{ owner: string; peer: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const loadChats = useCallback(async () => {
    const hdrs = { 'x-admin-token': admin?.token || '' };
    try {
      const res = await fetch(`${API}/api/admin/chats`, { headers: hdrs });
      if (res.ok) setChats(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [admin?.token]);

  useEffect(() => { loadChats(); }, [loadChats]);

  const openChat = async (owner: string, peer: string) => {
    setViewChat({ owner, peer });
    setLoadingMsgs(true);
    const hdrs = { 'x-admin-token': admin?.token || '' };
    try {
      const res = await fetch(`${API}/api/admin/chats/${owner}/${peer}`, { headers: hdrs });
      if (res.ok) setMessages(await res.json());
    } catch { /* ignore */ }
    setLoadingMsgs(false);
  };

  const deleteMessage = async (msgId: number) => {
    if (!viewChat) return;
    const hdrs = { 'x-admin-token': admin?.token || '' };
    try {
      await fetch(`${API}/api/admin/chats/${viewChat.owner}/${viewChat.peer}/${msgId}`, {
        method: 'DELETE', headers: hdrs,
      });
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } catch { /* ignore */ }
  };

  const filtered = chats.filter(c =>
    c.owner.toLowerCase().includes(search.toLowerCase()) ||
    c.peer.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Deduplicate chats (A->B and B->A are same conversation)
  const seen = new Set<string>();
  const unique = filtered.filter(c => {
    const key = [c.owner, c.peer].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Чаты ({unique.length})</h1>

      <input
        type="text" placeholder="Поиск по участникам..."
        value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="text-left px-4 py-3">Участники</th>
              <th className="text-left px-4 py-3">Последнее сообщение</th>
              <th className="text-left px-4 py-3">Сообщений</th>
              <th className="text-right px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {unique.map(c => (
              <tr key={`${c.owner}-${c.peer}`} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="px-4 py-3">
                  <span className="text-white">@{c.owner}</span>
                  <span className="text-gray-500 mx-2">↔</span>
                  <span className="text-white">@{c.peer}</span>
                </td>
                <td className="px-4 py-3 text-gray-400 max-w-xs truncate">{c.lastMessage || '—'}</td>
                <td className="px-4 py-3 text-gray-300">{c.messageCount}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openChat(c.owner, c.peer)} className="text-blue-400 hover:text-blue-300 text-xs">
                    Просмотр
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {unique.length === 0 && <div className="text-gray-400 text-center py-8">Нет чатов</div>}
      </div>

      {viewChat && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setViewChat(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-gray-800 rounded-xl w-full max-w-2xl max-h-[80vh] border border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-white font-bold">@{viewChat.owner} ↔ @{viewChat.peer}</h2>
              <button onClick={() => setViewChat(null)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {loadingMsgs ? (
                <div className="text-gray-400 text-center">Загрузка...</div>
              ) : messages.length === 0 ? (
                <div className="text-gray-400 text-center">Нет сообщений</div>
              ) : (
                messages.map(m => (
                  <div key={m.id} className="flex items-start gap-3 group">
                    <div className="flex-1 bg-gray-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-blue-400 text-xs font-medium">{m.sender}</span>
                        <span className="text-gray-500 text-xs">{m.time}</span>
                        {m.type && m.type !== 'text' && (
                          <span className="text-gray-500 text-xs bg-gray-600/50 px-1.5 rounded">{m.type}</span>
                        )}
                      </div>
                      <div className="text-gray-200 text-sm">{m.text}</div>
                    </div>
                    <button onClick={() => deleteMessage(m.id)}
                      className="text-red-400 hover:text-red-300 text-xs opacity-0 group-hover:opacity-100 mt-3">
                      Удалить
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
