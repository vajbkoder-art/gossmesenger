import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, Paperclip, Image, FileText, X, Pin, Mic, Settings, Users } from 'lucide-react';
import type { GroupChat, GroupMessage, User, ReplyTo } from '../types';
import VoiceRecorder from './VoiceRecorder';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Props {
  group: GroupChat;
  users: Record<string, User>;
  currentUser: User;
  onSendMessage: (text: string, attachment?: { url: string; filename: string; size: number; type: string; mimeType: string; duration?: number }, replyTo?: ReplyTo) => void;
  onBack: () => void;
  isMobile: boolean;
  onOpenSettings?: () => void;
}

export default function GroupChatWindow({ group, users, currentUser, onSendMessage, onBack, isMobile, onOpenSettings }: Props) {
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [group.messages]);
  useEffect(() => { if (!isRecording) inputRef.current?.focus(); }, [group.id, isRecording]);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    onSendMessage(input.trim(), undefined, replyTo || undefined);
    setInput(''); setReplyTo(null);
  }, [input, replyTo, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') { setReplyTo(null); setInput(''); }
  };

  const uploadFile = async (file: File): Promise<{ url: string; filename: string; size: number } | null> => {
    const formData = new FormData(); formData.append('file', file);
    try { const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData }); if (!res.ok) return null; return await res.json(); } catch { return null; }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'file') => {
    const file = e.target.files?.[0]; if (!file) return; setShowAttachMenu(false);
    const result = await uploadFile(file);
    if (result) { onSendMessage('', { url: result.url, filename: result.filename, size: result.size, type, mimeType: file.type }, replyTo || undefined); setReplyTo(null); }
    e.target.value = '';
  };

  const handleVoiceRecorded = async (blob: Blob, duration: number) => {
    setIsRecording(false);
    const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
    const result = await uploadFile(file);
    if (result) { onSendMessage('', { url: result.url, filename: result.filename, size: result.size, type: 'voice', mimeType: 'audio/webm', duration }, replyTo || undefined); setReplyTo(null); }
  };

  const getSenderName = (msg: GroupMessage) => {
    if (msg.senderUsername === currentUser.username) return '\u0412\u044b';
    return msg.senderName || users[msg.senderUsername || '']?.name || msg.senderUsername || '\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u044b\u0439';
  };

  const getSenderAvatar = (msg: GroupMessage) => {
    const u = users[msg.senderUsername || ''];
    if (u?.avatar?.startsWith('/')) return <img src={`${API_URL}${u.avatar}`} alt="" className="w-8 h-8 rounded-full object-cover" />;
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];
    const color = colors[(msg.senderUsername || '').charCodeAt(0) % colors.length];
    return <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-xs font-semibold`}>{(u?.name?.[0] || '?')}</div>;
  };

  const formatDuration = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;

  const renderMessage = (msg: GroupMessage, idx: number) => {
    if (msg.type === 'system') return <div key={msg.id || idx} className="flex justify-center my-2"><span className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full">{msg.text}</span></div>;
    const isMe = msg.senderUsername === currentUser.username;
    return (
      <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`}>
        {!isMe && <div className="flex-shrink-0 mr-2 mt-auto">{getSenderAvatar(msg)}</div>}
        <div className={`max-w-[70%] ${isMe ? 'bg-blue-500 text-white' : 'bg-white text-gray-900'} rounded-2xl px-4 py-2 shadow-sm`}>
          {!isMe && <p className={`text-xs font-semibold mb-0.5 ${isMe ? 'text-blue-200' : 'text-blue-600'}`}>{getSenderName(msg)}</p>}
          {msg.pinned && <div className={`flex items-center gap-1 mb-1 ${isMe ? 'text-blue-200' : 'text-orange-500'}`}><Pin className="w-3 h-3" /><span className="text-[10px]">{'\u0417\u0430\u043a\u0440\u0435\u043f\u043b\u0435\u043d\u043e'}</span></div>}
          {msg.replyTo && (
            <div className="bg-black/10 rounded-lg px-3 py-1.5 mb-1 border-l-2 border-blue-400">
              <p className="text-xs font-semibold">{msg.replyTo.senderName || '\u041e\u0442\u0432\u0435\u0442'}</p>
              <p className="text-xs opacity-80 truncate">{msg.replyTo.text}</p>
            </div>
          )}
          {msg.type === 'image' && msg.url && <img src={`${API_URL}${msg.url}`} alt="" className="rounded-lg mb-1 max-w-full max-h-60 object-cover" />}
          {msg.type === 'video' && msg.url && <video src={`${API_URL}${msg.url}`} controls className="rounded-lg mb-1 max-w-full max-h-60" />}
          {msg.type === 'voice' && msg.url && (
            <div className="flex items-center gap-2 min-w-[200px]">
              <Mic className={`w-4 h-4 ${isMe ? 'text-blue-200' : 'text-blue-500'}`} />
              <audio src={`${API_URL}${msg.url}`} controls className="flex-1 h-8" style={{ maxWidth: '250px' }} />
              {msg.duration != null && <span className={`text-xs ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{formatDuration(msg.duration)}</span>}
            </div>
          )}
          {msg.type === 'file' && msg.url && (
            <a href={`${API_URL}${msg.url}`} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 ${isMe ? 'text-blue-100 hover:text-white' : 'text-blue-600'}`}>
              <FileText className="w-4 h-4" /><span className="text-sm underline truncate">{msg.filename || '\u0424\u0430\u0439\u043b'}</span>
            </a>
          )}
          {msg.text && <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>}
          <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
            {msg.editedAt && <span className={`text-[10px] ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{'\u0440\u0435\u0434.'}</span>}
            <span className={`text-[11px] ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{msg.time}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        {isMobile && <button onClick={onBack} className="p-1 hover:bg-gray-100 rounded-lg transition"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>}
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
          {group.avatar ? <img src={`${API_URL}${group.avatar}`} alt="" className="w-10 h-10 rounded-full object-cover" /> : <Users className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{group.name}</h3>
          <p className="text-xs text-gray-500">{group.members.length} {'\u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432'}</p>
        </div>
        <button onClick={onOpenSettings} className="p-2 hover:bg-gray-100 rounded-lg transition"><Settings className="w-5 h-5 text-gray-500" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {(group.messages || []).map((msg, idx) => renderMessage(msg, idx))}
        <div ref={messagesEndRef} />
      </div>

      {replyTo && (
        <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center gap-3">
          <div className="w-1 h-8 rounded bg-blue-500" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-blue-600 font-semibold">{replyTo.senderName || '\u041e\u0442\u0432\u0435\u0442'}</p>
            <p className="text-xs text-gray-500 truncate">{replyTo.text}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
      )}

      <div className="bg-white border-t border-gray-200 p-3">
        <div className="flex items-center gap-2">
          {!isRecording && (
            <>
              <div className="relative">
                <button onClick={() => setShowAttachMenu(!showAttachMenu)} className="p-2 text-gray-500 hover:text-blue-500 hover:bg-gray-100 rounded-full transition"><Paperclip className="w-5 h-5" /></button>
                {showAttachMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowAttachMenu(false)} />
                    <div className="absolute bottom-12 left-0 z-20 bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-[160px]">
                      <button onClick={() => imageInputRef.current?.click()} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-sm text-gray-700"><Image className="w-4 h-4 text-green-500" /> {'\u0424\u043e\u0442\u043e'}</button>
                      <button onClick={() => videoInputRef.current?.click()} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-sm text-gray-700"><span className="text-blue-500">{'\ud83d\udcf9'}</span> {'\u0412\u0438\u0434\u0435\u043e'}</button>
                      <button onClick={() => fileInputRef.current?.click()} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 text-sm text-gray-700"><FileText className="w-4 h-4 text-purple-500" /> {'\u0424\u0430\u0439\u043b'}</button>
                    </div>
                  </>
                )}
              </div>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, 'image')} />
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleFileSelect(e, 'video')} />
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFileSelect(e, 'file')} />
              <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={'\u041d\u0430\u043f\u0438\u0441\u0430\u0442\u044c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435...'} className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
            </>
          )}
          {isRecording ? <VoiceRecorder onRecorded={handleVoiceRecorded} onCancel={() => setIsRecording(false)} /> : input.trim() ? <button onClick={handleSend} className="p-2.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition"><Send className="w-5 h-5" /></button> : <button onClick={() => setIsRecording(true)} className="p-2.5 text-gray-500 hover:text-red-500 hover:bg-gray-100 rounded-full transition"><Mic className="w-5 h-5" /></button>}
        </div>
      </div>
    </div>
  );
}
