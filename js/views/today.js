// Pantalla "Hoy": progreso del día, nota, ánimo y lista de hábitos.
import { h, todayKey, addDays, weekStartKey, fmtLong, WD_LETTER, fromKey, dow, ymOf, addMonths, fmtMonth } from '../util.js';
import { wrappedAvailable, wrappedSeen, openWrapped } from '../sheets/wrapped.js';
import { icon } from '../icons.js';
import { settings, allHabits, categories } from '../store.js';
import { dayStats, entry, isActiveOn, bestCurrentStreak, weekSummary } from '../logic.js';
import { ring } from '../charts.js';
import { habitCard } from '../habitUi.js';
import { ROUTINES } from '../ui.js';
import { moodRow, noteInput } from '../sheets/daySheet.js';
import { bus } from '../bus.js';
import { lastBackupAt, shareBackup } from '../backup.js';
import { syncEnabled } from '../sync.js';

let selected = null;
let filterCat = 'all';
let showOther = false;

export function resetTodaySelection() {
  selected = null;
}

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function lsGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

function greeting() {
  const hr = new Date().getHours();
  if (hr < 6) return 'Buenas noches';
  if (hr < 13) return 'Buenos días';
  if (hr < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function message(ds, isToday) {
  if (!ds.total) return isToday ? 'Día libre 🌿 disfrútalo' : 'Sin hábitos ese día';
  const p = ds.pct;
  if (!isToday) return p === 1 ? '¡Fue un día completo! 🎉' : p >= 0.5 ? 'Fue un buen día 🌱' : 'Cada día cuenta 🤍';
  const hr = new Date().getHours();
  if (p === 1) return '¡Día completo! 🎉';
  if (p === 0) return hr >= 19 ? 'Aún estás a tiempo 🌙' : 'Un nuevo día, a tu ritmo 🌤️';
  if (p < 0.34) return 'Buen comienzo 🌱';
  if (p < 0.67) return 'Vas por buen camino ✨';
  return 'Ya casi lo logras 🔥';
}

function banners(today) {
  const out = [];
  const { y: cy, m: cm } = ymOf(today);
  const pm = addMonths(cy, cm, -1);
  if (fromKey(today).getDate() <= 7 && !wrappedSeen(pm.y, pm.m) && wrappedAvailable(pm.y, pm.m)) {
    out.push(
      h(
        'button',
        { type: 'button', class: 'card wrapped-cta', onclick: () => openWrapped(pm.y, pm.m) },
        h('span', { class: 'wc-e' }, '🎁'),
        h('span', { class: 'grow' }, h('b', null, `Tu resumen de ${fmtMonth(pm.m).toLowerCase()} está listo`), h('span', { class: 'muted block' }, 'Tus logros, rachas y momentos del mes pasado')),
        icon('right', 18),
      ),
    );
  }
  if (isIOS() && !isStandalone() && lsGet('hint-install') !== 'no') {
    out.push(
      h(
        'div',
        { class: 'banner' },
        h('div', { class: 'banner-e' }, '📲'),
        h(
          'div',
          { class: 'grow' },
          h('b', null, 'Instálala como app'),
          h('div', { class: 'muted' }, 'En Safari toca Compartir ', h('span', { class: 'kbd' }, '⬆︎'), ' → “Añadir a pantalla de inicio”. Importante: lo que anotes aquí en Safari no pasa a la app instalada.'),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn ghost sm',
            'aria-label': 'Ocultar',
            onclick: () => {
              lsSet('hint-install', 'no');
              bus.render();
            },
          },
          icon('x', 16),
        ),
      ),
    );
  }
  const habits = allHabits();
  const oldest = habits.reduce((m, x) => Math.min(m, x.createdAt || Date.now()), Date.now());
  const snooze = Number(lsGet('hint-backup-snooze')) || 0;
  const last = lastBackupAt();
  const DAY = 86400000;
  if (!syncEnabled() && habits.length && Date.now() - oldest > 7 * DAY && Date.now() - last > 14 * DAY && Date.now() > snooze) {
    out.push(
      h(
        'div',
        { class: 'banner' },
        h('div', { class: 'banner-e' }, '💾'),
        h(
          'div',
          { class: 'grow' },
          h('b', null, last ? 'Hace tiempo que no respaldas' : 'Protege tus datos'),
          h('div', { class: 'muted' }, 'Tus datos viven solo en este teléfono. Guarda un respaldo o activa la sincronización con Google en Ajustes.'),
          h(
            'div',
            { class: 'row-gap small' },
            h('button', { type: 'button', class: 'btn primary sm', onclick: () => shareBackup().then(() => bus.render()) }, 'Respaldar ahora'),
            h(
              'button',
              {
                type: 'button',
                class: 'btn soft sm',
                onclick: () => {
                  lsSet('hint-backup-snooze', String(Date.now() + 3 * DAY));
                  bus.render();
                },
              },
              'Luego',
            ),
          ),
        ),
      ),
    );
  }
  const st = settings();
  const ws = st.weekStart ?? 1;
  if (dow(today) === ws && lsGet('hint-week') !== today) {
    const sum = weekSummary(addDays(today, -7));
    if (sum.cur.total > 0) {
      const p = Math.round((sum.cur.pct || 0) * 100);
      out.push(
        h(
          'div',
          { class: 'banner soft' },
          h('div', { class: 'banner-e' }, '🗓️'),
          h(
            'div',
            { class: 'grow' },
            h('b', null, `Tu semana pasada: ${p}%`),
            h(
              'div',
              { class: 'muted' },
              `${sum.cur.done} hábitos cumplidos · ${sum.cur.perfect} día${sum.cur.perfect === 1 ? '' : 's'} perfecto${sum.cur.perfect === 1 ? '' : 's'}`,
              sum.best ? ` · Lo mejor: ${sum.best.habit.emoji} ${sum.best.habit.name}` : '',
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'icon-btn ghost sm',
              'aria-label': 'Ocultar',
              onclick: () => {
                lsSet('hint-week', today);
                bus.render();
              },
            },
            icon('x', 16),
          ),
        ),
      );
    }
  }
  return out;
}

export function renderToday() {
  const today = todayKey();
  if (selected && selected >= today) selected = null;
  const key = selected || today;
  const isToday = key === today;
  const st = settings();
  const ws = st.weekStart ?? 1;
  const ds = dayStats(key);
  const root = h('div', { class: 'view view-today' });

  root.append(
    h(
      'header',
      { class: 'page-head' },
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'eyebrow' }, fmtLong(key)),
        h('h1', null, isToday ? `${greeting()}${st.name ? ', ' + st.name : ''}` : key === addDays(today, -1) ? 'Ayer' : 'Día pasado'),
      ),
      !isToday
        ? h(
            'button',
            {
              type: 'button',
              class: 'pill-btn',
              onclick: () => {
                selected = null;
                bus.render();
              },
            },
            'Volver a hoy',
          )
        : null,
    ),
  );

  // Tira semanal
  const start = weekStartKey(key, ws);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const k = addDays(start, i);
    const fut = k > today;
    const s = fut ? null : dayStats(k);
    days.push(
      h(
        'button',
        {
          type: 'button',
          class: 'wday' + (k === key ? ' sel' : '') + (k === today ? ' today' : '') + (fut ? ' future' : '') + (s && s.total && s.pct === 1 ? ' full' : ''),
          disabled: fut,
          'aria-label': fmtLong(k),
          onclick: () => {
            selected = k === today ? null : k;
            bus.render();
          },
        },
        h('span', { class: 'wd-l' }, WD_LETTER[fromKey(k).getDay()]),
        ring({ pct: (s && s.pct) || 0, size: 36, stroke: 3.5, children: String(fromKey(k).getDate()) }),
      ),
    );
  }
  root.append(
    h(
      'div',
      { class: 'week-strip' },
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn ghost sm',
          'aria-label': 'Semana anterior',
          onclick: () => {
            selected = addDays(key, -7);
            bus.render();
          },
        },
        icon('left', 18),
      ),
      h('div', { class: 'wdays' }, days),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn ghost sm',
          'aria-label': 'Semana siguiente',
          disabled: addDays(start, 7) > today,
          onclick: () => {
            const n = addDays(key, 7);
            selected = n >= today ? null : n;
            bus.render();
          },
        },
        icon('right', 18),
      ),
    ),
  );

  root.append(...banners(today));

  // Tarjeta de progreso
  const best = bestCurrentStreak();
  const wk = weekSummary(key);
  root.append(
    h(
      'div',
      { class: 'card progress-card' + (ds.total && ds.pct === 1 ? ' complete' : '') },
      ring({ pct: ds.pct || 0, size: 92, stroke: 10, children: h('b', { class: 'ring-big' }, ds.pct == null ? '–' : Math.round(ds.pct * 100) + '%') }),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'pc-msg' }, message(ds, isToday)),
        h('div', { class: 'muted' }, ds.total ? `${ds.done} de ${ds.total} hábitos completados` : 'No hay nada programado'),
        h(
          'div',
          { class: 'pc-chips' },
          best && best.s.current > 0 ? h('span', { class: 'mchip' }, `🔥 ${best.s.current} ${best.s.unit === 'semanas' ? 'sem' : best.s.current === 1 ? 'día' : 'días'} · ${best.h.emoji}`) : null,
          wk.cur.pct != null ? h('span', { class: 'mchip' }, `📅 Semana ${Math.round(wk.cur.pct * 100)}%`) : null,
        ),
      ),
    ),
  );

  // Nota y ánimo
  root.append(
    h(
      'div',
      { class: 'card note-card' },
      h('div', { class: 'card-title' }, isToday ? '✨ Lo más importante de hoy' : '✨ Lo más importante del día'),
      noteInput(key, { rows: 2, placeholder: isToday ? 'Una frase para recordar este día…' : '¿Qué pasó ese día?' }),
      moodRow(key),
    ),
  );

  // Lista de hábitos
  const all = allHabits();
  if (!all.length) {
    root.append(
      h(
        'div',
        { class: 'empty card' },
        h('div', { class: 'empty-e' }, '🌱'),
        h('h3', null, 'Tu jardín de hábitos está vacío'),
        h('p', { class: 'muted' }, 'Crea tu primer hábito: puede ser algo pequeño, como tomar agua o leer 10 minutos.'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => bus.openHabitForm(null) }, icon('plus', 18), 'Crear mi primer hábito'),
      ),
    );
    return root;
  }

  const items = ds.items;
  const usedCats = categories().filter((c) => items.some((e) => e.habit.categoryId === c.id));
  if (filterCat !== 'all' && !usedCats.some((c) => c.id === filterCat)) filterCat = 'all';
  if (usedCats.length && items.length > 3) {
    root.append(
      h(
        'div',
        { class: 'hscroll filter-chips' },
        h(
          'button',
          {
            type: 'button',
            class: 'chip' + (filterCat === 'all' ? ' on' : ''),
            onclick: () => {
              filterCat = 'all';
              bus.render();
            },
          },
          'Todos',
        ),
        usedCats.map((c) =>
          h(
            'button',
            {
              type: 'button',
              class: 'chip' + (filterCat === c.id ? ' on' : ''),
              style: { '--c': c.color },
              onclick: () => {
                filterCat = c.id;
                bus.render();
              },
            },
            h('span', { class: 'chip-e' }, c.emoji),
            c.name,
          ),
        ),
      ),
    );
  }

  const shown = filterCat === 'all' ? items : items.filter((e) => e.habit.categoryId === filterCat);
  const groups = ROUTINES.map((r) => ({ r, list: shown.filter((e) => (e.habit.routine || 'any') === r.id) })).filter((g) => g.list.length);
  if (!shown.length) {
    root.append(h('div', { class: 'empty card slim' }, h('div', { class: 'empty-e sm' }, '🌿'), h('p', { class: 'muted' }, isToday ? 'Hoy no tienes hábitos programados. ¡Disfruta tu día!' : 'No había hábitos programados ese día.')));
  } else if (groups.length > 1) {
    for (const g of groups) {
      const done = g.list.filter((e) => e.done).length;
      root.append(
        h('div', { class: 'section-title' }, h('span', null, g.r.emoji, ' ', g.r.label), h('span', { class: 'section-count' }, `${done}/${g.list.length}`)),
        h('div', { class: 'hlist' }, g.list.map((e) => habitCard(e, key))),
      );
    }
  } else {
    root.append(h('div', { class: 'section-title' }, h('span', null, 'Tus hábitos'), h('span', { class: 'section-count' }, `${shown.filter((e) => e.done).length}/${shown.length}`)), h('div', { class: 'hlist' }, shown.map((e) => habitCard(e, key))));
  }

  const others = all.filter((hb) => isActiveOn(hb, key) && !items.some((e) => e.habit.id === hb.id) && (filterCat === 'all' || hb.categoryId === filterCat));
  if (others.length) {
    root.append(
      h(
        'button',
        {
          type: 'button',
          class: 'link-btn other-toggle',
          onclick: () => {
            showOther = !showOther;
            bus.render();
          },
        },
        icon(showOther ? 'up' : 'down', 16),
        `No programados ${isToday ? 'hoy' : 'ese día'} (${others.length})`,
      ),
    );
    if (showOther) root.append(h('div', { class: 'hlist' }, others.map((hb) => habitCard(entry(hb, key), key))));
  }

  root.append(h('div', { class: 'hint center tip' }, 'Mantén pulsado ✓ para marcar un día de descanso 🌙 (no rompe tu racha).'));
  return root;
}
