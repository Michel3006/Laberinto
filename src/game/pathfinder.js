'use strict';

/**
 * Algoritmo BFS para verificar si existe al menos un camino
 * desde la posición del jugador hasta su fila meta.
 *
 * @param {Board} board - Estado del tablero
 * @param {number} startX - Columna inicial
 * @param {number} startY - Fila inicial
 * @param {number} targetRow - Fila meta a alcanzar
 * @returns {boolean} true si existe camino
 */
function bfsPathExists(board, startX, startY, targetRow) {
  const { size } = board;
  const queue = [{ x: startX, y: startY }];
  const visited = new Set();
  visited.add(`${startX},${startY}`);

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.y === targetRow) return true;

    const neighbors = board.getValidNeighbors(current.x, current.y);
    for (const nb of neighbors) {
      const key = `${nb.x},${nb.y}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(nb);
      }
    }
  }

  return false;
}

/**
 * Verifica que, tras colocar una pared, AMBOS jugadores
 * siguen teniendo al menos un camino a su meta.
 *
 * @param {Board} board - Tablero actual (no modificado)
 * @param {number} wallX - Coordenada x de la pared
 * @param {number} wallY - Coordenada y de la pared
 * @param {string} orientation - 'H' o 'V'
 * @returns {boolean} true si ambos jugadores mantienen camino
 */
function validatePathsAfterWall(board, wallX, wallY, orientation) {
  // Simular colocación clonando el tablero
  const sim = board.clone();
  if (orientation === 'H') sim.horizontalWalls[wallY][wallX] = 'sim';
  if (orientation === 'V') sim.verticalWalls[wallY][wallX]   = 'sim';

  const redGoal  = sim.size - 1; // Rojo va hacia abajo
  const blueGoal = 0;            // Azul va hacia arriba

  const redOk  = bfsPathExists(sim, sim.balls.red.x,  sim.balls.red.y,  redGoal);
  const blueOk = bfsPathExists(sim, sim.balls.blue.x, sim.balls.blue.y, blueGoal);

  return redOk && blueOk;
}

module.exports = { bfsPathExists, validatePathsAfterWall };
