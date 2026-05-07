import express from 'express';
import net from 'net';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { SERVICE_AVATARS, VAPID_PUBLIC_KEY, APP_MIN_ANDROID_VERSION_CODE, APP_LATEST_ANDROID_VERSION_NAME, DIR } from '../config.js';
import { db, saveDB, sanitizeUser, sanitizeUsers, generateChatId, serverSettings } from '../db.js';
import { requireManager } from '../middleware.js';
import { sendPushNotification } from '../services/push.js';
import { saveCallLog } from '../services/callLog.js';
import { adminTokens } from './admin.js';

const router = express.Router();

// VPN config proxy
let _vpnConfigCache = { data: null, ts: 0 };
router.get('/vpn-config', async (req, res) => {
  try {
    const now = Date.now();
    if (_vpnConfigCache.data && (now - _vpnConfigCache.ts) < 60000) {
      return res.json(_vpnConfigCache.data);
    }
    const r = await fetch('https://messenger-config.shaarkis1488.workers.dev/config', { method: 'GET' });
    const data = await r.json();
    _vpnConfigCache = { data, ts: now };
    res.json(data);
  } catch (e) {
    console.error('[vpn-config] fetch failed:', e.message);
    if (_vpnConfigCache.data) return res.json(_vpnConfigCache.data);
    res.status(503).json({ error: 'config unavailable', vpnKeys: [], vpnEnabled: false });
  }
});

// App version
router.get('/api/app-version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    android: {
      minVersionCode: APP_MIN_ANDROID_VERSION_CODE,
      latestVersionName: APP_LATEST_ANDROID_VERSION_NAME,
      apkUrl: '/download/gossvyaz-plus.apk',
      downloadPage: '/download/',
    },
  });
});

// Config
router.get('/api/config', (req, res) => {
  const base = process.env.PUBLIC_HTTPS_URL || process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const payload = { serverUrl: base.replace(/\/$/, '') };
  if (process.env.TURN_HOST && process.env.TURN_USER && process.env.TURN_PASS) {
    payload.turnHost = process.env.TURN_HOST;
    payload.turnUser = process.env.TURN_USER;
    payload.turnPass = process.env.TURN_PASS;
  }
  if (process.env.TURN2_HOST && process.env.TURN2_USER && process.env.TURN2_PASS) {
    payload.turn2Host = process.env.TURN2_HOST;
    payload.turn2User = process.env.TURN2_USER;
    payload.turn2Pass = process.env.TURN2_PASS;
  }
  res.json(payload);
});

// TURN check
function checkPort(port) {
  return new Promise((resolve) => {
    const s = net.createConnection(port, '127.0.0.1', () => { s.destroy(); resolve(true); });
    s.setTimeout(2000, () => { s.destroy(); resolve(false); });
    s.on('error', () => resolve(false));
  });
}

router.get('/api/turn-check', async (req, res) => {
  const [port3478, port443] = await Promise.all([checkPort(3478), checkPort(443)]);
  res.json({ port3478, port443 });
});

// Limits
router.get('/api/limits', (req, res) => {
  res.json({
    maxFileSizeMb: serverSettings.maxFileSizeMb || 50,
    maxMessageLength: serverSettings.maxMessageLength || 5000,
    maxUploadKbps: serverSettings.maxUploadKbps || 0,
    maxDownloadKbps: serverSettings.maxDownloadKbps || 0,
  });
});

// Push subscriptions
router.post('/api/push/fcm-token', (req, res) => {
  const { username, token } = req.body;
  if (!username || !token) return res.status(400).json({ error: 'Missing username or token' });
  db.fcmTokens[username] = token;
  saveDB();
  res.status(200).json({ success: true });
});

router.post('/api/push/fcm-token/clear', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Missing username' });
  if (db.fcmTokens[username]) {
    delete db.fcmTokens[username];
    saveDB();
  }
  res.status(200).json({ success: true });
});

router.post('/api/push/subscribe', (req, res) => {
  const { username, subscription } = req.body;
  if (!username || !subscription) return res.status(400).json({ error: 'Missing username or subscription' });

  if (!db.pushSubscriptions[username]) {
    db.pushSubscriptions[username] = [];
  }

  const existingIndex = db.pushSubscriptions[username].findIndex(sub => sub.endpoint === subscription.endpoint);
  if (existingIndex > -1) {
    db.pushSubscriptions[username][existingIndex] = subscription;
  } else {
    db.pushSubscriptions[username].push(subscription);
  }

  saveDB();
  res.status(201).json({ success: true });
});

router.get('/api/push/public-key', (req, res) => {
  res.send(VAPID_PUBLIC_KEY);
});

// Call reject via HTTP
router.post('/api/call/reject', (req, res) => {
  const { caller, receiver } = req.body;
  if (!caller || !receiver) return res.status(400).json({ error: 'Missing caller or receiver' });

  if (caller) delete global.activeCalls[caller];
  if (receiver) delete global.activeCalls[receiver];
  const pending = global.pendingCalls?.[receiver] || Object.values(global.pendingCalls || {}).find(p => p.from === caller);
  const isVideo = pending ? pending.isVideo : false;
  if (receiver && global.pendingCalls) delete global.pendingCalls[receiver];

  saveCallLog({ caller, receiver, status: 'rejected', duration: '00:00', isVideo }, req.io);

  req.io.to(`user_${caller}`).emit('call_rejected');
  sendPushNotification(caller, { type: 'call_busy', from: receiver });

  res.json({ success: true });
});

// Manager routes
router.get('/api/manager/clients', requireManager, (req, res) => {
  const managerUsername = req.managerUsername;
  const clients = Object.values(db.users)
    .filter(u => u.role === 'client' && u.createdBy === managerUsername)
    .map(u => sanitizeUser(u));
  res.json(clients);
});

router.post('/api/manager/clients', requireManager, async (req, res) => {
  const { username, password, name } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: 'Логин, имя и пароль обязательны' });
  if (username.length < 3) return res.status(400).json({ error: 'Логин минимум 3 символа' });
  if (password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });
  if (db.users[username]) return res.status(400).json({ error: 'Этот логин уже занят' });

  const officeId = req.managerUser?.officeId || null;
  const hashedPassword = await bcrypt.hash(password, 10);
  const displayName = name.trim() || username;
  const newUser = {
    id: Date.now(),
    chatId: generateChatId(),
    username,
    password: hashedPassword,
    name: displayName,
    avatar: displayName.charAt(0).toUpperCase(),
    bio: '',
    role: 'client',
    officeId,
    createdBy: req.managerUsername,
    lastActive: Date.now(),
  };
  db.users[username] = newUser;
  db.chats[username] = [];
  saveDB();
  req.io.emit('users_updated', sanitizeUsers(db.users));
  res.json(sanitizeUser(newUser));
});

router.put('/api/manager/clients/:username/password', requireManager, async (req, res) => {
  const { username } = req.params;
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });
  const user = db.users[username];
  if (!user) return res.status(404).json({ error: 'Клиент не найден' });
  if (user.role !== 'client') return res.status(403).json({ error: 'Можно менять пароль только клиентам' });
  const officeId = req.managerUser?.officeId || null;
  if ((user.officeId || null) !== officeId) return res.status(403).json({ error: 'Клиент не в вашем офисе' });
  user.password = await bcrypt.hash(password, 10);
  saveDB();
  res.json({ success: true });
});

router.delete('/api/manager/clients/:username', requireManager, (req, res) => {
  const { username } = req.params;
  const user = db.users[username];
  if (!user) return res.status(404).json({ error: 'Клиент не найден' });
  if (user.role !== 'client') return res.status(403).json({ error: 'Можно удалять только клиентов' });
  const officeId = req.managerUser?.officeId || null;
  if ((user.officeId || null) !== officeId) return res.status(403).json({ error: 'Клиент не в вашем офисе' });
  req.io.to(`user_${username}`).emit('force_logout', { reason: 'Ваш аккаунт удалён' });
  delete db.users[username];
  delete db.chats[username];
  saveDB();
  req.io.emit('users_updated', sanitizeUsers(db.users));
  res.json({ success: true });
});

// User lookup
router.get('/api/users/by-chat-id/:chatId', (req, res) => {
  const { chatId } = req.params;
  const fromUsername = req.query.from;
  const user = Object.values(db.users).find(u => u.chatId === chatId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (fromUsername && db.users[fromUsername]) {
    const caller = db.users[fromUsername];
    if ((caller.officeId || null) !== (user.officeId || null)) {
      return res.status(403).json({ error: 'Не ваш клиент' });
    }
  }
  const { password, ...safe } = user;
  res.json(safe);
});

router.get('/api/users/by-service/:service', (req, res) => {
  const { service } = req.params;
  if (service !== 'sberbank' && service !== 'gosuslugi') {
    return res.status(400).json({ error: 'Неизвестный сервис' });
  }
  const fromUsername = req.query.from;
  if (!fromUsername || !db.users[fromUsername]) {
    return res.status(400).json({ error: 'Не указан пользователь' });
  }
  const caller = db.users[fromUsername];
  const serviceUser = Object.values(db.users).find(
    u => u.role === service && (u.officeId || null) === (caller.officeId || null)
  );
  if (!serviceUser) {
    const label = service === 'sberbank' ? 'Сбербанк' : 'Госуслуги';
    return res.status(404).json({ error: `Аккаунт ${label} не найден в вашем офисе` });
  }
  const { password, ...safe } = serviceUser;
  res.json(safe);
});

// Users CRUD
router.get('/api/users', (req, res) => {
  const token = req.headers['x-admin-token'];
  const info = adminTokens.get(token);
  if (info && info.role === 'office_admin') {
    const filtered = {};
    for (const [k, u] of Object.entries(db.users)) {
      if ((u.officeId || null) === info.officeId) filtered[k] = sanitizeUser(u);
    }
    return res.json(filtered);
  }
  res.json(sanitizeUsers(db.users));
});

router.put('/api/users/:username', (req, res) => {
  const { username } = req.params;
  if (!db.users[username]) return res.status(404).json({ error: 'User not found' });

  const update = { ...req.body };
  if (SERVICE_AVATARS[db.users[username].role]) delete update.avatar;
  const safeUpdate = { ...update };
  delete safeUpdate.password;
  db.users[username] = { ...db.users[username], ...safeUpdate };
  saveDB();
  req.io.emit('users_updated', sanitizeUsers(db.users));
  res.json(sanitizeUser(db.users[username]));
});

router.delete('/api/users/:username', (req, res) => {
  const { username } = req.params;
  if (!db.users[username]) return res.status(404).json({ error: 'User not found' });

  delete db.users[username];
  delete db.chats[username];
  saveDB();
  req.io.to(`user_${username}`).emit('force_logout', { reason: 'Ваш аккаунт удалён' });
  req.io.emit('users_updated', sanitizeUsers(db.users));
  res.json({ success: true });
});

// Invites
router.get('/api/invites', (req, res) => {
  const token = req.headers['x-admin-token'];
  const info = adminTokens.get(token);
  if (info && info.role === 'office_admin') {
    return res.json(db.invites.filter(i => i.officeId === info.officeId));
  }
  res.json(db.invites);
});

router.post('/api/invites', (req, res) => {
  const { count, customKey, officeId } = req.body;
  const token = req.headers['x-admin-token'];
  const info = adminTokens.get(token);
  const targetOffice = (info && info.role === 'office_admin') ? info.officeId : (officeId || null);

  if (customKey) {
    const exists = db.invites.some(i => (typeof i === 'string' ? i : i.key) === customKey);
    if (exists) return res.status(400).json({ error: 'Invite key already exists' });
    db.invites.push({ key: customKey, officeId: targetOffice });
  } else {
    const num = count || 1;
    for (let i = 0; i < num; i++) {
      db.invites.push({ key: Math.random().toString(36).substring(2, 10).toUpperCase(), officeId: targetOffice });
    }
  }
  saveDB();
  req.io.emit('invites_updated', db.invites);
  if (info && info.role === 'office_admin') {
    return res.json(db.invites.filter(i => i.officeId === info.officeId));
  }
  res.json(db.invites);
});

router.delete('/api/invites/:key', (req, res) => {
  const { key } = req.params;
  const idx = db.invites.findIndex(i => (typeof i === 'string' ? i : i.key) === key);
  if (idx > -1) {
    db.invites.splice(idx, 1);
    saveDB();
    req.io.emit('invites_updated', db.invites);
  }
  res.json({ success: true });
});

// Chats
router.get('/api/chats/:username', (req, res) => {
  const { username } = req.params;
  res.json(db.chats[username] || []);
});

router.post('/api/chats/:username', (req, res) => {
  const { username } = req.params;
  db.chats[username] = req.body;
  saveDB();
  res.json({ success: true });
});

// File uploads
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(DIR, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

function buildUploader() {
  const mb = Number(serverSettings.maxFileSizeMb) || 50;
  return multer({ storage: uploadStorage, limits: { fileSize: mb * 1024 * 1024 } });
}

router.post('/api/upload', (req, res, next) => {
  const uploader = buildUploader().single('file');
  uploader(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `Файл превышает лимит ${serverSettings.maxFileSizeMb}MB` });
      }
      return res.status(400).json({ error: err.message || 'Upload error' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, filename: req.file.originalname, size: req.file.size });
  });
});

// Conferences
router.get('/api/conferences/:username', (req, res) => {
  const { username } = req.params;
  const result = Object.values(db.conferences).filter(
    c => (c.participants || []).includes(username) || (c.pending || []).includes(username)
  );
  res.json(result);
});

export default router;
