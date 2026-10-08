// Tarjeta de hábito compartida (Hoy, hoja del día).
import { h, rgba, WD_SHORT, todayKey } from './util.js';
import { startTimer, activeTimerHabitId } from './timer.js';
import { icon } from './icons.js';
import { streakInfo, weekProgress } from './logic.js';
import { getCategory } from './store.js';
import { pressable, numberSheet } from './ui.js';
import { toggleCheck, stepCount, setCount, toggleSkip, popId } from './actions.js';
import { bus } from './bus.js';

export const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

export function scheduleText(hb) {
  const s = hb.schedule;
  switch (s.type) {
    case 'days': {
      const ds = [1, 2, 3, 4, 5, 6, 0].filter((d) => (s.days || []).includes(d));
      if (ds.length === 7) return 'Todos los días';
      if (ds.length === 5 && !ds.includes(0) && !ds.includes(6)) return 'Entre semana';
      if (ds.length === 2 && ds.includes(0) && ds.includes(6)) return 'Fines de semana';
      return ds.map((d) => WD_SHORT[d]).join(', ');
    }
    case 'weekly':
      return `${s.times} ${s.times === 1 ? 'vez' : 'veces'} por semana`;
    case 'interval':
      return s.every <= 1 ? 'Todos los días' : `Cada ${s.every} días`;
    default:
      return 'Todos los días';
  }
}

export function habitVars(color) {
  return { '--c': color, '--c-soft': rgba(color, 0.16), '--c-mid': rgba(color, 0.34) };
}

export function habitCard(e, key, { noOpen = false } = {}) {
  const hb = e.habit;
  const st = streakInfo(hb);
  const cat = hb.categoryId ? getCategory(hb.categoryId) : null;
  const cls = ['hcard'];
  if (e.done) cls.push('done');
  if (e.skipped) cls.push('skipped');
  if (popId === hb.id) cls.push('pop');
  if (!e.sched && !e.done && !e.skipped) cls.push('off');

  const sub = [];
  if (e.skipped) {
    sub.push(h('span', { class: 'tag rest' }, '🌙 Día de descanso'));
  } else {
    const running = activeTimerHabitId() === hb.id;
    if (hb.timer > 0 && key === todayKey() && (!e.done || running)) {
      sub.push(
        h(
          'button',
          {
            type: 'button',
            class: 'timer-chip' + (running ? ' running' : ''),
            'aria-label': running ? 'Abrir temporizador' : `Empezar temporizador de ${hb.timer} minutos`,
            onclick: (ev) => {
              ev.stopPropagation();
              startTimer(hb, key);
            },
          },
          running ? '⏱️ en curso' : `▶ ${hb.timer} min`,
        ),
      );
    }
    if (hb.type === 'count') sub.push(h('span', { class: 'count-txt' }, `${fmtNum(Math.max(0, e.v))} / ${fmtNum(e.target)}${hb.unit ? ' ' + hb.unit : ''}`));
    if (hb.schedule.type === 'weekly') {
      const wp = weekProgress(hb, key);
      sub.push(h('span', null, `${wp.done}/${wp.times} esta semana`));
    }
    if (st.current >= 1) {
      const unit = hb.schedule.type === 'weekly' ? ' sem' : hb.avoid ? (st.current === 1 ? ' día' : ' días') : '';
      sub.push(h('span', { class: 'streak' + (hb.avoid ? ' clean' : '') }, `${hb.avoid ? '🛡️' : '🔥'} ${st.current}${unit}`));
    }
    if (cat) sub.push(h('span', { class: 'cat-dot', style: { '--cc': cat.color } }, cat.name));
    if (hb.avoid && st.current < 1) sub.push(h('span', { class: 'tag' }, 'para dejar'));
  }

  const open = noOpen ? null : () => bus.openHabit(hb.id);
  const bubble = h('button', { type: 'button', class: 'hbubble', 'aria-label': 'Ver ' + hb.name, onclick: open }, hb.emoji);
  const main = h(
    'div',
    { class: 'hmain', onclick: open },
    h('div', { class: 'hname' }, hb.name),
    sub.length ? h('div', { class: 'hsub' }, sub) : null,
    hb.type === 'count' && !e.skipped
      ? h('div', { class: 'hprog' }, h('i', { style: { width: Math.min(100, (Math.max(0, e.v) / e.target) * 100) + '%' } }))
      : null,
  );

  let action;
  if (e.skipped) {
    action = pressable(h('button', { type: 'button', class: 'chk rest', 'aria-label': 'Quitar descanso' }, '🌙'), {
      onTap: () => toggleSkip(hb, key),
    });
  } else if (hb.type === 'count') {
    const minus = pressable(h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Restar', disabled: e.v <= 0 }, icon('minus', 16, 2.4)), {
      onTap: () => stepCount(hb, key, -1),
    });
    const plus = pressable(
      h('button', { type: 'button', class: 'chk' + (e.done ? ' on' : ''), 'aria-label': 'Sumar' }, e.done ? icon('check', 22, 3) : icon('plus', 20, 2.6)),
      {
        onTap: () => stepCount(hb, key, 1),
        onLong: () =>
          numberSheet({
            title: `${hb.emoji} ${hb.name}`,
            value: Math.max(0, e.v),
            unit: hb.unit,
            onSave: (v) => setCount(hb, key, v),
          }),
      },
    );
    action = h('div', { class: 'counter' }, minus, plus);
  } else {
    action = pressable(
      h('button', { type: 'button', class: 'chk' + (e.done ? ' on' : ''), 'aria-label': e.done ? 'Desmarcar' : 'Marcar como hecho' }, icon('check', 22, 3)),
      { onTap: () => toggleCheck(hb, key), onLong: () => toggleSkip(hb, key) },
    );
  }

  return h('div', { class: cls.join(' '), style: habitVars(hb.color) }, bubble, main, action);
}
