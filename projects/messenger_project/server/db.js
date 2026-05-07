import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { DIR, SERVICE_AVATARS, ADMIN_LOGIN, ADMIN_PASSWORD } from './config.js';

const DB_FILE = path.join(DIR, 'db.json');

let db = {
  users: {},
  invites: [],
  chats: {},
  offices: {},
  conferences: {},
  pushSubscriptions: {},
  fcmTokens: {},
};

// Load from disk
try {
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
} catch (err) {
  console.error('Warning: Failed to load db.json, using default memory DB', err);
}

// Ensure required collections
if (!db.offices) db.offices = {};
if (!db.conferences) db.conferences = {};
if (!db.pushSubscriptions) db.pushSubscriptions = {};
if (!db.fcmTokens) db.fcmTokens = {};

// Migrate old string invites to objects
if (Array.isArray(db.invites)) {
  db.invites = db.invites.map(inv => typeof inv === 'string' ? { key: inv, officeId: null } : inv);
}

// Debounced save
let saveTimeout = null;
export function saveDB() {
  if (!saveTimeout) {
    saveTimeout = setTimeout(() => {
      fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), err => {
        if (err) console.error('Failed to save db.json:', err);
      });
      saveTimeout = null;
    }, 1000);
  }
}

export function saveDBSync() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Migrate plaintext passwords to bcrypt
(function migratePasswords() {
  let migrated = 0;
  for (const u of Object.values(db.users)) {
    if (u.password && !u.password.startsWith('$2')) {
      u.password = bcrypt.hashSync(u.password, 10);
      migrated++;
    }
  }
  for (const o of Object.values(db.offices || {})) {
    if (o.password && !o.password.startsWith('$2')) {
      o.password = bcrypt.hashSync(o.password, 10);
      migrated++;
    }
  }
  if (migrated > 0) {
    saveDBSync();
    console.log(`[security] Migrated ${migrated} plaintext passwords to bcrypt`);
  }
})();

// Generate unique 6-digit chatId
export function generateChatId() {
  const existing = new Set(Object.values(db.users).map(u => u.chatId).filter(Boolean));
  let id;
  do {
    id = String(Math.floor(100000 + Math.random() * 900000));
  } while (existing.has(id));
  return id;
}

// Migrate existing users: add chatId + auto-avatars for special roles
let needsSave = false;
for (const u of Object.values(db.users)) {
  if (!u.chatId) { u.chatId = generateChatId(); needsSave = true; }
  const expectedAvatar = SERVICE_AVATARS[u.role];
  if (expectedAvatar && u.avatar !== expectedAvatar) { u.avatar = expectedAvatar; needsSave = true; }
}
if (needsSave) {
  saveDBSync();
  console.log('Migration: updated users (chatId/avatars)');
}

// Sanitize user (remove password)
export function sanitizeUser(u) {
  if (!u) return u;
  const { password, ...safe } = u;
  return safe;
}

export function sanitizeUsers(users) {
  const out = {};
  for (const [k, v] of Object.entries(users)) {
    out[k] = sanitizeUser(v);
  }
  return out;
}

// Office helpers
export function getUsersForOffice(officeId) {
  return Object.values(db.users).filter(u => (u.officeId || null) === officeId);
}

export function getUsernamesForOffice(officeId) {
  return Object.keys(db.users).filter(u => (db.users[u].officeId || null) === officeId);
}

// Activity log (in-memory, last 500 entries)
const activityLog = [];
export function logActivity(type, details) {
  activityLog.unshift({ type, details, timestamp: Date.now() });
  if (activityLog.length > 500) activityLog.length = 500;
}
export function getActivityLog() {
  return activityLog;
}

// Server settings
export let serverSettings = { ...({ maxMessageLength: 5000, maxFileSize: '50mb', maxFileSizeMb: 50, callTimeout: 90, maxUploadKbps: 0, maxDownloadKbps: 0 }), ...(db.serverSettings || {}) };

export function updateServerSettings(newSettings) {
  serverSettings = { ...serverSettings, ...newSettings };
  db.serverSettings = serverSettings;
  saveDB();
}

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export { db };
