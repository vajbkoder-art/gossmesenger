import { db, saveDB } from '../db.js';

export function saveCallLog({ caller, receiver, status, duration, isVideo }, io) {
  if (!caller || !receiver || caller === receiver) return;

  const ensureChat = (owner, peer) => {
    if (!db.chats[owner]) db.chats[owner] = [];
    let chat = db.chats[owner].find(c => c.username === peer);
    if (!chat) {
      const peerUser = db.users[peer] || {};
      chat = {
        id: `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: peerUser.name || peer,
        username: peer,
        avatar: peerUser.avatar || '',
        time: '',
        lastMessage: '',
        unread: 0,
        status: 'offline',
        messages: [],
      };
      db.chats[owner].push(chat);
    }
    return chat;
  };

  const chatCaller = ensureChat(caller, receiver);
  const chatReceiver = ensureChat(receiver, caller);

  const nowMs = Date.now();
  const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const msgId = nowMs;
  const icon = isVideo ? '\u{1F4F9}' : '\u{1F4DE}';

  let callerText = '';
  let receiverText = '';

  if (status === 'missed') {
    callerText = `${icon} Исходящий звонок (без ответа)`;
    receiverText = `${icon} Пропущенный звонок`;
  } else if (status === 'rejected') {
    callerText = `${icon} Исходящий звонок (отклонён)`;
    receiverText = `${icon} Входящий звонок (отклонён)`;
  } else if (status === 'busy') {
    callerText = `${icon} Исходящий звонок (занято)`;
    receiverText = `${icon} Входящий звонок (занято)`;
  } else {
    callerText = `${icon} Исходящий звонок, ${duration}`;
    receiverText = `${icon} Входящий звонок, ${duration}`;
  }

  chatCaller.messages.unshift({ id: msgId, text: callerText, sender: 'me', time: timeStr, timestamp: nowMs, type: 'system' });
  chatCaller.lastMessage = callerText;
  chatCaller.time = timeStr;
  chatCaller.timestamp = nowMs;

  chatReceiver.messages.unshift({ id: msgId + 1, text: receiverText, sender: 'them', time: timeStr, timestamp: nowMs, type: 'system' });
  chatReceiver.lastMessage = receiverText;
  chatReceiver.time = timeStr;
  chatReceiver.timestamp = nowMs;

  db.chats[caller] = [chatCaller, ...db.chats[caller].filter(c => c.username !== receiver)];
  db.chats[receiver] = [chatReceiver, ...db.chats[receiver].filter(c => c.username !== caller)];

  if (io) {
    io.to(`user_${caller}`).emit('receive_chats', db.chats[caller]);
    io.to(`user_${receiver}`).emit('receive_chats', db.chats[receiver]);
  }
  saveDB();
}
