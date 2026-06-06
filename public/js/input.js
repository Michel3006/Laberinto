'use strict';

/**
 * Gestiona toda la entrada del usuario:
 *  - Toque/click sobre el canvas
 *  - Selector de borde de pared (overlay con N/S/E/W)
 *  - Botones de acción (Mover / Pared)
 */
class InputHandler {
  /**
   * @param {GameCanvas}  gameCanvas
   * @param {GameClient}  gameClient
   */
  constructor(gameCanvas, gameClient) {
    this.gc     = gameCanvas;
    this.client = gameClient;
    this.mode   = 'move'; // 'move' | 'wall'

    this._selectedCell = null; // celda tapeada en modo pared

    // Overlay HTML del selector de borde
    this._selectorEl = document.getElementById('wall-selector');
    this._cancelBtn  = document.getElementById('wall-sel-cancel');
    this._dirBtns    = Array.from(document.querySelectorAll('.wall-dir-btn'));

    this._bindCanvas();
    this._bindWallSelector();
    this._bindActionButtons();
  }

  // ─── Modo actual ─────────────────────────────────────

  setMode(mode) {
    this.mode = mode;
    this._hideWallSelector();
    this._selectedCell = null;
    // Actualizar highlights si cambia a mover
    this._updateMoveHighlights();
  }

  // ─── Canvas events ───────────────────────────────────

  _bindCanvas() {
    const canvas = this.gc.canvas;

    // Preferir touch; fallback a click en desktop
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this._handleTap(t.clientX, t.clientY);
    }, { passive: false });

    canvas.addEventListener('click', e => {
      this._handleTap(e.clientX, e.clientY);
    });
  }

  _handleTap(clientX, clientY) {
    if (!this.client.isMyTurn()) return;
    if (!this.client.gameState) return;

    const rect = this.gc.getCanvasRect();
    const px   = clientX - rect.left;
    const py   = clientY - rect.top;

    // Escalar si el CSS redimensiona el canvas
    const scaleX = this.gc.canvas.width  / rect.width;
    const scaleY = this.gc.canvas.height / rect.height;

    const cell = this.gc.getCellFromPoint(px * scaleX, py * scaleY);
    if (!cell) return;

    if (this.mode === 'move') {
      this._handleMoveClick(cell);
    } else {
      this._handleWallCellClick(cell, clientX, clientY);
    }
  }

  // ─── Lógica de movimiento ────────────────────────────

  _handleMoveClick(cell) {
    const gs    = this.client.gameState;
    const color = this.client.myColor;
    const ball  = gs.balls[color];

    const dx = cell.x - ball.x;
    const dy = cell.y - ball.y;

    let dir = null;
    if (dx === 0 && dy === -1) dir = 'N';
    else if (dx === 0 && dy ===  1) dir = 'S';
    else if (dx === -1 && dy === 0) dir = 'W';
    else if (dx ===  1 && dy === 0) dir = 'E';

    if (dir) this.client.sendMove(dir);
  }

  _updateMoveHighlights() {
    const gs = this.client.gameState;
    if (!gs || this.mode !== 'move') {
      this.gc.highlightMoves = [];
      this.gc.render(gs);
      return;
    }
    const color = this.client.myColor;
    if (!color || gs.currentTurn !== color) {
      this.gc.highlightMoves = [];
      this.gc.render(gs);
      return;
    }

    const ball  = gs.balls[color];
    const other = color === 'red' ? gs.balls.blue : gs.balls.red;
    const size  = gs.size;

    const deltas = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    ];
    const valid = [];

    for (const { dx, dy } of deltas) {
      const nx = ball.x + dx;
      const ny = ball.y + dy;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      // Casilla del oponente
      if (nx === other.x && ny === other.y) continue;
      // Pared
      if (this._hasWallBetween(gs, ball.x, ball.y, nx, ny)) continue;
      valid.push({ x: nx, y: ny });
    }

    this.gc.highlightMoves = valid;
    this.gc.render(gs);
  }

  _hasWallBetween(gs, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx ===  1) return !!gs.verticalWalls[y1][x1];
    if (dx === -1) return !!gs.verticalWalls[y1][x2];
    if (dy ===  1) return !!gs.horizontalWalls[y1][x1];
    if (dy === -1) return !!gs.horizontalWalls[y2][x1];
    return true;
  }

  // ─── Lógica de pared ─────────────────────────────────

  _handleWallCellClick(cell, screenX, screenY) {
    this._selectedCell = cell;
    this._showWallSelector(cell, screenX, screenY);
  }

  _showWallSelector(cell, screenX, screenY) {
    const gs    = this.client.gameState;
    const color = this.client.myColor;
    if (!gs) return;

    // Calcular validez de cada dirección
    const dirs = this._getWallDirValidity(gs, color, cell);

    // Actualizar botones
    for (const btn of this._dirBtns) {
      const dir = btn.dataset.dir;
      const info = dirs[dir];
      btn.classList.toggle('valid',   info && info.ok);
      btn.classList.toggle('invalid', !info || !info.ok);
    }

    // Posicionar overlay sobre la celda tapeada
    const sel = this._selectorEl;
    sel.classList.remove('hidden');

    // Usar coordenadas de pantalla relativas al wrapper del canvas
    const wrap    = this.gc.canvas.parentElement;
    const wrapRect = wrap.getBoundingClientRect();
    const relX = screenX - wrapRect.left;
    const relY = screenY - wrapRect.top;

    sel.style.left = relX + 'px';
    sel.style.top  = relY + 'px';
  }

  _hideWallSelector() {
    this._selectorEl.classList.add('hidden');
    this._selectedCell = null;
  }

  _getWallDirValidity(gs, color, cell) {
    const { x, y } = cell;
    const size = gs.size;
    const hw   = gs.horizontalWalls;
    const vw   = gs.verticalWalls;
    const result = {};

    // Norte de (x,y) → pared H en (x, y-1)
    if (y > 0) {
      result['N'] = { ok: hw[y-1][x] === null, wallX: x, wallY: y-1, orientation: 'H' };
    } else {
      result['N'] = { ok: false };
    }
    // Sur de (x,y) → pared H en (x, y)
    if (y < size - 1) {
      result['S'] = { ok: hw[y][x] === null, wallX: x, wallY: y, orientation: 'H' };
    } else {
      result['S'] = { ok: false };
    }
    // Oeste de (x,y) → pared V en (x-1, y)
    if (x > 0) {
      result['W'] = { ok: vw[y][x-1] === null, wallX: x-1, wallY: y, orientation: 'V' };
    } else {
      result['W'] = { ok: false };
    }
    // Este de (x,y) → pared V en (x, y)
    if (x < size - 1) {
      result['E'] = { ok: vw[y][x] === null, wallX: x, wallY: y, orientation: 'V' };
    } else {
      result['E'] = { ok: false };
    }

    return result;
  }

  // ─── Bindings del selector de pared ──────────────────

  _bindWallSelector() {
    // Botones de dirección
    for (const btn of this._dirBtns) {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('invalid')) return;
        const dir  = btn.dataset.dir;
        const cell = this._selectedCell;
        if (!cell) return;

        const gs     = this.client.gameState;
        const color  = this.client.myColor;
        const dirs   = this._getWallDirValidity(gs, color, cell);
        const info   = dirs[dir];
        if (!info || !info.ok) return;

        this._hideWallSelector();
        this.client.sendWall(info.wallX, info.wallY, info.orientation);
      });

      // Touch también
      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        btn.click();
      }, { passive: false });
    }

    // Cancelar
    this._cancelBtn.addEventListener('click', () => this._hideWallSelector());
    this._cancelBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      this._hideWallSelector();
    }, { passive: false });
  }

  // ─── Botones de acción ───────────────────────────────

  _bindActionButtons() {
    document.getElementById('btn-action-move').addEventListener('click', () => {
      this.setMode('move');
      this._syncActionButtons();
    });

    document.getElementById('btn-action-wall').addEventListener('click', () => {
      this.setMode('wall');
      this._syncActionButtons();
    });
  }

  _syncActionButtons() {
    document.getElementById('btn-action-move').classList.toggle('active', this.mode === 'move');
    document.getElementById('btn-action-wall').classList.toggle('active', this.mode === 'wall');
  }

  // Llamar cada vez que cambia el estado de juego
  onStateUpdate() {
    this._hideWallSelector();
    if (this.mode === 'move') this._updateMoveHighlights();
    else {
      this.gc.highlightMoves = [];
      this.gc.render(this.client.gameState);
    }
    this._syncActionButtons();
  }
}
