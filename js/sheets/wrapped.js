// "Tu mes en resumen": historias a pantalla completa con lo mejor del mes.
import { h, keyOf, daysInMonth, todayKey, fmtMonth, addMonths, fromKey, WD_LONG } from '../util.js';
import { icon } from '../icons.js';
import { getState, allHabits, settings } from '../store.js';
import { monthStats, habitRates, weekdayStats, longestRunIn, insights } from '../logic.js';
import { MOODS, confetti } from '../ui.js';
import { insightText } from '../views/stats.js';
import { bus } from '../bus.js';

const WD_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const pct = (x) => Math.round((x || 0) * 100);

export function wrappedAvailable(y, m) {
  const first = keyOf(y, m, 1);
  if (first > todayKey()) return false;
  const ms = monthStats(y, m);
  return ms.total > 0 && ms.days.filter((d) => d.total > 0).length >= 3;
}

export function wrappedSeen(y, m) {
  try {
    return localStorage.getItem(`habitos-wrapped-${y}-${m}`) === '1';
  } catch {
    return false;
  }
}

function wrappedData(y, m) {
  if (!wrappedAvailable(y, m)) return null;
  const today = todayKey();
  const first = keyOf(y, m, 1);
  const last = keyOf(y, m, daysInMonth(y, m));
  const ms = monthStats(y, m);
  const rates = habitRates(ms).filter((r) => r.total >= 4 || (r.habit.schedule.type === 'weekly' && r.done > 0));
  const byPct = [...rates].sort((a, b) => b.pct - a.pct || b.done - a.done);
  const star = byPct[0] || null;
  const low = byPct.length > 1 ? byPct[byPct.length - 1] : null;
  const hardest = low && low.pct < 0.75 && low !== star ? low : null;

  let run = null;
  for (const hb of allHabits()) {
    if (hb.schedule.type === 'weekly') continue;
    const len = longestRunIn(hb, first, last);
    if (len >= 3 && (!run || len > run.len)) run = { hb, len };
  }

  let bestWd = null;
  weekdayStats(ms).forEach((o, i) => {
    if (o.total >= 3 && o.pct != null && (!bestWd || o.pct > bestWd.pct)) bestWd = { i, pct: o.pct };
  });

  const days = getState().days;
  const moodCounts = [0, 0, 0, 0, 0, 0];
  let moodSum = 0;
  let moodN = 0;
  const notes = [];
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const k = keyOf(y, m, d);
    if (k > today) break;
    const dd = days[k];
    if (!dd) continue;
    if (dd.mood) {
      moodCounts[dd.mood]++;
      moodSum += dd.mood;
      moodN++;
    }
    if (dd.note) {
      const s = ms.days.find((x) => x.key === k);
      notes.push({ k, note: dd.note, mood: dd.mood, score: (dd.mood || 3) + (s && s.total && s.done === s.total ? 2 : 0) });
    }
  }
  const moments = [...notes]
    .sort((a, b) => b.score - a.score || (a.k < b.k ? 1 : -1))
    .slice(0, 4)
    .sort((a, b) => (a.k < b.k ? -1 : 1));

  const pm = addMonths(y, m, -1);
  const prev = monthStats(pm.y, pm.m);
  return {
    y,
    m,
    isCurrent: last >= today,
    ms,
    star,
    hardest,
    run,
    bestWd,
    moodCounts,
    moodN,
    moments,
    prev: prev.total ? prev : null,
    prevName: fmtMonth(pm.m).toLowerCase(),
    nextName: fmtMonth(addMonths(y, m, 1).m).toLowerCase(),
    ins: insights().list[0] || null,
  };
}

// Animación de conteo para los números grandes.
function countUp(el, to, suffix = '') {
  const start = performance.now();
  const dur = 1100;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(to * eased) + suffix;
    if (p < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = '0' + suffix;
  requestAnimationFrame(step);
}

const at = (d) => ({ '--d': d + 's' });
const L = (text, d = 0, cls = '') => h('div', { class: 'wr-label wr-in ' + cls, style: at(d) }, text);
const slide = (...kids) => h('div', { class: 'wr-slide' }, ...kids);

function buildSlides(D) {
  const monthName = fmtMonth(D.m);
  const ml = monthName.toLowerCase();
  const s = [];

  s.push({
    build: () =>
      slide(
        L('Tu resumen de', 0),
        h('div', { class: 'wr-month wr-in', style: at(0.15) }, monthName),
        L(String(D.y), 0.3, 'soft'),
        h('div', { class: 'wr-emoji wr-in', style: at(0.55) }, '✨'),
        L(D.isCurrent ? 'Cómo va tu mes hasta hoy' : 'Veamos cómo te fue', 0.8, 'soft'),
      ),
  });

  s.push({
    build: () => {
      const num = h('div', { class: 'wr-big wr-in', style: at(0.15) }, '0%');
      countUp(num, pct(D.ms.pct), '%');
      let delta = null;
      if (D.prev && D.prev.pct != null) {
        const diff = pct(D.ms.pct) - pct(D.prev.pct);
        delta = L(diff > 0 ? `▲ ${diff} puntos más que en ${D.prevName}` : diff < 0 ? `▼ ${-diff} puntos menos que en ${D.prevName}` : `Igual que en ${D.prevName}`, 0.9, 'soft');
      }
      return slide(
        L(D.isCurrent ? 'Hasta ahora, este mes cumpliste' : 'Este mes cumpliste', 0),
        num,
        L('de tus hábitos', 0.3),
        h(
          'div',
          { class: 'wr-chips wr-in', style: at(0.6) },
          h('span', null, `✅ ${D.ms.done} hábitos completados`),
          h('span', null, `⭐ ${D.ms.perfect} día${D.ms.perfect === 1 ? '' : 's'} perfecto${D.ms.perfect === 1 ? '' : 's'}`),
        ),
        delta,
      );
    },
  });

  if (D.star) {
    s.push({
      build: () =>
        slide(
          L('Tu hábito estrella', 0),
          h('div', { class: 'wr-hero wr-in', style: { ...at(0.15), '--c': D.star.habit.color } }, D.star.habit.emoji),
          h('div', { class: 'wr-name wr-in', style: at(0.35) }, D.star.habit.name),
          L(`${pct(D.star.pct)} % de cumplimiento en ${ml}`, 0.5),
          D.hardest
            ? h('div', { class: 'wr-note wr-in', style: at(0.9) }, 'El que más te costó: ', h('b', null, `${D.hardest.habit.emoji} ${D.hardest.habit.name}`), ` (${pct(D.hardest.pct)} %). El mes que viene, va por él 💪`)
            : null,
        ),
    });
  }

  if (D.run) {
    s.push({
      build: () => {
        const num = h('div', { class: 'wr-big wr-in', style: at(0.15) }, '0');
        countUp(num, D.run.len);
        return slide(
          L('Tu mejor racha del mes', 0),
          h('div', { class: 'wr-fire wr-in', style: at(0.05) }, '🔥'),
          num,
          L('días seguidos de', 0.35),
          h('div', { class: 'wr-name wr-in', style: at(0.5) }, `${D.run.hb.emoji} ${D.run.hb.name}`),
        );
      },
    });
  }

  if (D.bestWd) {
    s.push({
      build: () =>
        slide(
          L('Tu día más fuerte', 0),
          h('div', { class: 'wr-month wr-in', style: at(0.15) }, WD_LONG[D.bestWd.i]),
          L(`Los ${WD_PLURAL[D.bestWd.i]} cumpliste el ${pct(D.bestWd.pct)} % de tus hábitos`, 0.4),
          h('div', { class: 'wr-emoji wr-in', style: at(0.7) }, '💪'),
        ),
    });
  }

  if (D.moodN >= 3) {
    const max = Math.max(...D.moodCounts);
    const top = D.moodCounts.indexOf(max);
    const mt = MOODS.find((x) => x.v === top);
    s.push({
      build: () =>
        slide(
          L('Cómo te sentiste', 0),
          h(
            'div',
            { class: 'wr-moods' },
            [...MOODS].reverse().map((md, j) =>
              h(
                'div',
                { class: 'wr-mood wr-in', style: at(0.15 + j * 0.1) },
                h('span', { class: 'wm-e' }, md.e),
                h('span', { class: 'wm-bar' }, h('i', { style: { width: (max ? Math.round((D.moodCounts[md.v] / max) * 100) : 0) + '%' } })),
                h('span', { class: 'wm-n' }, D.moodCounts[md.v]),
              ),
            ),
          ),
          L(`Lo más frecuente: ${mt.e} ${mt.t.toLowerCase()}`, 0.8),
        ),
    });
  }

  if (D.moments.length) {
    s.push({
      build: () =>
        slide(
          L('Momentos del mes', 0),
          h(
            'div',
            { class: 'wr-quotes' },
            D.moments.map((n, j) => {
              const mood = n.mood ? MOODS.find((x) => x.v === n.mood) : null;
              return h(
                'div',
                { class: 'wr-quote wr-in', style: at(0.2 + j * 0.18) },
                h('div', { class: 'wq-date' }, `${fromKey(n.k).getDate()} de ${ml}`, mood ? ' · ' + mood.e : ''),
                h('div', { class: 'wq-text' }, `“${n.note}”`),
              );
            }),
          ),
        ),
    });
  }

  if (D.ins) {
    s.push({
      build: () =>
        slide(
          L('Algo que descubrimos sobre ti', 0),
          h('div', { class: 'wr-emoji wr-in', style: at(0.15) }, D.ins.emoji),
          h('div', { class: 'wr-insight wr-in', style: at(0.35) }, insightText(D.ins.parts)),
        ),
    });
  }

  s.push({
    build: () =>
      slide(
        h('div', { class: 'wr-emoji big wr-in', style: at(0) }, '🤍'),
        h('div', { class: 'wr-name wr-in', style: at(0.2) }, 'Gracias por cuidarte'),
        L(D.isCurrent ? 'Sigue así: el mes todavía no termina.' : `Nos vemos en ${D.nextName}.`, 0.45, 'soft'),
      ),
    onShow: () => {
      if (settings().celebrate !== false) setTimeout(confetti, 300);
    },
    last: true,
  });
  return s;
}

export function openWrapped(y, m) {
  const D = wrappedData(y, m);
  if (!D) return;
  const slides = buildSlides(D);
  let i = 0;
  const bars = h('div', { class: 'wr-bars' }, slides.map(() => h('i')));
  const stage = h('div', { class: 'wr-stage' });
  const nextBtn = h('button', { type: 'button', class: 'btn primary wr-next' });
  const el = h(
    'div',
    { class: 'wrapped', role: 'dialog', 'aria-label': `Resumen de ${fmtMonth(m)}` },
    bars,
    h('button', { type: 'button', class: 'icon-btn wr-close', 'aria-label': 'Cerrar', onclick: () => close() }, icon('x', 22)),
    stage,
    h('div', { class: 'wr-foot' }, nextBtn),
  );

  const show = (n) => {
    i = Math.max(0, Math.min(slides.length - 1, n));
    el.style.setProperty('--shift', String(i * 26));
    stage.replaceChildren(slides[i].build());
    [...bars.children].forEach((b, j) => {
      b.className = j < i ? 'done' : j === i ? 'on' : '';
    });
    nextBtn.textContent = slides[i].last ? 'Cerrar' : 'Siguiente';
    if (slides[i].onShow) slides[i].onShow();
  };
  const next = () => (i >= slides.length - 1 ? close() : show(i + 1));
  nextBtn.onclick = (e) => {
    e.stopPropagation();
    next();
  };
  stage.addEventListener('click', (e) => {
    if (e.clientX < window.innerWidth * 0.3) show(i - 1);
    else next();
  });
  const onKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') next();
    else if (e.key === 'ArrowLeft') show(i - 1);
    else if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  let sy = null;
  el.addEventListener('pointerdown', (e) => {
    sy = e.clientY;
  });
  el.addEventListener('pointerup', (e) => {
    if (sy != null && e.clientY - sy > 120) close();
    sy = null;
  });

  function close() {
    document.removeEventListener('keydown', onKey);
    bus.render();
    el.classList.remove('open');
    setTimeout(() => {
      el.remove();
      if (!document.querySelector('.sheet-wrap')) document.body.classList.remove('noscroll');
    }, 300);
  }

  document.body.appendChild(el);
  document.body.classList.add('noscroll');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  show(0);
  try {
    localStorage.setItem(`habitos-wrapped-${y}-${m}`, '1');
  } catch {}
}
