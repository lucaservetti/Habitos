// Estado de la app + persistencia local (IndexedDB y localStorage como doble respaldo).
import { uid, todayKey } from './util.js';

const DB_NAME = 'habitos';
const STORE = 'kv';
const KEY = 'state';
const LS_KEY = 'habitos-state-v1';

const defaultSettings = () => ({
  name: '',
  theme: 'lavanda',
  customHue: null,
  mode: 'auto',
  weekStart: 1,
  onboarded: false,
  pinHash: null,
  pinSalt: null,
  lockAfter: 1,
  celebrate: true,
  updatedAt: 0,
});

const habitDefaults = () => ({
  id: '',
  name: '',
  emoji: '✨',
  color: '#a58bf5',
  categoryId: null,
  type: 'check', // 'check' | 'count'
  target: 1,
  step: 1,
  unit: '',
  avoid: false,
  savePerDay: 0,
  timer: 0, // minutos; 0 = sin temporizador
  routine: 'any', // 'am' | 'pm' | 'night' | 'any'
  schedule: { type: 'daily', days: [1, 2, 3, 4, 5, 6, 0], times: 3, every: 2 },
  reminder: { on: false, time: '09:00' },
  startDate: todayKey(),
  archivedAt: null,
  pauses: [],
  order: 0,
  why: '',
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

const emptyState = () => ({
  v: 1,
  settings: defaultSettings(),
  categories: [],
  habits: [],
  days: {},
  updatedAt: 0,
});

let state = emptyState();
let version = 0;
const uiListeners = new Set();
const syncListeners = new Set();
let notifyQueued = false;
let saveTimer = null;

// ---------- Persistencia ----------
let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      res(db);
    };
    r.onerror = () => {
      dbPromise = null;
      rej(r.error);
    };
  });
  return dbPromise;
}
async function idbGet(key) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const q = db.transaction(STORE).objectStore(STORE).get(key);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function idbSet(key, val) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

function saveNow() {
  saveTimer = null;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {}
  try {
    idbSet(KEY, JSON.parse(JSON.stringify(state))).catch(() => {});
  } catch {}
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
export function flush() {
  if (saveTimer) saveNow();
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

function fixHabit(x) {
  const d = habitDefaults();
  const out = { ...d, ...x };
  out.schedule = { ...d.schedule, ...(x.schedule || {}) };
  out.reminder = { ...d.reminder, ...(x.reminder || {}) };
  out.pauses = Array.isArray(x.pauses) ? x.pauses : [];
  return out;
}

export function normalizeState(raw) {
  return normalize(raw);
}

function normalize(raw) {
  const s = emptyState();
  s.settings = { ...s.settings, ...(raw.settings || {}) };
  s.categories = Array.isArray(raw.categories) ? raw.categories : [];
  s.habits = Array.isArray(raw.habits) ? raw.habits.map(fixHabit) : [];
  s.days = raw.days && typeof raw.days === 'object' ? raw.days : {};
  for (const d of Object.values(s.days)) {
    d.logs = d.logs || {};
    d.note = d.note || '';
    d.mood = d.mood || 0;
    d.updatedAt = d.updatedAt || 0;
  }
  s.updatedAt = raw.updatedAt || 0;
  return s;
}

export async function init() {
  let a = null;
  let b = null;
  try {
    a = await idbGet(KEY);
  } catch {}
  try {
    const t = localStorage.getItem(LS_KEY);
    if (t) b = JSON.parse(t);
  } catch {}
  const best = [a, b].filter(Boolean).sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0))[0];
  state = best ? normalize(best) : emptyState();
  version++;
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch {}
}

// ---------- Suscripciones ----------
export const subscribe = (fn) => {
  uiListeners.add(fn);
  return () => uiListeners.delete(fn);
};
export const onSyncChange = (fn) => {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
};

function commit(opts = {}) {
  state.updatedAt = Date.now();
  version++;
  scheduleSave();
  syncListeners.forEach((fn) => fn());
  if (opts.silent) return;
  if (notifyQueued) return;
  notifyQueued = true;
  Promise.resolve().then(() => {
    notifyQueued = false;
    uiListeners.forEach((fn) => fn());
  });
}

// ---------- Lectura ----------
export const getState = () => state;
export const getVersion = () => version;
export const settings = () => state.settings;
const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0);
export const categories = () => state.categories.filter((c) => !c.deleted).sort(byOrder);
export const getCategory = (id) => state.categories.find((c) => c.id === id && !c.deleted) || null;
export const allHabits = () => state.habits.filter((x) => !x.deleted).sort(byOrder);
export const activeHabits = () => allHabits().filter((x) => !x.archivedAt);
export const archivedHabits = () => allHabits().filter((x) => !!x.archivedAt);
export const getHabit = (id) => state.habits.find((x) => x.id === id && !x.deleted) || null;
export const getDay = (key) => state.days[key] || null;

// ---------- Hábitos ----------
export function addHabit(data) {
  const t = Date.now();
  const habit = fixHabit({
    ...data,
    id: uid('h_'),
    order: Math.max(0, ...state.habits.map((x) => x.order || 0)) + 1,
    createdAt: t,
    updatedAt: t,
  });
  state.habits.push(habit);
  commit();
  return habit;
}
export function updateHabit(id, patch) {
  const x = state.habits.find((q) => q.id === id);
  if (!x) return;
  Object.assign(x, patch, { updatedAt: Date.now() });
  commit();
}
export function archiveHabit(id) {
  updateHabit(id, { archivedAt: todayKey() });
}
export function restoreHabit(id) {
  const x = state.habits.find((q) => q.id === id);
  if (!x || !x.archivedAt) return;
  const t = todayKey();
  const pauses = [...(x.pauses || [])];
  if (x.archivedAt < t) pauses.push({ from: x.archivedAt, to: t });
  updateHabit(id, { archivedAt: null, pauses });
}
// Devuelve lo necesario para deshacer el borrado con undeleteHabit().
export function deleteHabit(id) {
  const x = state.habits.find((q) => q.id === id);
  if (!x) return null;
  const now = Date.now();
  const logs = {};
  x.deleted = true;
  x.updatedAt = now;
  for (const [k, d] of Object.entries(state.days)) {
    if (id in d.logs) {
      logs[k] = d.logs[id];
      delete d.logs[id];
      d.updatedAt = now;
    }
  }
  commit();
  return { id, logs };
}
export function undeleteHabit(info) {
  const x = info && state.habits.find((q) => q.id === info.id);
  if (!x) return;
  const now = Date.now();
  x.deleted = false;
  x.updatedAt = now;
  for (const [k, v] of Object.entries(info.logs)) {
    const d = ensureDay(k);
    d.logs[info.id] = v;
    d.updatedAt = now;
  }
  commit();
}
export function moveHabit(id, dir) {
  const list = allHabits().filter((x) => !x.archivedAt);
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const now = Date.now();
  const a = list[i];
  const b = list[j];
  const oa = a.order;
  a.order = b.order;
  b.order = oa;
  if (a.order === b.order) a.order += dir * 0.5;
  a.updatedAt = b.updatedAt = now;
  commit();
}

// ---------- Categorías ----------
export function addCategory(data) {
  const t = Date.now();
  const c = {
    id: uid('c_'),
    name: 'Categoría',
    emoji: '🌿',
    color: '#6fcf97',
    order: Math.max(0, ...state.categories.map((x) => x.order || 0)) + 1,
    createdAt: t,
    updatedAt: t,
    deleted: false,
    ...data,
  };
  state.categories.push(c);
  commit();
  return c;
}
export function updateCategory(id, patch) {
  const c = state.categories.find((x) => x.id === id);
  if (!c) return;
  Object.assign(c, patch, { updatedAt: Date.now() });
  commit();
}
export function deleteCategory(id) {
  const now = Date.now();
  const c = state.categories.find((x) => x.id === id);
  if (!c) return null;
  const habitIds = [];
  c.deleted = true;
  c.updatedAt = now;
  for (const x of state.habits) {
    if (x.categoryId === id) {
      habitIds.push(x.id);
      x.categoryId = null;
      x.updatedAt = now;
    }
  }
  commit();
  return { id, habitIds };
}
export function undeleteCategory(info) {
  const c = info && state.categories.find((x) => x.id === info.id);
  if (!c) return;
  const now = Date.now();
  c.deleted = false;
  c.updatedAt = now;
  for (const x of state.habits) {
    if (info.habitIds.includes(x.id) && !x.categoryId) {
      x.categoryId = info.id;
      x.updatedAt = now;
    }
  }
  commit();
}

// ---------- Días ----------
function ensureDay(key) {
  if (!state.days[key]) state.days[key] = { logs: {}, note: '', mood: 0, updatedAt: 0 };
  return state.days[key];
}
export function setLog(key, habitId, value) {
  const d = ensureDay(key);
  if (!value) delete d.logs[habitId];
  else d.logs[habitId] = value;
  d.updatedAt = Date.now();
  commit();
}
export function setDay(key, patch, opts = {}) {
  const d = ensureDay(key);
  Object.assign(d, patch);
  d.updatedAt = Date.now();
  commit(opts);
}

// ---------- Ajustes ----------
export function updateSettings(patch, opts = {}) {
  Object.assign(state.settings, patch, { updatedAt: Date.now() });
  commit(opts);
}

// ---------- Importar / exportar / fusionar ----------
export const PRIVATE_SETTINGS = ['pinHash', 'pinSalt', 'lockAfter'];

export function exportData() {
  const data = JSON.parse(JSON.stringify(state));
  for (const k of PRIVATE_SETTINGS) delete data.settings[k];
  return { app: 'habitos', version: 1, exportedAt: new Date().toISOString(), data };
}

export function isValidBackup(obj) {
  return !!(obj && obj.app === 'habitos' && obj.data && Array.isArray(obj.data.habits) && obj.data.days);
}

function mergeById(xs, ys) {
  const m = new Map();
  for (const o of [...xs, ...ys]) {
    const p = m.get(o.id);
    if (!p || (o.updatedAt || 0) > (p.updatedAt || 0)) m.set(o.id, o);
  }
  return [...m.values()];
}

export function mergeStates(a, b) {
  const out = emptyState();
  const newer = (b.settings.updatedAt || 0) > (a.settings.updatedAt || 0) ? b.settings : a.settings;
  out.settings = { ...newer };
  for (const k of PRIVATE_SETTINGS) out.settings[k] = a.settings[k];
  out.settings.onboarded = !!(a.settings.onboarded || b.settings.onboarded);
  out.categories = mergeById(a.categories, b.categories);
  out.habits = mergeById(a.habits, b.habits).map(fixHabit);
  const keys = new Set([...Object.keys(a.days), ...Object.keys(b.days)]);
  for (const k of keys) {
    const x = a.days[k];
    const y = b.days[k];
    out.days[k] = !x ? y : !y ? x : (y.updatedAt || 0) > (x.updatedAt || 0) ? y : x;
  }
  out.updatedAt = Date.now();
  return out;
}

export function importData(backup, mode = 'merge') {
  const incoming = normalize(backup.data);
  if (mode === 'replace') {
    const keep = {};
    for (const k of PRIVATE_SETTINGS) keep[k] = state.settings[k];
    state = incoming;
    Object.assign(state.settings, keep, { onboarded: true });
    state.updatedAt = Date.now();
    state.settings.updatedAt = Date.now();
  } else {
    state = mergeStates(state, incoming);
  }
  version++;
  commit();
}

// Usado por la sincronización: sustituye el estado por una fusión ya calculada.
export function applyMerged(merged) {
  state = merged;
  version++;
  scheduleSave();
  if (!notifyQueued) {
    notifyQueued = true;
    Promise.resolve().then(() => {
      notifyQueued = false;
      uiListeners.forEach((fn) => fn());
    });
  }
}

// Copia completa del estado, para poder deshacer operaciones grandes (importar, borrar todo).
export function snapshotState() {
  return JSON.parse(JSON.stringify(state));
}
export function restoreSnapshot(snap) {
  const keep = {};
  for (const k of PRIVATE_SETTINGS) keep[k] = state.settings[k];
  state = normalize(JSON.parse(JSON.stringify(snap)));
  Object.assign(state.settings, keep);
  version++;
  commit();
}

export function resetAll() {
  const keep = {};
  for (const k of PRIVATE_SETTINGS) keep[k] = state.settings[k];
  state = emptyState();
  Object.assign(state.settings, keep);
  version++;
  commit();
}
