import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Paperclip, Check, CheckCheck } from 'lucide-react';
import type { Chat, User, Message } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ChatWindowProps {
  chat: Chat;
  users: Record<string, User>;
  currentUser: User;
  onSendMessage: (text: string) => void;
  onBack: () => void;
  isMobile: boolean;
}

export default function ChatWindow({ chat, users, onSendMessage, onBack, isMobile }: ChatWindowProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const peerUser = users[chat.username];
  const isOnline = peerUser && (Date.now() - (peerUser.lastActive || 0)) < 2 * 60 * 1000;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [chat.username]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderStatus = (msg: Message) => {
    if (msg.sender !== 'me') return null;
    switch (msg.status) {
      case 'read':
        return <CheckCheck className="w-4 h-4 text-blue-500" />;
      case 'delivered':
        return <CheckCheck className="w-4 h-4 text-gray-400" />;
      case 'sent':
        return <Check className="w-4 h-4 text-gray-400" />;
      case 'sending':
        return <div className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />;
      default:
        return <Check className="w-4 h-4 text-gray-400" />;
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
      <div key={msg.id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}>
        <div className={`max-w-[75%] ${isMe ? 'bg-blue-500 text-white' : 'bg-white text-gray-900'} rounded-2xl px-4 py-2 shadow-sm`}>
          {msg.type === 'image' && msg.url && (
            <img src={`${API_URL}${msg.url}`} alt="" className="rounded-lg mb-1 max-w-full max-h-60 object-cover" />
          )}
          {msg.type === 'file' && msg.url && (
            <a
              href={`${API_URL}${msg.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 ${isMe ? 'text-blue-100 hover:text-white' : 'text-blue-600 hover:text-blue-700'}`}
            >
              <Paperclip className="w-4 h-4" />
              <span className="text-sm underline truncate">{msg.filename || 'Файл'}</span>
            </a>
          )}
          {msg.text && <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>}
          <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
            <span className={`text-[11px] ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{msg.time}</span>
            {renderStatus(msg)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        {isMobile && (
          <button onClick={onBack} className="p-1 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
        )}
        <div className="relative">
          {getAvatar()}
          {isOnline && (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
          )}
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
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {(chat.messages || []).map((msg, idx) => renderMessage(msg, idx))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написать сообщение..."
            className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
