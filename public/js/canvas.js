/* global */
'use strict';

class GameCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');

    this.boardSize  = 9;
    this.cellSize   = 0;
    this.offsetX    = 0;
    this.offsetY    = 0;

    // Casillas resaltadas para preview de movimiento
    this.highlightMoves = []; // [{x,y}]
    // Pared en preview (al pasar el dedo)
    this.previewWall = null;  // {x, y, orientation}

    this.colors = {
      bg:        '#0D1526',
      cell:      '#111827',
      gridLine:  '#1E2D42',
      red:       '#FF4060',
      redDim:    'rgba(255,64,96,0.22)',
      redGlow:   'rgba(255,64,96,0.5)',
      blue:      '#4080FF',
      blueDim:   'rgba(64,128,255,0.22)',
      blueGlow:  'rgba(64,128,255,0.5)',
      wallRed:   '#FF4060',
      wallBlue:  '#4080FF',
      wallNeutral:'#8896B3',
      moveOk:    'rgba(48,209,88,0.35)',
      moveBorder:'#30D158',
      goalRed:   'rgba(255,64,96,0.12)',
      goalBlue:  'rgba(64,128,255,0.12)',
      gold:      '#FFD60A',
    };

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ─── Dimensiones responsivas ──────────────────────────

  resize() {
    const wrap = this.canvas.parentElement;
    const ww   = wrap.clientWidth  - 16;
    const wh   = wrap.clientHeight - 16;
    const size = Math.floor(Math.min(ww, wh, 540));

    this.canvas.width  = size;
    this.canvas.height = size;

    const padding  = Math.floor(size * 0.04);
    const total    = size - padding * 2;
    this.cellSize  = Math.floor(total / this.boardSize);
    this.offsetX   = Math.floor((size - this.cellSize * this.boardSize) / 2);
    this.offsetY   = Math.floor((size - this.cellSize * this.boardSize) / 2);
  }

  // ─── Render principal ────────────────────────────────

  render(gameState) {
    if (!gameState) return;
    this.boardSize = gameState.size || 9;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Fondo
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this._drawGoalZones();
    this._drawGrid();
    this._drawHighlights();
    this._drawWalls(gameState.horizontalWalls, gameState.verticalWalls);
    this._drawPreviewWall();
    this._drawBalls(gameState.balls);
  }

  // ─── Zonas meta ──────────────────────────────────────

  _drawGoalZones() {
    const { ctx, offsetX, offsetY, cellSize, boardSize, colors } = this;
    const w = cellSize * boardSize;

    // Meta azul: fila superior (y=0)
    const grad1 = ctx.createLinearGradient(0, offsetY, 0, offsetY + cellSize * 1.5);
    grad1.addColorStop(0, colors.blueDim);
    grad1.addColorStop(1, 'transparent');
    ctx.fillStyle = grad1;
    ctx.fillRect(offsetX, offsetY, w, cellSize * 1.5);

    // Meta roja: fila inferior (y=boardSize-1)
    const grad2 = ctx.createLinearGradient(0, offsetY + (boardSize-1)*cellSize + cellSize, 0, offsetY + (boardSize-1.5)*cellSize);
    grad2.addColorStop(0, colors.redDim);
    grad2.addColorStop(1, 'transparent');
    ctx.fillStyle = grad2;
    ctx.fillRect(offsetX, offsetY + (boardSize - 1.5) * cellSize, w, cellSize * 1.5);

    // Etiquetas de meta
    ctx.font      = `bold ${Math.floor(cellSize * 0.28)}px 'Space Mono', monospace`;
    ctx.fillStyle = colors.blue;
    ctx.textAlign = 'right';
    ctx.fillText('META ▲', offsetX + w - 4, offsetY + cellSize * 0.4);

    ctx.fillStyle = colors.red;
    ctx.textAlign = 'right';
    ctx.fillText('META ▼', offsetX + w - 4, offsetY + (boardSize - 1) * cellSize + cellSize * 0.8);
  }

  // ─── Cuadrícula ──────────────────────────────────────

  _drawGrid() {
    const { ctx, offsetX, offsetY, cellSize, boardSize, colors } = this;

    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        const px = offsetX + col * cellSize;
        const py = offsetY + row * cellSize;

        // Fondo de casilla
        ctx.fillStyle = colors.cell;
        ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);

        // Borde
        ctx.strokeStyle = colors.gridLine;
        ctx.lineWidth   = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, cellSize, cellSize);
      }
    }
  }

  // ─── Highlights de movimiento válido ─────────────────

  _drawHighlights() {
    if (!this.highlightMoves.length) return;
    const { ctx, offsetX, offsetY, cellSize, colors } = this;

    for (const { x, y } of this.highlightMoves) {
      const px = offsetX + x * cellSize;
      const py = offsetY + y * cellSize;
      const r  = Math.floor(cellSize * 0.3);
      const cx = px + cellSize / 2;
      const cy = py + cellSize / 2;

      // Fondo
      ctx.fillStyle = colors.moveOk;
      ctx.beginPath();
      ctx.roundRect(px + 4, py + 4, cellSize - 8, cellSize - 8, 6);
      ctx.fill();

      // Círculo borde
      ctx.strokeStyle = colors.moveBorder;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ─── Paredes ─────────────────────────────────────────

  _drawWalls(hWalls, vWalls) {
    if (!hWalls || !vWalls) return;
    const { ctx, offsetX, offsetY, cellSize, boardSize, colors } = this;
    const thick = Math.max(4, Math.floor(cellSize * 0.1));

    // Paredes horizontales: entre fila y e y+1
    for (let y = 0; y < boardSize - 1; y++) {
      for (let x = 0; x < boardSize; x++) {
        const color = hWalls[y][x];
        if (!color) continue;
        const wx = offsetX + x * cellSize;
        const wy = offsetY + (y + 1) * cellSize - thick / 2;
        this._drawWallSegment(wx, wy, cellSize, thick,
          color === 'red' ? colors.wallRed : colors.wallBlue, color);
      }
    }

    // Paredes verticales: entre columna x e x+1
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize - 1; x++) {
        const color = vWalls[y][x];
        if (!color) continue;
        const wx = offsetX + (x + 1) * cellSize - thick / 2;
        const wy = offsetY + y * cellSize;
        this._drawWallSegment(wx, wy, thick, cellSize,
          color === 'red' ? colors.wallRed : colors.wallBlue, color);
      }
    }
  }

  _drawWallSegment(x, y, w, h, color, playerColor) {
    const ctx = this.ctx;
    // Sombra / glow
    ctx.shadowColor  = color;
    ctx.shadowBlur   = 8;
    ctx.fillStyle    = color;
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur   = 0;

    // Brillo interior
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 1, y + 1, w - 2, Math.min(2, h - 2));
  }

  // ─── Preview de pared ────────────────────────────────

  _drawPreviewWall() {
    if (!this.previewWall) return;
    const { x, y, orientation, valid } = this.previewWall;
    const { ctx, offsetX, offsetY, cellSize } = this;
    const thick = Math.max(4, Math.floor(cellSize * 0.1));

    ctx.fillStyle = valid
      ? 'rgba(255,214,10,0.7)'
      : 'rgba(255,64,96,0.5)';
    ctx.shadowColor = valid ? '#FFD60A' : '#FF4060';
    ctx.shadowBlur  = 10;

    if (orientation === 'H') {
      ctx.fillRect(
        offsetX + x * cellSize,
        offsetY + (y + 1) * cellSize - thick / 2,
        cellSize, thick
      );
    } else {
      ctx.fillRect(
        offsetX + (x + 1) * cellSize - thick / 2,
        offsetY + y * cellSize,
        thick, cellSize
      );
    }
    ctx.shadowBlur = 0;
  }

  // ─── Pelotas ─────────────────────────────────────────

  _drawBalls(balls) {
    if (!balls) return;
    this._drawBall(balls.red.x,  balls.red.y,  this.colors.red,  this.colors.redGlow);
    this._drawBall(balls.blue.x, balls.blue.y, this.colors.blue, this.colors.blueGlow);
  }

  _drawBall(x, y, color, glow) {
    const { ctx, offsetX, offsetY, cellSize } = this;
    const cx = offsetX + x * cellSize + cellSize / 2;
    const cy = offsetY + y * cellSize + cellSize / 2;
    const r  = cellSize * 0.34;

    // Glow exterior
    ctx.shadowColor = glow;
    ctx.shadowBlur  = 18;

    // Sombra base
    const grad = ctx.createRadialGradient(cx - r*0.3, cy - r*0.3, r*0.1, cx, cy, r);
    grad.addColorStop(0, this._lighten(color, 60));
    grad.addColorStop(0.6, color);
    grad.addColorStop(1, this._darken(color, 40));

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Reflejo
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.25, cy - r * 0.25, r * 0.28, r * 0.18, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─── Coord utils ─────────────────────────────────────

  /**
   * Convierte coordenadas de pantalla (px, py) a celda del tablero.
   * Devuelve {x, y} o null si está fuera del tablero.
   */
  getCellFromPoint(px, py) {
    const x = Math.floor((px - this.offsetX) / this.cellSize);
    const y = Math.floor((py - this.offsetY) / this.cellSize);
    if (x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize) {
      return { x, y };
    }
    return null;
  }

  /**
   * Devuelve las coordenadas de pantalla del centro de una celda.
   */
  getCellCenter(cx, cy) {
    return {
      px: this.offsetX + cx * this.cellSize + this.cellSize / 2,
      py: this.offsetY + cy * this.cellSize + this.cellSize / 2,
    };
  }

  /**
   * Posición del canvas en la pantalla (para mapear touch/click).
   */
  getCanvasRect() {
    return this.canvas.getBoundingClientRect();
  }

  // ─── Color helpers ───────────────────────────────────

  _lighten(hex, amount) {
    return this._adjustColor(hex, amount);
  }
  _darken(hex, amount) {
    return this._adjustColor(hex, -amount);
  }
  _adjustColor(hex, amount) {
    const r = Math.max(0, Math.min(255, parseInt(hex.slice(1,3),16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.slice(3,5),16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.slice(5,7),16) + amount));
    return `rgb(${r},${g},${b})`;
  }
}
