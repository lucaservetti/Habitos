// Componentes de interfaz reutilizables.
import { h, graphemes, hexToHue, hslToHex } from './util.js';
import { icon } from './icons.js';

export const HABIT_COLORS = [
  '#f28b82', '#f6a56f', '#f2c46d', '#b5d86b', '#6fcf97', '#5cc8b8', '#6bb8f2',
  '#7c9cf5', '#a58bf5', '#d58bf5', '#f58bc3', '#e8a0a0', '#9aa5b1', '#8d7b68',
];

export const MOODS = [
  { v: 1, e: '😞', t: 'Mal' },
  { v: 2, e: '😕', t: 'Regular' },
  { v: 3, e: '😐', t: 'Normal' },
  { v: 4, e: '🙂', t: 'Bien' },
  { v: 5, e: '😄', t: 'Genial' },
];

export const ROUTINES = [
  { id: 'am', label: 'Mañana', emoji: '☀️' },
  { id: 'pm', label: 'Tarde', emoji: '🌤️' },
  { id: 'night', label: 'Noche', emoji: '🌙' },
  { id: 'any', label: 'Cualquier momento', emoji: '✨' },
];

const EMOJI_GROUPS = [
  ['Salud y deporte', '💪 🏃 🚶 🧘 🏋️ 🚴 🏊 🤸 🧗 ⚽ 🏀 🎾 🥊 🏓 🏐 🩺 💊 🦷 🛌 😴 🧴 🚿 🪥 🧠 ❤️ 🩹 🚑'],
  ['Comida y bebida', '💧 🥤 🍎 🍌 🍓 🍇 🥗 🥦 🥕 🥑 🍳 🥛 🍵 ☕ 🍞 🥜 🍽️ 🍫 🍬 🍷 🚫 🍕 🍜 🥣'],
  ['Mente y estudio', '📖 📚 ✍️ 📝 🎓 🧩 ♟️ 🎯 💡 🔬 🧪 🗣️ 🌍 🔤 🧮 🎹 🎸 🎨 🎧 🎬 🎤 🎻'],
  ['Trabajo y hogar', '💻 📧 📞 💼 📅 ⏰ 🧹 🧺 🛏️ 🪴 🏡 🔧 🛒 💰 📊 🗂️ 🧾 🔑 🧼 🪣'],
  ['Naturaleza y ocio', '🌿 🌱 🌸 🌞 🌙 ⭐ 🌈 🔥 ⚡ 🌊 🐶 🐱 🦋 🌳 🏞️ ⛰️ 🏖️ 🎮 📷 ✈️ 🚗 🚲 🎣 ⛺'],
  ['Social y bienestar', '💬 👨‍👩‍👧 🤝 🙏 😊 🥰 🎁 🎉 🕯️ 🛁 💆 🧖 📵 🚭 💤 ✨ 🌟 💖 🧡 💜'],
];

// ---------- Interacción: toque / pulsación larga ----------
export function pressable(el, { onTap, onLong, ms = 480 } = {}) {
  let timer = null;
  let long = false;
  let moved = false;
  let sx = 0;
  let sy = 0;
  el.classList.add('pressable');
  el.addEventListener('pointerdown', (e) => {
    long = false;
    moved = false;
    sx = e.clientX;
    sy = e.clientY;
    if (onLong) {
      timer = setTimeout(() => {
        long = true;
        if (navigator.vibrate) navigator.vibrate(12);
        onLong(e);
      }, ms);
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) {
      moved = true;
      clearTimeout(timer);
    }
  });
  const end = () => clearTimeout(timer);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', () => {
    clearTimeout(timer);
    moved = true;
  });
  el.addEventListener('pointerleave', end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (long) {
      long = false;
      e.preventDefault();
      return;
    }
    if (moved) {
      moved = false;
      return;
    }
    if (onTap) onTap(e);
  });
  return el;
}

// Igual que pressable pero con delegación (para cuadrículas con muchas celdas).
export function delegatePress(root, selector, { onTap, onLong, ms = 480 } = {}) {
  let timer = null;
  let long = false;
  let moved = false;
  let sx = 0;
  let sy = 0;
  let target = null;
  root.addEventListener('pointerdown', (e) => {
    const t = e.target.closest(selector);
    clearTimeout(timer);
    long = false;
    moved = false;
    target = t && root.contains(t) ? t : null;
    if (!target) return;
    sx = e.clientX;
    sy = e.clientY;
    if (onLong) {
      timer = setTimeout(() => {
        long = true;
        if (navigator.vibrate) navigator.vibrate(12);
        onLong(target, e);
      }, ms);
    }
  });
  root.addEventListener('pointermove', (e) => {
    if (!target) return;
    if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) {
      moved = true;
      clearTimeout(timer);
    }
  });
  root.addEventListener('pointerup', () => clearTimeout(timer));
  root.addEventListener('pointercancel', () => {
    clearTimeout(timer);
    moved = true;
  });
  root.addEventListener('contextmenu', (e) => {
    if (e.target.closest(selector)) e.preventDefault();
  });
  root.addEventListener('click', (e) => {
    const t = e.target.closest(selector);
    if (!t || !root.contains(t)) return;
    if (long) {
      long = false;
      return;
    }
    if (moved) {
      moved = false;
      return;
    }
    if (onTap) onTap(t, e);
  });
}

// ---------- Hojas inferiores ----------
let zTop = 100;
export function openSheet({ title = '', build, onClose, full = false }) {
  const layer = document.getElementById('layer');
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const body = h('div', { class: 'sheet-body' });
  const titleEl = h('div', { class: 'sheet-title' }, title);
  const closeBtn = h('button', { class: 'icon-btn ghost', 'aria-label': 'Cerrar', onclick: () => api.close() }, icon('x', 20));
  const head = h('div', { class: 'sheet-head' }, h('div', { class: 'grab' }), h('div', { class: 'sheet-bar' }, titleEl, closeBtn));
  const sheet = h('div', { class: 'sheet' + (full ? ' full' : ''), role: 'dialog', 'aria-modal': 'true' }, head, body);
  const wrap = h('div', { class: 'sheet-wrap', style: { zIndex: ++zTop } }, backdrop, sheet);
  layer.appendChild(wrap);
  document.body.classList.add('noscroll');
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));

  let closed = false;
  const api = {
    el: sheet,
    body,
    setTitle: (t) => {
      titleEl.textContent = t;
    },
    get closed() {
      return closed;
    },
    close() {
      if (closed) return;
      closed = true;
      sheet.style.transform = '';
      wrap.classList.remove('open');
      setTimeout(() => {
        wrap.remove();
        if (!layer.querySelector('.sheet-wrap')) document.body.classList.remove('noscroll');
      }, 340);
      if (onClose) onClose();
    },
  };
  backdrop.addEventListener('click', () => api.close());

  let startY = null;
  let dy = 0;
  let dragging = false;
  head.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    dy = 0;
    dragging = false;
  });
  head.addEventListener('pointermove', (e) => {
    if (startY == null) return;
    const d = e.clientY - startY;
    if (!dragging && Math.abs(d) > 8) {
      dragging = true;
      sheet.style.transition = 'none';
      try {
        head.setPointerCapture(e.pointerId);
      } catch {}
    }
    if (dragging) {
      dy = Math.max(0, d);
      sheet.style.transform = `translateY(${dy}px)`;
    }
  });
  const up = () => {
    if (startY == null) return;
    sheet.style.transition = '';
    if (dragging && dy > 110) api.close();
    else sheet.style.transform = '';
    startY = null;
    dragging = false;
    dy = 0;
  };
  head.addEventListener('pointerup', up);
  head.addEventListener('pointercancel', up);

  build(body, api);
  return api;
}

// ---------- Avisos ----------
// action opcional: { label: 'Deshacer', onClick() {} }
export function toast(msg, ms = 2400, action = null) {
  const layer = document.getElementById('layer');
  layer.querySelectorAll('.toast').forEach((x) => x.remove());
  let timer = null;
  const hide = () => {
    clearTimeout(timer);
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  };
  const t = h(
    'div',
    { class: 'toast' + (action ? ' has-action' : ''), role: 'status' },
    h('span', null, msg),
    action
      ? h(
          'button',
          {
            type: 'button',
            class: 'toast-btn',
            onclick: () => {
              hide();
              action.onClick();
            },
          },
          action.label,
        )
      : null,
  );
  layer.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  timer = setTimeout(hide, action ? Math.max(ms, 6000) : ms);
}

export const undoToast = (msg, onUndo) => toast(msg, 6000, { label: 'Deshacer', onClick: onUndo });

// Diálogo con varias opciones. Devuelve el `value` elegido o null si se cancela.
export function choiceDialog({ title, message, options, stacked = false }) {
  return new Promise((resolve) => {
    const layer = document.getElementById('layer');
    let finished = false;
    const done = (v) => {
      if (finished) return;
      finished = true;
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 250);
      resolve(v);
    };
    const wrap = h(
      'div',
      { class: 'dialog-wrap', style: { zIndex: 9000 } },
      h('div', { class: 'sheet-backdrop', onclick: () => done(null) }),
      h(
        'div',
        { class: 'dialog', role: 'alertdialog' },
        h('h3', null, title),
        message ? h('p', null, message) : null,
        h(
          'div',
          { class: 'dialog-actions' + (stacked || options.length > 2 ? ' stacked' : '') },
          options.map((o) => h('button', { type: 'button', class: 'btn ' + (o.cls || 'soft'), onclick: () => done(o.value) }, o.label)),
        ),
      ),
    );
    layer.appendChild(wrap);
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  });
}

export async function confirmDialog({ title, message, confirmText = 'Aceptar', cancelText = 'Cancelar', danger = false }) {
  const v = await choiceDialog({
    title,
    message,
    options: [
      { label: cancelText, value: false, cls: 'soft' },
      { label: confirmText, value: true, cls: danger ? 'danger' : 'primary' },
    ],
  });
  return v === true;
}

// ---------- Controles ----------
export function segmented(options, value, onChange, cls = '') {
  const wrap = h('div', { class: 'segmented ' + cls });
  for (const o of options) {
    wrap.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: o.value === value ? 'on' : '',
          onclick: () => onChange(o.value),
        },
        o.label,
      ),
    );
  }
  return wrap;
}

export function toggle(checked, onChange) {
  const b = h('button', {
    type: 'button',
    class: 'switch' + (checked ? ' on' : ''),
    role: 'switch',
    'aria-checked': checked ? 'true' : 'false',
    onclick: () => onChange(!checked),
  }, h('span', { class: 'knob' }));
  return b;
}

export function stepper(value, { min = 0, max = 999, step = 1, onChange, suffix = '' }) {
  return h(
    'div',
    { class: 'stepper-ctl' },
    h('button', { type: 'button', class: 'icon-btn soft', disabled: value <= min, onclick: () => onChange(Math.max(min, value - step)) }, icon('minus', 18)),
    h('span', { class: 'val' }, `${value}${suffix}`),
    h('button', { type: 'button', class: 'icon-btn soft', disabled: value >= max, onclick: () => onChange(Math.min(max, value + step)) }, icon('plus', 18)),
  );
}

export function field(label, control, hint) {
  return h('div', { class: 'field' }, h('label', { class: 'field-label' }, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
}

export function chips(options, value, onChange, { multi = false } = {}) {
  const wrap = h('div', { class: 'chips' });
  for (const o of options) {
    const on = multi ? value.includes(o.value) : value === o.value;
    wrap.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: 'chip' + (on ? ' on' : ''),
          style: o.color ? { '--c': o.color } : null,
          onclick: () => onChange(o.value),
        },
        o.emoji ? h('span', { class: 'chip-e' }, o.emoji) : null,
        o.label,
      ),
    );
  }
  return wrap;
}

export function colorPicker(value, onChange) {
  const wrap = h('div', { class: 'swatches' });
  for (const c of HABIT_COLORS) {
    wrap.appendChild(
      h('button', {
        type: 'button',
        class: 'swatch' + (c.toLowerCase() === String(value).toLowerCase() ? ' on' : ''),
        style: { background: c },
        'aria-label': c,
        onclick: () => onChange(c),
      }),
    );
  }
  const custom = h('label', { class: 'swatch custom' + (HABIT_COLORS.includes(value) ? '' : ' on'), style: HABIT_COLORS.includes(value) ? null : { background: value } }, h('input', {
    type: 'color',
    value: /^#[0-9a-f]{6}$/i.test(value) ? value : '#a58bf5',
    onchange: (e) => onChange(e.target.value),
  }), '+');
  wrap.appendChild(custom);
  return wrap;
}

export function emojiPicker(value, onPick) {
  const wrap = h('div', { class: 'emoji-picker' });
  const input = h('input', {
    type: 'text',
    class: 'input emoji-input',
    placeholder: 'Escribe o pega cualquier emoji…',
    inputmode: 'text',
    oninput: (e) => {
      const g = graphemes(e.target.value.trim());
      if (g.length) onPick(g[g.length - 1]);
    },
  });
  wrap.appendChild(input);
  for (const [name, list] of EMOJI_GROUPS) {
    wrap.appendChild(h('div', { class: 'emoji-group' }, name));
    const grid = h('div', { class: 'emoji-grid' });
    for (const e of list.split(' ')) {
      grid.appendChild(h('button', { type: 'button', class: 'emoji-btn' + (e === value ? ' on' : ''), onclick: () => onPick(e) }, e));
    }
    wrap.appendChild(grid);
  }
  return wrap;
}

// Selector de matiz para colores personalizados del tema
export function hueSlider(hue, onChange) {
  return h('input', {
    type: 'range',
    class: 'hue-slider',
    min: 0,
    max: 360,
    value: hue,
    oninput: (e) => onChange(Number(e.target.value)),
  });
}
export { hexToHue, hslToHex };

// ---------- Confeti suave ----------
export function confetti() {
  const layer = document.getElementById('layer');
  const colors = ['#f28b82', '#f6a56f', '#f2c46d', '#b5d86b', '#6fcf97', '#6bb8f2', '#a58bf5', '#f58bc3'];
  const box = h('div', { class: 'confetti' });
  for (let i = 0; i < 36; i++) {
    const p = h('i', {
      style: {
        left: Math.random() * 100 + '%',
        background: colors[i % colors.length],
        '--dx': (Math.random() * 120 - 60).toFixed(0) + 'px',
        '--r': (Math.random() * 720 - 360).toFixed(0) + 'deg',
        animationDelay: (Math.random() * 0.35).toFixed(2) + 's',
        animationDuration: (1.4 + Math.random() * 1.0).toFixed(2) + 's',
        width: 6 + Math.random() * 7 + 'px',
        height: 6 + Math.random() * 9 + 'px',
        borderRadius: Math.random() > 0.5 ? '50%' : '3px',
      },
    });
    box.appendChild(p);
  }
  layer.appendChild(box);
  setTimeout(() => box.remove(), 3200);
}

// ---------- Mini hoja para introducir un número ----------
export function numberSheet({ title, value, unit = '', min = 0, max = 99999, onSave }) {
  let v = value;
  openSheet({
    title,
    build(body, api) {
      const input = h('input', { type: 'number', class: 'input big-number', inputmode: 'decimal', value: String(value), min, max });
      input.addEventListener('input', () => {
        v = Number(input.value);
      });
      body.append(
        h('div', { class: 'num-wrap' }, input, unit ? h('span', { class: 'num-unit' }, unit) : null),
        h(
          'div',
          { class: 'row-gap' },
          h('button', { class: 'btn soft grow', onclick: () => api.close() }, 'Cancelar'),
          h(
            'button',
            {
              class: 'btn primary grow',
              onclick: () => {
                if (Number.isFinite(v)) onSave(Math.max(min, Math.min(max, Math.round(v * 100) / 100)));
                api.close();
              },
            },
            'Guardar',
          ),
        ),
      );
      setTimeout(() => input.focus(), 380);
    },
  });
}
