// Reglas de negocio: programación, cumplimiento, rachas, estadísticas y logros.
import { getState, allHabits, getVersion, getCategory, categories } from './store.js';
import { addDays, diffDays, dow, todayKey, weekStartKey, eachDay, keyOf, daysInMonth } from './util.js';

const cache = new Map();
let cacheVer = -1;
function memo(key, fn) {
  const v = getVersion();
  if (v !== cacheVer) {
    cache.clear();
    cacheVer = v;
  }
  if (cache.has(key)) return cache.get(key);
  const r = fn();
  cache.set(key, r);
  return r;
}

export const valueOf = (key, id) => getState().days[key]?.logs?.[id] ?? 0;
export const targetOf = (h) => (h.type === 'count' ? Math.max(1, Number(h.target) || 1) : 1);
export const isDoneVal = (h, v) => v > 0 && v >= targetOf(h);
const wsOf = () => getState().settings.weekStart ?? 1;

export function isActiveOn(h, key) {
  if (h.deleted) return false;
  if (key < h.startDate) return false;
  if (h.archivedAt && key >= h.archivedAt) return false;
  for (const p of h.pauses || []) if (key >= p.from && key < p.to) return false;
  return true;
}

function weeklyDoneBefore(h, key) {
  const start = weekStartKey(key, wsOf());
  let c = 0;
  for (let k = start; k < key; k = addDays(k, 1)) if (isDoneVal(h, valueOf(k, h.id))) c++;
  return c;
}

export function scheduledOn(h, key) {
  if (!isActiveOn(h, key)) return false;
  const s = h.schedule;
  switch (s.type) {
    case 'days':
      return (s.days || []).includes(dow(key));
    case 'interval':
      return diffDays(key, h.startDate) % Math.max(1, s.every || 1) === 0;
    case 'weekly': {
      const v = valueOf(key, h.id);
      if (isDoneVal(h, v)) return true;
      return weeklyDoneBefore(h, key) < Math.max(1, s.times || 1);
    }
    default:
      return true;
  }
}

export function weekProgress(h, key) {
  const ws = wsOf();
  const start = weekStartKey(key, ws);
  let c = 0;
  for (let i = 0; i < 7; i++) {
    const k = addDays(start, i);
    if (isActiveOn(h, k) && isDoneVal(h, valueOf(k, h.id))) c++;
  }
  return { done: c, times: Math.max(1, h.schedule.times || 1) };
}

export function entry(h, key) {
  const v = valueOf(key, h.id);
  const target = targetOf(h);
  const sched = scheduledOn(h, key);
  return {
    habit: h,
    key,
    v,
    target,
    sched,
    skipped: v === -1,
    done: isDoneVal(h, v),
    partial: v > 0 && v < target,
  };
}

export function dayStats(key) {
  return memo('d:' + key, () => {
    const items = [];
    let total = 0;
    let done = 0;
    for (const h of allHabits()) {
      if (!isActiveOn(h, key)) continue;
      const e = entry(h, key);
      if (!e.sched && !e.done && !e.skipped) continue;
      e.counts = false;
      items.push(e);
      if (e.skipped) continue;
      if (h.schedule.type === 'weekly' && !e.done) continue;
      e.counts = true;
      total++;
      if (e.done) done++;
    }
    return { key, items, total, done, pct: total ? done / total : null };
  });
}

// ---------- Rachas ----------
export function streakInfo(h, today = todayKey()) {
  return memo(`s:${h.id}:${today}`, () => (h.schedule.type === 'weekly' ? weekStreaks(h, today) : dayStreaks(h, today)));
}

function dayStreaks(h, today) {
  let run = 0;
  let best = 0;
  let total = 0;
  const end = h.archivedAt && h.archivedAt <= today ? addDays(h.archivedAt, -1) : today;
  for (let k = h.startDate; k <= end; k = addDays(k, 1)) {
    if (!isActiveOn(h, k)) continue;
    const v = valueOf(k, h.id);
    if (v === -1) continue;
    if (isDoneVal(h, v)) {
      total++;
      run++;
      if (run > best) best = run;
      continue;
    }
    if (!scheduledOn(h, k)) continue;
    if (k === today) continue;
    run = 0;
  }
  return { current: run, best, total, unit: 'días' };
}

function weekStreaks(h, today) {
  const ws = wsOf();
  const times = Math.max(1, h.schedule.times || 1);
  const curWeek = weekStartKey(today, ws);
  let run = 0;
  let best = 0;
  let total = 0;
  for (let wk = weekStartKey(h.startDate, ws); wk <= curWeek; wk = addDays(wk, 7)) {
    let c = 0;
    for (let i = 0; i < 7; i++) {
      const k = addDays(wk, i);
      if (k > today) break;
      if (isActiveOn(h, k) && isDoneVal(h, valueOf(k, h.id))) c++;
    }
    total += c;
    if (c >= times) {
      run++;
      if (run > best) best = run;
    } else if (wk !== curWeek) run = 0;
  }
  return { current: run, best, total, unit: 'semanas' };
}

export function bestCurrentStreak() {
  let best = null;
  for (const h of allHabits()) {
    if (h.archivedAt) continue;
    const s = streakInfo(h);
    if (!best || s.current > best.s.current) best = { h, s };
  }
  return best;
}

// ---------- Estadísticas por rango ----------
export function rangeStats(from, to) {
  const t = todayKey();
  if (to > t) to = t;
  const days = [];
  let total = 0;
  let done = 0;
  let perfect = 0;
  for (const k of eachDay(from, to)) {
    const s = dayStats(k);
    days.push(s);
    total += s.total;
    done += s.done;
    if (s.total > 0 && s.done === s.total) perfect++;
  }
  return { from, to, days, total, done, pct: total ? done / total : null, perfect };
}

export function monthStats(y, m) {
  return rangeStats(keyOf(y, m, 1), keyOf(y, m, daysInMonth(y, m)));
}

export function weekdayStats(rs) {
  const out = Array.from({ length: 7 }, () => ({ total: 0, done: 0 }));
  for (const d of rs.days) {
    const w = dow(d.key);
    out[w].total += d.total;
    out[w].done += d.done;
  }
  return out.map((o) => ({ ...o, pct: o.total ? o.done / o.total : null }));
}

export function categoryStats(rs) {
  const m = new Map();
  for (const d of rs.days) {
    for (const e of d.items) {
      if (!e.counts) continue;
      const id = e.habit.categoryId && getCategory(e.habit.categoryId) ? e.habit.categoryId : 'none';
      const o = m.get(id) || { id, total: 0, done: 0 };
      o.total++;
      if (e.done) o.done++;
      m.set(id, o);
    }
  }
  return [...m.values()]
    .map((o) => {
      const c = o.id === 'none' ? null : getCategory(o.id);
      return { ...o, name: c ? c.name : 'Sin categoría', emoji: c ? c.emoji : '🔖', color: c ? c.color : '#9aa5b1', pct: o.total ? o.done / o.total : 0 };
    })
    .sort((a, b) => b.pct - a.pct);
}

export function habitRates(rs) {
  const nDays = rs.days.length || 1;
  const out = [];
  for (const h of allHabits()) {
    let total = 0;
    let done = 0;
    let active = false;
    for (const d of rs.days) {
      const e = d.items.find((x) => x.habit.id === h.id);
      if (isActiveOn(h, d.key)) active = true;
      if (!e) continue;
      if (h.schedule.type === 'weekly') {
        if (e.done) done++;
      } else if (e.counts) {
        total++;
        if (e.done) done++;
      }
    }
    if (!active) continue;
    if (h.schedule.type === 'weekly') total = Math.max(1, Math.round((h.schedule.times || 1) * (nDays / 7)));
    const pct = total ? Math.min(1, done / total) : 0;
    out.push({ habit: h, total, done, pct, streak: streakInfo(h) });
  }
  return out;
}

export function earliestKey() {
  return memo('earliest', () => {
    let k = todayKey();
    for (const h of allHabits()) if (h.startDate < k) k = h.startDate;
    for (const d of Object.keys(getState().days)) if (d < k) k = d;
    return k;
  });
}

// ---------- Resumen semanal ----------
export function weekSummary(refKey = todayKey()) {
  return memo('w:' + refKey, () => {
    const ws = wsOf();
    const start = weekStartKey(refKey, ws);
    const end = addDays(start, 6);
    const cur = rangeStats(start, end);
    const prev = rangeStats(addDays(start, -7), addDays(start, -1));
    const rates = habitRates(cur).filter((r) => r.total > 0 || r.done > 0);
    rates.sort((a, b) => b.pct - a.pct || b.done - a.done);
    let notes = 0;
    let moodSum = 0;
    let moodN = 0;
    for (const k of eachDay(start, end)) {
      const d = getState().days[k];
      if (d?.note) notes++;
      if (d?.mood) {
        moodSum += d.mood;
        moodN++;
      }
    }
    return {
      start,
      end,
      cur,
      prev,
      best: rates[0] || null,
      worst: rates.length > 1 ? rates[rates.length - 1] : null,
      notes,
      mood: moodN ? moodSum / moodN : null,
    };
  });
}

// ---------- Logros ----------
export function achievements() {
  return memo('ach', () => {
    const st = getState();
    const habits = allHabits();
    const live = new Map(habits.map((h) => [h.id, h]));
    let totalDone = 0;
    let notes = 0;
    for (const [k, d] of Object.entries(st.days)) {
      if (d.note) notes++;
      for (const [id, v] of Object.entries(d.logs)) {
        const h = live.get(id);
        if (h && isDoneVal(h, v)) totalDone++;
      }
    }
    let bestStreak = 0;
    for (const h of habits) bestStreak = Math.max(bestStreak, streakInfo(h).best);
    let perfectDays = 0;
    let perfectRun = 0;
    let bestPerfectRun = 0;
    const first = earliestKey();
    for (const k of eachDay(first, todayKey())) {
      const s = dayStats(k);
      if (s.total >= 2 && s.done === s.total) {
        perfectDays++;
        perfectRun++;
        bestPerfectRun = Math.max(bestPerfectRun, perfectRun);
      } else if (s.total > 0 && k !== todayKey()) perfectRun = 0;
    }
    const A = (id, emoji, title, desc, cur, goal) => ({ id, emoji, title, desc, cur: Math.min(cur, goal), goal, unlocked: cur >= goal });
    return [
      A('first', '🌱', 'Primer paso', 'Completa tu primer hábito', totalDone, 1),
      A('t25', '✅', '25 logros', 'Completa 25 hábitos en total', totalDone, 25),
      A('t100', '🏅', 'Centenario', 'Completa 100 hábitos en total', totalDone, 100),
      A('t500', '🏆', 'Imparable', 'Completa 500 hábitos en total', totalDone, 500),
      A('t1000', '👑', 'Leyenda', 'Completa 1000 hábitos en total', totalDone, 1000),
      A('s3', '🔥', 'Chispa', 'Racha de 3', bestStreak, 3),
      A('s7', '⚡', 'Una semana', 'Racha de 7', bestStreak, 7),
      A('s14', '🌟', 'Dos semanas', 'Racha de 14', bestStreak, 14),
      A('s30', '🌙', 'Un mes entero', 'Racha de 30', bestStreak, 30),
      A('s100', '💯', 'Cien', 'Racha de 100', bestStreak, 100),
      A('s365', '🪐', 'Un año', 'Racha de 365', bestStreak, 365),
      A('p1', '⭐', 'Día perfecto', 'Cumple todos los hábitos de un día (2 o más)', perfectDays, 1),
      A('p7', '🌈', 'Semana perfecta', '7 días perfectos seguidos', bestPerfectRun, 7),
      A('n1', '📝', 'Primera nota', 'Escribe tu primera nota del día', notes, 1),
      A('n30', '📔', 'Cronista', 'Escribe 30 notas', notes, 30),
      A('n100', '📚', 'Memoria viva', 'Escribe 100 notas', notes, 100),
      A('h5', '🧩', 'Coleccionista', 'Ten 5 hábitos', habits.length, 5),
    ];
  });
}

export function categoriesList() {
  return categories();
}

// ---------- Descubrimientos (patrones en tus datos) ----------
const MOOD_NAMES = ['', '😞 mal', '😕 regular', '😐 normal', '🙂 bien', '😄 genial'];
const WD_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const ROUTINE_NAMES = { am: 'mañana', pm: 'tarde', night: 'noche' };
const pct = (x) => Math.round(x * 100);
const hname = (hb) => `${hb.emoji} ${hb.name}`;

// Pruebas estadísticas sencillas: solo mostramos patrones poco probables por azar (|t| o |z| >= 2,
// y más exigentes cuando se comparan muchos hábitos o días a la vez).
function welchT(s1, q1, n1, s2, q2, n2) {
  const m1 = s1 / n1;
  const m2 = s2 / n2;
  const v1 = Math.max(0.05, (q1 - n1 * m1 * m1) / (n1 - 1));
  const v2 = Math.max(0.05, (q2 - n2 * m2 * m2) / (n2 - 1));
  return (m1 - m2) / Math.sqrt(v1 / n1 + v2 / n2);
}
function propZ(x1, n1, x2, n2) {
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se ? (x1 / n1 - x2 / n2) / se : 0;
}

export function insights(today = todayKey()) {
  return memo('ins:' + today, () => computeInsights(today));
}

function computeInsights(today) {
  const days = getState().days;
  const end = addDays(today, -1);
  const start = earliestKey();
  const list = [];
  if (start > end) return { list, moodDays: 0 };
  const keys = [...eachDay(start, end)];
  const habits = allHabits();
  const moods = keys.map((k) => (days[k] && days[k].mood) || 0);
  const dows = keys.map((k) => dow(k));
  const moodDays = moods.filter(Boolean).length;
  // Estado de cada hábito por día: 2 = hecho, 1 = tocaba y no se hizo, 0 = no aplica / descanso.
  const S = new Map();
  for (const hb of habits) {
    const arr = new Int8Array(keys.length);
    keys.forEach((k, i) => {
      if (!isActiveOn(hb, k)) return;
      const v = valueOf(k, hb.id);
      if (v === -1) return;
      if (isDoneVal(hb, v)) arr[i] = 2;
      else if (scheduledOn(hb, k)) arr[i] = 1;
    });
    S.set(hb.id, arr);
  }

  // 1) Ánimo según cada hábito
  for (const hb of habits) {
    const arr = S.get(hb.id);
    let sd = 0;
    let qd = 0;
    let nd = 0;
    let sn = 0;
    let qn = 0;
    let nn = 0;
    for (let i = 0; i < keys.length; i++) {
      const mood = moods[i];
      if (!mood || !arr[i]) continue;
      if (arr[i] === 2) {
        sd += mood;
        qd += mood * mood;
        nd++;
      } else {
        sn += mood;
        qn += mood * mood;
        nn++;
      }
    }
    if (nd >= 6 && nn >= 6) {
      const a = sd / nd;
      const b = sn / nn;
      if (a - b >= 0.35 && welchT(sd, qd, nd, sn, qn, nn) >= 2.6) {
        list.push({
          emoji: '😊',
          score: 3 + (a - b),
          parts: ['Los días que cumples ', { b: hname(hb) }, ', tu ánimo es un ', { b: `${pct((a - b) / b)} % mejor` }, '.'],
        });
      }
    }
  }

  // 2) Ánimo en días perfectos vs. días flojos
  {
    let sp = 0;
    let qp = 0;
    let np = 0;
    let sl = 0;
    let ql = 0;
    let nl = 0;
    for (const k of keys) {
      const mood = days[k] && days[k].mood;
      if (!mood) continue;
      const ds = dayStats(k);
      if (!ds.total) continue;
      if (ds.pct === 1) {
        sp += mood;
        qp += mood * mood;
        np++;
      } else if (ds.pct < 0.5) {
        sl += mood;
        ql += mood * mood;
        nl++;
      }
    }
    if (np >= 4 && nl >= 4 && sp / np - sl / nl >= 0.4 && welchT(sp, qp, np, sl, ql, nl) >= 2) {
      list.push({
        emoji: '🌈',
        score: 2.8,
        parts: ['Tus días completos se sienten mejor: tu ánimo pasa de ', { b: MOOD_NAMES[Math.round(sl / nl)] }, ' a ', { b: MOOD_NAMES[Math.round(sp / np)] }, '.'],
      });
    }
  }

  // 3) Hábitos que se potencian entre sí
  const dayHabits = habits.filter((x) => x.schedule.type !== 'weekly');
  let pair = null;
  for (const A of dayHabits) {
    const sa = S.get(A.id);
    for (const B of dayHabits) {
      if (A === B) continue;
      const sb = S.get(B.id);
      let a1 = 0;
      let b1 = 0;
      let a0 = 0;
      let b0 = 0;
      for (let i = 0; i < keys.length; i++) {
        if (!sa[i] || !sb[i]) continue;
        const bd = sb[i] === 2;
        if (sa[i] === 2) {
          a1++;
          if (bd) b1++;
        } else {
          a0++;
          if (bd) b0++;
        }
      }
      if (a1 >= 6 && a0 >= 6) {
        const lift = b1 / a1 - b0 / a0;
        if (lift >= 0.25 && propZ(b1, a1, b0, a0) >= 3 && (!pair || lift > pair.lift)) pair = { A, B, p1: b1 / a1, p0: b0 / a0, lift };
      }
    }
  }
  if (pair) {
    list.push({
      emoji: '🔗',
      score: 2.6 + pair.lift,
      parts: ['Cuando cumples ', { b: hname(pair.A) }, ', también cumples ', { b: hname(pair.B) }, ` el ${pct(pair.p1)} % de las veces (frente al ${pct(pair.p0)} % cuando no). ¡Se potencian!`],
    });
  }

  // 4) El día de la semana que más cuesta a cada hábito
  let worst = null;
  for (const hb of dayHabits) {
    const arr = S.get(hb.id);
    const cnt = Array.from({ length: 7 }, () => ({ t: 0, d: 0 }));
    let T = 0;
    let D = 0;
    for (let i = 0; i < keys.length; i++) {
      if (!arr[i]) continue;
      const w = dows[i];
      cnt[w].t++;
      T++;
      if (arr[i] === 2) {
        cnt[w].d++;
        D++;
      }
    }
    if (T < 21) continue;
    cnt.forEach((c, w) => {
      if (c.t < 4 || T - c.t < 6) return;
      const r = c.d / c.t;
      const rest = (D - c.d) / (T - c.t);
      if (rest - r >= 0.3 && propZ(D - c.d, T - c.t, c.d, c.t) >= 3 && (!worst || rest - r > worst.gap)) worst = { hb, w, r, rest, gap: rest - r };
    });
  }
  if (worst) {
    list.push({
      emoji: '📅',
      score: 2 + worst.gap,
      parts: [{ b: hname(worst.hb) }, ' te cuesta más los ', { b: WD_PLURAL[worst.w] }, ` (${pct(worst.r)} % frente al ${pct(worst.rest)} % del resto de la semana). Un recordatorio ese día podría ayudarte.`],
    });
  }

  // 5) Momento del día más constante
  {
    const byR = {};
    for (const k of keys) {
      for (const e of dayStats(k).items) {
        if (!e.counts) continue;
        const r = e.habit.routine;
        if (!ROUTINE_NAMES[r]) continue;
        byR[r] = byR[r] || { t: 0, d: 0 };
        byR[r].t++;
        if (e.done) byR[r].d++;
      }
    }
    const rs = Object.entries(byR)
      .filter(([, o]) => o.t >= 10)
      .map(([r, o]) => ({ r, p: o.d / o.t, d: o.d, t: o.t }))
      .sort((a, b) => b.p - a.p);
    const hi = rs[0];
    const lo = rs[rs.length - 1];
    if (rs.length >= 2 && hi.p - lo.p >= 0.15 && propZ(hi.d, hi.t, lo.d, lo.t) >= 2) {
      const best = rs[0];
      const low = rs[rs.length - 1];
      list.push({
        emoji: '🌅',
        score: 1.6,
        parts: ['Tus hábitos de la ', { b: ROUTINE_NAMES[best.r] }, ` son los más constantes (${pct(best.p)} %), y los de la `, { b: ROUTINE_NAMES[low.r] }, ` los que más cuestan (${pct(low.p)} %).`],
      });
    }
  }

  // 6) Tendencia de las últimas dos semanas
  {
    const cur = rangeStats(addDays(end, -13), end);
    const prev = rangeStats(addDays(end, -27), addDays(end, -14));
    if (cur.total >= 10 && prev.total >= 10 && cur.pct != null && prev.pct != null && Math.abs(propZ(cur.done, cur.total, prev.done, prev.total)) >= 2) {
      const diff = cur.pct - prev.pct;
      if (diff >= 0.08) {
        list.push({ emoji: '📈', score: 2.2, parts: ['¡Vas en subida! En las últimas 2 semanas cumpliste un ', { b: `${pct(cur.pct)} %` }, `, ${pct(diff)} puntos más que en las 2 anteriores.`] });
      } else if (diff <= -0.08) {
        list.push({ emoji: '🌱', score: 2.1, parts: ['En las últimas 2 semanas bajaste a ', { b: `${pct(cur.pct)} %` }, ` (antes ${pct(prev.pct)} %). Está bien: retoma con un solo hábito pequeño.`] });
      }
    }
  }

  // 7) El hábito más constante de todos
  {
    const rates = habitRates(rangeStats(start, end)).filter((r) => r.total >= 14);
    rates.sort((a, b) => b.pct - a.pct);
    if (rates.length >= 2 && rates[0].pct >= 0.6) {
      list.push({ emoji: '🏅', score: 1, parts: ['Tu hábito más constante es ', { b: hname(rates[0].habit) }, `, con un ${pct(rates[0].pct)} % de cumplimiento.`] });
    }
  }

  list.sort((a, b) => b.score - a.score);
  return { list, moodDays };
}

// Racha más larga dentro de un rango (para el resumen del mes).
export function longestRunIn(hb, from, to) {
  const today = todayKey();
  let run = 0;
  let best = 0;
  for (let k = from; k <= to && k <= today; k = addDays(k, 1)) {
    if (!isActiveOn(hb, k)) continue;
    const v = valueOf(k, hb.id);
    if (v === -1) continue;
    if (isDoneVal(hb, v)) {
      run++;
      if (run > best) best = run;
    } else if (scheduledOn(hb, k) && k !== today) run = 0;
  }
  return best;
}
