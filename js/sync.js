// Sincronización opcional con Firebase (Google). Los datos locales siguen siendo la fuente principal;
// la nube se fusiona por entidad usando la fecha de última modificación (la más reciente gana).
import { getState, onSyncChange, applyMerged, normalizeState, PRIVATE_SETTINGS } from './store.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const CFG_KEY = 'habitos-firebase-config';
const LAST_KEY = 'habitos-last-sync';

let fb = null;
let user = null;
let status = 'off'; // off | loading | signedout | syncing | synced | offline | error
let statusMsg = '';
let unsubMeta = null;
let unsubMonths = null;
let remote = { meta: null, months: {}, ready: false };
let pushTimer = null;
let pushing = false;
let pushAgain = false;
const listeners = new Set();

// ---------- Configuración ----------
export function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY));
  } catch {
    return null;
  }
}

export function parseConfig(text) {
  const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const cfg = {};
  for (const k of keys) {
    const m = String(text).match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`));
    if (m) cfg[k] = m[1].trim();
  }
  if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) return null;
  return cfg;
}

export async function saveConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  await initSync();
}

export async function removeConfig() {
  await signOutSync();
  stopListening();
  if (fb) {
    try {
      await fb.m.app.deleteApp(fb.app);
    } catch {}
  }
  fb = null;
  user = null;
  localStorage.removeItem(CFG_KEY);
  setStatus('off');
}

// ---------- Estado ----------
export const syncEnabled = () => !!user;
export function syncStatus() {
  return {
    status,
    msg: statusMsg,
    configured: !!getConfig(),
    ready: !!fb,
    user: user ? { email: user.email || '', name: user.displayName || '', photo: user.photoURL || '' } : null,
    lastSync: Number(localStorage.getItem(LAST_KEY)) || 0,
  };
}
export function onSyncStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setStatus(s, msg = '') {
  status = s;
  statusMsg = msg;
  listeners.forEach((fn) => fn());
}

// ---------- Arranque ----------
async function loadSdk() {
  const [app, auth, fs] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
  return { app, auth, fs };
}

let initPromise = null;
export function initSync() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const cfg = getConfig();
    if (!cfg) {
      setStatus('off');
      return;
    }
    const cfgStr = JSON.stringify(cfg);
    if (fb && fb.cfgStr === cfgStr) return;
    setStatus('loading', 'Conectando…');
    try {
      if (fb) {
        stopListening();
        try {
          await fb.m.app.deleteApp(fb.app);
        } catch {}
        fb = null;
      }
      const m = await loadSdk();
      const app = m.app.initializeApp(cfg, 'habitos-' + Date.now());
      const auth = m.auth.getAuth(app);
      const db = m.fs.getFirestore(app);
      fb = { m, app, auth, db, cfgStr };
      m.auth.onAuthStateChanged(auth, (u) => {
        user = u;
        if (u) startListening();
        else {
          stopListening();
          setStatus('signedout');
        }
      });
    } catch (e) {
      console.error(e);
      setStatus('error', navigator.onLine ? 'No se pudo cargar Firebase.' : 'Sin conexión. Se conectará cuando vuelva internet.');
    }
  })().finally(() => {
    initPromise = null;
  });
  return initPromise;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (!getConfig()) return;
    if (!fb) initSync();
    else if (user) schedulePush(500);
  });
  window.addEventListener('offline', () => {
    if (user) setStatus('offline', 'Sin conexión: tus cambios se guardan y se subirán luego.');
  });
}

onSyncChange(() => {
  if (user && remote.ready) schedulePush(1200);
});

// ---------- Autenticación ----------
const ERRORS = {
  'auth/popup-blocked': 'El navegador bloqueó la ventana. Inténtalo de nuevo.',
  'auth/popup-closed-by-user': 'Se cerró la ventana antes de terminar.',
  'auth/cancelled-popup-request': 'Se canceló el inicio de sesión.',
  'auth/unauthorized-domain': 'Este dominio no está autorizado. En Firebase → Authentication → Settings → Authorized domains, agrega: ' + location.hostname,
  'auth/operation-not-allowed': 'Ese método de acceso no está activado en Firebase → Authentication → Sign-in method.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/user-not-found': 'No existe una cuenta con ese correo. Usa “Crear cuenta”.',
  'auth/email-already-in-use': 'Ese correo ya tiene cuenta. Usa “Entrar”.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/missing-password': 'Escribe una contraseña.',
  'auth/network-request-failed': 'Sin conexión a internet.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
  'auth/invalid-api-key': 'La configuración de Firebase no es válida (apiKey).',
};
export const authErrorText = (e) => ERRORS[e && e.code] || (e && e.message) || 'Ocurrió un error.';

function ensureReady() {
  if (!fb) throw { code: 'not-ready', message: 'Firebase aún se está cargando. Espera un segundo.' };
}

export async function signInGoogle() {
  ensureReady();
  const A = fb.m.auth;
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await A.signInWithPopup(fb.auth, provider);
}

export async function signInEmail(email, password, create = false) {
  ensureReady();
  const A = fb.m.auth;
  if (create) await A.createUserWithEmailAndPassword(fb.auth, email, password);
  else await A.signInWithEmailAndPassword(fb.auth, email, password);
}

export async function resetPassword(email) {
  ensureReady();
  await fb.m.auth.sendPasswordResetEmail(fb.auth, email);
}

export async function signOutSync() {
  if (fb && user) {
    try {
      await fb.m.auth.signOut(fb.auth);
    } catch {}
  }
}

// ---------- Escucha de la nube ----------
function refs() {
  const { fs } = fb.m;
  return {
    meta: fs.doc(fb.db, 'users', user.uid, 'meta', 'main'),
    months: fs.collection(fb.db, 'users', user.uid, 'months'),
    month: (id) => fs.doc(fb.db, 'users', user.uid, 'months', id),
  };
}

function stopListening() {
  if (unsubMeta) unsubMeta();
  if (unsubMonths) unsubMonths();
  unsubMeta = unsubMonths = null;
  remote = { meta: null, months: {}, ready: false };
  clearTimeout(pushTimer);
}

function onListenError(e) {
  console.error(e);
  if (e && e.code === 'permission-denied') setStatus('error', 'Permiso denegado. Revisa las reglas de Firestore (paso 5 de la guía).');
  else setStatus('error', 'Error de sincronización: ' + ((e && e.message) || ''));
}

function startListening() {
  stopListening();
  setStatus(navigator.onLine ? 'syncing' : 'offline', navigator.onLine ? 'Sincronizando…' : 'Sin conexión: se sincronizará luego.');
  const { fs } = fb.m;
  const r = refs();
  let gotMeta = false;
  let gotMonths = false;
  unsubMeta = fs.onSnapshot(
    r.meta,
    (snap) => {
      remote.meta = snap.exists() ? snap.data() : null;
      gotMeta = true;
      if (gotMonths) onRemote();
    },
    onListenError,
  );
  unsubMonths = fs.onSnapshot(
    r.months,
    (qs) => {
      const months = {};
      qs.forEach((d) => {
        months[d.id] = d.data();
      });
      remote.months = months;
      gotMonths = true;
      if (gotMeta) onRemote();
    },
    onListenError,
  );
}

// ---------- Fusión ----------
const monthOf = (k) => k.slice(0, 7);
const ts = (x) => (x && x.updatedAt) || 0;

function mergeList(local, rem, flags) {
  const out = new Map();
  const rmap = new Map((rem || []).map((x) => [x.id, x]));
  for (const x of local) out.set(x.id, x);
  for (const y of rem || []) {
    const x = out.get(y.id);
    if (!x || ts(y) > ts(x)) {
      out.set(y.id, y);
      flags.local = true;
    } else if (ts(x) > ts(y)) flags.remoteMeta = true;
  }
  for (const x of local) if (!rmap.has(x.id)) flags.remoteMeta = true;
  return [...out.values()];
}

function publicSettings(s) {
  const o = { ...s };
  for (const k of PRIVATE_SETTINGS) delete o[k];
  return o;
}

function remoteState() {
  const meta = remote.meta || {};
  const days = {};
  for (const mo of Object.values(remote.months)) Object.assign(days, (mo && mo.days) || {});
  return normalizeState({ settings: meta.settings || { updatedAt: 0 }, categories: meta.categories || [], habits: meta.habits || [], days, updatedAt: 0 });
}

export function diff(local, rem) {
  const flags = { local: false, remoteMeta: false, months: new Set() };
  const merged = { ...local };
  if (ts(rem.settings) > ts(local.settings)) {
    const keep = {};
    for (const k of PRIVATE_SETTINGS) keep[k] = local.settings[k];
    merged.settings = { ...rem.settings, ...keep, onboarded: !!(rem.settings.onboarded || local.settings.onboarded) };
    flags.local = true;
  } else if (ts(local.settings) > ts(rem.settings)) flags.remoteMeta = true;
  merged.habits = mergeList(local.habits, rem.habits, flags);
  merged.categories = mergeList(local.categories, rem.categories, flags);
  const days = { ...local.days };
  const keys = new Set([...Object.keys(local.days), ...Object.keys(rem.days)]);
  for (const k of keys) {
    const x = local.days[k];
    const y = rem.days[k];
    if (!x) {
      days[k] = y;
      flags.local = true;
    } else if (!y) flags.months.add(monthOf(k));
    else if (ts(y) > ts(x)) {
      days[k] = y;
      flags.local = true;
    } else if (ts(x) > ts(y)) flags.months.add(monthOf(k));
  }
  merged.days = days;
  return { merged, flags };
}

function onRemote() {
  remote.ready = true;
  const { merged, flags } = diff(getState(), remoteState());
  if (flags.local) {
    merged.updatedAt = Date.now();
    applyMerged(merged);
  }
  if (flags.remoteMeta || flags.months.size) schedulePush(300);
  else markSynced();
}

function markSynced() {
  localStorage.setItem(LAST_KEY, String(Date.now()));
  setStatus('synced', 'Sincronizado');
}

// ---------- Subida ----------
function schedulePush(ms) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, ms);
}

const clean = (o) => JSON.parse(JSON.stringify(o));

async function push() {
  if (!fb || !user || !remote.ready) return;
  if (pushing) {
    pushAgain = true;
    return;
  }
  if (!navigator.onLine) {
    setStatus('offline', 'Sin conexión: tus cambios se guardan y se subirán luego.');
    return;
  }
  pushing = true;
  setStatus('syncing', 'Subiendo cambios…');
  try {
    const { fs } = fb.m;
    const r = refs();
    const { flags } = diff(getState(), remoteState());
    if (flags.remoteMeta) {
      await fs.runTransaction(fb.db, async (tx) => {
        const snap = await tx.get(r.meta);
        const rm = snap.exists() ? snap.data() : {};
        const loc = getState();
        const f = {};
        const settings = ts(rm.settings) > ts(loc.settings) ? rm.settings : publicSettings(loc.settings);
        tx.set(
          r.meta,
          clean({
            settings,
            habits: mergeList(loc.habits, rm.habits || [], f),
            categories: mergeList(loc.categories, rm.categories || [], f),
            updatedAt: Date.now(),
          }),
        );
      });
    }
    for (const mo of flags.months) {
      await fs.runTransaction(fb.db, async (tx) => {
        const ref = r.month(mo);
        const snap = await tx.get(ref);
        const rdays = (snap.exists() && snap.data().days) || {};
        const out = { ...rdays };
        const local = getState().days;
        for (const [k, d] of Object.entries(local)) {
          if (monthOf(k) !== mo) continue;
          if (!out[k] || ts(d) > ts(out[k])) out[k] = d;
        }
        tx.set(ref, clean({ days: out, updatedAt: Date.now() }));
      });
    }
    markSynced();
  } catch (e) {
    console.error(e);
    if (!navigator.onLine || (e && e.code === 'unavailable')) setStatus('offline', 'Sin conexión: se reintentará automáticamente.');
    else if (e && e.code === 'permission-denied') setStatus('error', 'Permiso denegado. Revisa las reglas de Firestore (paso 5 de la guía).');
    else setStatus('error', 'No se pudo subir: ' + ((e && e.message) || ''));
  } finally {
    pushing = false;
    if (pushAgain) {
      pushAgain = false;
      schedulePush(400);
    }
  }
}

export function syncNow() {
  if (user && remote.ready) schedulePush(0);
  else if (getConfig() && !fb) initSync();
}
