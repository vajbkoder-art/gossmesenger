import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import os from 'os';
import { ADMIN_LOGIN, ADMIN_PASSWORD, SERVICE_AVATARS } from '../config.js';
import { db, saveDB, sanitizeUser, sanitizeUsers, generateChatId, getUsersForOffice, getUsernamesForOffice, logActivity, getActivityLog, serverSettings, updateServerSettings, generateToken } from '../db.js';
import { requireAdmin, requireSuperAdmin, getRequestIp } from '../middleware.js';

const router = express.Router();

// In-memory admin tokens
const adminTokens = new Map();

function getSuperAdminHash() {
  if (!db._superAdminHash || db._superAdminHashSrc !== ADMIN_PASSWORD) {
    db._superAdminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    db._superAdminHashSrc = ADMIN_PASSWORD;
  }
  return db._superAdminHash;
}

// Attach admin info from token to req.admin
function resolveAdminToken(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token) {
    const info = adminTokens.get(token);
    if (info) req.admin = info;
  }
  next();
}

router.use(resolveAdminToken);

// Login
router.post('/login', async (req, res) => {
  const { login, password } = req.body;

  if (login === ADMIN_LOGIN && await bcrypt.compare(password, getSuperAdminHash())) {
    const token = generateToken();
    adminTokens.set(token, { role: 'superadmin', officeId: null, login });
    logActivity('admin_login', { login, role: 'superadmin', ip: getRequestIp(req) });
    return res.json({ token, role: 'superadmin', officeId: null });
  }

  for (const office of Object.values(db.offices)) {
    if (office.login === login && await bcrypt.compare(password, office.password)) {
      if (office.suspended) return res.status(403).json({ error: 'Офис приостановлен' });
      const token = generateToken();
      adminTokens.set(token, { role: 'office_admin', officeId: office.id, officeName: office.name, login });
      logActivity('admin_login', { login, role: 'office_admin', officeId: office.id, ip: getRequestIp(req) });
      return res.json({ token, role: 'office_admin', officeId: office.id, officeName: office.name });
    }
  }

  res.status(401).json({ error: 'Неверный логин или пароль' });
});

router.post('/logout', requireAdmin, (req, res) => {
  adminTokens.delete(req.headers['x-admin-token']);
  res.json({ success: true });
});

// Offices CRUD (superadmin only)
router.get('/offices', requireSuperAdmin, (req, res) => {
  const offices = Object.values(db.offices).map(o => ({
    ...o,
    userCount: getUsersForOffice(o.id).length,
    inviteCount: db.invites.filter(i => i.officeId === o.id).length,
  }));
  res.json(offices);
});

router.post('/offices', requireSuperAdmin, async (req, res) => {
  const { name, login, password } = req.body;
  if (!name || !login || !password) return res.status(400).json({ error: 'name, login, password обязательны' });
  const existing = Object.values(db.offices).find(o => o.login === login);
  if (existing) return res.status(400).json({ error: 'Логин уже занят' });
  if (login === ADMIN_LOGIN) return res.status(400).json({ error: 'Логин совпадает с главным админом' });

  const id = `office_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const hashed = await bcrypt.hash(password, 10);
  db.offices[id] = { id, name, login, password: hashed, suspended: false, createdAt: Date.now() };
  saveDB();
  logActivity('create_office', { id, name, login });
  res.json(db.offices[id]);
});

router.put('/offices/:id', requireSuperAdmin, async (req, res) => {
  const office = db.offices[req.params.id];
  if (!office) return res.status(404).json({ error: 'Office not found' });
  const wasSuspended = office.suspended;
  const allowed = ['name', 'password', 'suspended'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      office[key] = key === 'password' ? await bcrypt.hash(req.body[key], 10) : req.body[key];
    }
  }
  saveDB();
  logActivity('update_office', { id: office.id, fields: Object.keys(req.body) });
  if (!wasSuspended && office.suspended) {
    const officeUsers = getUsernamesForOffice(office.id);
    for (const uname of officeUsers) {
      req.io.to(`user_${uname}`).emit('force_logout', { reason: 'Ваш офис приостановлен' });
    }
  }
  res.json(office);
});

router.delete('/offices/:id', requireSuperAdmin, (req, res) => {
  const office = db.offices[req.params.id];
  if (!office) return res.status(404).json({ error: 'Office not found' });
  delete db.offices[req.params.id];
  for (const u of Object.values(db.users)) {
    if (u.officeId === req.params.id) u.officeId = null;
  }
  db.invites = db.invites.filter(i => i.officeId !== req.params.id);
  saveDB();
  logActivity('delete_office', { id: req.params.id, name: office.name });
  res.json({ success: true });
});

// Office password reset
router.post('/offices/:id/reset-password', requireSuperAdmin, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 4) return res.status(400).json({ error: 'Минимум 4 символа' });
  const office = db.offices[req.params.id];
  if (!office) return res.status(404).json({ error: 'Office not found' });
  office.password = await bcrypt.hash(newPassword, 10);
  saveDB();
  logActivity('reset_office_password', { officeId: office.id });
  res.json({ success: true });
});

// Stats
router.get('/stats', requireAdmin, (req, res) => {
  const officeId = req.admin?.role === 'office_admin' ? req.admin.officeId : (req.query.officeId || null);
  const filterByOffice = req.admin?.role === 'office_admin' || req.query.officeId;

  const allUsers = Object.values(db.users);
  const users = filterByOffice ? allUsers.filter(u => (u.officeId || null) === officeId) : allUsers;
  const usernames = new Set(users.map(u => u.username));

  const now = Date.now();
  const onlineThreshold = 2 * 60 * 1000;
  const onlineCount = users.filter(u => (now - (u.lastActive || 0)) < onlineThreshold).length;

  let totalMessages = 0, totalChats = 0, totalCalls = 0;
  for (const [username, userChats] of Object.entries(db.chats)) {
    if (filterByOffice && !usernames.has(username)) continue;
    if (!Array.isArray(userChats)) continue;
    totalChats += userChats.length;
    for (const chat of userChats) {
      totalMessages += (chat.messages?.length || 0);
      for (const msg of (chat.messages || [])) {
        if (msg.type === 'system' && msg.text?.match(/\u{1F4DE}|\u{1F4F9}/u)) totalCalls++;
      }
    }
  }

  const invites = filterByOffice ? db.invites.filter(i => i.officeId === officeId) : db.invites;

  const result = {
    totalUsers: users.length,
    onlineUsers: onlineCount,
    totalMessages: Math.floor(totalMessages / 2),
    totalChats: Math.floor(totalChats / 2),
    totalCalls: Math.floor(totalCalls / 2),
    totalInvites: invites.length,
  };

  if (req.admin?.role === 'superadmin') {
    result.totalOffices = Object.keys(db.offices).length;
  }

  res.json(result);
});

// Activity log
router.get('/logs', requireAdmin, (req, res) => {
  res.json(getActivityLog());
});

// Chats overview
router.get('/chats', requireAdmin, (req, res) => {
  const usernames = req.admin?.role === 'office_admin'
    ? new Set(getUsernamesForOffice(req.admin.officeId))
    : null;

  const result = [];
  for (const [username, chats] of Object.entries(db.chats)) {
    if (usernames && !usernames.has(username)) continue;
    if (!Array.isArray(chats)) continue;
    for (const chat of chats) {
      result.push({
        owner: username,
        peer: chat.username,
        name: chat.name,
        lastMessage: chat.lastMessage,
        time: chat.time,
        messageCount: chat.messages?.length || 0,
      });
    }
  }
  res.json(result);
});

router.get('/chats/:owner/:peer', requireAdmin, (req, res) => {
  const { owner, peer } = req.params;
  if (req.admin?.role === 'office_admin') {
    const u = db.users[owner];
    if (!u || (u.officeId || null) !== req.admin.officeId) return res.status(403).json({ error: 'Forbidden' });
  }
  const userChats = db.chats[owner];
  if (!Array.isArray(userChats)) return res.json([]);
  const chat = userChats.find(c => c.username === peer);
  res.json(chat?.messages || []);
});

router.delete('/chats/:owner/:peer/:msgId', requireAdmin, (req, res) => {
  const { owner, peer, msgId } = req.params;
  if (req.admin?.role === 'office_admin') {
    const u = db.users[owner];
    if (!u || (u.officeId || null) !== req.admin.officeId) return res.status(403).json({ error: 'Forbidden' });
  }
  const userChats = db.chats[owner];
  if (!Array.isArray(userChats)) return res.status(404).json({ error: 'Not found' });
  const chat = userChats.find(c => c.username === peer);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  chat.messages = (chat.messages || []).filter(m => String(m.id) !== String(msgId));
  saveDB();
  logActivity('delete_message', { owner, peer, msgId });
  req.io.to(`user_${owner}`).emit('receive_chats', db.chats[owner]);
  res.json({ success: true });
});

// Create user
router.post('/users', requireAdmin, async (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: 'username, password, name обязательны' });
  if (db.users[username]) return res.status(400).json({ error: 'Юзернейм уже занят' });
  const validRoles = ['client', 'manager_closing', 'manager_fsb', 'sberbank', 'gosuslugi'];
  if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Недопустимая роль' });

  const officeId = req.admin?.role === 'office_admin' ? req.admin.officeId : (req.body.officeId || null);
  const userRole = role || 'client';

  if ((userRole === 'sberbank' || userRole === 'gosuslugi') && officeId) {
    const exists = Object.values(db.users).some(u => u.role === userRole && u.officeId === officeId);
    if (exists) {
      const label = userRole === 'sberbank' ? 'Сбербанк' : 'Госуслуги';
      return res.status(400).json({ error: `В этом офисе уже есть аккаунт ${label}` });
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const avatar = SERVICE_AVATARS[userRole] || name.charAt(0).toUpperCase();
  const newUser = {
    id: Date.now(),
    chatId: generateChatId(),
    username,
    password: hashedPassword,
    name,
    avatar,
    bio: '',
    role: userRole,
    officeId,
    lastActive: Date.now(),
  };
  db.users[username] = newUser;
  db.chats[username] = [];
  saveDB();
  logActivity('create_user', { username, role: newUser.role, chatId: newUser.chatId, officeId });
  req.io.emit('users_updated', sanitizeUsers(db.users));
  res.json(sanitizeUser(newUser));
});

// Update user
router.put('/users/:username', requireAdmin, async (req, res) => {
  const { username } = req.params;
  if (!db.users[username]) return res.status(404).json({ error: 'User not found' });
  if (req.admin?.role === 'office_admin') {
    if ((db.users[username].officeId || null) !== req.admin.officeId) return res.status(403).json({ error: 'Forbidden' });
  }
  const allowed = ['name', 'password', 'role', 'bio', 'banned'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      db.users[username][key] = key === 'password' ? await bcrypt.hash(req.body[key], 10) : req.body[key];
    }
  }
  const newRole = req.body.role;
  if (newRole && SERVICE_AVATARS[newRole]) {
    db.users[username].avatar = SERVICE_AVATARS[newRole];
  } else if (newRole && Object.values(SERVICE_AVATARS).includes(db.users[username].avatar)) {
    db.users[username].avatar = (db.users[username].name || 'U').charAt(0).toUpperCase();
  }
  saveDB();
  logActivity('update_user', { username, fields: Object.keys(req.body) });
  if (req.body.banned === true) {
    req.io.to(`user_${username}`).emit('force_logout', { reason: 'Ваш аккаунт заблокирован' });
  }
  req.io.emit('users_updated', sanitizeUsers(db.users));
  res.json(sanitizeUser(db.users[username]));
});

// Settings
router.get('/settings', requireSuperAdmin, (req, res) => {
  res.json(serverSettings);
});

function parseSizeToMb(v) {
  if (typeof v === 'number') return v;
  const m = String(v || '').toLowerCase().match(/^([\d.]+)\s*(mb|gb|kb|m|g|k)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = (m[2] || 'mb');
  if (u.startsWith('g')) return Math.round(n * 1024);
  if (u.startsWith('k')) return Math.max(1, Math.round(n / 1024));
  return Math.round(n);
}

router.put('/settings', requireSuperAdmin, (req, res) => {
  const body = req.body || {};
  if (body.maxFileSize !== undefined) {
    const mb = parseSizeToMb(body.maxFileSize);
    if (mb !== null) {
      body.maxFileSizeMb = mb;
      body.maxFileSize = `${mb}mb`;
    }
  }
  if (body.maxFileSizeMb !== undefined && body.maxFileSize === undefined) {
    body.maxFileSize = `${Math.max(1, Math.round(body.maxFileSizeMb))}mb`;
  }
  updateServerSettings(body);
  logActivity('update_settings', body);
  res.json(serverSettings);
});

// Change password
router.post('/change-password', requireAdmin, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'oldPassword и newPassword обязательны' });
  if (String(newPassword).length < 4) return res.status(400).json({ error: 'Минимум 4 символа' });

  if (req.admin?.role === 'superadmin') {
    const ok = await bcrypt.compare(oldPassword, getSuperAdminHash());
    if (!ok) return res.status(403).json({ error: 'Старый пароль неверный' });
    db.superAdminPasswordHash = await bcrypt.hash(newPassword, 10);
    saveDB();
    logActivity('change_password', { role: 'superadmin' });
    return res.json({ success: true });
  }

  const office = db.offices[req.admin?.officeId];
  if (!office) return res.status(404).json({ error: 'Office not found' });
  const ok = await bcrypt.compare(oldPassword, office.password);
  if (!ok) return res.status(403).json({ error: 'Старый пароль неверный' });
  office.password = await bcrypt.hash(newPassword, 10);
  saveDB();
  logActivity('change_password', { role: 'office_admin', officeId: office.id });
  res.json({ success: true });
});

// Billing
router.get('/billing', requireSuperAdmin, (req, res) => {
  const offices = Object.values(db.offices || {});
  const users = Object.values(db.users || {});
  const conferences = db.conferences ? Object.keys(db.conferences).length : 0;
  res.json({
    offices: offices.length,
    activeOffices: offices.filter(o => !o.suspended).length,
    suspendedOffices: offices.filter(o => o.suspended).length,
    users: users.length,
    bannedUsers: users.filter(u => u.banned).length,
    conferences,
    invitesTotal: (db.invites || []).length,
    perOffice: offices.map(o => ({
      id: o.id,
      name: o.name,
      suspended: !!o.suspended,
      users: getUsersForOffice(o.id).length,
      invites: (db.invites || []).filter(i => i.officeId === o.id).length,
    })),
  });
});

// System load
router.get('/system-load', requireSuperAdmin, (req, res) => {
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const load = os.loadavg();
  const cpuCount = os.cpus().length;
  const proc = process.memoryUsage();
  let sockets = 0;
  try { if (req.io?.sockets) sockets = req.io.sockets.sockets.size; } catch (_) {}
  res.json({
    uptimeSec: Math.round(process.uptime()),
    serverUptimeSec: Math.round(os.uptime()),
    cpuCount,
    loadAvg: { '1m': load[0], '5m': load[1], '15m': load[2] },
    loadPct: Math.min(100, Math.round((load[0] / cpuCount) * 100)),
    memory: {
      totalMb: Math.round(memTotal / 1024 / 1024),
      freeMb: Math.round(memFree / 1024 / 1024),
      usedMb: Math.round((memTotal - memFree) / 1024 / 1024),
      usedPct: Math.round(((memTotal - memFree) / memTotal) * 100),
    },
    process: {
      rssMb: Math.round(proc.rss / 1024 / 1024),
      heapUsedMb: Math.round(proc.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(proc.heapTotal / 1024 / 1024),
    },
    socketsConnected: sockets,
    adminTokens: adminTokens.size,
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.release()}`,
  });
});

// User IPs
router.get('/user-ips', requireSuperAdmin, (req, res) => {
  const list = [];
  for (const username of Object.keys(global.userIPs || {})) {
    const info = global.userIPs[username];
    const u = db.users[username];
    list.push({
      username,
      name: u?.name || username,
      chatId: u?.chatId || null,
      role: u?.role || null,
      officeId: u?.officeId || null,
      officeName: u?.officeId ? (db.offices[u.officeId]?.name || null) : null,
      ip: info.ip,
      lastSeen: info.at,
      online: !!(global.userSockets?.[username]?.size > 0),
    });
  }
  list.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  res.json(list);
});

export { adminTokens };
export default router;
