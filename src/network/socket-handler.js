'use strict';

const GameState = require('../game/game-state');
const {
  BOARD_SIZE, TURN_TIMEOUT_MS, RECONNECT_TIMEOUT_MS,
  INACTIVE_TIMEOUT_MS, FINISHED_GAME_TIMEOUT_MS,
  VALID_DIRECTIONS, VALID_ORIENTATIONS,
  MAX_PLAYERS_PER_IP,
} = require('../utils/constants');

// ─── Rate limiting Socket.io ─────────────────────────────────────────────────
const actionTimestamps = new Map(); // socketId -> timestamp[]
const joinAttempts     = new Map(); // ip -> { count, resetTime }
const connectionsPerIP = new Map(); // ip -> count

function isActionRateLimited(socketId) {
  const now  = Date.now();
  const list = (actionTimestamps.get(socketId) || []).filter(t => now - t < 5000);
  if (list.length >= 15) return true;
  list.push(now);
  actionTimestamps.set(socketId, list);
  return false;
}

function isJoinRateLimited(ip) {
  const now = Date.now();
  const rec = joinAttempts.get(ip) || { count: 0, resetTime: now + 60000 };
  if (now > rec.resetTime) { joinAttempts.set(ip, { count: 1, resetTime: now + 60000 }); return false; }
  if (rec.count >= 10) return true;
  rec.count++;
  joinAttempts.set(ip, rec);
  return false;
}

// ─── Log estructurado ────────────────────────────────────────────────────────
function log(level, event, data = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...data }));
}

// ─── SocketHandler ───────────────────────────────────────────────────────────
class SocketHandler {
  constructor(io, roomManager) {
    this.io          = io;
    this.rm          = roomManager;
    this.activeGames = new Map(); // roomId -> GameState
    this.turnTimers  = new Map(); // roomId -> timeoutId
    this.disconnectTimers = new Map(); // roomId_color -> timeoutId

    this._startCleanupInterval();
  }

  handleConnection(socket) {
    const ip = socket.handshake.address;

    // Límite de conexiones por IP
    const ipCount = (connectionsPerIP.get(ip) || 0);
    if (ipCount >= MAX_PLAYERS_PER_IP) {
      socket.emit('connection_error', { message: 'Demasiadas conexiones desde tu red.' });
      socket.disconnect(true);
      return;
    }
    connectionsPerIP.set(ip, ipCount + 1);
    log('info', 'connect', { socketId: socket.id, ip });

    // ── Eventos de sala ──────────────────────────────────────────────────
    socket.on('create_room', (data) => this._onCreateRoom(socket, data));
    socket.on('join_room',   (data) => this._onJoinRoom(socket, data, ip));
    socket.on('reconnect_room', (data) => this._onReconnect(socket, data));

    // ── Eventos de juego ─────────────────────────────────────────────────
    socket.on('move',        (data) => this._onMove(socket, data));
    socket.on('place_wall',  (data) => this._onPlaceWall(socket, data));

    // ── Revancha ─────────────────────────────────────────────────────────
    socket.on('request_rematch', () => this._onRematch(socket));

    // ── Desconexión ──────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => this._onDisconnect(socket, ip, reason));
  }

  // ─── Crear sala ──────────────────────────────────────────────────────────

  _onCreateRoom(socket, data) {
    if (!data || typeof data !== 'object') return;
    const result = this.rm.createRoom(socket.id, data.playerName);
    if (result.error) { socket.emit('join_error', { message: result.error }); return; }

    socket.join(result.room.id);
    socket.emit('room_created', {
      roomId:      result.room.id,
      playerColor: 'red',
      playerName:  result.room.players[0].name,
    });
    log('info', 'room_created', { roomId: result.room.id, host: socket.id });
  }

  // ─── Unirse a sala ───────────────────────────────────────────────────────

  _onJoinRoom(socket, data, ip) {
    if (!data || typeof data !== 'object') return;
    if (isJoinRateLimited(ip)) {
      socket.emit('join_error', { message: 'Demasiados intentos. Espera un minuto.' });
      return;
    }

    const rawId = typeof data.roomId === 'string' ? data.roomId.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{4,8}$/.test(rawId)) {
      socket.emit('join_error', { message: 'Código de sala inválido.' });
      return;
    }

    const result = this.rm.joinRoom(socket.id, rawId, data.playerName);
    if (result.error) { socket.emit('join_error', { message: result.error }); return; }

    const room = result.room;
    socket.join(room.id);

    // Confirmar al jugador que se une
    socket.emit('room_joined', { roomId: room.id, playerColor: 'blue', playerName: room.players[1].name });

    // Notificar al anfitrión
    const host = room.players.find(p => p.color === 'red');
    this.io.to(host.socketId).emit('player_joined', { playerName: room.players[1].name });

    // Iniciar partida
    this._startGame(room.id);
    log('info', 'game_start', { roomId: room.id });
  }

  // ─── Reconexión ──────────────────────────────────────────────────────────

  _onReconnect(socket, data) {
    if (!data || typeof data !== 'object') return;
    const { roomId, color } = data;
    if (!roomId || !color) return;

    const result = this.rm.reconnectPlayer(socket.id, roomId, color);
    if (result.error) { socket.emit('join_error', { message: result.error }); return; }

    socket.join(roomId);
    const game = this.activeGames.get(roomId);

    // Cancelar timer de abandono si existía
    const timerKey = `${roomId}_${color}`;
    if (this.disconnectTimers.has(timerKey)) {
      clearTimeout(this.disconnectTimers.get(timerKey));
      this.disconnectTimers.delete(timerKey);
    }

    socket.emit('reconnected', {
      roomId,
      playerColor: color,
      gameState: game ? game.toJSON() : null,
    });

    // Notificar al oponente
    const other = result.room.players.find(p => p.color !== color);
    if (other && other.connected) {
      this.io.to(other.socketId).emit('opponent_reconnected', { playerColor: color });
    }
    log('info', 'reconnected', { roomId, color });
  }

  // ─── Movimiento ──────────────────────────────────────────────────────────

  _onMove(socket, data) {
    if (isActionRateLimited(socket.id)) {
      socket.emit('action_result', { success: false, error: 'Demasiadas acciones. Espera.' });
      return;
    }
    if (!data || !VALID_DIRECTIONS.includes(data.direction)) {
      socket.emit('action_result', { success: false, error: 'Dirección inválida.' });
      return;
    }

    const ctx = this._getGameContext(socket);
    if (!ctx) return;
    const { game, player, roomId } = ctx;

    const result = game.executeMove(player.color, data.direction);
    socket.emit('action_result', { success: result.success, error: result.error });

    if (result.success) {
      if (result.gameOver) {
        this._clearTurnTimer(roomId);
        this.io.to(roomId).emit('game_over', { winner: result.winner, reason: 'goal' });
        const room = this.rm.getRoom(roomId);
        if (room) room.status = 'finished';
        log('info', 'game_over', { roomId, winner: result.winner });
      } else {
        this.io.to(roomId).emit('state_update', game.toJSON());
        this._startTurnTimer(roomId, game.board.currentTurn);
      }
    }
  }

  // ─── Colocar pared ───────────────────────────────────────────────────────

  _onPlaceWall(socket, data) {
    if (isActionRateLimited(socket.id)) {
      socket.emit('action_result', { success: false, error: 'Demasiadas acciones. Espera.' });
      return;
    }
    if (!data || typeof data !== 'object') {
      socket.emit('action_result', { success: false, error: 'Datos inválidos.' });
      return;
    }

    const { x, y, orientation } = data;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !VALID_ORIENTATIONS.includes(orientation)) {
      socket.emit('action_result', { success: false, error: 'Parámetros de pared inválidos.' });
      return;
    }

    const ctx = this._getGameContext(socket);
    if (!ctx) return;
    const { game, player, roomId } = ctx;

    const result = game.executeWallPlacement(player.color, x, y, orientation);
    socket.emit('action_result', { success: result.success, error: result.error });

    if (result.success) {
      this.io.to(roomId).emit('state_update', game.toJSON());
      this._startTurnTimer(roomId, game.board.currentTurn);
    }
  }

  // ─── Revancha ────────────────────────────────────────────────────────────

  _onRematch(socket) {
    const roomId = this.rm.getRoomId(socket.id);
    if (!roomId) return;
    const room = this.rm.getRoom(roomId);
    if (!room || room.status !== 'finished') return;

    // Guardar ambos sockets antes de borrar sala
    const players = [...room.players];

    // Nueva sala: invertir colores
    this.rm.removeRoom(roomId);
    this.activeGames.delete(roomId);
    this._clearTurnTimer(roomId);

    const [p1, p2] = players; // p1 era red, p2 era blue

    const r1 = this.rm.createRoom(p2.socketId, p2.name); // blue pasa a ser red (anfitrión)
    if (r1.error) return;
    const newRoomId = r1.room.id;

    const r2 = this.rm.joinRoom(p1.socketId, newRoomId, p1.name);
    if (r2.error) return;

    // Actualizar salas de socket.io
    const s1 = this.io.sockets.sockets.get(p1.socketId);
    const s2 = this.io.sockets.sockets.get(p2.socketId);
    if (s1) { s1.leave(roomId); s1.join(newRoomId); }
    if (s2) { s2.leave(roomId); s2.join(newRoomId); }

    this._startGame(newRoomId);
    log('info', 'rematch', { oldRoom: roomId, newRoom: newRoomId });
  }

  // ─── Desconexión ─────────────────────────────────────────────────────────

  _onDisconnect(socket, ip, reason) {
    const ipCount = connectionsPerIP.get(ip) || 1;
    if (ipCount <= 1) connectionsPerIP.delete(ip);
    else connectionsPerIP.set(ip, ipCount - 1);

    actionTimestamps.delete(socket.id);

    const info = this.rm.disconnectPlayer(socket.id);
    if (!info) return;
    const { room, roomId, player } = info;

    log('info', 'disconnect', { socketId: socket.id, roomId, reason });

    if (room.status === 'finished' || room.status === 'waiting') return;

    // Notificar al oponente
    const other = room.players.find(p => p.color !== player?.color);
    if (other && other.connected) {
      this.io.to(other.socketId).emit('player_disconnected', {
        playerColor: player?.color,
        reconnectWindowMs: RECONNECT_TIMEOUT_MS,
      });
    }

    // Timer de abandono: si no reconecta en 2 min, el otro gana
    const timerKey = `${roomId}_${player?.color}`;
    const t = setTimeout(() => {
      const r = this.rm.getRoom(roomId);
      const g = this.activeGames.get(roomId);
      if (!r || !g || g.status !== 'playing') return;

      g.status = 'finished';
      g.winner = other?.color || null;
      if (r) r.status = 'finished';

      this.io.to(roomId).emit('game_over', { winner: other?.color, reason: 'forfeit' });
      this._clearTurnTimer(roomId);
      log('info', 'forfeit', { roomId, disconnected: player?.color });
    }, RECONNECT_TIMEOUT_MS);

    this.disconnectTimers.set(timerKey, t);
  }

  // ─── Helpers internos ────────────────────────────────────────────────────

  _startGame(roomId) {
    const game = new GameState(roomId, BOARD_SIZE);
    this.activeGames.set(roomId, game);
    this.io.to(roomId).emit('game_start', game.toJSON());
    this._startTurnTimer(roomId, 'red');
  }

  _getGameContext(socket) {
    const player = this.rm.getPlayer(socket.id);
    if (!player) { socket.emit('action_result', { success: false, error: 'No estás en ninguna sala.' }); return null; }

    const roomId = this.rm.getRoomId(socket.id);
    const game   = this.activeGames.get(roomId);
    if (!game)   { socket.emit('action_result', { success: false, error: 'Partida no encontrada.' }); return null; }
    if (game.status !== 'playing') { socket.emit('action_result', { success: false, error: 'La partida no está activa.' }); return null; }

    return { game, player, roomId };
  }

  _startTurnTimer(roomId, playerColor) {
    this._clearTurnTimer(roomId);
    const t = setTimeout(() => {
      const game = this.activeGames.get(roomId);
      if (!game || game.status !== 'playing') return;
      if (game.board.currentTurn !== playerColor) return;
      // Forzar cambio de turno por timeout
      game.board.currentTurn = playerColor === 'red' ? 'blue' : 'red';
      this.io.to(roomId).emit('state_update', { ...game.toJSON(), turnTimeout: true });
      this._startTurnTimer(roomId, game.board.currentTurn);
      log('info', 'turn_timeout', { roomId, color: playerColor });
    }, TURN_TIMEOUT_MS);
    this.turnTimers.set(roomId, t);
  }

  _clearTurnTimer(roomId) {
    const t = this.turnTimers.get(roomId);
    if (t) { clearTimeout(t); this.turnTimers.delete(roomId); }
  }

  _startCleanupInterval() {
    // Memoria
    if (process.env.NODE_ENV === 'production') {
      setInterval(() => {
        const mem = process.memoryUsage();
        log('info', 'memory', {
          rss:  Math.round(mem.rss  / 1024 / 1024),
          heap: Math.round(mem.heapUsed / 1024 / 1024),
          rooms: this.rm.rooms.size,
        });
      }, 10 * 60 * 1000);
    }

    // Salas inactivas
    setInterval(() => {
      const cleaned = this.rm.purgeStaleRooms(
        this.activeGames, INACTIVE_TIMEOUT_MS, FINISHED_GAME_TIMEOUT_MS
      );
      if (cleaned > 0) log('info', 'cleanup', { removed: cleaned, remaining: this.rm.rooms.size });
    }, 5 * 60 * 1000);
  }
}

module.exports = SocketHandler;
