import * as mediasoupRooms from '../mediasoupRooms.js';
import { db, saveDB, sanitizeUsers, logActivity } from '../db.js';
import { sendPushNotification } from '../services/push.js';
import { saveCallLog } from '../services/callLog.js';
import { recordUserIp } from '../middleware.js';

function sfuPeerIdToUsername(pid) {
  if (!pid) return pid;
  const idx = pid.lastIndexOf('_');
  if (idx > 0 && !isNaN(pid.substring(idx + 1))) return pid.substring(0, idx);
  return pid;
}

// Shared state
if (!global.activeCalls) global.activeCalls = {};
if (!global.activeConferenceCalls) global.activeConferenceCalls = {};
if (!global.userIPs) global.userIPs = {};
if (!global.pendingCalls) global.pendingCalls = {};

const userSockets = {};
global.userSockets = userSockets;

export function setupSocketHandlers(io) {
  const pendingCalls = global.pendingCalls;

  io.on('connection', (socket) => {

    // === Register user ===
    socket.on('register_user', (username) => {
      if (!username || typeof username !== 'string') return;
      const u = username.trim();
      if (!u) return;

      if (socket._registeredAs) {
        const old = userSockets[socket._registeredAs];
        if (old) { old.delete(socket.id); if (old.size === 0) delete userSockets[socket._registeredAs]; }
      }
      socket._registeredAs = u;
      if (!userSockets[u]) userSockets[u] = new Set();
      userSockets[u].add(socket.id);
      socket.join(`user_${u}`);

      try {
        const xff = socket.handshake?.headers?.['x-forwarded-for'];
        const ip = xff ? String(xff).split(',')[0].trim() : socket.handshake?.address;
        recordUserIp(u, ip);
        if (!global.userIPs) global.userIPs = {};
        global.userIPs[u] = { ip, at: Date.now() };
      } catch (_) {}

      // Deliver pending call
      const pending = pendingCalls[u];
      if (pending) {
        const ageMs = Date.now() - (pending.createdAt || 0);
        if (ageMs > 60000) {
          delete pendingCalls[u];
        } else if (!pending._delivered) {
          pending._delivered = true;
          socket.emit('incoming_call', {
            signal: pending.signal,
            from: pending.from,
            fromName: pending.fromName || db.users[pending.from]?.name,
            fromAvatar: pending.fromAvatar || db.users[pending.from]?.avatar || undefined,
            isVideo: pending.isVideo,
            roomId: pending.roomId,
          });
        }
      }

      if (db.users[u]) {
        db.users[u].lastActive = Date.now();
        saveDB();
        io.emit('users_updated', sanitizeUsers(db.users));
      }
    });

    // === Heartbeat ===
    socket.on('heartbeat', () => {
      const u = socket._registeredAs;
      if (u && db.users[u]) {
        db.users[u].lastActive = Date.now();
        io.emit('user_status_update', { username: u, lastActive: db.users[u].lastActive, online: true });
      }
    });

    // === Disconnect ===
    socket.on('disconnect', () => {
      const peerInfo = mediasoupRooms.unregisterPeerSocket(socket.id);
      if (peerInfo) {
        const { roomId: peerRoomId, peerId: disconnectedPeerId } = peerInfo;
        const closedProducers = mediasoupRooms.removePeerFromRoom(peerRoomId, disconnectedPeerId);
        const others = mediasoupRooms.getOtherPeersInRoom(peerRoomId, disconnectedPeerId);
        closedProducers.forEach(cp => {
          others.forEach(otherPeerId => {
            const uname = sfuPeerIdToUsername(otherPeerId);
            const sids = userSockets[uname];
            if (sids) sids.forEach(sid => io.to(sid).emit('sfu:producerClosed', { producerId: cp.producerId, kind: cp.kind, peerId: cp.peerId }));
          });
        });
      }

      const username = socket._registeredAs;
      if (username) {
        const s = userSockets[username];
        if (s) {
          s.delete(socket.id);
          if (s.size === 0) {
            delete userSockets[username];
            if (db.users[username]) {
              db.users[username].lastActive = Date.now();
              saveDB();
              io.emit('user_status_update', { username, lastActive: db.users[username].lastActive, online: false });
            }

            setTimeout(() => {
              if (!userSockets[username] || userSockets[username].size === 0) {
                if (global.activeCalls?.[username]) {
                  const callInfo = global.activeCalls[username];
                  if (callInfo.peer) {
                    io.to(`user_${callInfo.peer}`).emit('call_ended', { reason: 'peer_disconnected' });
                    sendPushNotification(callInfo.peer, { type: 'call_ended' });
                    delete global.activeCalls[callInfo.peer];
                  }
                  delete global.activeCalls[username];
                }
                Object.keys(pendingCalls).forEach(callee => {
                  if (pendingCalls[callee]?.from === username) {
                    io.to(`user_${callee}`).emit('call_ended', { reason: 'caller_disconnected' });
                    sendPushNotification(callee, { type: 'call_ended' });
                    delete pendingCalls[callee];
                  }
                });
                if (pendingCalls[username]) {
                  const p = pendingCalls[username];
                  const callerSids = userSockets[p.from];
                  if (callerSids) {
                    callerSids.forEach(sid => io.to(sid).emit('call_ended', { reason: 'callee_disconnected' }));
                  }
                  mediasoupRooms.closeRoom(p.roomId);
                  delete pendingCalls[username];
                }
              }
            }, 5000);
          }
        }
      }
    });

    // === Messaging ===
    socket.on('send_message', (payload, ackFn) => {
      const { recipientUsername, senderUsername, message, chatToSaveRecipient, chatToSaveSender } = payload;
      const ack = typeof ackFn === 'function' ? ackFn : () => {};

      if (message) {
        const nowMs = Date.now();
        message.timestamp = nowMs;
        const mskTime = new Date(nowMs).toLocaleTimeString('ru-RU', {
          hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
        });
        message.time = mskTime;

        const patchMsgs = (msgs) =>
          Array.isArray(msgs)
            ? msgs.map(m => m.id === message.id ? { ...m, timestamp: nowMs, time: mskTime } : m)
            : msgs;

        if (chatToSaveSender) {
          chatToSaveSender.timestamp = nowMs;
          chatToSaveSender.time = mskTime;
          chatToSaveSender.messages = patchMsgs(chatToSaveSender.messages);
        }
        if (chatToSaveRecipient) {
          chatToSaveRecipient.timestamp = nowMs;
          chatToSaveRecipient.time = mskTime;
          chatToSaveRecipient.messages = patchMsgs(chatToSaveRecipient.messages);
        }
      }

      const sender = db.users[senderUsername];
      const recipient = db.users[recipientUsername];
      if (!sender) { ack({ error: 'Аккаунт не найден' }); return; }
      if (sender.banned) { socket.emit('force_logout', { reason: 'Ваш аккаунт заблокирован' }); ack({ error: 'Заблокирован' }); return; }
      if (sender.officeId && db.offices[sender.officeId]?.suspended) {
        socket.emit('force_logout', { reason: 'Ваш офис приостановлен' }); ack({ error: 'Офис приостановлен' }); return;
      }
      if (sender && recipient && (sender.officeId || null) !== (recipient.officeId || null)) {
        socket.emit('message_error', { error: 'Нельзя писать пользователям из другого офиса' });
        ack({ error: 'Другой офис' }); return;
      }
      const senderRole = sender?.role || 'client';
      const recipientRole = recipient?.role || 'client';
      const isClientToClient = (senderRole === 'client' || senderRole === 'user') && (recipientRole === 'client' || recipientRole === 'user');
      if (isClientToClient) {
        socket.emit('message_error', { error: 'Клиенты могут общаться только с сотрудниками' });
        ack({ error: 'Клиент → клиент запрещено' }); return;
      }

      if (chatToSaveRecipient) {
        if (!db.chats[recipientUsername]) db.chats[recipientUsername] = [];
        const chats = db.chats[recipientUsername];
        const idx = chats.findIndex(c => c.username === senderUsername);
        if (idx !== -1) { chats[idx] = chatToSaveRecipient; chats.unshift(chats.splice(idx, 1)[0]); }
        else { chats.unshift(chatToSaveRecipient); }

        io.to(`user_${recipientUsername}`).emit('receive_chats', chats);
        io.to(`user_${recipientUsername}`).emit('receive_message', payload);

        const senderName = sender.name || sender.username;
        const textPreview = message?.text || (message?.type === 'image' ? 'Фотография' : 'Файл');
        sendPushNotification(recipientUsername, {
          type: 'message', title: senderName, body: textPreview,
          icon: sender.avatar || '/app/favicon.ico', url: '/app/',
        });
      }

      if (chatToSaveSender) {
        if (chatToSaveSender.messages && message) {
          chatToSaveSender.messages = chatToSaveSender.messages.map(m =>
            m.id === message.id ? { ...m, status: 'sent' } : m
          );
        }
        if (!db.chats[senderUsername]) db.chats[senderUsername] = [];
        const chats = db.chats[senderUsername];
        const idx = chats.findIndex(c => c.username === recipientUsername);
        if (idx !== -1) { chats[idx] = chatToSaveSender; chats.unshift(chats.splice(idx, 1)[0]); }
        else { chats.unshift(chatToSaveSender); }
        io.to(`user_${senderUsername}`).emit('receive_chats', chats);
      }

      saveDB();
      ack({ ok: true });
    });

    // === Delete messages ===
    socket.on('delete_messages', ({ senderUsername, recipientUsername, messageIds, forBoth }) => {
      if (!messageIds?.length || !senderUsername || !recipientUsername) return;

      const removeFromChat = (ownerUsername, peerUsername) => {
        const chats = db.chats[ownerUsername] || [];
        const chatIdx = chats.findIndex(c => c.username === peerUsername);
        if (chatIdx !== -1) {
          const chat = chats[chatIdx];
          chat.messages = (chat.messages || []).filter(m => !messageIds.includes(m.id));
          const lastMsg = chat.messages[chat.messages.length - 1];
          chat.lastMessage = lastMsg?.text || '';
          chat.time = lastMsg?.time || chat.time;
          chat.timestamp = lastMsg?.timestamp || chat.timestamp;
          io.to(`user_${ownerUsername}`).emit('receive_chats', chats);
        }
      };

      removeFromChat(senderUsername, recipientUsername);
      if (forBoth) removeFromChat(recipientUsername, senderUsername);
      saveDB();
    });

    // === Message delivery ===
    socket.on('message_delivered', ({ senderUsername, recipientUsername, messageIds }) => {
      if (!senderUsername || !messageIds?.length) return;
      const senderChats = db.chats[senderUsername];
      if (Array.isArray(senderChats)) {
        const chat = senderChats.find(c => c.username === recipientUsername);
        if (chat?.messages) {
          let changed = false;
          chat.messages = chat.messages.map(m => {
            if (messageIds.includes(m.id) && m.sender === 'me' && m.status !== 'read') {
              changed = true;
              return { ...m, status: 'delivered' };
            }
            return m;
          });
          if (changed) saveDB();
        }
      }
      io.to(`user_${senderUsername}`).emit('message_status_update', { chatUsername: recipientUsername, messageIds, status: 'delivered' });
    });

    // === Messages read ===
    socket.on('messages_read', ({ senderUsername, recipientUsername, messageIds }) => {
      if (!senderUsername || !messageIds?.length) return;
      const senderChats = db.chats[senderUsername];
      if (Array.isArray(senderChats)) {
        const chat = senderChats.find(c => c.username === recipientUsername);
        if (chat?.messages) {
          let changed = false;
          chat.messages = chat.messages.map(m => {
            if (messageIds.includes(m.id) && m.sender === 'me') { changed = true; return { ...m, status: 'read' }; }
            return m;
          });
          if (changed) saveDB();
        }
      }
      io.to(`user_${senderUsername}`).emit('message_status_update', { chatUsername: recipientUsername, messageIds, status: 'read' });
    });

    // === Delete chat ===
    socket.on('delete_chat', ({ username, updatedChats }) => {
      if (!username || !Array.isArray(updatedChats)) return;
      db.chats[username] = updatedChats;
      saveDB();
      io.to(`user_${username}`).emit('receive_chats', updatedChats);
    });

    socket.on('delete_chat_peer', ({ ownerUsername, peerUsername }) => {
      if (!peerUsername || !db.chats[peerUsername]) return;
      const peerChats = db.chats[peerUsername];
      if (!Array.isArray(peerChats)) return;
      db.chats[peerUsername] = peerChats.filter(c => c.username !== ownerUsername);
      saveDB();
      io.to(`user_${peerUsername}`).emit('receive_chats', db.chats[peerUsername]);
      io.to(`user_${peerUsername}`).emit('chat_deleted_by_peer', { by: ownerUsername });
    });

    // === Log call ===
    socket.on('log_call', ({ caller, receiver, status, duration, isVideo }) => {
      saveCallLog({ caller, receiver, status, duration, isVideo }, io);
    });

    // === Conferences ===
    socket.on('create_conference', ({ name, creatorUsername, invitedUsernames }) => {
      const creator = db.users[creatorUsername];
      if (!creator) return;
      if (creator.banned) { socket.emit('force_logout', { reason: 'Ваш аккаунт заблокирован' }); return; }

      const nowMs = Date.now();
      const confId = `conf_${nowMs}`;
      const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

      const validInvited = (invitedUsernames || []).filter(u => {
        const target = db.users[u];
        if (!target || target.banned) return false;
        if ((target.officeId || null) !== (creator.officeId || null)) return false;
        return u !== creatorUsername;
      });

      const conf = {
        id: confId, name: name || 'Конференция', creator: creatorUsername,
        participants: [creatorUsername], pending: validInvited,
        messages: [{ id: nowMs, text: `${creator.name || creatorUsername} создал конференцию`, senderUsername: null, time: timeStr, timestamp: nowMs, type: 'system' }],
        avatar: null, createdAt: new Date().toISOString(),
      };

      db.conferences[confId] = conf;
      saveDB();

      socket.emit('conference_created', conf);
      for (const u of validInvited) {
        io.to(`user_${u}`).emit('conference_invite', { confId, inviterName: creator.name || creatorUsername, confName: conf.name, conference: conf });
      }
      logActivity('create_conference', { confId, creator: creatorUsername, invited: validInvited });
    });

    socket.on('join_conference', ({ confId, username }) => {
      const conf = db.conferences[confId];
      if (!conf || !conf.pending.includes(username)) return;
      conf.pending = conf.pending.filter(u => u !== username);
      conf.participants.push(username);
      const nowMs = Date.now();
      const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const user = db.users[username];
      conf.messages.push({ id: nowMs, text: `${user?.name || username} присоединился`, senderUsername: null, time: timeStr, timestamp: nowMs, type: 'system' });
      saveDB();
      for (const u of conf.participants) io.to(`user_${u}`).emit('conference_updated', conf);
    });

    socket.on('decline_conference', ({ confId, username }) => {
      const conf = db.conferences[confId];
      if (!conf) return;
      conf.pending = conf.pending.filter(u => u !== username);
      saveDB();
      for (const u of conf.participants) io.to(`user_${u}`).emit('conference_updated', conf);
    });

    socket.on('send_conference_message', ({ confId, senderUsername, text, attachment }) => {
      const conf = db.conferences[confId];
      if (!conf || !conf.participants.includes(senderUsername)) return;
      const sender = db.users[senderUsername];
      if (!sender) return;
      if (sender.banned) { socket.emit('force_logout', { reason: 'Ваш аккаунт заблокирован' }); return; }
      if (sender.officeId && db.offices[sender.officeId]?.suspended) {
        socket.emit('force_logout', { reason: 'Ваш офис приостановлен' }); return;
      }
      const nowMs = Date.now();
      const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const message = { id: nowMs, text: text || '', senderUsername, time: timeStr, timestamp: nowMs, type: attachment?.type || 'text' };
      if (attachment) {
        if (attachment.url) message.url = attachment.url;
        if (attachment.filename) message.filename = attachment.filename;
        if (attachment.size != null) message.size = attachment.size;
        if (attachment.mimeType) message.mimeType = attachment.mimeType;
        if (attachment.width != null) message.width = attachment.width;
        if (attachment.height != null) message.height = attachment.height;
        if (attachment.duration != null) message.duration = attachment.duration;
      }
      conf.messages.push(message);
      saveDB();
      for (const u of conf.participants) io.to(`user_${u}`).emit('receive_conference_message', { confId, message });
    });

    socket.on('leave_conference', ({ confId, username }) => {
      const conf = db.conferences[confId];
      if (!conf || !conf.participants.includes(username)) return;
      conf.participants = conf.participants.filter(u => u !== username);
      const nowMs = Date.now();
      const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const user = db.users[username];
      conf.messages.push({ id: nowMs, text: `${user?.name || username} покинул конференцию`, senderUsername: null, time: timeStr, timestamp: nowMs, type: 'system' });
      if (conf.participants.length === 0) delete db.conferences[confId];
      saveDB();
      io.to(`user_${username}`).emit('conference_updated', { ...conf, _left: true });
      for (const u of conf.participants) io.to(`user_${u}`).emit('conference_updated', conf);
    });

    socket.on('add_conference_participant', ({ confId, adderUsername, targetChatId }) => {
      const conf = db.conferences[confId];
      if (!conf) return;
      if (conf.creator !== adderUsername) { socket.emit('conference_error', { error: 'Только создатель может добавлять участников' }); return; }
      const targetUser = Object.values(db.users).find(u => u.chatId === targetChatId);
      if (!targetUser) { socket.emit('conference_error', { error: 'Пользователь не найден' }); return; }
      const adder = db.users[adderUsername];
      if ((adder?.officeId || null) !== (targetUser.officeId || null)) { socket.emit('conference_error', { error: 'Пользователь из другого офиса' }); return; }
      if (conf.participants.includes(targetUser.username) || conf.pending.includes(targetUser.username)) { socket.emit('conference_error', { error: 'Пользователь уже в конференции' }); return; }
      conf.pending.push(targetUser.username);
      saveDB();
      io.to(`user_${targetUser.username}`).emit('conference_invite', { confId, inviterName: adder?.name || adderUsername, confName: conf.name, conference: conf });
      for (const u of conf.participants) io.to(`user_${u}`).emit('conference_updated', conf);
    });

    // === Conference Calls ===
    socket.on('start_conference_call', async ({ confId, username, isVideo }) => {
      const conf = db.conferences[confId];
      if (!conf || !conf.participants.includes(username)) return;
      if (global.activeCalls?.[username]) {
        const peer = global.activeCalls[username].peer;
        delete global.activeCalls[username];
        if (peer && global.activeCalls[peer]?.peer === username) delete global.activeCalls[peer];
      }
      if (global.activeConferenceCalls[confId]) {
        socket.emit('conference_call_room', { confId, roomId: global.activeConferenceCalls[confId].roomId, isVideo: global.activeConferenceCalls[confId].isVideo });
        return;
      }
      const roomId = `conf_${confId}_${Date.now()}`;
      try { await mediasoupRooms.getOrCreateRoom(roomId); } catch (e) { console.error('[start_conference_call] mediasoup error', e); return; }
      global.activeConferenceCalls[confId] = { roomId, isVideo, startedBy: username, startedAt: Date.now(), participants: [username] };
      socket.emit('conference_call_room', { confId, roomId, isVideo });
      const callerName = db.users[username]?.name || username;
      const callMsg = { id: Date.now(), text: `\u{1F4DE} ${callerName} начал ${isVideo ? 'видео' : 'аудио'} звонок`, type: 'system', timestamp: Date.now(), time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) };
      conf.messages.push(callMsg);
      saveDB();
      for (const p of conf.participants) {
        io.to(`user_${p}`).emit('receive_conference_message', { confId, message: callMsg });
        if (p === username) continue;
        io.to(`user_${p}`).emit('conference_call_started', { confId, confName: conf.name, roomId, isVideo, startedBy: username, callerName, participants: [{ username, name: callerName, avatar: db.users[username]?.avatar || '' }] });
      }
    });

    socket.on('join_conference_call', ({ confId, username }) => {
      const call = global.activeConferenceCalls[confId];
      if (!call) return;
      const conf = db.conferences[confId];
      if (!conf || !conf.participants.includes(username)) return;
      if (global.activeCalls?.[username]) {
        const peer = global.activeCalls[username].peer;
        delete global.activeCalls[username];
        if (peer && global.activeCalls[peer]?.peer === username) delete global.activeCalls[peer];
      }
      if (!call.participants.includes(username)) call.participants.push(username);
      const participantList = call.participants.map(u => ({ username: u, name: db.users[u]?.name || u, avatar: db.users[u]?.avatar || '' }));
      for (const p of conf.participants) {
        io.to(`user_${p}`).emit('conference_call_participant_joined', { confId, username, name: db.users[username]?.name || username, avatar: db.users[username]?.avatar || '', participantCount: call.participants.length, participants: participantList });
      }
    });

    socket.on('check_conference_call', ({ confId }, cb) => {
      const call = global.activeConferenceCalls[confId];
      if (!call) return cb?.({ active: false });
      const participantList = call.participants.map(u => ({ username: u, name: db.users[u]?.name || u, avatar: db.users[u]?.avatar || '' }));
      cb?.({ active: true, roomId: call.roomId, isVideo: call.isVideo, participants: participantList });
    });

    socket.on('leave_conference_call', ({ confId, username }) => {
      const call = global.activeConferenceCalls[confId];
      if (!call || !call.participants.includes(username)) return;
      if (global.activeCalls?.[username]) {
        const peer = global.activeCalls[username].peer;
        delete global.activeCalls[username];
        if (peer && global.activeCalls[peer]?.peer === username) delete global.activeCalls[peer];
      }
      call.participants = call.participants.filter(p => p !== username);
      const closedProducers = mediasoupRooms.removePeerFromRoom(call.roomId, username);
      const others = mediasoupRooms.getOtherPeersInRoom(call.roomId, username);
      closedProducers.forEach(cp => {
        others.forEach(otherPeerId => {
          const uname = sfuPeerIdToUsername(otherPeerId);
          const sids = userSockets[uname];
          if (sids) sids.forEach(sid => io.to(sid).emit('sfu:producerClosed', { producerId: cp.producerId, kind: cp.kind, peerId: cp.peerId }));
        });
      });
      const conf = db.conferences[confId];
      if (call.participants.length === 0) {
        mediasoupRooms.closeRoom(call.roomId);
        delete global.activeConferenceCalls[confId];
        if (conf) { for (const p of conf.participants) io.to(`user_${p}`).emit('conference_call_ended', { confId }); }
      } else if (conf) {
        for (const p of conf.participants) io.to(`user_${p}`).emit('conference_call_participant_left', { confId, username, participantCount: call.participants.length });
      }
    });

    // === WebRTC Call Signaling ===
    socket.on('call_user', async (data) => {
      if (global.activeCalls[data.userToCall]) {
        const callInfo = global.activeCalls[data.userToCall];
        const callAgeMs = Date.now() - (callInfo.startTime || 0);
        if (callAgeMs > 5 * 60 * 1000) {
          delete global.activeCalls[data.userToCall];
          if (callInfo.peer) delete global.activeCalls[callInfo.peer];
        } else {
          socket.emit('call_busy', { user: data.userToCall });
          saveCallLog({ caller: data.from, receiver: data.userToCall, status: 'busy', duration: '00:00', isVideo: data.isVideo }, io);
          return;
        }
      }

      const roomId = `call_${data.from}_${data.userToCall}_${Date.now()}`;
      try { await mediasoupRooms.getOrCreateRoom(roomId); } catch (e) { console.error('[call_user] mediasoup error', e); }

      global.activeCalls[data.from] = { peer: data.userToCall, roomId, startTime: Date.now() };
      global.activeCalls[data.userToCall] = { peer: data.from, roomId, startTime: Date.now() };

      const callerUser = db.users[data.from];
      pendingCalls[data.userToCall] = {
        from: data.from,
        fromName: callerUser?.name || data.from,
        fromAvatar: callerUser?.avatar || undefined,
        signal: data.signalData,
        isVideo: data.isVideo,
        roomId,
        createdAt: Date.now(),
      };

      io.to(`user_${data.userToCall}`).emit('incoming_call', {
        signal: data.signalData, from: data.from,
        fromName: callerUser?.name || data.from,
        fromAvatar: callerUser?.avatar || undefined,
        isVideo: data.isVideo, roomId,
      });

      sendPushNotification(data.userToCall, {
        type: 'call', from: data.from,
        fromName: callerUser?.name || data.from,
        isVideo: data.isVideo, roomId,
      });
    });

    socket.on('answer_call', (data) => {
      const receiver = socket._registeredAs;
      if (receiver && pendingCalls[receiver]) delete pendingCalls[receiver];
      io.to(`user_${data.to}`).emit('call_accepted', { signal: data.signal, roomId: data.roomId, from: receiver });
    });

    socket.on('reject_call', ({ caller, receiver }) => {
      const pending = pendingCalls[receiver];
      const isVideo = pending ? pending.isVideo : false;
      if (receiver) delete pendingCalls[receiver];
      saveCallLog({ caller, receiver: receiver || 'unknown', status: 'rejected', duration: '00:00', isVideo }, io);
      io.to(`user_${caller}`).emit('call_rejected');
    });

    socket.on('ice_candidate', (data) => {
      io.to(`user_${data.to}`).emit('ice_candidate', data.candidate);
    });

    socket.on('end_call', (data) => {
      const isConfRoom = data.roomId?.startsWith('conf_');
      if (data.roomId && !isConfRoom) mediasoupRooms.closeRoom(data.roomId);

      const wasActive = !!(global.activeCalls?.[data.from] || global.activeCalls?.[data.to]);
      const wasPending = !!(data.to && pendingCalls[data.to]);
      const callerName = data.from ? (db.users[data.from]?.name || data.from) : '';

      if (data.from) delete global.activeCalls[data.from];
      if (data.to) delete global.activeCalls[data.to];
      if (data.to && pendingCalls[data.to]) delete pendingCalls[data.to];
      if (data.from && pendingCalls[data.from]) delete pendingCalls[data.from];

      io.to(`user_${data.to}`).emit('call_ended');

      if (data.to) {
        sendPushNotification(data.to, { type: 'call_ended' });
        if (wasPending && !wasActive) {
          sendPushNotification(data.to, { type: 'call_missed', from: data.from, fromName: callerName });
        }
      }

      const duration = data.duration || '??:??';
      const isVideo = data.isVideo !== undefined ? data.isVideo : false;
      const status = wasPending && !wasActive ? 'missed' : 'completed';
      if (data.from && data.to) saveCallLog({ caller: data.from, receiver: data.to, status, duration, isVideo }, io);
    });

    // === SFU mediasoup signaling ===
    socket.on('sfu:getRouterRtpCapabilities', async ({ roomId, peerId }, cb) => {
      if (!roomId || !peerId) return cb?.({ error: 'roomId and peerId required' });
      try {
        socket._sfuPeerId = peerId;
        socket._sfuRoomId = roomId;
        mediasoupRooms.registerPeerSocket(roomId, peerId, socket.id);
        const rtpCapabilities = await mediasoupRooms.getRouterRtpCapabilities(roomId);
        cb?.({ rtpCapabilities });
      } catch (e) { cb?.({ error: String(e.message || e) }); }
    });

    socket.on('sfu:createWebRtcTransport', async ({ roomId, peerId, direction }, cb) => {
      if (!roomId || !peerId || !direction) return cb?.({ error: 'roomId, peerId, direction required' });
      try {
        const transport = await mediasoupRooms.createWebRtcTransport(roomId, peerId, direction);
        cb?.(transport);
      } catch (e) { cb?.({ error: String(e.message || e) }); }
    });

    socket.on('sfu:connectWebRtcTransport', async ({ roomId, transportId, dtlsParameters }, cb) => {
      if (!roomId || !transportId || !dtlsParameters) return cb?.({ error: 'missing params' });
      try {
        await mediasoupRooms.connectWebRtcTransport(roomId, transportId, dtlsParameters);
        cb?.({ ok: true });
      } catch (e) { cb?.({ error: String(e.message || e) }); }
    });

    socket.on('sfu:produce', async ({ roomId, transportId, peerId, kind, rtpParameters }, cb) => {
      if (!roomId || !transportId || !peerId || !kind || !rtpParameters) return cb?.({ error: 'missing params' });
      try {
        const result = await mediasoupRooms.produce(roomId, transportId, peerId, kind, rtpParameters);
        const producerId = result?.id;
        if (!producerId) return cb?.({ error: 'Produce failed: no producer id' });
        const others = mediasoupRooms.getOtherPeersInRoom(roomId, peerId);
        others.forEach(otherPeerId => {
          const username = sfuPeerIdToUsername(otherPeerId);
          const sids = userSockets[username];
          if (sids) sids.forEach(sid => io.to(sid).emit('sfu:newProducer', { producerId, peerId, kind }));
        });
        cb?.({ producerId });
      } catch (e) { cb?.({ error: String(e.message || e) }); }
    });

    socket.on('sfu:consume', async ({ roomId, transportId, producerId, rtpCapabilities }, cb) => {
      if (!roomId || !transportId || !producerId || !rtpCapabilities) return cb?.({ error: 'missing params' });
      const peerId = socket._sfuPeerId || socket._registeredAs;
      if (!peerId) return cb?.({ error: 'not registered' });
      try {
        const consumer = await mediasoupRooms.consume(roomId, peerId, transportId, producerId, rtpCapabilities);
        cb?.(consumer);
      } catch (e) { cb?.({ error: String(e.message || e) }); }
    });

    socket.on('sfu:getProducers', ({ roomId, peerId: clientPeerId }, cb) => {
      if (!roomId) return cb?.({ error: 'roomId required' });
      const peerId = clientPeerId || socket._registeredAs;
      if (!peerId) return cb?.({ error: 'not registered' });
      try {
        const list = mediasoupRooms.getProducersInRoom(roomId, peerId);
        cb?.({ producers: list });
      } catch (e) { cb?.({ error: String(e.message || e) }); }
    });

    socket.on('sfu:closeProducer', ({ roomId, producerId }, cb) => {
      if (!roomId || !producerId) return cb?.({ error: 'missing params' });
      try {
        const result = mediasoupRooms.closeProducer(roomId, producerId);
        if (result) {
          const others = mediasoupRooms.getOtherPeersInRoom(roomId, result.peerId);
          others.forEach(otherPeerId => {
            const uname = sfuPeerIdToUsername(otherPeerId);
            const sids = userSockets[uname];
            if (sids) sids.forEach(sid => io.to(sid).emit('sfu:producerClosed', { producerId, kind: result.kind, peerId: result.peerId }));
          });
        }
        cb?.({ ok: true });
      } catch (e) { cb?.({ error: String(e.message || e) }); }
    });

    socket.on('sfu:getProducerStats', async ({ roomId }, cb) => {
      if (!roomId) return cb?.({ error: 'roomId required' });
      try {
        const stats = await mediasoupRooms.getProducerStatsForRoom(roomId);
        cb?.({ stats });
      } catch (e) { cb?.({ error: String(e.message || e) }); }
    });

    // === Edit message ===
    socket.on('edit_message', ({ senderUsername, recipientUsername, messageId, newText }) => {
      if (!senderUsername || !recipientUsername || !messageId || !newText) return;
      const editedAt = Date.now();

      const updateChat = (owner, peer) => {
        const chats = db.chats[owner] || [];
        const chat = chats.find(c => c.username === peer);
        if (!chat?.messages) return;
        const msg = chat.messages.find(m => m.id === messageId);
        if (msg) {
          msg.text = newText;
          msg.editedAt = editedAt;
          if (msg.text === chat.lastMessage || chat.messages[chat.messages.length - 1]?.id === messageId) {
            chat.lastMessage = newText;
          }
        }
        io.to(`user_${owner}`).emit('receive_chats', chats);
      };

      updateChat(senderUsername, recipientUsername);
      updateChat(recipientUsername, senderUsername);
      saveDB();

      io.to(`user_${senderUsername}`).emit('message_edited', { chatUsername: recipientUsername, messageId, newText, editedAt });
      io.to(`user_${recipientUsername}`).emit('message_edited', { chatUsername: senderUsername, messageId, newText, editedAt });
    });

    // === Pin/unpin message ===
    socket.on('pin_message', ({ senderUsername, recipientUsername, messageId, pinned }) => {
      if (!senderUsername || !recipientUsername || !messageId) return;

      const updateChat = (owner, peer) => {
        const chats = db.chats[owner] || [];
        const chat = chats.find(c => c.username === peer);
        if (!chat?.messages) return;
        const msg = chat.messages.find(m => m.id === messageId);
        if (msg) msg.pinned = !!pinned;
        io.to(`user_${owner}`).emit('receive_chats', chats);
      };

      updateChat(senderUsername, recipientUsername);
      updateChat(recipientUsername, senderUsername);
      saveDB();

      io.to(`user_${senderUsername}`).emit('message_pinned', { chatUsername: recipientUsername, messageId, pinned: !!pinned });
      io.to(`user_${recipientUsername}`).emit('message_pinned', { chatUsername: senderUsername, messageId, pinned: !!pinned });
    });

    // === Forward message ===
    socket.on('forward_message', ({ senderUsername, recipientUsername, message, originalSender }) => {
      if (!senderUsername || !recipientUsername || !message) return;
      const sender = db.users[senderUsername];
      if (!sender) return;
      if (sender.banned) { socket.emit('force_logout', { reason: 'Ваш аккаунт заблокирован' }); return; }

      const recipient = db.users[recipientUsername];
      if (sender && recipient && (sender.officeId || null) !== (recipient.officeId || null)) {
        socket.emit('message_error', { error: 'Нельзя пересылать сообщения пользователям из другого офиса' });
        return;
      }

      const nowMs = Date.now();
      const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
      const msgId = nowMs;

      const fwdMsg = {
        id: msgId, text: message.text || '', time: timeStr, timestamp: nowMs,
        type: message.type || 'text', forwarded: true, forwardedFrom: originalSender || '',
        status: 'sent',
      };
      if (message.url) fwdMsg.url = message.url;
      if (message.filename) fwdMsg.filename = message.filename;
      if (message.size != null) fwdMsg.size = message.size;
      if (message.mimeType) fwdMsg.mimeType = message.mimeType;
      if (message.duration != null) fwdMsg.duration = message.duration;

      const ensureChat = (owner, peer) => {
        if (!db.chats[owner]) db.chats[owner] = [];
        let chat = db.chats[owner].find(c => c.username === peer);
        if (!chat) {
          const peerUser = db.users[peer] || {};
          chat = {
            id: `chat_${nowMs}_${Math.random().toString(36).slice(2)}`,
            name: peerUser.name || peer, username: peer,
            avatar: peerUser.avatar || '', time: '', lastMessage: '',
            unread: 0, status: 'offline', messages: [],
          };
          db.chats[owner].push(chat);
        }
        return chat;
      };

      const senderChat = ensureChat(senderUsername, recipientUsername);
      senderChat.messages.push({ ...fwdMsg, sender: 'me' });
      senderChat.lastMessage = fwdMsg.text || (fwdMsg.type === 'image' ? 'Фотография' : 'Файл');
      senderChat.time = timeStr;
      senderChat.timestamp = nowMs;
      db.chats[senderUsername] = [senderChat, ...db.chats[senderUsername].filter(c => c.username !== recipientUsername)];

      const recipientChat = ensureChat(recipientUsername, senderUsername);
      recipientChat.messages.push({ ...fwdMsg, id: msgId + 1, sender: 'them' });
      recipientChat.lastMessage = fwdMsg.text || (fwdMsg.type === 'image' ? 'Фотография' : 'Файл');
      recipientChat.time = timeStr;
      recipientChat.timestamp = nowMs;
      recipientChat.unread = (recipientChat.unread || 0) + 1;
      db.chats[recipientUsername] = [recipientChat, ...db.chats[recipientUsername].filter(c => c.username !== senderUsername)];

      io.to(`user_${senderUsername}`).emit('receive_chats', db.chats[senderUsername]);
      io.to(`user_${recipientUsername}`).emit('receive_chats', db.chats[recipientUsername]);

      const senderName = sender.name || senderUsername;
      sendPushNotification(recipientUsername, {
        type: 'message', title: senderName,
        body: `Пересланное сообщение: ${fwdMsg.text || 'файл'}`,
      });
      saveDB();
    });

    // === Group chats ===
    socket.on('create_group', ({ name, creatorUsername, memberUsernames, avatar }) => {
      const creator = db.users[creatorUsername];
      if (!creator) return;
      if (creator.banned) { socket.emit('force_logout', { reason: 'Ваш аккаунт заблокирован' }); return; }

      const nowMs = Date.now();
      const groupId = `group_${nowMs}`;
      const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

      const validMembers = (memberUsernames || []).filter(u => {
        const target = db.users[u];
        if (!target || target.banned) return false;
        if ((target.officeId || null) !== (creator.officeId || null)) return false;
        return u !== creatorUsername;
      });

      if (!db.groups) db.groups = {};
      const group = {
        id: groupId, name: name || 'Группа', avatar: avatar || null,
        creator: creatorUsername, admins: [creatorUsername],
        members: [creatorUsername, ...validMembers], pending: [],
        messages: [{
          id: nowMs, text: `${creator.name || creatorUsername} создал группу`,
          senderUsername: null, time: timeStr, timestamp: nowMs, type: 'system',
        }],
        createdAt: new Date().toISOString(), pinnedMessages: [],
      };
      db.groups[groupId] = group;
      saveDB();

      for (const u of group.members) {
        io.to(`user_${u}`).emit('group_created', group);
      }
    });

    socket.on('get_groups', ({ username }, cb) => {
      if (!db.groups) db.groups = {};
      const groups = Object.values(db.groups).filter(g => g.members.includes(username));
      cb?.(groups);
    });

    socket.on('send_group_message', ({ groupId, senderUsername, text, attachment, replyTo }) => {
      if (!db.groups) db.groups = {};
      const group = db.groups[groupId];
      if (!group || !group.members.includes(senderUsername)) return;
      const sender = db.users[senderUsername];
      if (!sender) return;
      if (sender.banned) { socket.emit('force_logout', { reason: 'Ваш аккаунт заблокирован' }); return; }

      const nowMs = Date.now();
      const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
      const message = {
        id: nowMs, text: text || '', senderUsername, senderName: sender.name || senderUsername,
        time: timeStr, timestamp: nowMs, type: attachment?.type || 'text',
      };
      if (replyTo) message.replyTo = replyTo;
      if (attachment) {
        if (attachment.url) message.url = attachment.url;
        if (attachment.filename) message.filename = attachment.filename;
        if (attachment.size != null) message.size = attachment.size;
        if (attachment.mimeType) message.mimeType = attachment.mimeType;
        if (attachment.duration != null) message.duration = attachment.duration;
      }
      group.messages.push(message);
      saveDB();
      for (const u of group.members) {
        io.to(`user_${u}`).emit('receive_group_message', { groupId, message });
      }

      const senderName = sender.name || senderUsername;
      for (const u of group.members) {
        if (u !== senderUsername) {
          sendPushNotification(u, { type: 'message', title: `${group.name}: ${senderName}`, body: text || 'Медиа' });
        }
      }
    });

    socket.on('update_group', ({ groupId, username, name, avatar }) => {
      if (!db.groups) return;
      const group = db.groups[groupId];
      if (!group) return;
      if (!group.admins.includes(username) && group.creator !== username) {
        socket.emit('group_error', { error: 'Только админ может изменять группу' }); return;
      }
      if (name) group.name = name;
      if (avatar !== undefined) group.avatar = avatar;
      saveDB();
      for (const u of group.members) io.to(`user_${u}`).emit('group_updated', group);
    });

    socket.on('add_group_member', ({ groupId, adderUsername, targetUsername }) => {
      if (!db.groups) return;
      const group = db.groups[groupId];
      if (!group) return;
      if (!group.admins.includes(adderUsername) && group.creator !== adderUsername) {
        socket.emit('group_error', { error: 'Только админ может добавлять участников' }); return;
      }
      const target = db.users[targetUsername];
      if (!target) { socket.emit('group_error', { error: 'Пользователь не найден' }); return; }
      if (group.members.includes(targetUsername)) { socket.emit('group_error', { error: 'Пользователь уже в группе' }); return; }
      group.members.push(targetUsername);
      const nowMs = Date.now();
      const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      group.messages.push({ id: nowMs, text: `${target.name || targetUsername} добавлен в группу`, senderUsername: null, time: timeStr, timestamp: nowMs, type: 'system' });
      saveDB();
      for (const u of group.members) io.to(`user_${u}`).emit('group_updated', group);
    });

    socket.on('remove_group_member', ({ groupId, removerUsername, targetUsername }) => {
      if (!db.groups) return;
      const group = db.groups[groupId];
      if (!group) return;
      if (!group.admins.includes(removerUsername) && group.creator !== removerUsername) {
        socket.emit('group_error', { error: 'Только админ может удалять участников' }); return;
      }
      if (targetUsername === group.creator) { socket.emit('group_error', { error: 'Нельзя удалить создателя' }); return; }
      group.members = group.members.filter(u => u !== targetUsername);
      group.admins = group.admins.filter(u => u !== targetUsername);
      const nowMs = Date.now();
      const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const target = db.users[targetUsername];
      group.messages.push({ id: nowMs, text: `${target?.name || targetUsername} удалён из группы`, senderUsername: null, time: timeStr, timestamp: nowMs, type: 'system' });
      saveDB();
      io.to(`user_${targetUsername}`).emit('group_removed', { groupId });
      for (const u of group.members) io.to(`user_${u}`).emit('group_updated', group);
    });

    socket.on('set_group_admin', ({ groupId, setterUsername, targetUsername, isAdmin }) => {
      if (!db.groups) return;
      const group = db.groups[groupId];
      if (!group) return;
      if (group.creator !== setterUsername) { socket.emit('group_error', { error: 'Только создатель может назначать админов' }); return; }
      if (!group.members.includes(targetUsername)) return;
      if (isAdmin && !group.admins.includes(targetUsername)) group.admins.push(targetUsername);
      if (!isAdmin) group.admins = group.admins.filter(u => u !== targetUsername);
      saveDB();
      for (const u of group.members) io.to(`user_${u}`).emit('group_updated', group);
    });

    socket.on('leave_group', ({ groupId, username }) => {
      if (!db.groups) return;
      const group = db.groups[groupId];
      if (!group || !group.members.includes(username)) return;
      group.members = group.members.filter(u => u !== username);
      group.admins = group.admins.filter(u => u !== username);
      const nowMs = Date.now();
      const timeStr = new Date(nowMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const user = db.users[username];
      group.messages.push({ id: nowMs, text: `${user?.name || username} покинул группу`, senderUsername: null, time: timeStr, timestamp: nowMs, type: 'system' });
      if (group.members.length === 0) { delete db.groups[groupId]; }
      else {
        if (group.creator === username && group.members.length > 0) {
          group.creator = group.members[0];
          if (!group.admins.includes(group.members[0])) group.admins.push(group.members[0]);
        }
      }
      saveDB();
      io.to(`user_${username}`).emit('group_removed', { groupId });
      for (const u of (group.members || [])) io.to(`user_${u}`).emit('group_updated', group);
    });

    // === Renegotiation & misc ===
    socket.on('renegotiate', (data) => {
      io.to(`user_${data.to}`).emit('renegotiate_offer', { signalData: data.signalData, from: data.from });
    });

    socket.on('get_pending_signal', ({ from, to }, callback) => {
      const pending = pendingCalls[to];
      if (pending && pending.from === from) callback({ signal: pending.signal, roomId: pending.roomId });
      else callback(null);
    });

    // === Screen share ===
    socket.on('screen:join', ({ roomId }) => { if (roomId) socket.join(`screen_${roomId}`); });
    socket.on('screen:start', ({ roomId, peerId }) => {
      if (!roomId) return;
      socket._screenShareRoom = roomId;
      socket._screenSharePeerId = peerId || socket._sfuPeerId || '';
      socket.join(`screen_${roomId}`);
      socket.to(`screen_${roomId}`).emit('screen:started', { peerId: socket._screenSharePeerId });
    });
    socket.on('screen:frame', ({ roomId, frame }) => {
      if (!roomId || !frame) return;
      socket.to(`screen_${roomId}`).volatile.emit('screen:frame', { peerId: socket._screenSharePeerId || '', frame });
    });
    socket.on('screen:stop', ({ roomId }) => {
      if (!roomId) return;
      socket.to(`screen_${roomId}`).emit('screen:stopped', { peerId: socket._screenSharePeerId || '' });
      socket.leave(`screen_${roomId}`);
      socket._screenShareRoom = null;
    });

  });
}
