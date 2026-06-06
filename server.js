'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const RoomManager   = require('./src/network/room-manager');
const SocketHandler = require('./src/network/socket-handler');

const app    = express();
const server = http.createServer(app);

const isDev  = process.env.NODE_ENV !== 'production';
const origin = isDev ? '*' : (process.env.ALLOWED_ORIGIN || '*');

// ─── Seguridad HTTP ───────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", 'https://fonts.googleapis.com'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      imgSrc:     ["'self'", 'data:'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      frameSrc:   ["'none'"],
      objectSrc:  ["'none'"],
    },
  },
  noSniff:    true,
  frameguard: { action: 'deny' },
  hsts: isDev ? false : { maxAge: 31536000, includeSubDomains: true },
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});

// ─── Errores Express ──────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(500).json({ error: isDev ? err.message : 'Error interno del servidor.' });
});

// ─── Socket.io ───────────────────────────────────────────────────────────────

const io = new Server(server, {
  cors:              { origin, methods: ['GET', 'POST'], credentials: false },
  pingTimeout:       60000,
  pingInterval:      25000,
  maxHttpBufferSize: 1e4,  // 10 KB
});

const roomManager   = new RoomManager();
const socketHandler = new SocketHandler(io, roomManager);

io.on('connection', socket => socketHandler.handleConnection(socket));

// ─── Arranque ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    event: 'server_start',
    port: PORT,
    env: process.env.NODE_ENV || 'development',
  }));
});

// ─── Errores no capturados ────────────────────────────────────────────────────

process.on('uncaughtException',    err => console.error('[UncaughtException]', err));
process.on('unhandledRejection',   err => console.error('[UnhandledRejection]', err));
