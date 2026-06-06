'use strict';

const { validatePathsAfterWall } = require('./pathfinder');
const { VALID_DIRECTIONS, VALID_ORIENTATIONS } = require('../utils/constants');

/**
 * Valida si un movimiento de pelota es legal.
 */
function validateMove(board, playerColor, direction) {
  if (!VALID_DIRECTIONS.includes(direction)) return { ok: false, error: 'Dirección inválida.' };

  const ball = board.balls[playerColor];
  let nx = ball.x;
  let ny = ball.y;

  switch (direction) {
    case 'N': ny--; break;
    case 'S': ny++; break;
    case 'E': nx++; break;
    case 'W': nx--; break;
  }

  // Límites del tablero
  if (nx < 0 || nx >= board.size || ny < 0 || ny >= board.size) {
    return { ok: false, error: 'Fuera del tablero.' };
  }

  // Pared bloqueando el paso
  if (board.hasWallBetween(ball.x, ball.y, nx, ny)) {
    return { ok: false, error: 'Hay una pared bloqueando ese camino.' };
  }

  // Casilla ocupada por la otra pelota
  const other = playerColor === 'red' ? 'blue' : 'red';
  const ob = board.balls[other];
  if (nx === ob.x && ny === ob.y) {
    return { ok: false, error: 'Esa casilla está ocupada.' };
  }

  return { ok: true, nx, ny };
}

/**
 * Valida si la colocación de una pared es legal.
 * x, y: casilla "origen" de la pared.
 * H: pared horizontal debajo de la fila y  (entre y e y+1)
 * V: pared vertical  a la derecha de columna x (entre x y x+1)
 */
function validateWallPlacement(board, playerColor, x, y, orientation) {
  if (!VALID_ORIENTATIONS.includes(orientation)) {
    return { ok: false, error: 'Orientación inválida.' };
  }

  const s = board.size;

  // Rangos válidos según orientación
  if (orientation === 'H') {
    if (x < 0 || x >= s || y < 0 || y >= s - 1) {
      return { ok: false, error: 'Posición de pared fuera de rango.' };
    }
    if (board.horizontalWalls[y][x] !== null) {
      return { ok: false, error: 'Ya existe una pared ahí.' };
    }
  } else {
    if (x < 0 || x >= s - 1 || y < 0 || y >= s) {
      return { ok: false, error: 'Posición de pared fuera de rango.' };
    }
    if (board.verticalWalls[y][x] !== null) {
      return { ok: false, error: 'Ya existe una pared ahí.' };
    }
  }

  // BFS: verificar que ambos jugadores conservan camino
  if (!validatePathsAfterWall(board, x, y, orientation)) {
    return { ok: false, error: 'Esa pared bloquea completamente el camino de un jugador.' };
  }

  return { ok: true };
}

module.exports = { validateMove, validateWallPlacement };
