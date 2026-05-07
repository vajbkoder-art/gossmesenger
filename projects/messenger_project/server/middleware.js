import bcrypt from 'bcryptjs';
import { ADMIN_LOGIN, ADMIN_PASSWORD, MANAGER_ROLES } from './config.js';
import { db } from './db.js';

function getSuperAdminHash() {
  if (!db._superAdminHash || db._superAdminHashSrc !== ADMIN_PASSWORD) {
    db._superAdminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    db._superAdminHashSrc = ADMIN_PASSWORD;
  }
  return db._superAdminHash;
}

export function requireAdmin(req, res, next) {
  const login = req.headers['x-admin-login'];
  const pass = req.headers['x-admin-password'];
  if (!login || !pass) return res.status(401).json({ error: 'Auth required' });
  const isSuperAdmin = login === ADMIN_LOGIN && bcrypt.compareSync(pass, getSuperAdminHash());
  const office = Object.values(db.offices || {}).find(o => o.login === login);
  const isOfficeAdmin = office && bcrypt.compareSync(pass, office.password);
  if (!isSuperAdmin && !isOfficeAdmin) return res.status(403).json({ error: 'Invalid credentials' });
  req.adminRole = isSuperAdmin ? 'superadmin' : 'office_admin';
  req.adminOfficeId = isSuperAdmin ? null : office?.id || null;
  next();
}

export function requireSuperAdmin(req, res, next) {
  const login = req.headers['x-admin-login'];
  const pass = req.headers['x-admin-password'];
  if (!login || !pass) return res.status(401).json({ error: 'Auth required' });
  if (login !== ADMIN_LOGIN || !bcrypt.compareSync(pass, getSuperAdminHash())) {
    return res.status(403).json({ error: 'Superadmin only' });
  }
  req.adminRole = 'superadmin';
  next();
}

export function requireManager(req, res, next) {
  const login = req.headers['x-manager-login'];
  const pass = req.headers['x-manager-password'];
  if (!login || !pass) return res.status(401).json({ error: 'Auth required' });
  const user = db.users[login];
  if (!user || !MANAGER_ROLES.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
  if (!bcrypt.compareSync(pass, user.password)) return res.status(403).json({ error: 'Invalid credentials' });
  req.managerUsername = login;
  req.managerUser = user;
  next();
}

export function getRequestIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || req.ip;
}

export function recordUserIp(username, ip) {
  if (!username || !ip || !db.users[username]) return;
  db.users[username].lastIp = ip;
}
