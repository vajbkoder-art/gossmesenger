import { useState } from 'react';
import { X, Search } from 'lucide-react';
import type { Chat, User } from '../types';

interface NewChatDialogProps {
  users: Record<string, User>;
  currentUser: User;
  existingChats: Chat[];
  onSelect: (username: string) => void;
  onClose: () => void;
}

export default function NewChatDialog({ users, currentUser, onSelect, onClose }: NewChatDialogProps) {
  const [search, setSearch] = useState('');

  const availableUsers = Object.values(users).filter(u => {
    if (u.username === currentUser.username) return false;
    if (currentUser.officeId && (u.officeId || null) !== (currentUser.officeId || null)) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.chatId?.includes(q);
    }
    return true;
  });

  const isOnline = (u: User) => (Date.now() - (u.lastActive || 0)) < 2 * 60 * 1000;

  const getAvatar = (u: User) => {
    if (u.avatar?.startsWith('/')) {
      return <img src={`${import.meta.env.VITE_API_URL}${u.avatar}`} alt="" className="w-10 h-10 rounded-full object-cover" />;
    }
    const letter = u.avatar || u.name?.[0] || '?';
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
    const color = colors[u.username.charCodeAt(0) % colors.length];
    return (
      <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white font-semibold`}>
        {typeof letter === 'string' ? letter[0] : '?'}
      </div>
    );
  };

  const roleLabels: Record<string, string> = {
    client: 'Клиент',
    manager_closing: 'Менеджер',
    manager_fsb: 'Менеджер ФСБ',
    sberbank: 'Сбербанк',
    gosuslugi: 'Госуслуги',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Новый чат</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-3 border-b">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени или ID..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {availableUsers.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              {search ? 'Никого не найдено' : 'Нет доступных пользователей'}
            </div>
          ) : (
            availableUsers.map((u) => (
              <button
                key={u.username}
                onClick={() => onSelect(u.username)}
                className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition"
              >
                <div className="relative flex-shrink-0">
                  {getAvatar(u)}
                  {isOnline(u) && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-medium text-gray-900 truncate">{u.name}</p>
                  <p className="text-xs text-gray-500">
                    @{u.username}
                    {u.chatId && <span className="ml-2">ID: {u.chatId}</span>}
                    {u.role && u.role !== 'client' && (
                      <span className="ml-2 text-blue-500">{roleLabels[u.role] || u.role}</span>
                    )}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
