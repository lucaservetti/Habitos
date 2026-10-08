// Acciones sobre registros de hábitos (marcar, contar, descansar).
import { setLog, settings } from './store.js';
import { valueOf, isDoneVal, dayStats } from './logic.js';
import { todayKey } from './util.js';
import { confetti } from './ui.js';

export let popId = null;

function after(key, before, id) {
  popId = id;
  setTimeout(() => {
    if (popId === id) popId = null;
  }, 700);
  const now = dayStats(key);
  if (settings().celebrate === false) return;
  if (key === todayKey() && now.total > 0 && now.pct === 1 && (before == null || before < 1)) {
    const k = 'confetti-' + key;
    try {
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch {}
    confetti();
  }
}

export function toggleCheck(hb, key) {
  const before = dayStats(key).pct;
  const v = valueOf(key, hb.id);
  setLog(key, hb.id, isDoneVal(hb, v) ? 0 : 1);
  after(key, before, hb.id);
}

export function setCount(hb, key, value) {
  const before = dayStats(key).pct;
  setLog(key, hb.id, Math.max(0, value) || 0);
  after(key, before, hb.id);
}

export function stepCount(hb, key, dir) {
  const v = Math.max(0, valueOf(key, hb.id));
  const step = Math.max(0.01, Number(hb.step) || 1);
  const nv = Math.round(Math.max(0, v + dir * step) * 100) / 100;
  setCount(hb, key, nv);
}

export function toggleSkip(hb, key) {
  const v = valueOf(key, hb.id);
  setLog(key, hb.id, v === -1 ? 0 : -1);
  popId = hb.id;
  setTimeout(() => {
    if (popId === hb.id) popId = null;
  }, 700);
}
