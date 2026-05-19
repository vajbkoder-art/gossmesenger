import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, Paperclip, Check, CheckCheck, Image, FileText, X, Pin, Reply as ReplyIcon, Pencil, Forward as ForwardIcon, Mic } from 'lucide-react';
import type { Chat, User, Message, ReplyTo } from '../types';
import MessageContextMenu from './MessageContextMenu';
import VoiceRecorder from './VoiceRecorder';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ChatWindowProps {
  chat: Chat;
  users: Record<string, User>;
  currentUser: User;
  onSendMessage: (text: string, attachment?: { url: string; filename: string; size: number; type: string; mimeType: string; duration?: number }, replyTo?: ReplyTo) => void;
  onBack: () => void;
  isMobile: boolean;
  onEditMessage?: (messageId: number, newText: string) => void;
  onDeleteMessages?: (messageIds: number[], forBoth: boolean) => void;
  onForwardMessage?: (message: Message) => void;
  onPinMessage?: (messageId: number, pinned: boolean) => void;
}

export default function ChatWindow({ chat, users, currentUser, onSendMessage, onBack, isMobile, onEditMessage, onDeleteMessages, onForwardMessage, onPinMessage }: ChatWindowProps) {
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [contextMenu, setContextMenu] = useState<{ message: Message; x: number; y: number } | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Message | null>(null);
  const [showPinned, setShowPinned] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const peerUser = users[chat.username];
  const isOnline = peerUser && (Date.now() - (peerUser.lastActive || 0)) < 2 * 60 * 1000;
  const pinnedMessages = (chat.messages || []).filter(m => m.pinned);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.messages]);
  useEffect(() => { if (!isRecording) inputRef.current?.focus(); }, [chat.username, isRecording]);

  const handleSend = useCallback(() => {
    if (editingMessage) {
      if (input.trim() && input.trim() !== editingMessage.text) onEditMessage?.(editingMessage.id, input.trim());
      setEditingMessage(null); setInput(''); return;
    }
    if (!input.trim()) return;
    onSendMessage(input.trim(), undefined, replyTo || undefined);
    setInput(''); setReplyTo(null);
  }, [input, editingMessage, replyTo, onEditMessage, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') { setReplyTo(null); setEditingMessage(null); setInput(''); }
  };

  const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    setContextMenu({ message: msg, x: e.clientX, y: e.clientY });
  };

  const handleReply = (msg: Message) => {
    setReplyTo({
      id: msg.id, text: msg.text, sender: msg.sender,
      senderUsername: msg.sender === 'me' ? currentUser.username : chat.username,
      senderName: msg.sender === 'me' ? currentUser.name : chat.name,
      type: msg.type, filename: msg.filename,
    });
    setContextMenu(null);
    inputRef.current?.focus();
  };

  const handleEdit = (msg: Message) => {
    setEditingMessage(msg);
    setInput(msg.text);
    setContextMenu(null);
    inputRef.current?.focus();
  };

  const handleCopy = (msg: Message) => {
    navigator.clipboard.writeText(msg.text);
    setContextMenu(null);
  };

  const uploadFile = async (file: File): Promise<{ url: string; filename: string; size: number } | null> => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'file') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowAttachMenu(false);
    const result = await uploadFile(file);
    if (result) {
      onSendMessage('', { url: result.url, filename: result.filename, size: result.size, type, mimeType: file.type }, replyTo || undefined);
      setReplyTo(null);
    }
    e.target.value = '';
  };

  const handleVoiceRecorded = async (blob: Blob, duration: number) => {
    setIsRecording(false);
    const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
    const result = await uploadFile(file);
    if (result) {
      onSendMessage('', { url: result.url, filename: result.filename, size: result.size, type: 'voice', mimeType: 'audio/webm', duration }, replyTo || undefined);
      setReplyTo(null);
    }
  };

  const renderStatus = (msg: Message) => {
    if (msg.sender !== 'me') return null;
    switch (msg.status) {
      case 'read': return <CheckCheck className="w-4 h-4 text-blue-500" />;
      case 'delivered': return <CheckCheck className="w-4 h-4 text-gray-400" />;
      case 'sent': return <Check className="w-4 h-4 text-gray-400" />;
      case 'sending': return <div className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />;
      default: return <Check className="w-4 h-4 text-gray-400" />;
    }
  };

  const getAvatar = () => {
    const avatar = peerUser?.avatar || chat.avatar;
    if (avatar?.startsWith('/')) {
      return <img src={`${API_URL}${avatar}`} alt="" className="w-10 h-10 rounded-full object-cover" />;
    }
    const letter = avatar || chat.name?.[0] || '?';
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];
    const color = colors[chat.username.charCodeAt(0) % colors.length];
    return (
      <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white font-semibold`}>
        {typeof letter === 'string' ? letter[0] : '?'}
      </div>
    );
  };

  const renderReplyPreview = (reply: ReplyTo, isInBubble: boolean) => {
    const bgClass = isInBubble ? 'bg-black/10' : 'bg-blue-50';
    const textClass = isInBubble ? 'text-inherit opacity-80' : 'text-gray-600';
    const nameClass = isInBubble ? 'text-inherit font-semibold' : 'text-blue-600 font-semibold';
    const typeLabel = reply.type === 'image' ? '\ud83d\udcf7 Фото' : reply.type === 'voice' ? '\ud83c\udfa4 Голосовое' : reply.type === 'video' ? '\ud83d\udcf9 Видео' : reply.type === 'file' ? `\ud83d\udcce ${reply.filename || 'Файл'}` : reply.text;
    return (
      <div className={`${bgClass} rounded-lg px-3 py-1.5 mb-1 border-l-2 border-blue-400`}>
        <p className={`text-xs ${nameClass}`}>{reply.senderName || (reply.sender === 'me' ? 'Вы' : chat.name)}</p>
        <p className={`text-xs ${textClass} truncate`}>{typeLabel}</p>
      </div>
    );
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderMessage = (msg: Message, idx: number) => {
    if (msg.type === 'system') {
      return (
        <div key={msg.id || idx} className="flex justify-center my-2">
          <span className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full">{msg.text}</span>
        </div>
      );
    }
    const isMe = msg.sender === 'me';
    return (
      <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1 group`} onContextMenu={(e) => handleContextMenu(e, msg)}>
        <div className={`max-w-[75%] ${isMe ? 'bg-blue-500 text-white' : 'bg-white text-gray-900'} rounded-2xl px-4 py-2 shadow-sm relative`}>
          {msg.pinned && (
            <div className={`flex items-center gap-1 mb-1 ${isMe ? 'text-blue-200' : 'text-orange-500'}`}>
              <Pin className="w-3 h-3" /><span className="text-[10px]">{'Закреплено'}</span>
            </div>
          )}
          {msg.forwarded && (
            <div className={`flex items-center gap-1 mb-1 ${isMe ? 'text-blue-200' : 'text-purple-500'}`}>
              <ForwardIcon className="w-3 h-3" /><span className="text-[10px]">{'Переслано'}{msg.forwardedFrom ? ` от ${msg.forwardedFrom}` : ''}</span>
            </div>
          )}
          {msg.replyTo && renderReplyPreview(msg.replyTo, true)}
          {msg.type === 'image' && msg.url && (
            <img src={`${API_URL}${msg.url}`} alt="" className="rounded-lg mb-1 max-w-full max-h-60 object-cover cursor-pointer" onClick={() => window.open(`${API_URL}${msg.url}`, '_blank')} />
          )}
          {msg.type === 'video' && msg.url && (
            <video src={`${API_URL}${msg.url}`} controls className="rounded-lg mb-1 max-w-full max-h-60" />
          )}
          {msg.type === 'video_circle' && msg.url && (
            <div className="mb-1">
              <video src={`${API_URL}${msg.url}`} controls className="w-48 h-48 rounded-full object-cover" style={{ clipPath: 'circle(50%)' }} />
            </div>
          )}
          {msg.type === 'voice' && msg.url && (
            <div className="flex items-center gap-2 min-w-[200px]">
              <Mic className={`w-4 h-4 ${isMe ? 'text-blue-200' : 'text-blue-500'}`} />
              <audio src={`${API_URL}${msg.url}`} controls className="flex-1 h-8" style={{ maxWidth: '250px' }} />
              {msg.duration != null && <span className={`text-xs ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{formatDuration(msg.duration)}</span>}
            </div>
          )}
          {msg.type === 'file' && msg.url && (
            <a href={`${API_URL}${msg.url}`} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 ${isMe ? 'text-blue-100 hover:text-white' : 'text-blue-600 hover:text-blue-700'}`}>
              <FileText className="w-4 h-4" />
              <span className="text-sm underline truncate">{msg.filename || 'Файл'}</span>
              {msg.size != null && <span className="text-xs opacity-70">{(msg.size / 1024).toFixed(0)} KB</span>}
            </a>
          )}
          {msg.text && <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>}
          <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
            {msg.editedAt && <span className={`text-[10px] ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{'ред.'}</span>}
            <span className={`text-[11px] ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{msg.time}</span>
            {renderStatus(msg)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        {isMobile && (
          <button onClick={onBack} className="p-1 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
        )}
        <div className="relative">
          {getAvatar()}
          {isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{chat.name}</h3>
          <p className="text-xs text-gray-500">
            {isOnline ? 'в сети' : peerUser?.lastActive
              ? `был(а) ${new Date(peerUser.lastActive).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}`
              : 'не в сети'
            }
          </p>
        </div>
        {pinnedMessages.length > 0 && (
          <button onClick={() => setShowPinned(!showPinned)} className="p-2 hover:bg-gray-100 rounded-lg transition relative" title={'Закреплённые сообщения'}>
            <Pin className="w-5 h-5 text-orange-500" />
            <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{pinnedMessages.length}</span>
          </button>
        )}
      </div>

      {showPinned && pinnedMessages.length > 0 && (
        <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 max-h-32 overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-orange-700">{'Закреплённые сообщения'}</span>
            <button onClick={() => setShowPinned(false)} className="p-0.5 hover:bg-orange-100 rounded"><X className="w-3 h-3 text-orange-500" /></button>
          </div>
          {pinnedMessages.map(m => (
            <div key={m.id} className="text-xs text-gray-700 py-1 border-b border-orange-100 last:border-0 truncate">
              <span className="text-orange-600">{m.sender === 'me' ? 'Вы' : chat.name}:</span> {m.text || '\u{1F4CE} Файл'}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {(chat.messages || []).map((msg, idx) => renderMessage(msg, idx))}
        <div ref={messagesEndRef} />
      </div>

      {(replyTo || editingMessage) && (
        <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center gap-3">
          <div className="w-1 h-8 rounded bg-blue-500" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-blue-600 font-semibold flex items-center gap-1">
              {editingMessage
                ? <><Pencil className="w-3 h-3" /> {'Редактирование'}</>
                : <><ReplyIcon className="w-3 h-3" /> {replyTo?.senderName || 'Ответ'}</>
              }
            </p>
            <p className="text-xs text-gray-500 truncate">{editingMessage ? editingMessage.text : replyTo?.text || ''}</p>
          </div>
          <button onClick={() => { setReplyTo(null); setEditingMessage(null); setInput(''); }} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}

      <div className="bg-white border-t border-gray-200 p-3">
        <div className="flex items-center gap-2">
          {!isRecording && (
            <>
              <div className="relative">
                <button onClick={() => setShowAttachMenu(!showAttachMenu)} className="p-2 text-gray-500 hover:text-blue-500 hover:bg-gray-100 rounded-full transition">
                  <Paperclip className="w-5 h-5" />
                </button>
                {showAttachMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowAttachMenu(false)} />
                    <div className="absolute bottom-12 left-0 z-20 bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-[160px]">
                      <button onClick={() => imageInputRef.current?.click()} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-sm text-gray-700">
                        <Image className="w-4 h-4 text-green-500" /> {'Фото'}
                      </button>
                      <button onClick={() => videoInputRef.current?.click()} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-sm text-gray-700">
                        <span className="text-blue-500 text-base">{'\ud83d\udcf9'}</span> {'Видео'}
                      </button>
                      <button onClick={() => fileInputRef.current?.click()} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-sm text-gray-700">
                        <FileText className="w-4 h-4 text-purple-500" /> {'Файл'}
                      </button>
                    </div>
                  </>
                )}
              </div>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, 'image')} />
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleFileSelect(e, 'video')} />
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFileSelect(e, 'file')} />
              <input
                ref={inputRef} type="text" value={input}
                onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder={editingMessage ? 'Редактировать сообщение...' : 'Написать сообщение...'}
                className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </>
          )}
          {isRecording ? (
            <VoiceRecorder onRecorded={handleVoiceRecorded} onCancel={() => setIsRecording(false)} />
          ) : input.trim() ? (
            <button onClick={handleSend} className="p-2.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition">
              <Send className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={() => setIsRecording(true)} className="p-2.5 text-gray-500 hover:text-red-500 hover:bg-gray-100 rounded-full transition" title={'Голосовое сообщение'}>
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {contextMenu && (
        <MessageContextMenu
          message={contextMenu.message} x={contextMenu.x} y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onReply={() => handleReply(contextMenu.message)}
          onEdit={() => handleEdit(contextMenu.message)}
          onDelete={() => { setShowDeleteConfirm(contextMenu.message); setContextMenu(null); }}
          onForward={() => { onForwardMessage?.(contextMenu.message); setContextMenu(null); }}
          onPin={() => { onPinMessage?.(contextMenu.message.id, !contextMenu.message.pinned); setContextMenu(null); }}
          onCopy={() => handleCopy(contextMenu.message)}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-2">{'Удалить сообщение?'}</h3>
            <p className="text-sm text-gray-500 mb-4 truncate">&quot;{showDeleteConfirm.text || 'Медиа'}&quot;</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => { onDeleteMessages?.([showDeleteConfirm.id], true); setShowDeleteConfirm(null); }} className="w-full py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium">
                {'Удалить у всех'}
              </button>
              <button onClick={() => { onDeleteMessages?.([showDeleteConfirm.id], false); setShowDeleteConfirm(null); }} className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
                {'Удалить у меня'}
              </button>
              <button onClick={() => setShowDeleteConfirm(null)} className="w-full py-2.5 text-gray-500 text-sm">{'Отмена'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
