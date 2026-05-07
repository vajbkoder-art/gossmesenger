import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import type { Chat, Message, User } from '../types';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';
import Sidebar from '../components/Sidebar';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function ChatPage() {
  const { user, logout } = useAuth();
  const socket = useSocket(user?.username);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [showSidebar, setShowSidebar] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const activeChatRef = useRef(activeChat);

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load chats and users
  useEffect(() => {
    if (!user) return;
    fetch(`${API_URL}/api/chats/${user.username}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setChats(data); })
      .catch(console.error);

    fetch(`${API_URL}/api/users`)
      .then(r => r.json())
      .then(data => setUsers(data))
      .catch(console.error);
  }, [user]);

  // Socket events
  useEffect(() => {
    if (!socket || !user) return;

    const onReceiveChats = (updatedChats: Chat[]) => {
      if (Array.isArray(updatedChats)) setChats(updatedChats);
    };

    const onReceiveMessage = (payload: { recipientUsername: string; senderUsername: string; message: Message }) => {
      if (payload.senderUsername === activeChatRef.current && payload.message) {
        socket.emit('message_delivered', {
          senderUsername: payload.senderUsername,
          recipientUsername: user.username,
          messageIds: [payload.message.id],
        });
      }
    };

    const onUsersUpdated = (updatedUsers: Record<string, User>) => {
      setUsers(updatedUsers);
    };

    const onMessageStatusUpdate = (data: { chatUsername: string; messageIds: number[]; status: string }) => {
      setChats(prev => prev.map(chat => {
        if (chat.username !== data.chatUsername) return chat;
        return {
          ...chat,
          messages: chat.messages.map(m =>
            data.messageIds.includes(m.id) ? { ...m, status: data.status as Message['status'] } : m
          ),
        };
      }));
    };

    const onForceLogout = (data: { reason: string }) => {
      alert(data.reason);
      logout();
    };

    socket.on('receive_chats', onReceiveChats);
    socket.on('receive_message', onReceiveMessage);
    socket.on('users_updated', onUsersUpdated);
    socket.on('message_status_update', onMessageStatusUpdate);
    socket.on('force_logout', onForceLogout);

    return () => {
      socket.off('receive_chats', onReceiveChats);
      socket.off('receive_message', onReceiveMessage);
      socket.off('users_updated', onUsersUpdated);
      socket.off('message_status_update', onMessageStatusUpdate);
      socket.off('force_logout', onForceLogout);
    };
  }, [socket, user, logout]);

  const sendMessage = useCallback((recipientUsername: string, text: string) => {
    if (!user || !socket || !text.trim()) return;

    const nowMs = Date.now();
    const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const msgId = nowMs;

    const message: Message = {
      id: msgId,
      text: text.trim(),
      sender: 'me',
      time: timeStr,
      timestamp: nowMs,
      type: 'text',
      status: 'sending',
    };

    const recipientUser = users[recipientUsername];

    const chatToSaveSender: Chat = (() => {
      const existing = chats.find(c => c.username === recipientUsername);
      if (existing) {
        return {
          ...existing,
          messages: [...existing.messages, message],
          lastMessage: text.trim(),
          time: timeStr,
          timestamp: nowMs,
        };
      }
      return {
        id: `chat_${nowMs}`,
        name: recipientUser?.name || recipientUsername,
        username: recipientUsername,
        avatar: recipientUser?.avatar || recipientUsername[0]?.toUpperCase() || '?',
        time: timeStr,
        timestamp: nowMs,
        lastMessage: text.trim(),
        unread: 0,
        status: 'offline',
        messages: [message],
      };
    })();

    const recipientMessage = { ...message, sender: 'them' as const };
    const chatToSaveRecipient: Chat = {
      id: `chat_${nowMs}`,
      name: user.name || user.username,
      username: user.username,
      avatar: user.avatar || user.username[0]?.toUpperCase() || '?',
      time: timeStr,
      timestamp: nowMs,
      lastMessage: text.trim(),
      unread: 1,
      status: 'online',
      messages: [recipientMessage],
    };

    // Find existing chat for recipient to merge messages
    const existingRecipientChat = chats.find(c => c.username === recipientUsername);
    if (existingRecipientChat) {
      chatToSaveRecipient.messages = [...existingRecipientChat.messages.map(m => {
        if (m.sender === 'me') return { ...m, sender: 'them' as const };
        if (m.sender === 'them') return { ...m, sender: 'me' as const };
        return m;
      }), recipientMessage];
    }

    socket.emit('send_message', {
      recipientUsername,
      senderUsername: user.username,
      message,
      chatToSaveSender,
      chatToSaveRecipient,
    }, (ack: { ok?: boolean; error?: string }) => {
      if (ack?.error) console.error('Send error:', ack.error);
    });

    // Optimistically update local chats
    setChats(prev => {
      const idx = prev.findIndex(c => c.username === recipientUsername);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = chatToSaveSender;
        updated.unshift(updated.splice(idx, 1)[0]);
        return updated;
      }
      return [chatToSaveSender, ...prev];
    });
  }, [user, socket, chats, users]);

  const currentChat = chats.find(c => c.username === activeChat) || (() => {
    if (!activeChat || !users[activeChat]) return undefined;
    const peer = users[activeChat];
    return {
      id: `new_${activeChat}`,
      name: peer.name || activeChat,
      username: activeChat,
      avatar: peer.avatar || activeChat[0]?.toUpperCase() || '?',
      time: '',
      timestamp: 0,
      lastMessage: '',
      unread: 0,
      status: 'offline',
      messages: [],
    } as Chat;
  })();

  // Mark messages as read when opening a chat
  useEffect(() => {
    if (!activeChat || !user || !socket) return;
    const chat = chats.find(c => c.username === activeChat);
    if (!chat) return;

    const unreadIds = chat.messages
      .filter(m => m.sender === 'them' && m.status !== 'read')
      .map(m => m.id);

    if (unreadIds.length > 0) {
      socket.emit('messages_read', {
        senderUsername: activeChat,
        recipientUsername: user.username,
        messageIds: unreadIds,
      });
    }
  }, [activeChat, chats, user, socket]);

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Sidebar */}
      {showSidebar && (
        <Sidebar
          user={user!}
          onClose={() => setShowSidebar(false)}
          onLogout={logout}
        />
      )}

      {/* Chat list */}
      {(!isMobile || !activeChat) && (
        <div className={`${isMobile ? 'w-full' : 'w-80 border-r border-gray-200'} bg-white flex flex-col`}>
          <ChatList
            chats={chats}
            activeChat={activeChat}
            users={users}
            currentUser={user!}
            onSelectChat={setActiveChat}
            onOpenSidebar={() => setShowSidebar(true)}
          />
        </div>
      )}

      {/* Chat window */}
      {(!isMobile || activeChat) && (
        <div className="flex-1 flex flex-col">
          {activeChat && currentChat ? (
            <ChatWindow
              chat={currentChat}
              users={users}
              currentUser={user!}
              onSendMessage={(text) => sendMessage(activeChat, text)}
              onBack={() => setActiveChat(null)}
              isMobile={isMobile}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center text-gray-400">
                <p className="text-lg">Выберите чат</p>
                <p className="text-sm mt-1">или начните новый диалог</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
