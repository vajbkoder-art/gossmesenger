import { useState } from 'react';
import { Search, Menu, Plus, Users } from 'lucide-react';
import type { Chat, GroupChat, User } from '../types';
import NewChatDialog from './NewChatDialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ChatListProps {
  chats: Chat[];
  groups: GroupChat[];
  activeChat: string | null;
  activeGroup: string | null;
  users: Record<string, User>;
  currentUser: User;
  onSelectChat: (username: string) => void;
  onSelectGroup: (groupId: string) => void;
  onOpenSidebar: () => void;
  onCreateGroup: () => void;
  onOpenSearch: () => void;
}

export default function ChatList({ chats, groups, activeChat, activeGroup, users, currentUser, onSelectChat, onSelectGroup, onOpenSidebar, onCreateGroup, onOpenSearch }: ChatListProps) {
  const [search, setSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [tab, setTab] = useState<'chats' | 'groups'>('chats');

  const filteredChats = chats.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.username?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredGroups = groups.filter(g =>
    g.name?.toLowerCase().includes(search.toLowerCase())
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
      return <img src={`${API_URL}${avatar}`} alt="" className="w-12 h-12 rounded-full object-cover" />;
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

  const getGroupLastMessage = (g: GroupChat) => {
    if (!g.messages || g.messages.length === 0) return '';
    const last = g.messages[g.messages.length - 1];
    const sender = last.senderUsername === currentUser.username ? 'Вы' : (users[last.senderUsername || '']?.name || last.senderUsername || '');
    return `${sender}: ${last.text || 'Файл'}`;
  };

  const getGroupTime = (g: GroupChat) => {
    if (!g.messages || g.messages.length === 0) return '';
    return g.messages[g.messages.length - 1].time;
  };

  return (
    <>
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onOpenSidebar} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900">Чаты</h2>
          <div className="flex items-center gap-1">
            <button onClick={onOpenSearch} className="p-2 hover:bg-gray-100 rounded-lg transition" title="Поиск">
              <Search className="w-5 h-5 text-gray-600" />
            </button>
            <button onClick={() => setShowNewChat(true)} className="p-2 hover:bg-gray-100 rounded-lg transition" title="Новый чат">
              <Plus className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск..."
            className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setTab('chats')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${tab === 'chats' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
            Личные
          </button>
          <button onClick={() => setTab('groups')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${tab === 'groups' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
            Группы ({groups.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'chats' ? (
          filteredChats.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              {search ? 'Ничего не найдено' : 'Нет чатов'}
            </div>
          ) : (
            filteredChats.map((chat) => (
              <button
                key={chat.username}
                onClick={() => onSelectChat(chat.username)}
                className={`w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition ${activeChat === chat.username ? 'bg-blue-50' : ''}`}
              >
                <div className="relative flex-shrink-0">
                  {getAvatar(chat)}
                  {isOnline(chat.username) && <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex justify-between items-baseline">
                    <span className="font-medium text-gray-900 truncate">{chat.name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatTime(chat)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <span className="text-sm text-gray-500 truncate">{chat.lastMessage || ' '}</span>
                    {chat.unread > 0 && (
                      <span className="bg-blue-500 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 flex-shrink-0 ml-2">
                        {chat.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )
        ) : (
          <>
            <button onClick={onCreateGroup} className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition text-blue-600">
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <span className="font-medium text-sm">Создать группу</span>
            </button>
            {filteredGroups.length === 0 && !search ? (
              <div className="p-8 text-center text-gray-400 text-sm">Нет групп</div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Ничего не найдено</div>
            ) : (
              filteredGroups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => onSelectGroup(g.id)}
                  className={`w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition ${activeGroup === g.id ? 'bg-blue-50' : ''}`}
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                    {g.avatar ? <img src={`${API_URL}${g.avatar}`} alt="" className="w-12 h-12 rounded-full object-cover" /> : <Users className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex justify-between items-baseline">
                      <span className="font-medium text-gray-900 truncate">{g.name}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{getGroupTime(g)}</span>
                    </div>
                    <div className="flex justify-between items-center mt-0.5">
                      <span className="text-sm text-gray-500 truncate">{getGroupLastMessage(g) || `${g.members.length} участников`}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </>
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
