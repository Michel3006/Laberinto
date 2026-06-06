'use strict';

class UIManager {
  constructor() {
    this._timerInterval = null;
    this._timerStart    = null;
    this._timerDuration = 60000;
    this._disconnectTimer = null;
    this._toastTimeout    = null;
  }

  // ─── Pantallas ───────────────────────────────────────

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  // ─── Lobby ───────────────────────────────────────────

  showLobby(roomId) {
    document.getElementById('lobby-code').textContent = roomId;
    this.showScreen('screen-lobby');
  }

  // ─── HUD de juego ────────────────────────────────────

  updateGameHUD(gameState, myColor, names) {
    if (!gameState) return;

    const { currentTurn, wallsLeft, balls } = gameState;
    const isMyTurn = currentTurn === myColor;

    // Indicador de turno
    const badge = document.getElementById('turn-indicator');
    badge.textContent = currentTurn === 'red' ? '— ROJO —' : '— AZUL —';
    badge.className   = 'turn-badge ' + (currentTurn === 'red' ? 'is-red' : 'is-blue');

    // Nombres
    if (names) {
      document.getElementById('name-red').textContent  = names.red  || 'Rojo';
      document.getElementById('name-blue').textContent = names.blue || 'Azul';
    }

    const btnMove = document.getElementById('btn-action-move');
    const btnWall = document.getElementById('btn-action-wall');
    btnMove.disabled = !isMyTurn;
    btnWall.disabled = !isMyTurn;
  }

  // ─── Timer de turno ──────────────────────────────────

  startTimer(durationMs = 60000) {
    this._timerDuration = durationMs;
    this._timerStart    = Date.now();
    this._clearTimer();

    const bar = document.getElementById('timer-bar');
    bar.style.transition = 'none';
    bar.style.width      = '100%';
    bar.style.background = '#FFD60A';

    // Forzar reflow para reiniciar la transición
    bar.getBoundingClientRect();

    this._timerInterval = setInterval(() => {
      const elapsed  = Date.now() - this._timerStart;
      const progress = Math.max(0, 1 - elapsed / this._timerDuration);
      bar.style.transition = 'none';
      bar.style.width      = (progress * 100) + '%';

      if (progress < 0.3)       bar.style.background = '#FF453A';
      else if (progress < 0.6)  bar.style.background = '#FF9F0A';
      else                      bar.style.background = '#FFD60A';

      if (progress === 0) this._clearTimer();
    }, 200);
  }

  _clearTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  }

  stopTimer() {
    this._clearTimer();
    const bar = document.getElementById('timer-bar');
    bar.style.width = '100%';
    bar.style.background = '#FFD60A';
  }

  // ─── Toast / mensaje ─────────────────────────────────

  showToast(text, type = 'info', duration = 2800) {
    if (this._toastTimeout) {
      clearTimeout(this._toastTimeout);
      this._toastTimeout = null;
    }
    const el = document.getElementById('game-message');
    el.textContent = text;
    el.className   = `game-message ${type}`;
    this._toastTimeout = setTimeout(() => {
      el.classList.add('hidden');
    }, duration);
  }

  hideToast() {
    const el = document.getElementById('game-message');
    el.classList.add('hidden');
  }

  // ─── Banner desconexión ──────────────────────────────

  showDisconnectBanner(reconnectWindowMs) {
    const banner = document.getElementById('disconnect-banner');
    const cd     = document.getElementById('disconnect-countdown');
    banner.classList.remove('hidden');

    let remaining = Math.ceil(reconnectWindowMs / 1000);
    cd.textContent = `(${remaining}s)`;

    if (this._disconnectTimer) clearInterval(this._disconnectTimer);
    this._disconnectTimer = setInterval(() => {
      remaining--;
      cd.textContent = `(${remaining}s)`;
      if (remaining <= 0) this.hideDisconnectBanner();
    }, 1000);
  }

  hideDisconnectBanner() {
    document.getElementById('disconnect-banner').classList.add('hidden');
    if (this._disconnectTimer) {
      clearInterval(this._disconnectTimer);
      this._disconnectTimer = null;
    }
  }

  // ─── Pantalla de resultado ───────────────────────────

  showResult({ isWinner, isDraw, winnerColor, reason, moveCount }) {
    const anim    = document.getElementById('result-animation');
    const title   = document.getElementById('result-title');
    const sub     = document.getElementById('result-sub');
    const moves   = document.getElementById('stat-moves');

    moves.textContent = moveCount ?? '—';

    if (isDraw) {
      anim.className  = 'result-anim draw';
      anim.textContent = '🤝';
      title.textContent = 'Empate';
      title.style.color = '#FFD60A';
      sub.textContent   = 'Se agotó el tiempo.';
    } else if (isWinner) {
      anim.className  = 'result-anim win';
      anim.textContent = '🏆';
      title.textContent = '¡Victoria!';
      title.style.color = winnerColor === 'red' ? '#FF4060' : '#4080FF';
      sub.textContent   = reason === 'forfeit'
        ? 'Tu oponente abandonó la partida.'
        : 'Cruzaste la línea de meta primero.';
    } else {
      anim.className  = 'result-anim lose';
      anim.textContent = '💀';
      title.textContent = 'Derrota';
      title.style.color = '#FF453A';
      sub.textContent   = reason === 'forfeit'
        ? 'Fuiste desconectado y se te contó como abandono.'
        : 'Tu rival llegó antes.';
    }

    this.showScreen('screen-result');
  }

  // ─── Código de sala ──────────────────────────────────

  async copyRoomCode(code) {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // fallback
      const el = document.createElement('input');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    const fb = document.getElementById('copy-feedback');
    fb.classList.remove('hidden');
    setTimeout(() => fb.classList.add('hidden'), 2000);
  }

  // ─── Modal utils ────────────────────────────────────

  openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
  closeModal(id) { document.getElementById(id).classList.add('hidden'); }
}
