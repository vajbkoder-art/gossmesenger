import webpush from 'web-push';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, DIR } from '../config.js';
import { db, saveDB } from '../db.js';

// Initialize Web Push
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:admin@messenger.local', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Initialize Firebase Admin
const firebaseKeyPath = path.join(DIR, 'firebase-service-account.json');
let firebaseApp = null;
if (fs.existsSync(firebaseKeyPath)) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(firebaseKeyPath, 'utf8'));
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[firebase] Initialized successfully');
  } catch (e) {
    console.error('[firebase] Failed to initialize:', e.message);
  }
}

export function sendPushNotification(username, payload) {
  if (!username) return;

  // Web Push
  const subs = db.pushSubscriptions?.[username];
  if (Array.isArray(subs) && subs.length > 0) {
    const promises = subs.map(sub =>
      webpush.sendNotification(sub, JSON.stringify(payload)).then(() => sub).catch(err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          return null;
        }
        return sub;
      })
    );
    Promise.all(promises).then((results) => {
      const valid = results.filter(Boolean);
      if (valid.length < subs.length) {
        db.pushSubscriptions[username] = valid;
        saveDB();
      }
    });
  }

  // FCM (Android)
  const tokens = db.fcmTokens?.[username];
  if (firebaseApp && Array.isArray(tokens) && tokens.length > 0) {
    const message = {
      data: {},
      tokens: tokens.slice(),
    };

    if (payload.type === 'call') {
      message.data = {
        type: 'call',
        from: payload.from || '',
        fromName: payload.fromName || '',
        isVideo: String(payload.isVideo ?? false),
        roomId: payload.roomId || '',
      };
      message.android = { priority: 'high', ttl: 30000 };
    } else {
      message.notification = {
        title: payload.title || payload.from || 'Message',
        body: payload.body || payload.text || '',
      };
      message.data.type = payload.type || 'message';
      if (payload.from) message.data.from = payload.from;
      if (payload.fromName) message.data.fromName = payload.fromName;
    }

    admin.messaging().sendEachForMulticast(message).catch(err => {
      console.error('[FCM] sendEachForMulticast error:', err.message);
    });
  }
}
