import { useState } from 'react';
import { X, Search, Users, Camera } from 'lucide-react';
import type { User } from '../types';

interface Props {
  users: Record<string, User>;
  currentUser: User;
  onCreateGroup: (name: string, members: string[], avatar: string | null) => void;
  onClose: () => void;
}

export default function CreateGroupDialog({ users, currentUser, onCreateGroup, onClose }: Props) {
  const [step, setStep] = useState<'members' | 'details'>('members');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');

  const availableUsers = Object.values(users).filter(u => {
    if (u.username === currentUser.username) return false;
    if (currentUser.officeId && (u.officeId || null) !== (currentUser.officeId || null)) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q);
    }
    return true;
  });

  const toggle = (username: string) => {
    setSelected(prev => prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]);
  };

  const handleCreate = () => {
    if (!groupName.trim() || selected.length === 0) return;
    onCreateGroup(groupName.trim(), selected, null);
  };

  const getAvatar = (u: User) => {
    if (u.avatar?.startsWith('/')) {
      return <img src={`${import.meta.env.VITE_API_URL}${u.avatar}`} alt="" className="w-10 h-10 rounded-full object-cover" />;
    }
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];
    const color = colors[u.username.charCodeAt(0) % colors.length];
    return (
      <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white font-semibold`}>
        {(u.avatar || u.name?.[0] || '?')[0]}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold">
              {step === 'members' ? 'Создать группу' : 'Настройки группы'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {step === 'members' ? (
          <>
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={'Поиск...'} autoFocus className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selected.map(u => (
                    <span key={u} className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                      {users[u]?.name || u}
                      <button onClick={() => toggle(u)} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {availableUsers.map(u => (
                <button key={u.username} onClick={() => toggle(u.username)} className={`w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition ${selected.includes(u.username) ? 'bg-blue-50' : ''}`}>
                  <div className="flex-shrink-0">{getAvatar(u)}</div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-medium text-gray-900 truncate">{u.name}</p>
                    <p className="text-xs text-gray-500">@{u.username}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected.includes(u.username) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                    {selected.includes(u.username) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                </button>
              ))}
            </div>
            <div className="p-4 border-t">
              <button onClick={() => setStep('details')} disabled={selected.length === 0} className="w-full py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium">
                {'Далее'} ({selected.length})
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-6 flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-300 transition">
                <Camera className="w-8 h-8 text-gray-400" />
              </div>
              <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={'Название группы'} autoFocus className="w-full px-4 py-3 bg-gray-100 rounded-lg text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-sm text-gray-500">{'Участники:'} {selected.length}</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {selected.map(u => (
                  <span key={u} className="bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-full">{users[u]?.name || u}</span>
                ))}
              </div>
            </div>
            <div className="p-4 border-t flex gap-2">
              <button onClick={() => setStep('members')} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">{'Назад'}</button>
              <button onClick={handleCreate} disabled={!groupName.trim()} className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium">{'Создать'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
