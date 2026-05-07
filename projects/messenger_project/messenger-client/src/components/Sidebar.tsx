import { X, LogOut, User as UserIcon, Settings } from 'lucide-react';
import type { User } from '../types';

interface SidebarProps {
  user: User;
  onClose: () => void;
  onLogout: () => void;
}

export default function Sidebar({ user, onClose, onLogout }: SidebarProps) {
  const getAvatar = () => {
    if (user.avatar?.startsWith('/')) {
      return <img src={`${import.meta.env.VITE_API_URL}${user.avatar}`} alt="" className="w-16 h-16 rounded-full object-cover" />;
    }
    return (
      <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-semibold">
        {user.avatar || user.name?.[0] || '?'}
      </div>
    );
  };

  const roleLabels: Record<string, string> = {
    client: 'Клиент',
    manager_closing: 'Менеджер',
    manager_fsb: 'Менеджер ФСБ',
    sberbank: 'Сбербанк',
    gosuslugi: 'Госуслуги',
    office_admin: 'Админ офиса',
    superadmin: 'Суперадмин',
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-72 bg-white h-full shadow-xl flex flex-col animate-in slide-in-from-left">
        <div className="p-6 bg-gradient-to-br from-blue-600 to-indigo-700">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
          <div className="mt-4">
            {getAvatar()}
            <h3 className="text-white font-semibold text-lg mt-3">{user.name}</h3>
            <p className="text-blue-200 text-sm">@{user.username}</p>
            {user.chatId && (
              <p className="text-blue-300 text-xs mt-1">ID: {user.chatId}</p>
            )}
          </div>
        </div>

        <div className="flex-1 py-2">
          <div className="px-4 py-3 flex items-center gap-3 text-gray-700">
            <UserIcon className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm font-medium">Роль</p>
              <p className="text-xs text-gray-500">{roleLabels[user.role] || user.role}</p>
            </div>
          </div>
          {user.bio && (
            <div className="px-4 py-3 flex items-center gap-3 text-gray-700">
              <Settings className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium">О себе</p>
                <p className="text-xs text-gray-500">{user.bio}</p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-4">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-lg transition"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Выйти</span>
          </button>
        </div>
      </div>
    </div>
  );
}
