'use strict';

class SocketClient {
  constructor(gameClient) {
    this.gc  = gameClient;
    this.socket = io({ reconnectionDelay: 1000, reconnectionAttempts: 10 });
    this._reconnecting = false; // bloquea acciones mientras reconectamos
    this._bind();
  }

  // ─── Emisores (cliente → servidor) ───────────────────

  createRoom(playerName) {
    this.socket.emit('create_room', { playerName });
  }

  joinRoom(roomId, playerName) {
    this.socket.emit('join_room', { roomId, playerName });
  }

  leaveRoom() {
    this.socket.emit('leave_room');
  }

  reconnectRoom(roomId, color) {
    this.socket.emit('reconnect_room', { roomId, color });
  }

  sendMove(direction) {
    if (this._reconnecting) {
      this.gc.ui.showToast('Reconectando… espera un momento.', 'info', 2000);
      return;
    }
    this.socket.emit('move', { direction });
  }

  sendWall(x, y, orientation) {
    if (this._reconnecting) {
      this.gc.ui.showToast('Reconectando… espera un momento.', 'info', 2000);
      return;
    }
    this.socket.emit('place_wall', { x, y, orientation });
  }

  requestRematch() {
    this.socket.emit('request_rematch');
  }

  // ─── Receptores (servidor → cliente) ─────────────────

  _bind() {
    const s  = this.socket;
    const gc = this.gc;

    s.on('connect', () => {
      // Al reconectar con nuevo socket.id, intentar reanudar sala guardada
      const saved = this._loadReconnectData();
      if (saved) {
        this._reconnecting = true;
        gc.tryReconnect(saved);
      }
    });

    s.on('disconnect', () => {
      // Marcar como reconectando para bloquear acciones locales
      const saved = this._loadReconnectData();
      if (saved) {
        this._reconnecting = true;
      }
    });

    s.on('connection_error', data => {
      gc.ui.showToast(data.message || 'Error de conexión.', 'error', 4000);
    });

    // ── Sala ──────────────────────────────────────────

    s.on('room_created', data => {
      gc.myColor = data.playerColor;
      gc.roomId  = data.roomId;
      gc.names   = { red: data.playerName, blue: '…' };
      gc.ui.showLobby(data.roomId);
      this._saveReconnectData(data.roomId, data.playerColor);
    });

    s.on('room_joined', data => {
      gc.myColor = data.playerColor;
      gc.roomId  = data.roomId;
      // Guardar también para el jugador azul
      this._saveReconnectData(data.roomId, data.playerColor);
      gc.ui.showScreen('screen-game');
      gc.ui.showToast('Uniéndote a la partida…', 'info', 1500);
    });

    s.on('player_joined', data => {
      if (!gc.names) gc.names = {};
      gc.names.blue = data.playerName;
      gc.ui.showToast(`${data.playerName} se unió. ¡A jugar!`, 'success', 2500);
    });

    s.on('join_error', data => {
      gc.ui.showToast(data.message || 'Error al unirse.', 'error', 3500);
      gc.ui.closeModal('modal-join');
    });

    // ── Juego ─────────────────────────────────────────

    s.on('game_start', state => {
      gc.gameState = state;
      gc.ui.showScreen('screen-game');
      gc.ui.updateGameHUD(state, gc.myColor, gc.names);
      gc.canvas.resize();
      gc.canvas.render(state);
      gc.input.onStateUpdate();
      gc.ui.startTimer(60000);
      gc.ui.showToast('¡Comienza la partida! Mueve el rojo.', 'info', 2000);
    });

    s.on('state_update', state => {
      gc.gameState = state;
      gc.ui.updateGameHUD(state, gc.myColor, gc.names);
      gc.canvas.render(state);
      gc.input.onStateUpdate();
      gc.ui.startTimer(60000);

      if (state.turnTimeout) {
        gc.ui.showToast('⏱ Turno perdido por tiempo.', 'error', 2500);
      }
    });

    s.on('action_result', data => {
      if (!data.success) {
        gc.ui.showToast(data.error || 'Acción inválida.', 'error', 2500);
      }
    });

    s.on('game_over', data => {
      gc.ui.stopTimer();
      this._clearReconnectData();
      gc.ui.showResult({
        isWinner:    data.winner === gc.myColor,
        isDraw:      !data.winner,
        winnerColor: data.winner,
        reason:      data.reason,
        moveCount:   gc.gameState?.moveCount,
      });
    });

    // ── Desconexión oponente ──────────────────────────

    s.on('player_disconnected', data => {
      gc.ui.showDisconnectBanner(data.reconnectWindowMs || 120000);
      gc.ui.showToast('Oponente desconectado. Esperando…', 'error', 3000);
    });

    s.on('opponent_reconnected', () => {
      gc.ui.hideDisconnectBanner();
      gc.ui.showToast('¡Oponente reconectado!', 'success', 2000);
    });

    // ── Reconexión propia ─────────────────────────────

    s.on('reconnected', data => {
      this._reconnecting = false; // ya podemos volver a enviar acciones
      gc.roomId  = data.roomId;
      if (data.gameState) {
        gc.gameState = data.gameState;
        gc.ui.showScreen('screen-game');
        gc.ui.updateGameHUD(data.gameState, gc.myColor, gc.names);
        gc.canvas.resize();
        gc.canvas.render(data.gameState);
        gc.input.onStateUpdate();
        gc.ui.startTimer(60000);
        gc.ui.showToast('Reconectado a la partida.', 'success', 2000);
      }
    });

    // Si el servidor rechaza la reconexión (sala ya no existe, partida terminada…)
    s.on('join_error', data => {
      this._reconnecting = false;
      this._clearReconnectData();
      gc.ui.showToast(data.message || 'No se pudo reconectar.', 'error', 3500);
      gc.ui.closeModal('modal-join');
    });
  }

  // ─── sessionStorage para reconexión ────────────────────

  _saveReconnectData(roomId, color) {
    try {
      sessionStorage.setItem('lastRoomId',   roomId);
      sessionStorage.setItem('lastColor',    color);
      sessionStorage.setItem('reconnectExp', Date.now() + 5 * 60 * 1000);
    } catch (_) {}
  }

  _loadReconnectData() {
    try {
      const exp    = parseInt(sessionStorage.getItem('reconnectExp') || '0');
      const roomId = sessionStorage.getItem('lastRoomId');
      const color  = sessionStorage.getItem('lastColor');
      if (Date.now() > exp || !roomId || !color) {
        this._clearReconnectData();
        return null;
      }
      return { roomId, color };
    } catch (_) { return null; }
  }

  _clearReconnectData() {
    try {
      sessionStorage.removeItem('lastRoomId');
      sessionStorage.removeItem('lastColor');
      sessionStorage.removeItem('reconnectExp');
    } catch (_) {}
  }
}
