import { Reply, Pencil, Trash2, Forward, Pin, PinOff, Copy } from 'lucide-react';
import type { Message } from '../types';

interface Props {
  message: Message;
  x: number;
  y: number;
  onClose: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onForward: () => void;
  onPin: () => void;
  onCopy: () => void;
}

export default function MessageContextMenu({ message, x, y, onClose, onReply, onEdit, onDelete, onForward, onPin, onCopy }: Props) {
  const isMe = message.sender === 'me';
  const isSystem = message.type === 'system';
  if (isSystem) return null;

  const menuStyle: React.CSSProperties = {
    position: 'fixed', left: x, top: y, zIndex: 100,
  };

  // Adjust position if menu would go off screen
  const adjustPosition = (el: HTMLDivElement | null) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) el.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) el.style.top = `${window.innerHeight - rect.height - 8}px`;
  };

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={adjustPosition} style={menuStyle} className="z-[100] bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-100">
        <button onClick={onReply} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-sm text-gray-700">
          <Reply className="w-4 h-4 text-blue-500" /> Ответить
        </button>
        {message.text && (
          <button onClick={onCopy} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-sm text-gray-700">
            <Copy className="w-4 h-4 text-gray-500" /> Копировать
          </button>
        )}
        {isMe && message.type !== 'voice' && message.type !== 'video_circle' && (
          <button onClick={onEdit} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-sm text-gray-700">
            <Pencil className="w-4 h-4 text-green-500" /> Редактировать
          </button>
        )}
        <button onClick={onForward} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-sm text-gray-700">
          <Forward className="w-4 h-4 text-purple-500" /> Переслать
        </button>
        <button onClick={onPin} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-sm text-gray-700">
          {message.pinned
            ? <><PinOff className="w-4 h-4 text-orange-500" /> Открепить</>
            : <><Pin className="w-4 h-4 text-orange-500" /> Закрепить</>
          }
        </button>
        <div className="border-t border-gray-100 my-1" />
        <button onClick={onDelete} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-sm text-red-600">
          <Trash2 className="w-4 h-4" /> Удалить
        </button>
      </div>
    </>
  );
}
