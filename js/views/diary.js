// Pantalla "Diario": notas diarias, buscador, filtro por ánimo y recuerdos.
import { h, todayKey, addDays, fromKey, fmtWeekdayShort, fmtMonthYear, ymOf, norm, fmtLong } from '../util.js';
import { icon } from '../icons.js';
import { getState } from '../store.js';
import { dayStats } from '../logic.js';
import { MOODS } from '../ui.js';
import { bus } from '../bus.js';

let query = '';
let moodFilter = 0;

function writingStreak(days, today) {
  let k = days[today]?.note ? today : addDays(today, -1);
  let n = 0;
  while (days[k]?.note) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}

function highlight(text, q) {
  if (!q) return text;
  const nt = norm(text);
  const nq = norm(q);
  if (nt.length !== text.length) return text;
  const out = [];
  let i = 0;
  let idx = nt.indexOf(nq, i);
  while (idx !== -1 && nq) {
    if (idx > i) out.push(text.slice(i, idx));
    out.push(h('mark', null, text.slice(idx, idx + nq.length)));
    i = idx + nq.length;
    idx = nt.indexOf(nq, i);
  }
  out.push(text.slice(i));
  return out;
}

function entryRow(k, dd, q) {
  const mood = dd.mood ? MOODS.find((x) => x.v === dd.mood) : null;
  const s = dayStats(k);
  return h(
    'button',
    { type: 'button', class: 'diary-row', onclick: () => bus.openDay(k) },
    h('span', { class: 'dr-date' }, h('b', null, fromKey(k).getDate()), h('span', null, fmtWeekdayShort(k))),
    h(
      'span',
      { class: 'dr-main' },
      h('span', { class: 'dr-text' + (dd.note ? '' : ' muted') }, dd.note ? highlight(dd.note, q) : 'Sin nota'),
      s.total ? h('span', { class: 'dr-meta' }, `${s.done}/${s.total} hábitos${s.done === s.total ? ' ⭐' : ''}`) : null,
    ),
    mood ? h('span', { class: 'dr-mood' }, mood.e) : null,
  );
}

function memory(label, k, dd) {
  const mood = dd.mood ? MOODS.find((x) => x.v === dd.mood) : null;
  return h(
    'button',
    { type: 'button', class: 'memory', onclick: () => bus.openDay(k) },
    h('div', { class: 'memory-l' }, label, ' · ', fmtLong(k)),
    h('div', { class: 'memory-t' }, mood ? mood.e + ' ' : '', dd.note),
  );
}

export function renderDiary() {
  const today = todayKey();
  const days = getState().days;
  const root = h('div', { class: 'view view-diary' });
  root.append(h('header', { class: 'page-head' }, h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, 'Tus recuerdos'), h('h1', null, 'Diario'))));

  const allKeys = Object.keys(days)
    .filter((k) => k <= today && (days[k].note || days[k].mood))
    .sort()
    .reverse();
  const notesCount = allKeys.filter((k) => days[k].note).length;
  const streak = writingStreak(days, today);

  root.append(
    h(
      'button',
      { type: 'button', class: 'card write-today', onclick: () => bus.openDay(today) },
      h('span', { class: 'wt-e' }, days[today]?.note ? '📖' : '✍️'),
      h(
        'span',
        { class: 'grow' },
        h('b', null, days[today]?.note ? 'Tu nota de hoy' : 'Escribe lo más importante de hoy'),
        h('span', { class: 'muted block' }, days[today]?.note || 'Una sola frase basta para recordar este día.'),
      ),
      icon('right', 18),
    ),
  );

  root.append(
    h(
      'div',
      { class: 'tiles three' },
      h('div', { class: 'tile' }, h('div', { class: 'tile-val' }, '📝 ', notesCount), h('div', { class: 'tile-label' }, notesCount === 1 ? 'nota' : 'notas')),
      h('div', { class: 'tile' }, h('div', { class: 'tile-val' }, '🔥 ', streak), h('div', { class: 'tile-label' }, 'de racha')),
      h('div', { class: 'tile' }, h('div', { class: 'tile-val' }, '😊 ', allKeys.filter((k) => days[k].mood).length), h('div', { class: 'tile-label' }, 'ánimos')),
    ),
  );

  // Recuerdos: hace un mes / hace un año
  const mems = [];
  const d = fromKey(today);
  const monthAgo = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate());
  const yearAgo = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
  const pad = (n) => String(n).padStart(2, '0');
  const kOf = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const kMonth = kOf(monthAgo);
  const kYear = kOf(yearAgo);
  if (days[kYear]?.note) mems.push(memory('🕰️ Hace un año', kYear, days[kYear]));
  if (days[kMonth]?.note) mems.push(memory('🌙 Hace un mes', kMonth, days[kMonth]));
  if (mems.length) root.append(h('div', { class: 'memories' }, mems));

  // Buscador
  const list = h('div', { class: 'diary-list' });
  const input = h('input', {
    class: 'input search-input',
    type: 'search',
    placeholder: 'Buscar en tus notas…',
    value: query,
    oninput: (e) => {
      query = e.target.value;
      drawList();
    },
  });
  root.append(h('div', { class: 'search' }, icon('search', 18), input));
  root.append(
    h(
      'div',
      { class: 'hscroll filter-chips' },
      h(
        'button',
        {
          type: 'button',
          class: 'chip' + (moodFilter === 0 ? ' on' : ''),
          onclick: () => {
            moodFilter = 0;
            bus.render();
          },
        },
        'Todos',
      ),
      MOODS.map((m) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip' + (moodFilter === m.v ? ' on' : ''),
            onclick: () => {
              moodFilter = moodFilter === m.v ? 0 : m.v;
              bus.render();
            },
          },
          h('span', { class: 'chip-e' }, m.e),
          m.t,
        ),
      ),
    ),
  );
  root.append(list);

  function drawList() {
    const q = query.trim();
    const nq = norm(q);
    const keys = allKeys.filter((k) => {
      const dd = days[k];
      if (moodFilter && dd.mood !== moodFilter) return false;
      if (nq && !norm(dd.note).includes(nq)) return false;
      return true;
    });
    if (!keys.length) {
      list.replaceChildren(
        h(
          'div',
          { class: 'empty card slim' },
          h('div', { class: 'empty-e sm' }, allKeys.length ? '🔎' : '📔'),
          h('p', { class: 'muted' }, allKeys.length ? 'No hay notas que coincidan.' : 'Tu diario está en blanco. Cada día, escribe una frase sobre lo más importante que pasó.'),
        ),
      );
      return;
    }
    const groups = [];
    let cur = null;
    for (const k of keys) {
      const { y, m } = ymOf(k);
      const gk = `${y}-${m}`;
      if (!cur || cur.gk !== gk) {
        cur = { gk, y, m, keys: [] };
        groups.push(cur);
      }
      cur.keys.push(k);
    }
    list.replaceChildren(
      ...groups.map((g) =>
        h(
          'div',
          { class: 'diary-group' },
          h('div', { class: 'section-title' }, h('span', null, fmtMonthYear(g.y, g.m)), h('span', { class: 'section-count' }, g.keys.length)),
          h('div', { class: 'card list-card' }, g.keys.map((k) => entryRow(k, days[k], q))),
        ),
      ),
    );
  }
  drawList();
  return root;
}
