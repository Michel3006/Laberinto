'use strict';

const {
  MAX_ROOMS, MAX_NAME_LENGTH, ROOM_CODE_LENGTH,
} = require('../utils/constants');

// Caracteres sin ambiguedad (sin 0/O, 1/I, etc.)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class RoomManager {
  constructor() {
    this.rooms      = new Map(); // roomId -> Room
    this.socketRoom = new Map(); // socketId -> roomId
  }

  // ─── Creación y unión ────────────────────────────────────────────────────

  createRoom(socketId, playerName) {
    if (this.rooms.size >= MAX_ROOMS) {
      return { error: 'El servidor está lleno. Intenta más tarde.' };
    }

    // Si ya está en una sala en espera (huérfana), limpiarla primero
    if (this.socketRoom.has(socketId)) {
      const oldRoomId = this.socketRoom.get(socketId);
      const oldRoom   = this.rooms.get(oldRoomId);
      if (oldRoom && oldRoom.status === 'waiting') {
        this.removeRoom(oldRoomId);
      } else {
        return { error: 'Ya estás en una sala. Sal primero.' };
      }
    }

    const roomId = this._generateCode();
    const room = {
      id: roomId,
      players: [
        {
          socketId,
          color: 'red',
          name: this._sanitizeName(playerName),
          connected: true,
        },
      ],
      status: 'waiting',     // 'waiting' | 'playing' | 'finished'
      createdAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    this.socketRoom.set(socketId, roomId);
    return { room };
  }

  joinRoom(socketId, roomId, playerName) {
    // Si ya está en una sala en espera (huérfana), limpiarla primero
    if (this.socketRoom.has(socketId)) {
      const oldRoomId = this.socketRoom.get(socketId);
      const oldRoom   = this.rooms.get(oldRoomId);
      if (oldRoom && oldRoom.status === 'waiting') {
        this.removeRoom(oldRoomId);
      } else {
        return { error: 'Ya estás en una sala. Sal primero.' };
      }
    }

    const room = this.rooms.get(roomId);
    if (!room)                          return { error: 'Sala no encontrada.' };
    if (room.players.length >= 2)       return { error: 'Sala llena.' };
    if (room.status !== 'waiting')      return { error: 'La partida ya está en curso.' };

    room.players.push({
      socketId,
      color: 'blue',
      name: this._sanitizeName(playerName),
      connected: true,
    });
    room.status = 'playing';
    this.socketRoom.set(socketId, roomId);
    return { room };
  }

  // ─── Reconexión ──────────────────────────────────────────────────────────

  reconnectPlayer(socketId, roomId, color) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Sala no encontrada.' };
    if (room.status === 'finished') return { error: 'La partida ya terminó.' };

    const player = room.players.find(p => p.color === color);
    if (!player) return { error: 'Color no registrado en esta sala.' };

    // Actualizar socketId
    this.socketRoom.delete(player.socketId);
    player.socketId   = socketId;
    player.connected  = true;
    this.socketRoom.set(socketId, roomId);
    return { room, player };
  }

  // ─── Desconexión ─────────────────────────────────────────────────────────

  disconnectPlayer(socketId) {
    const roomId = this.socketRoom.get(socketId);
    this.socketRoom.delete(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.find(p => p.socketId === socketId);
    if (player) player.connected = false;

    return { room, roomId, player };
  }

  removeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.players.forEach(p => this.socketRoom.delete(p.socketId));
    }
    this.rooms.delete(roomId);
  }

  // ─── Consultas ───────────────────────────────────────────────────────────

  getRoom(roomId)       { return this.rooms.get(roomId) || null; }
  getRoomId(socketId)   { return this.socketRoom.get(socketId) || null; }
  getPlayer(socketId)   {
    const room = this.rooms.get(this.socketRoom.get(socketId));
    return room ? room.players.find(p => p.socketId === socketId) || null : null;
  }

  // ─── Limpieza ────────────────────────────────────────────────────────────

  purgeStaleRooms(activeGames, INACTIVE_TIMEOUT, FINISHED_TIMEOUT) {
    const now = Date.now();
    let count = 0;

    for (const [roomId, room] of this.rooms.entries()) {
      const game = activeGames.get(roomId);
      const allGone = room.players.every(p => !p.connected);
      const isInactive = game && (now - game.lastActivity > INACTIVE_TIMEOUT);
      const isDoneOld  = game && game.status === 'finished' &&
                         (now - game.lastActivity > FINISHED_TIMEOUT);

      // También purgar salas waiting sin actividad reciente (más de 10 min)
      const isStaleWaiting = room.status === 'waiting' &&
                             (now - room.createdAt > 10 * 60 * 1000);

      if (allGone || isInactive || isDoneOld || isStaleWaiting) {
        this.removeRoom(roomId);
        activeGames.delete(roomId);
        count++;
      }
    }
    return count;
  }

  // ─── Helpers privados ────────────────────────────────────────────────────

  _generateCode() {
    let code;
    do {
      code = Array.from({ length: ROOM_CODE_LENGTH }, () =>
        CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }

  _sanitizeName(name) {
    if (typeof name !== 'string') return 'Jugador';
    return name
      .replace(/[<>"'&]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, MAX_NAME_LENGTH) || 'Jugador';
  }
}

module.exports = RoomManager;
