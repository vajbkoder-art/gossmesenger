import { useState } from 'react';
import { X, UserPlus, UserMinus, Shield, ShieldOff, LogOut, Camera, Search } from 'lucide-react';
import type { GroupChat, User } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Props {
  group: GroupChat;
  users: Record<string, User>;
  currentUser: User;
  onUpdateGroup: (name: string, avatar: string | null) => void;
  onAddMember: (username: string) => void;
  onRemoveMember: (username: string) => void;
  onSetAdmin: (username: string, isAdmin: boolean) => void;
  onLeaveGroup: () => void;
  onClose: () => void;
}

export default function GroupSettingsDialog({ group, users, currentUser, onUpdateGroup, onAddMember, onRemoveMember, onSetAdmin, onLeaveGroup, onClose }: Props) {
  const [editName, setEditName] = useState(group.name);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const isAdmin = group.admins.includes(currentUser.username);
  const isCreator = group.creator === currentUser.username;

  const handleSaveName = () => {
    if (editName.trim() && editName.trim() !== group.name) {
      onUpdateGroup(editName.trim(), group.avatar);
    }
  };

  const nonMembers = Object.values(users).filter(u => {
    if (group.members.includes(u.username)) return false;
    if (u.username === currentUser.username) return false;
    if (currentUser.officeId && (u.officeId || null) !== (currentUser.officeId || null)) return false;
    if (addSearch) {
      const q = addSearch.toLowerCase();
      return u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q);
    }
    return true;
  });

  const getAvatar = (u: User) => {
    if (u.avatar?.startsWith('/')) return <img src={`${API_URL}${u.avatar}`} alt="" className="w-10 h-10 rounded-full object-cover" />;
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];
    const color = colors[u.username.charCodeAt(0) % colors.length];
    return <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white font-semibold`}>{(u.name?.[0] || '?')}</div>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">{'\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0433\u0440\u0443\u043f\u043f\u044b'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 flex flex-col items-center gap-3 border-b">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white">
              {group.avatar ? <img src={`${API_URL}${group.avatar}`} alt="" className="w-20 h-20 rounded-full object-cover" /> : <Camera className="w-8 h-8" />}
            </div>
            {isAdmin ? (
              <div className="flex items-center gap-2 w-full">
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={handleSaveName} className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ) : (
              <h3 className="text-xl font-semibold">{group.name}</h3>
            )}
            <p className="text-sm text-gray-500">{group.members.length} {'\u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432'}</p>
          </div>

          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900">{'\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0438'}</h4>
              {isAdmin && (
                <button onClick={() => setShowAddMember(!showAddMember)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition">
                  <UserPlus className="w-4 h-4" />
                </button>
              )}
            </div>

            {showAddMember && (
              <div className="mb-3 bg-gray-50 rounded-lg p-3">
                <div className="relative mb-2">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder={'\u041f\u043e\u0438\u0441\u043a...'} autoFocus className="w-full pl-10 pr-4 py-2 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {nonMembers.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-2">{'\u041d\u0438\u043a\u043e\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e'}</p>
                  ) : nonMembers.map(u => (
                    <button key={u.username} onClick={() => { onAddMember(u.username); setShowAddMember(false); }} className="w-full p-2 flex items-center gap-2 hover:bg-white rounded-lg transition">
                      <div className="w-8 h-8 flex-shrink-0">{getAvatar(u)}</div>
                      <span className="text-sm font-medium truncate">{u.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {group.members.map(username => {
              const u = users[username];
              if (!u) return null;
              const isMemberAdmin = group.admins.includes(username);
              const isMemberCreator = group.creator === username;
              return (
                <div key={username} className="flex items-center gap-3 py-2">
                  <div className="flex-shrink-0">{getAvatar(u)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{u.name} {username === currentUser.username ? '(\u0432\u044b)' : ''}</p>
                    <div className="flex items-center gap-1">
                      {isMemberCreator && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">{'\u0421\u043e\u0437\u0434\u0430\u0442\u0435\u043b\u044c'}</span>}
                      {isMemberAdmin && !isMemberCreator && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{'\u0410\u0434\u043c\u0438\u043d'}</span>}
                    </div>
                  </div>
                  {isAdmin && username !== currentUser.username && !isMemberCreator && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => onSetAdmin(username, !isMemberAdmin)} className="p-1.5 hover:bg-gray-100 rounded-lg" title={isMemberAdmin ? '\u0423\u0431\u0440\u0430\u0442\u044c \u0430\u0434\u043c\u0438\u043d\u0430' : '\u041d\u0430\u0437\u043d\u0430\u0447\u0438\u0442\u044c \u0430\u0434\u043c\u0438\u043d\u043e\u043c'}>
                        {isMemberAdmin ? <ShieldOff className="w-4 h-4 text-orange-500" /> : <Shield className="w-4 h-4 text-blue-500" />}
                      </button>
                      {(isCreator || (!isMemberAdmin)) && (
                        <button onClick={() => onRemoveMember(username)} className="p-1.5 hover:bg-gray-100 rounded-lg" title={'\u0423\u0434\u0430\u043b\u0438\u0442\u044c'}>
                          <UserMinus className="w-4 h-4 text-red-500" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t">
          <button onClick={onLeaveGroup} className="w-full py-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm font-medium flex items-center justify-center gap-2">
            <LogOut className="w-4 h-4" /> {'\u041f\u043e\u043a\u0438\u043d\u0443\u0442\u044c \u0433\u0440\u0443\u043f\u043f\u0443'}
          </button>
        </div>
      </div>
    </div>
  );
}
