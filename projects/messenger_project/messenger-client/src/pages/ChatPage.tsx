import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import type { Chat, Message, User, GroupChat, GroupMessage, ReplyTo } from '../types';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';
import GroupChatWindow from '../components/GroupChatWindow';
import GroupSettingsDialog from '../components/GroupSettingsDialog';
import ForwardDialog from '../components/ForwardDialog';
import CreateGroupDialog from '../components/CreateGroupDialog';
import SearchDialog from '../components/SearchDialog';
import Sidebar from '../components/Sidebar';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function ChatPage() {
  const { user, logout } = useAuth();
  const socket = useSocket(user?.username);
  const [chats, setChats] = useState<Chat[]>([]);
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [showSidebar, setShowSidebar] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const activeChatRef = useRef(activeChat);

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load chats, users, and groups
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

  // Load groups via socket
  useEffect(() => {
    if (!socket || !user) return;
    socket.emit('get_groups', { username: user.username }, (response: { ok: boolean; groups?: GroupChat[] }) => {
      if (response.ok && response.groups) setGroups(response.groups);
    });
  }, [socket, user]);

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

    const onMessageEdited = (data: { chatUsername: string; messageId: number; text: string; editedAt: number }) => {
      setChats(prev => prev.map(chat => {
        if (chat.username !== data.chatUsername) return chat;
        return {
          ...chat,
          messages: chat.messages.map(m =>
            m.id === data.messageId ? { ...m, text: data.text, editedAt: data.editedAt } : m
          ),
        };
      }));
    };

    const onMessagePinned = (data: { chatUsername: string; messageId: number; pinned: boolean }) => {
      setChats(prev => prev.map(chat => {
        if (chat.username !== data.chatUsername) return chat;
        return {
          ...chat,
          messages: chat.messages.map(m =>
            m.id === data.messageId ? { ...m, pinned: data.pinned } : m
          ),
        };
      }));
    };

    const onMessageDeleted = (data: { chatUsername: string; messageIds: number[] }) => {
      setChats(prev => prev.map(chat => {
        if (chat.username !== data.chatUsername) return chat;
        return {
          ...chat,
          messages: chat.messages.filter(m => !data.messageIds.includes(m.id)),
        };
      }));
    };

    const onGroupMessage = (data: { groupId: string; message: GroupMessage }) => {
      setGroups(prev => prev.map(g => {
        if (g.id !== data.groupId) return g;
        return { ...g, messages: [...g.messages, data.message] };
      }));
    };

    const onGroupUpdated = (data: { group: GroupChat }) => {
      setGroups(prev => {
        const idx = prev.findIndex(g => g.id === data.group.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = data.group;
          return updated;
        }
        return [...prev, data.group];
      });
    };

    const onForceLogout = (data: { reason: string }) => {
      alert(data.reason);
      logout();
    };

    socket.on('receive_chats', onReceiveChats);
    socket.on('receive_message', onReceiveMessage);
    socket.on('users_updated', onUsersUpdated);
    socket.on('message_status_update', onMessageStatusUpdate);
    socket.on('message_edited', onMessageEdited);
    socket.on('message_pinned', onMessagePinned);
    socket.on('message_deleted', onMessageDeleted);
    socket.on('group_message', onGroupMessage);
    socket.on('group_updated', onGroupUpdated);
    socket.on('force_logout', onForceLogout);

    return () => {
      socket.off('receive_chats', onReceiveChats);
      socket.off('receive_message', onReceiveMessage);
      socket.off('users_updated', onUsersUpdated);
      socket.off('message_status_update', onMessageStatusUpdate);
      socket.off('message_edited', onMessageEdited);
      socket.off('message_pinned', onMessagePinned);
      socket.off('message_deleted', onMessageDeleted);
      socket.off('group_message', onGroupMessage);
      socket.off('group_updated', onGroupUpdated);
      socket.off('force_logout', onForceLogout);
    };
  }, [socket, user, logout]);

  // Send message (1:1 chat)
  const sendMessage = useCallback((recipientUsername: string, text: string, attachment?: { url: string; filename: string; size: number; type: string; mimeType: string; duration?: number }, replyTo?: ReplyTo) => {
    if (!user || !socket) return;
    if (!text.trim() && !attachment) return;

    const nowMs = Date.now();
    const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const msgId = nowMs;

    const message: Message = {
      id: msgId,
      text: text.trim(),
      sender: 'me',
      time: timeStr,
      timestamp: nowMs,
      type: (attachment?.type as Message['type']) || 'text',
      status: 'sending',
      url: attachment?.url,
      filename: attachment?.filename,
      size: attachment?.size,
      mimeType: attachment?.mimeType,
      duration: attachment?.duration,
      replyTo: replyTo || undefined,
    };

    const recipientUser = users[recipientUsername];

    const chatToSaveSender: Chat = (() => {
      const existing = chats.find(c => c.username === recipientUsername);
      if (existing) {
        return {
          ...existing,
          messages: [...existing.messages, message],
          lastMessage: text.trim() || attachment?.filename || '\u0424\u0430\u0439\u043b',
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
        lastMessage: text.trim() || attachment?.filename || '\u0424\u0430\u0439\u043b',
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
      lastMessage: text.trim() || attachment?.filename || '\u0424\u0430\u0439\u043b',
      unread: 1,
      status: 'online',
      messages: [recipientMessage],
    };

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

  // Edit message
  const handleEditMessage = useCallback((messageId: number, newText: string) => {
    if (!socket || !user || !activeChat) return;
    socket.emit('edit_message', {
      senderUsername: user.username,
      recipientUsername: activeChat,
      messageId,
      newText,
    });
    setChats(prev => prev.map(chat => {
      if (chat.username !== activeChat) return chat;
      return {
        ...chat,
        messages: chat.messages.map(m =>
          m.id === messageId ? { ...m, text: newText, editedAt: Date.now() } : m
        ),
      };
    }));
  }, [socket, user, activeChat]);

  // Delete messages
  const handleDeleteMessages = useCallback((messageIds: number[], forBoth: boolean) => {
    if (!socket || !user || !activeChat) return;
    socket.emit('delete_message', {
      senderUsername: user.username,
      recipientUsername: activeChat,
      messageIds,
      forBoth,
    });
    if (forBoth) {
      setChats(prev => prev.map(chat => {
        if (chat.username !== activeChat) return chat;
        return { ...chat, messages: chat.messages.filter(m => !messageIds.includes(m.id)) };
      }));
    } else {
      setChats(prev => prev.map(chat => {
        if (chat.username !== activeChat) return chat;
        return { ...chat, messages: chat.messages.filter(m => !messageIds.includes(m.id)) };
      }));
    }
  }, [socket, user, activeChat]);

  // Forward message
  const handleForwardMessage = useCallback((recipientUsername: string) => {
    if (!socket || !user || !forwardMessage) return;
    socket.emit('forward_message', {
      senderUsername: user.username,
      recipientUsername,
      originalMessage: forwardMessage,
    });
    setForwardMessage(null);
  }, [socket, user, forwardMessage]);

  // Pin message
  const handlePinMessage = useCallback((messageId: number, pinned: boolean) => {
    if (!socket || !user || !activeChat) return;
    socket.emit('pin_message', {
      senderUsername: user.username,
      recipientUsername: activeChat,
      messageId,
      pinned,
    });
    setChats(prev => prev.map(chat => {
      if (chat.username !== activeChat) return chat;
      return {
        ...chat,
        messages: chat.messages.map(m =>
          m.id === messageId ? { ...m, pinned } : m
        ),
      };
    }));
  }, [socket, user, activeChat]);

  // Group chat: create
  const handleCreateGroup = useCallback((name: string, members: string[], avatar: string | null) => {
    if (!socket || !user) return;
    socket.emit('create_group', {
      name,
      creatorUsername: user.username,
      memberUsernames: members,
      avatar,
    }, (response: { ok: boolean; group?: GroupChat }) => {
      if (response.ok && response.group) {
        setGroups(prev => [...prev, response.group!]);
        setActiveGroup(response.group.id);
        setActiveChat(null);
      }
    });
    setShowCreateGroup(false);
  }, [socket, user]);

  // Group chat: send message
  const sendGroupMessage = useCallback((text: string, attachment?: { url: string; filename: string; size: number; type: string; mimeType: string; duration?: number }, replyTo?: ReplyTo) => {
    if (!socket || !user || !activeGroup) return;
    if (!text.trim() && !attachment) return;
    const nowMs = Date.now();
    const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const msg: GroupMessage = {
      id: nowMs,
      text: text.trim(),
      senderUsername: user.username,
      senderName: user.name,
      time: timeStr,
      timestamp: nowMs,
      type: attachment?.type || 'text',
      url: attachment?.url,
      filename: attachment?.filename,
      size: attachment?.size,
      mimeType: attachment?.mimeType,
      duration: attachment?.duration,
      replyTo: replyTo || undefined,
    };
    socket.emit('send_group_message', { groupId: activeGroup, message: msg });
    setGroups(prev => prev.map(g => {
      if (g.id !== activeGroup) return g;
      return { ...g, messages: [...g.messages, msg] };
    }));
  }, [socket, user, activeGroup]);

  // Group management
  const handleUpdateGroup = useCallback((name: string, avatar: string | null) => {
    if (!socket || !user || !activeGroup) return;
    socket.emit('update_group', { groupId: activeGroup, username: user.username, name, avatar });
  }, [socket, user, activeGroup]);

  const handleAddGroupMember = useCallback((username: string) => {
    if (!socket || !user || !activeGroup) return;
    socket.emit('add_group_member', { groupId: activeGroup, adminUsername: user.username, memberUsername: username });
  }, [socket, user, activeGroup]);

  const handleRemoveGroupMember = useCallback((username: string) => {
    if (!socket || !user || !activeGroup) return;
    socket.emit('remove_group_member', { groupId: activeGroup, adminUsername: user.username, memberUsername: username });
  }, [socket, user, activeGroup]);

  const handleSetGroupAdmin = useCallback((username: string, isAdmin: boolean) => {
    if (!socket || !user || !activeGroup) return;
    socket.emit('set_group_admin', { groupId: activeGroup, adminUsername: user.username, memberUsername: username, isAdmin });
  }, [socket, user, activeGroup]);

  const handleLeaveGroup = useCallback(() => {
    if (!socket || !user || !activeGroup) return;
    socket.emit('leave_group', { groupId: activeGroup, username: user.username });
    setGroups(prev => prev.filter(g => g.id !== activeGroup));
    setActiveGroup(null);
    setShowGroupSettings(false);
  }, [socket, user, activeGroup]);

  const selectChat = (username: string) => {
    setActiveChat(username);
    setActiveGroup(null);
  };

  const selectGroup = (groupId: string) => {
    setActiveGroup(groupId);
    setActiveChat(null);
  };

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

  const currentGroup = groups.find(g => g.id === activeGroup);

  // Mark messages as read
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

  const hasActiveView = !!(activeChat || activeGroup);

  return (
    <div className="h-screen flex bg-gray-100">
      {showSidebar && (
        <Sidebar user={user!} onClose={() => setShowSidebar(false)} onLogout={logout} />
      )}

      {(!isMobile || !hasActiveView) && (
        <div className={`${isMobile ? 'w-full' : 'w-80 border-r border-gray-200'} bg-white flex flex-col`}>
          <ChatList
            chats={chats}
            groups={groups}
            activeChat={activeChat}
            activeGroup={activeGroup}
            users={users}
            currentUser={user!}
            onSelectChat={selectChat}
            onSelectGroup={selectGroup}
            onOpenSidebar={() => setShowSidebar(true)}
            onCreateGroup={() => setShowCreateGroup(true)}
            onOpenSearch={() => setShowSearch(true)}
          />
        </div>
      )}

      {(!isMobile || hasActiveView) && (
        <div className="flex-1 flex flex-col">
          {activeChat && currentChat ? (
            <ChatWindow
              chat={currentChat}
              users={users}
              currentUser={user!}
              onSendMessage={(text, attachment, replyTo) => sendMessage(activeChat, text, attachment, replyTo)}
              onBack={() => setActiveChat(null)}
              isMobile={isMobile}
              onEditMessage={handleEditMessage}
              onDeleteMessages={handleDeleteMessages}
              onForwardMessage={(msg) => setForwardMessage(msg)}
              onPinMessage={handlePinMessage}
            />
          ) : activeGroup && currentGroup ? (
            <GroupChatWindow
              group={currentGroup}
              users={users}
              currentUser={user!}
              onSendMessage={sendGroupMessage}
              onBack={() => setActiveGroup(null)}
              isMobile={isMobile}
              onOpenSettings={() => setShowGroupSettings(true)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center text-gray-400">
                <p className="text-lg">\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0447\u0430\u0442</p>
                <p className="text-sm mt-1">\u0438\u043b\u0438 \u043d\u0430\u0447\u043d\u0438\u0442\u0435 \u043d\u043e\u0432\u044b\u0439 \u0434\u0438\u0430\u043b\u043e\u0433</p>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreateGroup && (
        <CreateGroupDialog users={users} currentUser={user!} onCreateGroup={handleCreateGroup} onClose={() => setShowCreateGroup(false)} />
      )}

      {showGroupSettings && currentGroup && (
        <GroupSettingsDialog
          group={currentGroup} users={users} currentUser={user!}
          onUpdateGroup={handleUpdateGroup}
          onAddMember={handleAddGroupMember}
          onRemoveMember={handleRemoveGroupMember}
          onSetAdmin={handleSetGroupAdmin}
          onLeaveGroup={handleLeaveGroup}
          onClose={() => setShowGroupSettings(false)}
        />
      )}

      {showSearch && (
        <SearchDialog chats={chats} groups={groups} users={users} currentUser={user!} onSelectChat={selectChat} onSelectGroup={selectGroup} onClose={() => setShowSearch(false)} />
      )}

      {forwardMessage && (
        <ForwardDialog users={users} currentUser={user!} chats={chats} message={forwardMessage} onForward={handleForwardMessage} onClose={() => setForwardMessage(null)} />
      )}
    </div>
  );
}
