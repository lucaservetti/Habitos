// Punto de entrada: arranque, navegación, tema y ciclo de vida.
import { h, todayKey, hslToHex } from './util.js';
import { icon } from './icons.js';
import * as store from './store.js';
import { bus } from './bus.js';
import { themeHueSat } from './templates.js';
import { renderToday, resetTodaySelection } from './views/today.js';
import { renderMonth } from './views/month.js';
import { renderStats } from './views/stats.js';
import { renderDiary } from './views/diary.js';
import { renderSettings } from './views/settings.js';
import { openHabitForm } from './sheets/habitForm.js';
import { openHabitDetail } from './sheets/habitDetail.js';
import { openDaySheet } from './sheets/daySheet.js';
import { openCategoryForm } from './sheets/categoryForm.js';
import { openOnboarding } from './sheets/onboarding.js';
import { initLock } from './lock.js';
import { initTimer } from './timer.js';
import { initSync, onSyncStatus } from './sync.js';
import { toast } from './ui.js';

const TABS = [
  { id: 'today', label: 'Hoy', icon: 'home', render: renderToday },
  { id: 'month', label: 'Mes', icon: 'calendar', render: renderMonth },
  { id: 'stats', label: 'Progreso', icon: 'chart', render: renderStats },
  { id: 'diary', label: 'Diario', icon: 'book', render: renderDiary },
  { id: 'settings', label: 'Ajustes', icon: 'sliders', render: renderSettings },
];

let tab = 'today';
try {
  const saved = sessionStorage.getItem('habitos-tab');
  if (TABS.some((t) => t.id === saved)) tab = saved;
} catch {}

let onboardingOpen = false;
let lastToday = todayKey();
const mq = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const s = store.settings();
  const { hue, sat } = themeHueSat(s);
  const root = document.documentElement;
  root.style.setProperty('--h', String(hue));
  root.style.setProperty('--s', sat + '%');
  const dark = s.mode === 'dark' || (s.mode === 'auto' && mq.matches);
  root.dataset.mode = dark ? 'dark' : 'light';
  const meta = document.getElementById('theme-color');
  if (meta) meta.setAttribute('content', dark ? hslToHex(hue, 18, 10) : hslToHex(hue, 55, 97));
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren(
    ...TABS.map((t) =>
      h(
        'button',
        {
          type: 'button',
          class: t.id === tab ? 'active' : '',
          'aria-label': t.label,
          'aria-current': t.id === tab ? 'page' : null,
          onclick: () => goto(t.id),
        },
        icon(t.icon, 22, t.id === tab ? 2.3 : 2),
        h('span', null, t.label),
      ),
    ),
  );
}

function renderFab() {
  const fab = document.getElementById('fab');
  const show = (tab === 'today' || tab === 'month') && store.allHabits().length > 0;
  fab.hidden = !show;
}

function errorView(e) {
  return h(
    'div',
    { class: 'view' },
    h(
      'div',
      { class: 'empty card' },
      h('div', { class: 'empty-e' }, '🫧'),
      h('h3', null, 'Algo salió mal al mostrar esta pantalla'),
      h('p', { class: 'muted' }, 'Tus datos están a salvo. Prueba recargar.'),
      h('pre', { class: 'code' }, String((e && e.stack) || e)),
      h('button', { type: 'button', class: 'btn primary', onclick: () => location.reload() }, 'Recargar'),
    ),
  );
}

function render() {
  applyTheme();
  const view = document.getElementById('view');
  const y = window.scrollY;
  const t = TABS.find((x) => x.id === tab) || TABS[0];
  let node;
  try {
    node = t.render();
  } catch (e) {
    console.error(e);
    node = errorView(e);
  }
  view.replaceChildren(node);
  window.scrollTo(0, y);
  renderNav();
  renderFab();
  if (!store.settings().onboarded && !onboardingOpen) {
    onboardingOpen = true;
    openOnboarding();
    const check = setInterval(() => {
      if (store.settings().onboarded) {
        onboardingOpen = false;
        clearInterval(check);
      }
    }, 500);
  }
}

function goto(id) {
  if (id === tab) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (id === 'today') {
      resetTodaySelection();
      render();
    }
    return;
  }
  tab = id;
  try {
    sessionStorage.setItem('habitos-tab', id);
  } catch {}
  window.scrollTo(0, 0);
  render();
}

function checkDayRollover() {
  const t = todayKey();
  if (t !== lastToday) {
    lastToday = t;
    resetTodaySelection();
    render();
  }
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && !location.search.includes('sw')) return;
  const loadedAt = Date.now();
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    if (Date.now() - loadedAt < 6000) {
      reloaded = true;
      store.flush();
      location.reload();
    } else toast('✨ Nueva versión lista. Cierra y abre la app para usarla.', 4000);
  });
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
}

async function boot() {
  await store.init();
  bus.render = render;
  bus.goto = goto;
  bus.applyTheme = applyTheme;
  bus.openDay = (k) => openDaySheet(k);
  bus.openHabit = (id) => openHabitDetail(id);
  bus.openHabitForm = (hb, opts) => openHabitForm(hb, opts);
  bus.openCategoryForm = (c, opts) => openCategoryForm(c, opts);

  store.subscribe(render);
  mq.addEventListener ? mq.addEventListener('change', applyTheme) : mq.addListener(applyTheme);
  document.getElementById('fab').addEventListener('click', () => openHabitForm(null));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkDayRollover();
  });
  setInterval(checkDayRollover, 60000);

  render();
  document.getElementById('splash')?.remove();
  initLock();
  initTimer();
  registerSW();
  onSyncStatus(() => {
    if (tab === 'settings') render();
  });
  initSync();
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('view').replaceChildren(errorView(e));
});
