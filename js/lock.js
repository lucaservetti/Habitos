// Bloqueo con PIN (privacidad del diario).
import { h } from './util.js';
import { icon } from './icons.js';
import { settings, updateSettings, resetAll } from './store.js';
import { openSheet, toast, choiceDialog } from './ui.js';
import { signOutSync } from './sync.js';

function fallbackHash(str) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  return 'f' + h1.toString(16) + h2.toString(16);
}

export async function hashPin(pin, salt) {
  const text = `${salt}:${pin}:habitos`;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return fallbackHash(text);
}

function newSalt() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function keypad({ length = 4, onComplete }) {
  let val = '';
  let busy = false;
  const dots = h('div', { class: 'pin-dots' });
  const drawDots = () => dots.replaceChildren(...Array.from({ length }, (_, i) => h('i', { class: i < val.length ? 'on' : '' })));
  const press = (d) => {
    if (busy || val.length >= length) return;
    val += d;
    drawDots();
    if (val.length === length) {
      busy = true;
      setTimeout(async () => {
        await onComplete(val, api);
        busy = false;
      }, 120);
    }
  };
  const del = () => {
    if (busy) return;
    val = val.slice(0, -1);
    drawDots();
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  const grid = h(
    'div',
    { class: 'keypad' },
    keys.map((k) =>
      k === ''
        ? h('span')
        : h(
            'button',
            { type: 'button', class: 'key' + (k === 'del' ? ' del' : ''), 'aria-label': k === 'del' ? 'Borrar' : k, onclick: () => (k === 'del' ? del() : press(k)) },
            k === 'del' ? icon('backspace', 24) : k,
          ),
    ),
  );
  const el = h('div', { class: 'pin-pad' }, dots, grid);
  const onKey = (e) => {
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') del();
  };
  const api = {
    el,
    onKey,
    reset() {
      val = '';
      drawDots();
    },
    shake() {
      val = '';
      drawDots();
      dots.classList.remove('shake');
      void dots.offsetWidth;
      dots.classList.add('shake');
      if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    },
  };
  drawDots();
  return api;
}

let lockEl = null;
let keyHandler = null;

export const isLocked = () => !!lockEl;

export function showLockScreen() {
  const s = settings();
  if (!s.pinHash || lockEl) return;
  const pad = keypad({
    onComplete: async (pin, p) => {
      const cur = settings();
      if ((await hashPin(pin, cur.pinSalt)) === cur.pinHash) unlock();
      else p.shake();
    },
  });
  keyHandler = pad.onKey;
  document.addEventListener('keydown', keyHandler);
  lockEl = h(
    'div',
    { class: 'lock-screen', role: 'dialog', 'aria-label': 'Bloqueado' },
    h('div', { class: 'lock-e' }, '🌿'),
    h('h2', null, s.name ? `Hola, ${s.name}` : 'Hábitos'),
    h('p', { class: 'muted' }, 'Introduce tu PIN'),
    pad.el,
    h('button', { type: 'button', class: 'link-btn', onclick: forgot }, 'Olvidé mi PIN'),
  );
  document.body.appendChild(lockEl);
  document.body.classList.add('noscroll');
}

function unlock() {
  if (!lockEl) return;
  const el = lockEl;
  lockEl = null;
  document.removeEventListener('keydown', keyHandler);
  el.classList.add('out');
  setTimeout(() => {
    el.remove();
    if (!document.querySelector('.sheet-wrap')) document.body.classList.remove('noscroll');
  }, 260);
}

async function forgot() {
  const v = await choiceDialog({
    title: '¿Olvidaste tu PIN?',
    message: 'Por seguridad, para quitar el PIN hay que borrar los datos de este dispositivo (también se cierra la sesión de sincronización). Si tienes sincronización con Google o un respaldo, podrás recuperarlos después.',
    options: [
      { label: 'Borrar datos y quitar PIN', value: 'reset', cls: 'danger' },
      { label: 'Cancelar', value: null, cls: 'soft' },
    ],
  });
  if (v !== 'reset') return;
  await signOutSync();
  resetAll();
  updateSettings({ pinHash: null, pinSalt: null });
  unlock();
  toast('PIN eliminado. Datos del dispositivo borrados.');
}

export function initLock() {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    const s = settings();
    if (!s.pinHash) return;
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      if ((s.lockAfter ?? 1) === 0) showLockScreen();
    } else if (hiddenAt) {
      const mins = s.lockAfter ?? 1;
      if (Date.now() - hiddenAt >= mins * 60000) showLockScreen();
      hiddenAt = 0;
    }
  });
  if (settings().pinHash) showLockScreen();
}

export function pinSetupSheet() {
  openSheet({
    title: 'Crear PIN',
    build(body, api) {
      let first = null;
      const msg = h('p', { class: 'center pin-msg' }, 'Elige un PIN de 4 dígitos');
      const pad = keypad({
        onComplete: async (pin, p) => {
          if (!first) {
            first = pin;
            msg.textContent = 'Repite el PIN para confirmar';
            p.reset();
          } else if (pin === first) {
            const salt = newSalt();
            updateSettings({ pinHash: await hashPin(pin, salt), pinSalt: salt });
            document.removeEventListener('keydown', pad.onKey);
            api.close();
            toast('PIN activado 🔒');
          } else {
            first = null;
            msg.textContent = 'No coinciden. Elige un PIN de 4 dígitos';
            p.shake();
          }
        },
      });
      document.addEventListener('keydown', pad.onKey);
      const prevClose = api.close;
      api.close = () => {
        document.removeEventListener('keydown', pad.onKey);
        prevClose();
      };
      body.append(msg, pad.el, h('p', { class: 'hint center' }, 'Si lo olvidas, tendrás que borrar los datos de este dispositivo (recuperables con la sincronización o un respaldo).'));
    },
  });
}

export function verifyPinSheet(onOk) {
  openSheet({
    title: 'Introduce tu PIN actual',
    build(body, api) {
      const pad = keypad({
        onComplete: async (pin, p) => {
          const s = settings();
          if ((await hashPin(pin, s.pinSalt)) === s.pinHash) {
            document.removeEventListener('keydown', pad.onKey);
            api.close();
            onOk();
          } else p.shake();
        },
      });
      document.addEventListener('keydown', pad.onKey);
      const prevClose = api.close;
      api.close = () => {
        document.removeEventListener('keydown', pad.onKey);
        prevClose();
      };
      body.append(pad.el);
    },
  });
}
