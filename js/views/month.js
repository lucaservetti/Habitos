// Pantalla "Mes": cuadrícula hábitos × días y calendario con notas.
import { h, todayKey, ymOf, keyOf, daysInMonth, fmtMonthYear, fmtMonth, addMonths, fromKey, WD_LETTER, dow, fmtDayMonth, fmtWeekdayShort } from '../util.js';
import { wrappedAvailable, openWrapped } from '../sheets/wrapped.js';
import { icon } from '../icons.js';
import { allHabits, getState, getHabit, settings } from '../store.js';
import { monthStats, entry, isActiveOn, habitRates, dayStats } from '../logic.js';
import { ring, areaChart } from '../charts.js';
import { segmented, delegatePress, numberSheet, MOODS } from '../ui.js';
import { toggleCheck, toggleSkip, setCount } from '../actions.js';
import { habitVars } from '../habitUi.js';
import { bus } from '../bus.js';

let ym = null;
let mode = 'grid';
let gridScroll = null;
let gridScrollYm = '';

export function renderMonth() {
  const today = todayKey();
  if (!ym) ym = ymOf(today);
  const cur = ymOf(today);
  const { y, m } = ym;
  const isCurrent = y === cur.y && m === cur.m;
  const ms = monthStats(y, m);
  const root = h('div', { class: 'view view-month' });

  root.append(
    h(
      'header',
      { class: 'page-head' },
      h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, 'Tu mes'), h('h1', null, fmtMonthYear(y, m))),
      h(
        'div',
        { class: 'row-gap tight' },
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn soft',
            'aria-label': 'Mes anterior',
            onclick: () => {
              ym = addMonths(y, m, -1);
              bus.render();
            },
          },
          icon('left', 20),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn soft',
            'aria-label': 'Mes siguiente',
            disabled: isCurrent,
            onclick: () => {
              ym = addMonths(y, m, 1);
              bus.render();
            },
          },
          icon('right', 20),
        ),
      ),
    ),
  );

  root.append(
    segmented(
      [
        { value: 'grid', label: '▦ Cuadrícula' },
        { value: 'cal', label: '🗓️ Calendario' },
      ],
      mode,
      (v) => {
        mode = v;
        bus.render();
      },
      'view-switch',
    ),
  );

  // Resumen
  let notes = 0;
  const days = getState().days;
  for (let d = 1; d <= daysInMonth(y, m); d++) if (days[keyOf(y, m, d)]?.note) notes++;
  root.append(
    h(
      'div',
      { class: 'card month-summary' },
      ring({ pct: ms.pct || 0, size: 70, stroke: 8, children: h('b', null, ms.pct == null ? '–' : Math.round(ms.pct * 100) + '%') }),
      h(
        'div',
        { class: 'ms-stats' },
        h('div', null, h('b', null, ms.done), h('span', null, 'hábitos cumplidos')),
        h('div', null, h('b', null, ms.perfect), h('span', null, 'días perfectos')),
        h('div', null, h('b', null, notes), h('span', null, 'notas escritas')),
      ),
    ),
  );

  if (wrappedAvailable(y, m)) {
    root.append(
      h(
        'button',
        { type: 'button', class: 'card wrapped-cta', onclick: () => openWrapped(y, m) },
        h('span', { class: 'wc-e' }, '🎁'),
        h(
          'span',
          { class: 'grow' },
          h('b', null, `Tu resumen de ${fmtMonth(m).toLowerCase()}`),
          h('span', { class: 'muted block' }, isCurrent ? 'Cómo va tu mes hasta hoy' : 'Tus logros, rachas y momentos del mes'),
        ),
        icon('right', 18),
      ),
    );
  }

  if (mode === 'grid') root.append(gridTable(y, m, today));
  else root.append(calendar(y, m, today));

  root.append(
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'card-title' }, '📈 Progreso del mes'),
      areaChart(ms.days.map((d) => ({ key: d.key, pct: d.pct })), { height: 140, onPick: null }),
    ),
  );

  if (mode === 'cal') root.append(monthNotes(y, m));
  return root;
}

function gridTable(y, m, today) {
  const n = daysInMonth(y, m);
  const keys = Array.from({ length: n }, (_, i) => keyOf(y, m, i + 1));
  const habits = allHabits().filter((hb) => keys.some((k) => isActiveOn(hb, k)));
  if (!habits.length) {
    return h('div', { class: 'empty card slim' }, h('div', { class: 'empty-e sm' }, '🗓️'), h('p', { class: 'muted' }, 'No hay hábitos activos este mes.'));
  }
  const rates = habitRates(monthStats(y, m));
  const ymKey = `${y}-${m}`;

  const thead = h(
    'thead',
    null,
    h(
      'tr',
      null,
      h('th', { class: 'sticky corner' }, 'Hábito'),
      keys.map((k) => {
        const wd = dow(k);
        return h(
          'th',
          { class: 'dh' + (k === today ? ' today' : '') + (wd === 0 || wd === 6 ? ' we' : ''), 'data-day': k },
          h('span', { class: 'dh-l' }, WD_LETTER[wd]),
          h('span', { class: 'dh-n' }, fromKey(k).getDate()),
        );
      }),
      h('th', { class: 'pct-h' }, '%'),
    ),
  );

  const tbody = h('tbody');
  for (const hb of habits) {
    const r = rates.find((x) => x.habit.id === hb.id);
    const tr = h('tr', { style: habitVars(hb.color) });
    tr.appendChild(
      h('th', { class: 'sticky hcell', 'data-habit': hb.id }, h('span', { class: 'hc-e' }, hb.emoji), h('span', { class: 'hc-n' }, hb.name)),
    );
    for (const k of keys) {
      const active = isActiveOn(hb, k);
      const fut = k > today;
      let cls = 'cell';
      let content = null;
      let style = null;
      if (!active) cls += ' na';
      else if (fut) cls += ' future';
      else {
        const e = entry(hb, k);
        if (e.skipped) {
          cls += ' skip';
          content = '–';
        } else if (e.done) {
          cls += ' done';
          content = icon('check', 14, 3.4);
        } else if (e.partial) {
          cls += ' part';
          style = { '--p': Math.round((e.v / e.target) * 100) + '%' };
        } else if (e.sched) cls += k === today ? ' pending' : ' miss';
        else cls += ' off';
      }
      tr.appendChild(
        h(
          'td',
          { class: k === today ? 'today' : null },
          h('button', { type: 'button', class: cls, style, 'data-h': hb.id, 'data-k': k, disabled: !active || fut, 'aria-label': `${hb.name} ${k}` }, content),
        ),
      );
    }
    tr.appendChild(h('td', { class: 'pct-c' }, r && (r.total || r.done) ? Math.round(r.pct * 100) : '–'));
    tbody.appendChild(tr);
  }

  const tfoot = h(
    'tfoot',
    null,
    h(
      'tr',
      null,
      h('th', { class: 'sticky hcell foot' }, h('span', { class: 'hc-n' }, 'Total del día')),
      keys.map((k) => {
        if (k > today) return h('td', null);
        const s = dayStats(k);
        if (!s.total) return h('td', null, h('span', { class: 'dpct empty' }, '·'));
        const p = s.done / s.total;
        return h('td', null, h('span', { class: 'dpct' + (p === 1 ? ' full' : ''), style: { '--a': (0.12 + p * 0.88).toFixed(2) } }, Math.round(p * 100)));
      }),
      h('td', null),
    ),
  );

  const table = h('table', { class: 'mgrid' }, thead, tbody, tfoot);
  const wrap = h('div', { class: 'grid-wrap' }, table);

  delegatePress(table, 'button.cell', {
    onTap: (el) => {
      const hb = getHabit(el.dataset.h);
      const k = el.dataset.k;
      if (!hb) return;
      if (hb.type === 'count') {
        const e = entry(hb, k);
        numberSheet({
          title: `${hb.emoji} ${hb.name} · ${fmtDayMonth(k)}`,
          value: Math.max(0, e.v),
          unit: hb.unit,
          onSave: (v) => setCount(hb, k, v),
        });
      } else toggleCheck(hb, k);
    },
    onLong: (el) => {
      const hb = getHabit(el.dataset.h);
      if (hb) toggleSkip(hb, el.dataset.k);
    },
  });
  table.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-day]');
    if (th && th.dataset.day <= today) bus.openDay(th.dataset.day);
    const hc = e.target.closest('th[data-habit]');
    if (hc) bus.openHabit(hc.dataset.habit);
  });
  wrap.addEventListener('scroll', () => {
    gridScroll = wrap.scrollLeft;
    gridScrollYm = ymKey;
  });
  requestAnimationFrame(() => {
    if (gridScroll != null && gridScrollYm === ymKey) wrap.scrollLeft = gridScroll;
    else {
      const th = table.querySelector('th.today');
      if (th) wrap.scrollLeft = Math.max(0, th.offsetLeft + th.offsetWidth * 3 - wrap.clientWidth);
      else wrap.scrollLeft = 0;
      gridScroll = wrap.scrollLeft;
      gridScrollYm = ymKey;
    }
  });

  return h(
    'div',
    { class: 'card grid-card' },
    wrap,
    h(
      'div',
      { class: 'legend' },
      h('span', null, h('i', { class: 'lg done' }), 'Hecho'),
      h('span', null, h('i', { class: 'lg part' }), 'Parcial'),
      h('span', null, h('i', { class: 'lg miss' }), 'Pendiente'),
      h('span', null, h('i', { class: 'lg skip' }), 'Descanso'),
      h('span', null, h('i', { class: 'lg off' }), 'No toca'),
    ),
    h('div', { class: 'hint center' }, 'Toca para marcar · mantén pulsado para descanso · toca un día para abrirlo'),
  );
}

function calendar(y, m, today) {
  const ws = settings().weekStart ?? 1;
  const first = keyOf(y, m, 1);
  const offset = (dow(first) - ws + 7) % 7;
  const n = daysInMonth(y, m);
  const days = getState().days;
  const grid = h('div', { class: 'cal-grid' });
  for (let i = 0; i < 7; i++) grid.appendChild(h('div', { class: 'cal-wd' }, WD_LETTER[(ws + i) % 7]));
  for (let i = 0; i < offset; i++) grid.appendChild(h('div'));
  for (let d = 1; d <= n; d++) {
    const k = keyOf(y, m, d);
    const fut = k > today;
    const s = fut ? null : dayStats(k);
    const p = s && s.total ? s.done / s.total : 0;
    const dd = days[k];
    const mood = dd && dd.mood ? MOODS.find((x) => x.v === dd.mood) : null;
    grid.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: 'cday' + (k === today ? ' today' : '') + (fut ? ' future' : '') + (s && s.total && p === 1 ? ' full' : ''),
          disabled: fut,
          onclick: () => bus.openDay(k),
          'aria-label': k,
        },
        h('span', { class: 'cring', style: { '--p': Math.round(p * 100) } }, h('span', { class: 'cnum' }, d)),
        mood ? h('span', { class: 'cmood' }, mood.e) : null,
        dd && dd.note ? h('span', { class: 'cnote' }) : null,
      ),
    );
  }
  return h('div', { class: 'card' }, grid, h('div', { class: 'hint center' }, 'El anillo muestra el % de hábitos del día · 😊 tu ánimo · • tiene nota'));
}

function monthNotes(y, m) {
  const days = getState().days;
  const list = [];
  for (let d = daysInMonth(y, m); d >= 1; d--) {
    const k = keyOf(y, m, d);
    const dd = days[k];
    if (dd && (dd.note || dd.mood)) list.push({ k, dd });
  }
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, '📝 Notas del mes'),
    list.length
      ? h(
          'div',
          { class: 'note-list' },
          list.map(({ k, dd }) => {
            const mood = dd.mood ? MOODS.find((x) => x.v === dd.mood) : null;
            return h(
              'button',
              { type: 'button', class: 'note-row', onclick: () => bus.openDay(k) },
              h('span', { class: 'nr-date' }, h('b', null, fromKey(k).getDate()), h('span', null, fmtWeekdayShort(k))),
              h('span', { class: 'nr-text' + (dd.note ? '' : ' muted') }, dd.note || 'Sin nota'),
              mood ? h('span', { class: 'nr-mood' }, mood.e) : null,
            );
          }),
        )
      : h('p', { class: 'muted' }, 'Aún no hay notas este mes. Toca un día para escribir.'),
  );
}
