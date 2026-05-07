import { useState } from 'react';
import { Search, Menu, Plus } from 'lucide-react';
import type { Chat, User } from '../types';
import NewChatDialog from './NewChatDialog';

interface ChatListProps {
  chats: Chat[];
  activeChat: string | null;
  users: Record<string, User>;
  currentUser: User;
  onSelectChat: (username: string) => void;
  onOpenSidebar: () => void;
}

export default function ChatList({ chats, activeChat, users, currentUser, onSelectChat, onOpenSidebar }: ChatListProps) {
  const [search, setSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);

  const filtered = chats.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.username?.toLowerCase().includes(search.toLowerCase())
  );

  const isOnline = (username: string) => {
    const u = users[username];
    if (!u) return false;
    return (Date.now() - (u.lastActive || 0)) < 2 * 60 * 1000;
  };

  const getAvatar = (chat: Chat) => {
    const u = users[chat.username];
    const avatar = u?.avatar || chat.avatar;
    if (avatar?.startsWith('/')) {
      return <img src={`${import.meta.env.VITE_API_URL}${avatar}`} alt="" className="w-12 h-12 rounded-full object-cover" />;
    }
    const letter = avatar || chat.name?.[0] || '?';
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
    const color = colors[chat.username.charCodeAt(0) % colors.length];
    return (
      <div className={`w-12 h-12 rounded-full ${color} flex items-center justify-center text-white font-semibold text-lg`}>
        {typeof letter === 'string' ? letter[0] : '?'}
      </div>
    );
  };

  const formatTime = (chat: Chat) => {
    if (!chat.timestamp && !chat.time) return '';
    if (chat.time) return chat.time;
    return new Date(chat.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onOpenSidebar} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900">Чаты</h2>
          <button onClick={() => setShowNewChat(true)} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <Plus className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск..."
            className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {search ? 'Ничего не найдено' : 'Нет чатов'}
          </div>
        ) : (
          filtered.map((chat) => (
            <button
              key={chat.username}
              onClick={() => onSelectChat(chat.username)}
              className={`w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition ${
                activeChat === chat.username ? 'bg-blue-50' : ''
              }`}
            >
              <div className="relative flex-shrink-0">
                {getAvatar(chat)}
                {isOnline(chat.username) && (
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex justify-between items-baseline">
                  <span className="font-medium text-gray-900 truncate">{chat.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatTime(chat)}</span>
                </div>
                <div className="flex justify-between items-center mt-0.5">
                  <span className="text-sm text-gray-500 truncate">{chat.lastMessage || '\u00A0'}</span>
                  {chat.unread > 0 && (
                    <span className="bg-blue-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 flex-shrink-0 ml-2">
                      {chat.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {showNewChat && (
        <NewChatDialog
          users={users}
          currentUser={currentUser}
          existingChats={chats}
          onSelect={(username) => { onSelectChat(username); setShowNewChat(false); }}
          onClose={() => setShowNewChat(false)}
        />
      )}
    </>
  );
}
