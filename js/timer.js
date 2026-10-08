// Temporizador para hábitos de tiempo. Guarda la hora de fin (no un contador), así que sigue siendo
// correcto aunque la app pase a segundo plano o se cierre y se vuelva a abrir.
import { h, svg, todayKey, rgba } from './util.js';
import { icon } from './icons.js';
import { getHabit } from './store.js';
import { valueOf, isDoneVal } from './logic.js';
import { toggleCheck, setCount } from './actions.js';
import { toast, confirmDialog } from './ui.js';
import { bus } from './bus.js';

const KEY = 'habitos-timer';
const MIN = 60000;
let t = null; // { habitId, key, total, endAt, remaining, paused }
let tickId = null;
let overlay = null;
let pill = null;
let wake = null;
let audio = null;

function save() {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {}
}
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}
const remainingMs = () => (t.paused ? t.remaining : Math.max(0, t.endAt - Date.now()));
const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const activeTimerHabitId = () => (t ? t.habitId : null);

// ---------- Sonido y pantalla ----------
function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === 'suspended') audio.resume();
    const src = audio.createBufferSource();
    src.buffer = audio.createBuffer(1, 1, 22050);
    src.connect(audio.destination);
    src.start(0);
  } catch {}
}

function chime() {
  try {
    if (!audio) return;
    if (audio.state === 'suspended') audio.resume();
    const now = audio.currentTime;
    [
      [880, 0],
      [1318.5, 0.32],
      [1760, 0.64],
    ].forEach(([freq, d]) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + d);
      g.gain.exponentialRampToValueAtTime(0.22, now + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 1.6);
      o.connect(g);
      g.connect(audio.destination);
      o.start(now + d);
      o.stop(now + d + 1.7);
    });
  } catch {}
}

async function keepAwake(on) {
  try {
    if (on && !wake && navigator.wakeLock && document.visibilityState === 'visible') {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => {
        wake = null;
      });
    } else if (!on && wake) {
      const w = wake;
      wake = null;
      await w.release();
    }
  } catch {
    wake = null;
  }
}

// ---------- Ciclo ----------
function startTicking() {
  stopTicking();
  tickId = setInterval(tick, 250);
  tick();
}
function stopTicking() {
  clearInterval(tickId);
  tickId = null;
}
function tick() {
  if (!t) {
    stopTicking();
    return;
  }
  const rem = remainingMs();
  if (overlay) overlay.update(rem);
  if (pill) pill.update(rem);
  if (!t.paused && rem <= 0) finish({ live: true });
}

function markDone(hb, key, elapsedMs) {
  const v = Math.max(0, valueOf(key, hb.id));
  if (hb.type === 'count') {
    const minutes = Math.max(1, Math.round(elapsedMs / MIN));
    const add = /^min/i.test((hb.unit || '').trim()) ? minutes : Number(hb.step) || 1;
    setCount(hb, key, Math.round((v + add) * 100) / 100);
  } else if (!isDoneVal(hb, v)) {
    toggleCheck(hb, key);
  }
}

function finish({ live, early = false }) {
  if (!t) return;
  const done = t;
  const elapsed = done.total - (early ? remainingMs() : 0);
  t = null;
  save();
  stopTicking();
  keepAwake(false);
  removePill();
  const hb = getHabit(done.habitId);
  if (live && !early) {
    chime();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  if (hb) markDone(hb, done.key, elapsed);
  if (overlay) overlay.showDone(hb);
  else if (hb) toast(`⏱️ ${hb.emoji} ${hb.name}: ¡completado! ✓`, 3500);
}

function adjust(deltaMs) {
  if (!t) return;
  if (t.paused) t.remaining = Math.max(0, t.remaining + deltaMs);
  else t.endAt = Math.max(Date.now(), t.endAt + deltaMs);
  t.total = Math.max(MIN, t.total + deltaMs);
  save();
  tick();
}

function togglePause() {
  unlockAudio();
  if (!t) return;
  if (t.paused) {
    t.endAt = Date.now() + t.remaining;
    t.paused = false;
    keepAwake(true);
  } else {
    t.remaining = remainingMs();
    t.paused = true;
    keepAwake(false);
  }
  save();
  if (overlay) overlay.refresh();
  tick();
}

async function cancel() {
  if (!t) {
    closeOverlay();
    return;
  }
  const ok = await confirmDialog({ title: '¿Cancelar el temporizador?', message: 'El hábito no se marcará como hecho.', confirmText: 'Cancelar temporizador', cancelText: 'Seguir', danger: true });
  if (!ok) return;
  t = null;
  save();
  stopTicking();
  keepAwake(false);
  removePill();
  closeOverlay();
  bus.render();
}

// ---------- Pantalla del temporizador ----------
function closeOverlay() {
  if (!overlay) return;
  const el = overlay.el;
  document.removeEventListener('keydown', overlay.onKey);
  overlay = null;
  el.classList.remove('open');
  setTimeout(() => {
    el.remove();
    if (!document.querySelector('.sheet-wrap')) document.body.classList.remove('noscroll');
  }, 300);
}

function minimize() {
  closeOverlay();
  keepAwake(false);
  if (t) showPill();
}

function openOverlay() {
  if (overlay || !t) return;
  const hb = getHabit(t.habitId);
  if (!hb) return;
  removePill();

  const SIZE = 260;
  const STROKE = 12;
  const r = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * r;
  const fg = svg('circle', {
    cx: SIZE / 2,
    cy: SIZE / 2,
    r,
    fill: 'none',
    stroke: hb.color,
    'stroke-width': STROKE,
    'stroke-linecap': 'round',
    'stroke-dasharray': C,
    'stroke-dashoffset': C,
    transform: `rotate(-90 ${SIZE / 2} ${SIZE / 2})`,
    class: 'tm-fg',
  });
  const ringSvg = svg(
    'svg',
    { viewBox: `0 0 ${SIZE} ${SIZE}`, width: SIZE, height: SIZE, class: 'tm-svg' },
    svg('circle', { cx: SIZE / 2, cy: SIZE / 2, r, fill: 'none', stroke: rgba(hb.color, 0.18), 'stroke-width': STROKE }),
    fg,
  );
  const timeEl = h('div', { class: 'tm-time' });
  const stateEl = h('div', { class: 'tm-state' });
  const pauseBtn = h('button', { type: 'button', class: 'tm-main', onclick: togglePause });
  const center = h(
    'div',
    { class: 'tm-center' },
    h('div', { class: 'tm-breath' }),
    h('div', { class: 'tm-ring' }, ringSvg, h('div', { class: 'tm-inner' }, h('div', { class: 'tm-emoji' }, hb.emoji), timeEl, stateEl)),
  );
  const controls = h(
    'div',
    { class: 'tm-controls' },
    h('button', { type: 'button', class: 'tm-side', onclick: () => adjust(-MIN), 'aria-label': 'Restar un minuto' }, '−1 min'),
    pauseBtn,
    h('button', { type: 'button', class: 'tm-side', onclick: () => adjust(MIN), 'aria-label': 'Sumar un minuto' }, '+1 min'),
  );
  const footer = h('button', { type: 'button', class: 'btn soft tm-finish', onclick: () => finish({ live: true, early: true }) }, icon('check', 18, 2.6), 'Ya terminé');
  const el = h(
    'div',
    { class: 'timer-screen', role: 'dialog', 'aria-label': 'Temporizador', style: { '--c': hb.color, '--c-soft': rgba(hb.color, 0.16), '--c-mid': rgba(hb.color, 0.32) } },
    h(
      'div',
      { class: 'tm-top' },
      h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': 'Minimizar', onclick: minimize }, icon('down', 24)),
      h('div', { class: 'tm-title' }, hb.name),
      h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': 'Cancelar temporizador', onclick: cancel }, icon('x', 22)),
    ),
    center,
    controls,
    footer,
  );

  const refresh = () => {
    if (!t) return;
    pauseBtn.replaceChildren(icon(t.paused ? 'play' : 'pause', 30, 0));
    pauseBtn.setAttribute('aria-label', t.paused ? 'Reanudar' : 'Pausar');
    pauseBtn.querySelector('svg').setAttribute('fill', 'currentColor');
    el.classList.toggle('paused', t.paused);
    stateEl.textContent = t.paused ? 'En pausa' : hb.why ? hb.why : 'Respira y disfruta ✨';
  };
  const onKey = (e) => {
    if (e.key === 'Escape') minimize();
    else if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      togglePause();
    }
  };
  document.addEventListener('keydown', onKey);

  overlay = {
    el,
    onKey,
    refresh,
    update(rem) {
      if (!t) return;
      timeEl.textContent = fmt(rem);
      const p = Math.min(1, Math.max(0, 1 - rem / t.total));
      fg.setAttribute('stroke-dashoffset', String(C * (1 - p)));
    },
    showDone(doneHb) {
      el.classList.add('finished');
      center.replaceChildren(
        h('div', { class: 'tm-done' }, h('div', { class: 'tm-done-check' }, icon('check', 64, 3)), h('div', { class: 'tm-done-t' }, '¡Listo!'), h('div', { class: 'tm-done-s' }, doneHb ? `${doneHb.emoji} ${doneHb.name} quedó completado` : 'Temporizador terminado')),
      );
      controls.replaceChildren();
      footer.replaceChildren('Cerrar');
      footer.onclick = closeOverlay;
      footer.className = 'btn primary tm-finish';
    },
  };
  document.body.appendChild(el);
  document.body.classList.add('noscroll');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  refresh();
  tick();
  if (!t.paused) keepAwake(true);
}

// ---------- Píldora flotante (temporizador minimizado) ----------
function showPill() {
  if (pill || !t) return;
  const hb = getHabit(t.habitId);
  if (!hb) return;
  const txt = h('span', { class: 'tp-time' });
  const el = h('button', { type: 'button', class: 'timer-pill', style: { '--c': hb.color }, onclick: openOverlay, 'aria-label': 'Abrir temporizador' }, h('span', null, hb.emoji), txt);
  document.body.appendChild(el);
  pill = {
    el,
    update(rem) {
      txt.textContent = (t && t.paused ? '⏸ ' : '') + fmt(rem);
    },
  };
  tick();
}
function removePill() {
  if (!pill) return;
  pill.el.remove();
  pill = null;
}

// ---------- API ----------
export async function startTimer(hb, key = todayKey()) {
  unlockAudio();
  if (t) {
    if (t.habitId === hb.id && t.key === key) {
      openOverlay();
      return;
    }
    const other = getHabit(t.habitId);
    const ok = await confirmDialog({
      title: 'Ya hay un temporizador en curso',
      message: other ? `Tienes uno activo para ${other.emoji} ${other.name}. ¿Quieres reemplazarlo?` : '¿Quieres reemplazarlo?',
      confirmText: 'Reemplazar',
    });
    if (!ok) return;
    closeOverlay();
    removePill();
  }
  const total = Math.max(1, Number(hb.timer) || 10) * MIN;
  t = { habitId: hb.id, key, total, endAt: Date.now() + total, remaining: total, paused: false };
  save();
  startTicking();
  openOverlay();
  bus.render();
}

export function openRunningTimer() {
  if (t) openOverlay();
}

export function initTimer() {
  const saved = load();
  if (saved && saved.habitId && getHabit(saved.habitId)) {
    t = saved;
    if (!t.paused && remainingMs() <= 0) {
      const hb = getHabit(t.habitId);
      finish({ live: false });
      if (hb) setTimeout(() => toast(`⏱️ Terminaste ${hb.emoji} ${hb.name} mientras la app estaba cerrada ✓`, 4500), 600);
    } else {
      startTicking();
      showPill();
    }
  } else if (saved) {
    t = null;
    save();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !t) return;
    tick();
    if (overlay && t && !t.paused) keepAwake(true);
  });
}
