'use strict';

class GameClient {
  constructor() {
    this.gameState = null;
    this.myColor   = null;
    this.roomId    = null;
    this.names     = { red: 'Rojo', blue: 'Azul' };

    // Módulos
    this.canvas = new GameCanvas('game-canvas');
    this.ui     = new UIManager();
    this.socket = new SocketClient(this);
    this.input  = new InputHandler(this.canvas, this);
  }

  // ─── API pública para SocketClient ───────────────────

  isMyTurn() {
    return this.gameState && this.gameState.currentTurn === this.myColor;
  }

  sendMove(direction) {
    if (!this.isMyTurn()) {
      this.ui.showToast('No es tu turno.', 'error', 1800);
      return;
    }
    this.socket.sendMove(direction);
  }

  sendWall(x, y, orientation) {
    if (!this.isMyTurn()) {
      this.ui.showToast('No es tu turno.', 'error', 1800);
      return;
    }
    this.socket.sendWall(x, y, orientation);
  }

  tryReconnect(saved) {
    this.myColor = saved.color;
    this.socket.reconnectRoom(saved.roomId, saved.color);
  }
}
