'use strict';

const BOARD_SIZE = 9;
const WALLS_PER_PLAYER = Infinity;
const MAX_ROOMS = parseInt(process.env.MAX_ROOMS) || 100;
const MAX_PLAYERS_PER_IP = parseInt(process.env.MAX_PLAYERS_PER_IP) || 5;
const TURN_TIMEOUT_MS = parseInt(process.env.TURN_TIMEOUT_MS) || 60000;
const INACTIVE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 minutos
const FINISHED_GAME_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos tras finalizar
const MAX_MOVE_HISTORY = 500;
const RECONNECT_TIMEOUT_MS = 2 * 60 * 1000;   // 2 minutos para reconectar
const VALID_DIRECTIONS = ['N', 'S', 'E', 'W'];
const VALID_ORIENTATIONS = ['H', 'V'];
const MAX_NAME_LENGTH = 20;
const ROOM_CODE_LENGTH = 6;

module.exports = {
  BOARD_SIZE,
  WALLS_PER_PLAYER,
  MAX_ROOMS,
  MAX_PLAYERS_PER_IP,
  TURN_TIMEOUT_MS,
  INACTIVE_TIMEOUT_MS,
  FINISHED_GAME_TIMEOUT_MS,
  MAX_MOVE_HISTORY,
  RECONNECT_TIMEOUT_MS,
  VALID_DIRECTIONS,
  VALID_ORIENTATIONS,
  MAX_NAME_LENGTH,
  ROOM_CODE_LENGTH,
};
