'use strict';

const Board = require('./board');
const { validateMove, validateWallPlacement } = require('./rules');
const { BOARD_SIZE, MAX_MOVE_HISTORY } = require('../utils/constants');

class GameState {
  constructor(roomId, boardSize = BOARD_SIZE) {
    this.roomId = roomId;
    this.board  = new Board(boardSize);
    this.status = 'playing';  // 'playing' | 'finished' | 'abandoned'
    this.winner = null;
    this.moveHistory  = [];
    this.startTime    = Date.now();
    this.lastActivity = Date.now();
    this.moveCount    = 0;
  }

  /**
   * Ejecuta un movimiento de pelota.
   * Devuelve { success, error?, gameOver?, winner? }
   */
  executeMove(playerColor, direction) {
    if (this.status !== 'playing') return { success: false, error: 'La partida ha terminado.' };
    if (this.board.currentTurn !== playerColor) return { success: false, error: 'No es tu turno.' };

    const result = validateMove(this.board, playerColor, direction);
    if (!result.ok) return { success: false, error: result.error };

    // Aplicar movimiento
    this.board.balls[playerColor].x = result.nx;
    this.board.balls[playerColor].y = result.ny;

    this._recordMove({ player: playerColor, action: 'move', direction });

    // Verificar victoria
    const goalRow = playerColor === 'red' ? this.board.size - 1 : 0;
    if (result.ny === goalRow) {
      this.status = 'finished';
      this.winner = playerColor;
      return { success: true, gameOver: true, winner: playerColor };
    }

    // Cambiar turno
    this.board.currentTurn = playerColor === 'red' ? 'blue' : 'red';
    this.lastActivity = Date.now();
    return { success: true, gameOver: false };
  }

  /**
   * Ejecuta la colocación de una pared.
   * Devuelve { success, error? }
   */
  executeWallPlacement(playerColor, x, y, orientation) {
    if (this.status !== 'playing') return { success: false, error: 'La partida ha terminado.' };
    if (this.board.currentTurn !== playerColor) return { success: false, error: 'No es tu turno.' };

    const result = validateWallPlacement(this.board, playerColor, x, y, orientation);
    if (!result.ok) return { success: false, error: result.error };

    // Aplicar pared con el color del jugador
    if (orientation === 'H') this.board.horizontalWalls[y][x] = playerColor;
    if (orientation === 'V') this.board.verticalWalls[y][x]   = playerColor;
    this._recordMove({ player: playerColor, action: 'wall', x, y, orientation });

    // Cambiar turno
    this.board.currentTurn = playerColor === 'red' ? 'blue' : 'red';
    this.lastActivity = Date.now();
    return { success: true };
  }

  _recordMove(entry) {
    this.moveCount++;
    this.moveHistory.push({ ...entry, timestamp: Date.now(), moveNum: this.moveCount });
    if (this.moveHistory.length > MAX_MOVE_HISTORY) this.moveHistory.shift();
  }

  /**
   * Serialización completa para enviar al cliente.
   */
  toJSON() {
    return {
      ...this.board.toJSON(),
      status:    this.status,
      winner:    this.winner,
      moveCount: this.moveCount,
    };
  }
}

module.exports = GameState;
