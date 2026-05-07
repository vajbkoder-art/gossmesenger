import express from 'express';
import bcrypt from 'bcryptjs';
import { ADMIN_LOGIN, ADMIN_PASSWORD } from '../config.js';
import { db, saveDB, sanitizeUser, sanitizeUsers, generateChatId } from '../db.js';
import { getRequestIp, recordUserIp } from '../middleware.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.users[username];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Неверные данные. Зарегистрируйтесь.' });
  }
  if (user.banned) {
    return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
  }
  if (user.officeId && db.offices[user.officeId]?.suspended) {
    return res.status(403).json({ error: 'Ваш офис приостановлен' });
  }
  user.lastActive = Date.now();
  recordUserIp(username, getRequestIp(req));
  saveDB();
  res.json(sanitizeUser(user));
  req.io.emit('users_updated', sanitizeUsers(db.users));
});

router.post('/register', async (req, res) => {
  const { username, password, name, inviteKey } = req.body;

  if (db.users[username]) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  let officeId = null;
  const cleanKey = inviteKey?.trim()?.toUpperCase();
  const invIdx = db.invites.findIndex(i => (typeof i === 'string' ? i : i.key) === cleanKey);
  if (invIdx === -1) {
    return res.status(400).json({ error: 'Invalid Invite Key' });
  }
  const invite = db.invites[invIdx];
  officeId = (typeof invite === 'object' ? invite.officeId : null) || null;
  db.invites.splice(invIdx, 1);
  req.io.emit('invites_updated', db.invites);

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: Date.now(),
    chatId: generateChatId(),
    username,
    password: hashedPassword,
    name,
    avatar: name.charAt(0).toUpperCase(),
    bio: 'Hello, I am using Messenger!',
    role: 'client',
    officeId,
    lastActive: Date.now(),
  };

  db.users[username] = newUser;
  db.chats[username] = [];
  saveDB();

  req.io.emit('users_updated', sanitizeUsers(db.users));
  res.json(sanitizeUser(newUser));
});

export default router;
