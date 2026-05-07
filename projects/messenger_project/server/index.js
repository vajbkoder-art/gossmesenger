import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import * as mediasoupRooms from './mediasoupRooms.js';
import { PORT, ALLOWED_ORIGINS, DIR } from './config.js';
import { setupSocketHandlers } from './socket/handlers.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import apiRouter from './routes/api.js';

// Express app
const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o)) || origin.endsWith('.trycloudflare.com')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте через 15 минут.' },
});
app.use('/api/auth', authLimiter);
app.use('/api/admin/login', authLimiter);

// HTTP server + Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: (origin, cb) => cb(null, true), credentials: true },
  maxHttpBufferSize: 1e8,
});

// Inject io into req for route handlers
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Static files
app.get(['/call.html', '/app/call.html'], (req, res) => {
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
  res.sendFile(path.join(DIR, 'public', 'call.html'));
});

app.use('/_expo', express.static(path.join(DIR, 'public', 'app', '_expo'), {
  setHeaders: (res) => { res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); },
}));

app.use(express.static(path.join(DIR, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.includes('/app/') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

// Routes
app.use('/api/admin', adminRouter);
app.use('/api/auth', authRouter);
app.use('/', apiRouter);

// Service worker
const SW_PATH = path.join(DIR, 'public', 'app', 'sw.js');
const SW_FALLBACK = "self.addEventListener('push',function(e){var d={title:'Уведомление',body:''};try{if(e.data)d=e.data.json();}catch(t){if(e.data)d.body=e.data.text();}e.waitUntil(self.registration.showNotification(d.title||'Messenger',{body:d.body||'',tag:'push',icon:'/app/favicon.ico'}));});self.addEventListener('notificationclick',function(e){e.notification.close();});";
app.get('/app/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  if (fs.existsSync(SW_PATH)) res.sendFile(SW_PATH);
  else res.send(SW_FALLBACK);
});

// PWA static
app.get('/app', (req, res) => res.redirect(301, '/app/'));
app.use('/app', express.static(path.join(DIR, 'public', 'app'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));
app.get('/app/*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(DIR, 'public', 'app', 'index.html'));
});

// Catch-all for admin panel SPA
app.get('*', (req, res) => {
  if (!req.url.startsWith('/api/') && !req.url.startsWith('/socket.io/')) {
    res.sendFile(path.join(DIR, 'public', 'index.html'));
  }
});

// Socket.IO handlers
setupSocketHandlers(io);

// Start server
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await mediasoupRooms.runMediasoupWorker();
  } catch (e) {
    console.error('[mediasoup] Failed to start worker', e);
  }
});
