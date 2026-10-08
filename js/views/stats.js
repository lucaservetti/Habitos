// Pantalla "Progreso": estadísticas, gráficas, ranking y logros.
import { h, todayKey, addDays, WD_LONG, WD_SHORT, fmtDayMonth } from '../util.js';
import { allHabits, settings } from '../store.js';
import { rangeStats, weekdayStats, categoryStats, habitRates, bestCurrentStreak, earliestKey, weekSummary, achievements, dayStats, insights } from '../logic.js';
import { areaChart, bucketSeries, hbars, vbars, heatmap } from '../charts.js';
import { segmented, MOODS } from '../ui.js';
import { bus } from '../bus.js';

let period = 'm';
let showAllAch = false;
let showAllIns = false;
const PERIODS = [
  { value: 'w', label: '7 días', days: 7 },
  { value: 'm', label: '30 días', days: 30 },
  { value: 'q', label: '90 días', days: 90 },
  { value: 'y', label: 'Año', days: 365 },
  { value: 'all', label: 'Todo' },
];

export function insightText(parts) {
  return parts.map((p) => (typeof p === 'string' ? p : h('b', null, p.b)));
}

function insightsCard() {
  const { list, moodDays } = insights();
  const shown = showAllIns ? list : list.slice(0, 3);
  const kids = [h('div', { class: 'card-title' }, '💡 Descubrimientos', list.length ? h('span', { class: 'section-count' }, list.length) : null)];
  if (!list.length) {
    kids.push(
      h(
        'div',
        { class: 'ins-empty' },
        h('p', null, 'Aquí aparecerán patrones sobre ti: qué hábitos mejoran tu ánimo, cuáles se potencian entre sí y qué días te cuestan más.'),
        h('p', { class: 'muted' }, 'Sigue marcando tus hábitos y registra tu ánimo 😊 cada día. Hacen falta unas dos o tres semanas de datos.'),
        h('div', { class: 'ins-progress' }, h('i', { style: { width: Math.min(100, Math.round((moodDays / 14) * 100)) + '%' } })),
        h('div', { class: 'hint' }, `${Math.min(moodDays, 14)} de 14 días con ánimo registrado`),
      ),
    );
  } else {
    kids.push(h('div', { class: 'ins-list' }, shown.map((it) => h('div', { class: 'ins' }, h('span', { class: 'ins-e' }, it.emoji), h('p', null, insightText(it.parts))))));
    if (list.length > 3) {
      kids.push(
        h(
          'button',
          {
            type: 'button',
            class: 'link-btn center',
            onclick: () => {
              showAllIns = !showAllIns;
              bus.render();
            },
          },
          showAllIns ? 'Ver menos' : `Ver ${list.length - 3} más`,
        ),
      );
    }
    if (moodDays < 10) kids.push(h('div', { class: 'hint ins-hint' }, '😊 Registra tu ánimo cada día para descubrir cómo te afectan tus hábitos.'));
  }
  return h('div', { class: 'card ins-card' }, ...kids);
}

function tile(emoji, value, label) {
  return h('div', { class: 'tile' }, h('div', { class: 'tile-val' }, h('span', { class: 'tile-e' }, emoji), value), h('div', { class: 'tile-label' }, label));
}

export function renderStats() {
  const today = todayKey();
  const root = h('div', { class: 'view view-stats' });
  root.append(h('header', { class: 'page-head' }, h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, 'Tu progreso'), h('h1', null, 'Estadísticas'))));

  if (!allHabits().length) {
    root.append(h('div', { class: 'empty card' }, h('div', { class: 'empty-e' }, '📊'), h('h3', null, 'Aún no hay datos'), h('p', { class: 'muted' }, 'Crea hábitos y márcalos para ver aquí tus gráficas, rachas y logros.')));
    return root;
  }

  root.append(
    segmented(
      PERIODS.map((p) => ({ value: p.value, label: p.label })),
      period,
      (v) => {
        period = v;
        bus.render();
      },
      'small',
    ),
  );

  const p = PERIODS.find((x) => x.value === period);
  const first = earliestKey();
  const wanted = p.days ? addDays(today, -(p.days - 1)) : first;
  const from = wanted < first ? first : wanted;
  const rs = rangeStats(from, today);
  const best = bestCurrentStreak();

  root.append(
    h(
      'div',
      { class: 'tiles' },
      tile('🎯', rs.pct == null ? '–' : Math.round(rs.pct * 100) + '%', 'Cumplimiento'),
      tile('⭐', rs.perfect, rs.perfect === 1 ? 'Día perfecto' : 'Días perfectos'),
      tile('🔥', best ? best.s.current : 0, best && best.s.current ? `Racha actual · ${best.h.emoji}` : 'Racha actual'),
      tile('✅', rs.done, 'Hábitos cumplidos'),
    ),
  );

  root.append(insightsCard());

  let series;
  let note = null;
  if (p.days && p.days >= 30 && p.days <= 90) {
    const ext = rangeStats(addDays(from, -6), today).days;
    series = ext
      .map((d, i) => {
        let t = 0;
        let dn = 0;
        for (let j = Math.max(0, i - 6); j <= i; j++) {
          t += ext[j].total;
          dn += ext[j].done;
        }
        return { key: d.key, pct: t ? dn / t : null };
      })
      .slice(ext.length - rs.days.length);
    note = 'Media de los últimos 7 días, para ver la tendencia sin altibajos.';
  } else {
    series = bucketSeries(rs.days, 60);
    if (series.length < rs.days.length) note = 'Cada punto es el promedio de varios días.';
  }
  root.append(
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'card-title' }, '📈 Evolución'),
      areaChart(series, { height: 150 }),
      note ? h('div', { class: 'hint chart-note' }, note) : null,
    ),
  );

  root.append(
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'card-title' }, '🟩 Constancia'),
      heatmap({
        weeks: 20,
        ws: settings().weekStart ?? 1,
        level: (k) => dayStats(k).pct,
        onPick: (k) => bus.openDay(k),
      }),
    ),
  );

  // Resumen semanal
  const ws = weekSummary(today);
  const curP = ws.cur.pct;
  const prevP = ws.prev.pct;
  const delta = curP != null && prevP != null ? Math.round((curP - prevP) * 100) : null;
  const mood = ws.mood ? MOODS[Math.min(4, Math.max(0, Math.round(ws.mood) - 1))] : null;
  root.append(
    h(
      'div',
      { class: 'card week-card' },
      h('div', { class: 'card-title' }, '🗓️ Esta semana'),
      h(
        'div',
        { class: 'week-row' },
        h('div', { class: 'week-big' }, curP == null ? '–' : Math.round(curP * 100) + '%'),
        h(
          'div',
          { class: 'grow' },
          delta != null
            ? h('div', { class: 'delta ' + (delta >= 0 ? 'up' : 'down') }, delta >= 0 ? `▲ ${delta} pts vs. semana pasada` : `▼ ${-delta} pts vs. semana pasada`)
            : h('div', { class: 'muted' }, 'Sin datos de la semana pasada'),
          h('div', { class: 'muted' }, `${fmtDayMonth(ws.start)} – ${fmtDayMonth(ws.end)}`),
        ),
      ),
      h(
        'div',
        { class: 'week-facts' },
        ws.best ? h('div', null, '🏅 Lo mejor: ', h('b', null, `${ws.best.habit.emoji} ${ws.best.habit.name}`)) : null,
        ws.worst && ws.worst.pct < 1 && ws.worst.habit.id !== ws.best?.habit.id ? h('div', null, '🌱 Para reforzar: ', h('b', null, `${ws.worst.habit.emoji} ${ws.worst.habit.name}`)) : null,
        h('div', null, `📝 ${ws.notes} nota${ws.notes === 1 ? '' : 's'} esta semana`),
        mood ? h('div', null, `${mood.e} Ánimo promedio: ${mood.t.toLowerCase()}`) : null,
      ),
    ),
  );

  // Por día de la semana
  const wd = weekdayStats(rs);
  const wsStart = settings().weekStart ?? 1;
  const order = Array.from({ length: 7 }, (_, i) => (wsStart + i) % 7);
  const items = order.map((d) => ({ label: WD_SHORT[d], pct: wd[d].pct }));
  let bestIdx = -1;
  let bestVal = -1;
  items.forEach((it, i) => {
    if (it.pct != null && it.pct > bestVal) {
      bestVal = it.pct;
      bestIdx = i;
    }
  });
  root.append(
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'card-title' }, '📅 Por día de la semana'),
      vbars(items, { highlight: bestIdx }),
      bestIdx >= 0 ? h('div', { class: 'insight' }, `✨ Tu mejor día es el ${WD_LONG[order[bestIdx]].toLowerCase()} (${Math.round(bestVal * 100)}%)`) : null,
    ),
  );

  // Por categoría
  const cs = categoryStats(rs);
  if (cs.length > 1 || (cs.length === 1 && cs[0].id !== 'none')) {
    root.append(
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, '🏷️ Por categoría'), hbars(cs.map((c) => ({ label: c.name, emoji: c.emoji, pct: c.pct, color: c.color })))),
    );
  }

  // Ranking de hábitos
  const rates = habitRates(rs)
    .filter((r) => !r.habit.archivedAt || r.done > 0)
    .sort((a, b) => b.pct - a.pct || b.streak.current - a.streak.current);
  root.append(
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'card-title' }, '🏆 Tus hábitos'),
      h(
        'div',
        { class: 'rank' },
        rates.map((r) =>
          h(
            'button',
            { type: 'button', class: 'rank-row', onclick: () => bus.openHabit(r.habit.id) },
            h('span', { class: 'rank-e', style: { background: r.habit.color + '2e' } }, r.habit.emoji),
            h(
              'span',
              { class: 'rank-main' },
              h('span', { class: 'rank-name' }, r.habit.name),
              h('span', { class: 'rank-bar' }, h('i', { style: { width: Math.round(r.pct * 100) + '%', background: r.habit.color } })),
            ),
            h(
              'span',
              { class: 'rank-side' },
              h('b', null, Math.round(r.pct * 100) + '%'),
              h('span', null, `🔥${r.streak.current} · 🏆${r.streak.best}`),
            ),
          ),
        ),
      ),
    ),
  );

  // Logros
  const ach = achievements();
  const unlocked = ach.filter((a) => a.unlocked).length;
  const visible = showAllAch ? ach : [...ach.filter((a) => a.unlocked), ...ach.filter((a) => !a.unlocked)].slice(0, 8);
  root.append(
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'card-title' }, '🎖️ Logros', h('span', { class: 'section-count' }, `${unlocked}/${ach.length}`)),
      h(
        'div',
        { class: 'ach-grid' },
        visible.map((a) =>
          h(
            'div',
            { class: 'ach' + (a.unlocked ? ' on' : '') },
            h('div', { class: 'ach-e' }, a.emoji),
            h('div', { class: 'ach-t' }, a.title),
            h('div', { class: 'ach-d' }, a.desc),
            a.unlocked ? null : h('div', { class: 'ach-p' }, h('i', { style: { width: Math.round((a.cur / a.goal) * 100) + '%' } })),
          ),
        ),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'link-btn center',
          onclick: () => {
            showAllAch = !showAllAch;
            bus.render();
          },
        },
        showAllAch ? 'Ver menos' : 'Ver todos los logros',
      ),
    ),
  );

  return root;
}
