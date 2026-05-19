import { useState, useMemo } from 'react';
import { X, Search, MessageSquare, Users } from 'lucide-react';
import type { Chat, GroupChat, User } from '../types';

interface Props {
  chats: Chat[];
  groups: GroupChat[];
  users: Record<string, User>;
  currentUser: User;
  onSelectChat: (username: string) => void;
  onSelectGroup: (groupId: string) => void;
  onClose: () => void;
}

export default function SearchDialog({ chats, groups, onSelectChat, onSelectGroup, onClose }: Props) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return { chats: [], groups: [], messages: [] };
    const q = query.toLowerCase();

    const chatResults = chats.filter(c =>
      c.name?.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q)
    );

    const groupResults = groups.filter(g => g.name?.toLowerCase().includes(q));

    const messageResults: { chatName: string; chatUsername: string; text: string; time: string; isGroup: boolean; groupId?: string }[] = [];
    chats.forEach(c => {
      (c.messages || []).forEach(m => {
        if (m.text?.toLowerCase().includes(q) && m.type !== 'system') {
          messageResults.push({ chatName: c.name, chatUsername: c.username, text: m.text, time: m.time, isGroup: false });
        }
      });
    });
    groups.forEach(g => {
      (g.messages || []).forEach(m => {
        if (m.text?.toLowerCase().includes(q) && m.type !== 'system') {
          messageResults.push({ chatName: g.name, chatUsername: '', text: m.text, time: m.time, isGroup: true, groupId: g.id });
        }
      });
    });

    return { chats: chatResults, groups: groupResults, messages: messageResults.slice(0, 20) };
  }, [query, chats, groups]);

  const hasResults = results.chats.length > 0 || results.groups.length > 0 || results.messages.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center gap-3 p-4 border-b">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={'\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0447\u0430\u0442\u0430\u043c \u0438 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f\u043c...'} autoFocus className="flex-1 text-sm focus:outline-none" />
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!query.trim() ? (
            <div className="p-8 text-center text-gray-400 text-sm">{'\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0437\u0430\u043f\u0440\u043e\u0441 \u0434\u043b\u044f \u043f\u043e\u0438\u0441\u043a\u0430'}</div>
          ) : !hasResults ? (
            <div className="p-8 text-center text-gray-400 text-sm">{'\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e'}</div>
          ) : (
            <>
              {results.chats.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50">{'\u0427\u0430\u0442\u044b'}</div>
                  {results.chats.map(c => (
                    <button key={c.username} onClick={() => { onSelectChat(c.username); onClose(); }} className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition">
                      <MessageSquare className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-medium text-gray-900 truncate">{c.name}</p>
                        <p className="text-xs text-gray-500">@{c.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {results.groups.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50">{'\u0413\u0440\u0443\u043f\u043f\u044b'}</div>
                  {results.groups.map(g => (
                    <button key={g.id} onClick={() => { onSelectGroup(g.id); onClose(); }} className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition">
                      <Users className="w-5 h-5 text-purple-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-medium text-gray-900 truncate">{g.name}</p>
                        <p className="text-xs text-gray-500">{g.members.length} {'\u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {results.messages.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50">{'\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f'}</div>
                  {results.messages.map((m, i) => (
                    <button key={i} onClick={() => { m.isGroup && m.groupId ? onSelectGroup(m.groupId) : onSelectChat(m.chatUsername); onClose(); }} className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition">
                      <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs text-gray-500">{m.chatName} &middot; {m.time}</p>
                        <p className="text-sm text-gray-700 truncate">{m.text}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
