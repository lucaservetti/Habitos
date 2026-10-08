// Hoja de un día: hábitos de ese día, estado de ánimo y nota.
import { h, todayKey, addDays, fmtLong } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, MOODS } from '../ui.js';
import { getDay, setDay, subscribe, allHabits } from '../store.js';
import { dayStats, entry, isActiveOn } from '../logic.js';
import { ring } from '../charts.js';
import { habitCard } from '../habitUi.js';
import { bus } from '../bus.js';

export function moodRow(key) {
  const d = getDay(key);
  const cur = d ? d.mood : 0;
  return h(
    'div',
    { class: 'moods' },
    MOODS.map((m) =>
      h(
        'button',
        {
          type: 'button',
          class: 'mood' + (cur === m.v ? ' on' : ''),
          'aria-label': m.t,
          onclick: () => setDay(key, { mood: cur === m.v ? 0 : m.v }),
        },
        h('span', { class: 'mood-e' }, m.e),
        h('span', { class: 'mood-t' }, m.t),
      ),
    ),
  );
}

export function noteInput(key, { rows = 3, placeholder = '¿Qué fue lo más importante de este día?' } = {}) {
  const d = getDay(key);
  const max = 280;
  const counter = h('span', { class: 'counter-txt' }, `${(d?.note || '').length}/${max}`);
  const ta = h(
    'textarea',
    {
      class: 'input note-input',
      rows,
      maxlength: max,
      placeholder,
      oninput: (e) => {
        setDay(key, { note: e.target.value }, { silent: true });
        counter.textContent = `${e.target.value.length}/${max}`;
      },
    },
    d?.note || '',
  );
  return h('div', { class: 'note-wrap' }, ta, counter);
}

export function openDaySheet(startKey) {
  let key = startKey;
  let unsub = null;
  let showOther = false;
  openSheet({
    title: '',
    full: true,
    onClose: () => {
      if (unsub) unsub();
      bus.render();
    },
    build(body, api) {
      const today = todayKey();
      const nav = h('div', { class: 'day-nav' });
      const summary = h('div');
      const moods = h('div');
      const note = h('div');
      const list = h('div', { class: 'hlist' });
      body.append(
        nav,
        summary,
        h('div', { class: 'card' }, h('div', { class: 'card-title' }, '✨ Lo más importante del día'), note, moods),
        h('div', { class: 'section-title' }, 'Hábitos'),
        list,
      );

      const drawNav = () => {
        api.setTitle(key === today ? 'Hoy' : key === addDays(today, -1) ? 'Ayer' : '');
        nav.replaceChildren(
          h('button', { type: 'button', class: 'icon-btn soft', 'aria-label': 'Día anterior', onclick: () => go(-1) }, icon('left', 20)),
          h('div', { class: 'day-nav-title' }, fmtLong(key)),
          h('button', { type: 'button', class: 'icon-btn soft', 'aria-label': 'Día siguiente', disabled: key >= today, onclick: () => go(1) }, icon('right', 20)),
        );
      };
      const drawDynamic = () => {
        if (api.closed) return;
        const ds = dayStats(key);
        const pct = ds.pct;
        summary.replaceChildren(
          h(
            'div',
            { class: 'day-summary' },
            ring({ pct: pct || 0, size: 72, stroke: 8, children: pct == null ? '–' : Math.round(pct * 100) + '%' }),
            h(
              'div',
              null,
              h('div', { class: 'big-txt' }, ds.total ? `${ds.done} de ${ds.total}` : 'Sin hábitos'),
              h('div', { class: 'muted' }, ds.total ? (ds.done === ds.total ? '¡Día completo! 🎉' : 'hábitos completados') : 'No había hábitos programados'),
            ),
          ),
        );
        moods.replaceChildren(moodRow(key));
        const others = allHabits().filter((hb) => isActiveOn(hb, key) && !ds.items.some((i) => i.habit.id === hb.id));
        list.replaceChildren(
          ...(ds.items.length ? ds.items.map((e) => habitCard(e, key)) : [h('div', { class: 'empty-mini' }, 'No hay hábitos programados este día.')]),
          others.length
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'link-btn other-toggle',
                  onclick: () => {
                    showOther = !showOther;
                    drawDynamic();
                  },
                },
                icon(showOther ? 'up' : 'down', 16),
                `Otros hábitos (${others.length})`,
              )
            : null,
          showOther ? others.map((hb) => habitCard(entry(hb, key), key)) : null,
        );
      };
      const drawAll = () => {
        drawNav();
        note.replaceChildren(noteInput(key));
        drawDynamic();
      };
      const go = (d) => {
        const nk = addDays(key, d);
        if (nk > today) return;
        key = nk;
        showOther = false;
        drawAll();
        body.scrollTop = 0;
      };
      drawAll();
      unsub = subscribe(drawDynamic);
    },
  });
}
