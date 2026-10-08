// Detalle de un hábito: rachas, mapa de calor, progreso mensual.
import { h, todayKey, addDays, keyOf, daysInMonth, addMonths, ymOf, MONTHS_SHORT } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast, undoToast, numberSheet, ROUTINES } from '../ui.js';
import { getHabit, getCategory, subscribe, archiveHabit, restoreHabit, getState } from '../store.js';
import { streakInfo, entry, isActiveOn, rangeStats, habitRates, valueOf, targetOf, scheduledOn, isDoneVal } from '../logic.js';
import { heatmap, vbars } from '../charts.js';
import { habitCard, habitVars, scheduleText, fmtNum } from '../habitUi.js';
import { toggleSkip, setCount } from '../actions.js';
import { startTimer } from '../timer.js';
import { bus } from '../bus.js';

function tile(label, value, sub) {
  return h('div', { class: 'tile' }, h('div', { class: 'tile-val' }, value), h('div', { class: 'tile-label' }, label), sub ? h('div', { class: 'tile-sub' }, sub) : null);
}

export function openHabitDetail(id) {
  let unsub = null;
  openSheet({
    title: '',
    full: true,
    onClose: () => unsub && unsub(),
    build(body, api) {
      const draw = () => {
        if (api.closed) return;
        const hb = getHabit(id);
        if (!hb) {
          api.close();
          return;
        }
        const st = body.scrollTop;
        const today = todayKey();
        const s = streakInfo(hb);
        const cat = hb.categoryId ? getCategory(hb.categoryId) : null;
        const routine = ROUTINES.find((r) => r.id === hb.routine);
        const r30 = habitRates(rangeStats(addDays(today, -29), today)).find((r) => r.habit.id === id);
        const unit = s.unit === 'semanas' ? 'sem' : 'días';

        const parts = [];
        parts.push(
          h(
            'div',
            { class: 'detail-hero', style: habitVars(hb.color) },
            h('div', { class: 'hbubble xl' }, hb.emoji),
            h('h2', null, hb.name),
            h(
              'div',
              { class: 'meta-chips' },
              h('span', { class: 'mchip' }, '🗓️ ', scheduleText(hb)),
              routine && hb.routine !== 'any' ? h('span', { class: 'mchip' }, routine.emoji, ' ', routine.label) : null,
              cat ? h('span', { class: 'mchip' }, cat.emoji, ' ', cat.name) : null,
              hb.type === 'count' ? h('span', { class: 'mchip' }, '🎯 ', `${fmtNum(targetOf(hb))} ${hb.unit || ''}`.trim()) : null,
              hb.reminder.on ? h('span', { class: 'mchip' }, '🔔 ', hb.reminder.time) : null,
              hb.timer > 0 ? h('span', { class: 'mchip' }, '⏱️ ', `${hb.timer} min`) : null,
              hb.avoid ? h('span', { class: 'mchip' }, '🛡️ Para dejar') : null,
              hb.archivedAt ? h('span', { class: 'mchip warn' }, '📦 Archivado') : null,
            ),
          ),
        );

        if (hb.why) parts.push(h('div', { class: 'why card' }, h('span', { class: 'why-q' }, '“'), hb.why));

        if (isActiveOn(hb, today)) {
          const e = entry(hb, today);
          parts.push(
            h('div', { class: 'section-title' }, 'Hoy'),
            habitCard(e, today, { noOpen: true }),
            h(
              'div',
              { class: 'row-gap small' },
              hb.timer > 0 && !e.skipped
                ? h('button', { type: 'button', class: 'btn primary sm', onclick: () => startTimer(hb, today) }, icon('play', 16, 0), `Temporizador · ${hb.timer} min`)
                : null,
              h(
                'button',
                { type: 'button', class: 'btn soft sm', onclick: () => toggleSkip(hb, today) },
                e.skipped ? '☀️ Quitar descanso' : '🌙 Día de descanso',
              ),
              hb.type === 'count'
                ? h(
                    'button',
                    {
                      type: 'button',
                      class: 'btn soft sm',
                      onclick: () =>
                        numberSheet({
                          title: `${hb.emoji} ${hb.name}`,
                          value: Math.max(0, valueOf(today, hb.id)),
                          unit: hb.unit,
                          onSave: (v) => setCount(hb, today, v),
                        }),
                    },
                    '✏️ Escribir cantidad',
                  )
                : null,
            ),
            h('div', { class: 'hint center' }, 'Consejo: mantén pulsado el botón ✓ para marcar descanso sin romper la racha.'),
          );
        }

        const saved = hb.avoid && hb.savePerDay > 0 ? s.total * hb.savePerDay : 0;
        parts.push(
          h(
            'div',
            { class: 'tiles' },
            hb.avoid ? tile('Racha limpia', `🛡️ ${s.current}`, unit) : tile('Racha actual', `🔥 ${s.current}`, unit),
            tile('Mejor racha', `🏆 ${s.best}`, unit),
            saved
              ? tile('Ahorrado', `💰 ${Math.round(saved).toLocaleString('es')}`, `en ${s.total} día${s.total === 1 ? '' : 's'} logrado${s.total === 1 ? '' : 's'}`)
              : tile(hb.avoid ? 'Días logrados' : 'Veces completado', `✅ ${s.total}`, 'en total'),
            tile('Últimos 30 días', r30 ? `${Math.round(r30.pct * 100)}%` : '–', 'de cumplimiento'),
          ),
        );

        const level = (k) => {
          if (!isActiveOn(hb, k)) return null;
          const v = valueOf(k, hb.id);
          if (v === -1) return null;
          if (isDoneVal(hb, v)) return 1;
          if (v > 0) return Math.min(0.9, v / targetOf(hb));
          return scheduledOn(hb, k) && k < today ? 0 : null;
        };
        parts.push(
          h(
            'div',
            { class: 'card' },
            h('div', { class: 'card-title' }, 'Historial'),
            heatmap({
              weeks: 18,
              ws: getState().settings.weekStart,
              level,
              color: hb.color,
              onPick: (k) => bus.openDay(k),
            }),
          ),
        );

        const { y, m } = ymOf(today);
        const months = [];
        for (let i = 5; i >= 0; i--) {
          const mm = addMonths(y, m, -i);
          const from = keyOf(mm.y, mm.m, 1);
          const to = keyOf(mm.y, mm.m, daysInMonth(mm.y, mm.m));
          const r = to < hb.startDate ? null : habitRates(rangeStats(from, to)).find((x) => x.habit.id === id);
          months.push({ label: MONTHS_SHORT[mm.m], pct: r && (r.total || r.done) ? r.pct : null });
        }
        parts.push(h('div', { class: 'card' }, h('div', { class: 'card-title' }, 'Cumplimiento por mes'), vbars(months, { highlight: 5 })));

        parts.push(
          h(
            'div',
            { class: 'detail-actions' },
            h('button', { type: 'button', class: 'btn primary', onclick: () => bus.openHabitForm(getHabit(id), { onDeleted: () => api.close() }) }, icon('pencil', 18), 'Editar'),
            hb.archivedAt
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn soft',
                    onclick: () => {
                      restoreHabit(id);
                      toast('Hábito restaurado 🌱');
                    },
                  },
                  icon('refresh', 18),
                  'Restaurar',
                )
              : h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn soft',
                    onclick: () => {
                      archiveHabit(id);
                      api.close();
                      undoToast('Hábito archivado 📦', () => restoreHabit(id));
                    },
                  },
                  icon('archive', 18),
                  'Archivar',
                ),
          ),
        );

        body.replaceChildren(...parts);
        body.scrollTop = st;
      };
      draw();
      unsub = subscribe(draw);
    },
  });
}
