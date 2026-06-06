'use strict';

const { BOARD_SIZE, WALLS_PER_PLAYER } = require('../utils/constants');

class Board {
  constructor(size = BOARD_SIZE) {
    this.size = size;

    // Posiciones iniciales: columna central
    const center = Math.floor(size / 2);
    this.balls = {
      red:  { x: center, y: 0 },         // Fila superior, centro
      blue: { x: center, y: size - 1 },  // Fila inferior, centro
    };

    // horizontalWalls[y][x]: pared entre casilla (x,y) y (x,y+1)
    // Valor: null (sin pared), 'red' o 'blue' (color del jugador que la puso)
    this.horizontalWalls = Array.from({ length: size }, () =>
      Array(size).fill(null)
    );

    // verticalWalls[y][x]: pared entre casilla (x,y) y (x+1,y)
    this.verticalWalls = Array.from({ length: size }, () =>
      Array(size).fill(null)
    );

    // Paredes restantes por jugador
    this.wallsLeft = { red: WALLS_PER_PLAYER, blue: WALLS_PER_PLAYER };

    // Turno actual
    this.currentTurn = 'red';
  }

  /**
   * Devuelve true si hay pared entre dos casillas adyacentes.
   */
  hasWallBetween(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (Math.abs(dx) + Math.abs(dy) !== 1) return true; // No adyacentes

    if (dx === 1)  return !!this.verticalWalls[y1][x1];    // Moverse al este
    if (dx === -1) return !!this.verticalWalls[y1][x2];    // Moverse al oeste
    if (dy === 1)  return !!this.horizontalWalls[y1][x1];  // Moverse al sur
    if (dy === -1) return !!this.horizontalWalls[y2][x1];  // Moverse al norte

    return true;
  }

  /**
   * Devuelve casillas adyacentes accesibles desde (x,y), ignorando pelotas.
   */
  getValidNeighbors(x, y) {
    const dirs = [
      { dx: 0, dy: -1 }, // Norte
      { dx: 0, dy:  1 }, // Sur
      { dx: -1, dy: 0 }, // Oeste
      { dx:  1, dy: 0 }, // Este
    ];
    const neighbors = [];
    for (const { dx, dy } of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= this.size || ny < 0 || ny >= this.size) continue;
      if (!this.hasWallBetween(x, y, nx, ny)) {
        neighbors.push({ x: nx, y: ny });
      }
    }
    return neighbors;
  }

  /**
   * Clon profundo del tablero para simulaciones BFS.
   */
  clone() {
    const b = new Board(this.size);
    b.balls = {
      red:  { ...this.balls.red },
      blue: { ...this.balls.blue },
    };
    b.horizontalWalls = this.horizontalWalls.map(row => [...row]);
    b.verticalWalls   = this.verticalWalls.map(row => [...row]);
    b.wallsLeft = { ...this.wallsLeft };
    b.currentTurn = this.currentTurn;
    return b;
  }

  /**
   * Serialización para enviar al cliente.
   */
  toJSON() {
    return {
      size: this.size,
      balls: this.balls,
      horizontalWalls: this.horizontalWalls,
      verticalWalls:   this.verticalWalls,
      wallsLeft:       this.wallsLeft,
      currentTurn:     this.currentTurn,
    };
  }
}

module.exports = Board;
