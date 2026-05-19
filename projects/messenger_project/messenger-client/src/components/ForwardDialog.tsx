import { useState } from 'react';
import { X, Search, Forward } from 'lucide-react';
import type { Chat, User, Message } from '../types';

interface Props {
  users: Record<string, User>;
  currentUser: User;
  chats: Chat[];
  message: Message;
  onForward: (recipientUsername: string) => void;
  onClose: () => void;
}

export default function ForwardDialog({ users, currentUser, chats, onForward, onClose }: Props) {
  const [search, setSearch] = useState('');

  const availableUsers = Object.values(users).filter(u => {
    if (u.username === currentUser.username) return false;
    if (currentUser.officeId && (u.officeId || null) !== (currentUser.officeId || null)) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q);
    }
    return true;
  });

  const chatUsernames = new Set(chats.map(c => c.username));
  const sorted = [
    ...availableUsers.filter(u => chatUsernames.has(u.username)),
    ...availableUsers.filter(u => !chatUsernames.has(u.username)),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Forward className="w-5 h-5 text-purple-500" />
            <h3 className="text-lg font-semibold">Переслать</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-3 border-b">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..." autoFocus
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Никого не найдено</div>
          ) : (
            sorted.map((u) => {
              const avatar = u.avatar?.startsWith('/')
                ? <img src={`${import.meta.env.VITE_API_URL}${u.avatar}`} alt="" className="w-10 h-10 rounded-full object-cover" />
                : <div className={`w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold`}>
                    {(u.avatar || u.name?.[0] || '?')[0]}
                  </div>;
              return (
                <button
                  key={u.username}
                  onClick={() => onForward(u.username)}
                  className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition"
                >
                  <div className="flex-shrink-0">{avatar}</div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-medium text-gray-900 truncate">{u.name}</p>
                    <p className="text-xs text-gray-500">@{u.username}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
