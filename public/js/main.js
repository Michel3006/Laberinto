'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const client = new GameClient();

  // ── Helpers ──────────────────────────────────────────

  function getPlayerName() {
    const raw = document.getElementById('input-name').value.trim();
    return raw.substring(0, 20) || 'Jugador';
  }

  function isValidRoomCode(code) {
    return typeof code === 'string' && /^[A-Z0-9]{4,8}$/.test(code.toUpperCase());
  }

  // ── Menú principal ───────────────────────────────────

  document.getElementById('btn-create').addEventListener('click', () => {
    const name = getPlayerName();
    client.socket.createRoom(name);
  });

  document.getElementById('btn-open-join').addEventListener('click', () => {
    client.ui.openModal('modal-join');
    setTimeout(() => document.getElementById('input-room-code').focus(), 100);
  });

  document.getElementById('btn-rules').addEventListener('click', () => {
    client.ui.openModal('modal-rules');
  });

  // ── Modal: Unirse ────────────────────────────────────

  document.getElementById('btn-join-confirm').addEventListener('click', () => {
    const raw  = document.getElementById('input-room-code').value.trim().toUpperCase();
    if (!isValidRoomCode(raw)) {
      client.ui.showToast('Código inválido. Debe tener 4-8 caracteres.', 'error', 2500);
      return;
    }
    const name = getPlayerName();
    client.socket.joinRoom(raw, name);
    client.ui.closeModal('modal-join');
  });

  document.getElementById('btn-join-cancel').addEventListener('click', () => {
    client.ui.closeModal('modal-join');
  });

  // Confirmar con Enter en el input de código
  document.getElementById('input-room-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-join-confirm').click();
  });

  // Uppercase automático al escribir el código
  document.getElementById('input-room-code').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase();
  });

  // ── Modal: Reglas ─────────────────────────────────────

  document.getElementById('btn-rules-close').addEventListener('click', () => {
    client.ui.closeModal('modal-rules');
  });

  // Cerrar modales al click fuera del box
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });

  // ── Lobby ─────────────────────────────────────────────

  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = document.getElementById('lobby-code').textContent;
    client.ui.copyRoomCode(code);
  });

  document.getElementById('btn-lobby-back').addEventListener('click', () => {
    // Notificar al servidor que abandonamos la sala antes de volver al menú
    client.socket.leaveRoom();
    client.socket._clearReconnectData();
    client.ui.showScreen('screen-menu');
    client.roomId  = null;
    client.myColor = null;
  });

  // ── Resultado ─────────────────────────────────────────

  document.getElementById('btn-rematch').addEventListener('click', () => {
    client.socket.requestRematch();
  });

  document.getElementById('btn-back-menu').addEventListener('click', () => {
    client.ui.showScreen('screen-menu');
    client.gameState = null;
    client.roomId    = null;
    client.myColor   = null;
    client.names     = { red: 'Rojo', blue: 'Azul' };
    client.canvas.highlightMoves = [];
  });

  // ── Orientación / resize ──────────────────────────────

  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      client.canvas.resize();
      if (client.gameState) {
        client.canvas.render(client.gameState);
        client.input.onStateUpdate();
      }
    }, 200);
  });

  // ── Exponer globalmente para debugging en desarrollo ──
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window._client = client;
  }
});
