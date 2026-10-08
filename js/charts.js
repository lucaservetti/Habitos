// Gráficas ligeras hechas a mano (SVG y HTML).
import { h, svg, addDays, weekStartKey, todayKey, fmtDayMonth, MONTHS_SHORT, fromKey, rgba, WD_LETTER } from './util.js';

export function ring({ pct = 0, size = 64, stroke = 8, color = 'var(--accent)', children, className = '' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct || 0));
  const fg = svg('circle', {
    cx: size / 2,
    cy: size / 2,
    r,
    fill: 'none',
    stroke: color,
    'stroke-width': stroke,
    'stroke-linecap': 'round',
    'stroke-dasharray': c,
    'stroke-dashoffset': c * (1 - p),
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
    class: 'ring-fg',
  });
  const s = svg(
    'svg',
    { viewBox: `0 0 ${size} ${size}`, width: size, height: size },
    svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--line)', 'stroke-width': stroke, class: 'ring-bg' }),
    fg,
  );
  return h('div', { class: 'ring ' + className, style: { width: size + 'px', height: size + 'px' } }, s, children ? h('div', { class: 'ring-label' }, children) : null);
}

// Gráfica de área suave. series: [{ key, pct }] (pct 0..1 o null)
export function areaChart(series, { height = 150, color = 'var(--accent)', onPick } = {}) {
  const pts = series.filter((s) => s.pct != null);
  const wrap = h('div', { class: 'chart-wrap' });
  if (pts.length < 2) {
    wrap.appendChild(h('div', { class: 'empty-chart' }, pts.length === 1 ? 'Aún hay un solo día con datos' : 'Todavía no hay datos para graficar'));
    return wrap;
  }
  const W = 320;
  const H = height;
  const padX = 6;
  const padT = 10;
  const padB = 8;
  const n = series.length;
  const xAt = (i) => padX + (i * (W - padX * 2)) / Math.max(1, n - 1);
  const yAt = (v) => padT + (1 - v) * (H - padT - padB);
  const idx = series.map((s, i) => (s.pct != null ? i : -1)).filter((i) => i >= 0);
  let d = `M ${xAt(idx[0])} ${yAt(series[idx[0]].pct)}`;
  for (let j = 1; j < idx.length; j++) {
    const a = idx[j - 1];
    const b = idx[j];
    const xm = (xAt(a) + xAt(b)) / 2;
    d += ` C ${xm} ${yAt(series[a].pct)}, ${xm} ${yAt(series[b].pct)}, ${xAt(b)} ${yAt(series[b].pct)}`;
  }
  const area = `${d} L ${xAt(idx[idx.length - 1])} ${H - padB} L ${xAt(idx[0])} ${H - padB} Z`;
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  const avg = pts.reduce((a, s) => a + s.pct, 0) / pts.length;
  const label = h('div', { class: 'chart-tip' }, `Promedio ${Math.round(avg * 100)}%`);
  const dot = h('div', { class: 'chart-dot', style: { display: 'none', background: color } });
  const guide = h('div', { class: 'chart-guide', style: { display: 'none', background: color } });
  const s = svg(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, class: 'area-chart', preserveAspectRatio: 'none', style: { height: H + 'px' } },
    svg(
      'defs',
      null,
      svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, svg('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.35 }), svg('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0.02 })),
    ),
    ...[0, 0.5, 1].map((v) => svg('line', { x1: padX, x2: W - padX, y1: yAt(v), y2: yAt(v), stroke: 'var(--line)', 'stroke-width': 1, 'stroke-dasharray': v === 0 ? '' : '3 4' })),
    svg('path', { d: area, fill: `url(#${gid})` }),
    svg('path', { d, fill: 'none', stroke: color, 'stroke-width': 2.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }),
  );
  const areaBox = h('div', { class: 'chart-area' }, s, guide, dot);
  const pick = (e) => {
    const rect = s.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    let best = idx[0];
    let bd = 9;
    for (const i of idx) {
      const dd = Math.abs(xAt(i) / W - rel);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    const it = series[best];
    const left = (xAt(best) / W) * 100 + '%';
    dot.style.display = '';
    guide.style.display = '';
    dot.style.left = left;
    dot.style.top = yAt(it.pct) + 'px';
    guide.style.left = left;
    label.textContent = `${it.label || fmtDayMonth(it.key)} · ${Math.round(it.pct * 100)}%`;
    if (onPick) onPick(it);
  };
  areaBox.addEventListener('pointerdown', pick);
  areaBox.addEventListener('pointermove', (e) => {
    if (e.buttons || e.pointerType === 'mouse') pick(e);
  });
  const first = series[0];
  const last = series[series.length - 1];
  wrap.append(
    label,
    areaBox,
    h('div', { class: 'chart-axis' }, h('span', null, first.label || fmtDayMonth(first.key)), h('span', null, last.label || fmtDayMonth(last.key))),
  );
  return wrap;
}

// Agrupa series largas en cubos (para año / todo)
export function bucketSeries(days, maxPoints = 60) {
  if (days.length <= maxPoints) return days.map((d) => ({ key: d.key, pct: d.pct }));
  const size = Math.ceil(days.length / maxPoints);
  const out = [];
  for (let i = 0; i < days.length; i += size) {
    const chunk = days.slice(i, i + size);
    let t = 0;
    let dn = 0;
    for (const c of chunk) {
      t += c.total;
      dn += c.done;
    }
    const first = chunk[0].key;
    const last = chunk[chunk.length - 1].key;
    out.push({ key: first, pct: t ? dn / t : null, label: size > 1 ? `${fmtDayMonth(first)} – ${fmtDayMonth(last)}` : undefined });
  }
  return out;
}

export function hbars(items) {
  const wrap = h('div', { class: 'hbars' });
  for (const it of items) {
    wrap.appendChild(
      h(
        'div',
        { class: 'hbar', onclick: it.onclick },
        h('div', { class: 'hbar-label' }, it.emoji ? h('span', null, it.emoji) : null, h('span', { class: 'ell' }, it.label)),
        h('div', { class: 'hbar-track' }, h('div', { class: 'hbar-fill', style: { width: Math.round((it.pct || 0) * 100) + '%', background: it.color || 'var(--accent)' } })),
        h('div', { class: 'hbar-val' }, it.valueText ?? Math.round((it.pct || 0) * 100) + '%'),
      ),
    );
  }
  return wrap;
}

export function vbars(items, { highlight = -1 } = {}) {
  const wrap = h('div', { class: 'vbars' });
  items.forEach((it, i) => {
    const p = it.pct == null ? 0 : it.pct;
    wrap.appendChild(
      h(
        'div',
        { class: 'vbar' + (i === highlight ? ' hi' : '') },
        h('div', { class: 'vbar-val' }, it.pct == null ? '–' : Math.round(p * 100)),
        h('div', { class: 'vbar-track' }, h('div', { class: 'vbar-fill', style: { height: it.pct == null ? '0' : Math.max(4, Math.round(p * 100)) + '%' } })),
        h('div', { class: 'vbar-label' }, it.label),
      ),
    );
  });
  return wrap;
}

// Mapa de calor tipo GitHub. level(key) => 0..1 | null
export function heatmap({ weeks = 20, ws = 1, level, color, onPick }) {
  const today = todayKey();
  const startThis = weekStartKey(today, ws);
  const start = addDays(startThis, -(weeks - 1) * 7);
  const cols = `repeat(${weeks}, minmax(0, 1fr))`;
  const grid = h('div', { class: 'heat-grid', style: { gridTemplateColumns: cols } });
  const months = h('div', { class: 'heat-months', style: { gridTemplateColumns: cols } });
  // Etiqueta de mes en la primera semana de cada mes, omitiendo las que quedarían encimadas.
  const labels = new Array(weeks).fill('');
  let lastMonth = -1;
  let lastIdx = -9;
  for (let w = 0; w < weeks; w++) {
    const mo = fromKey(addDays(start, w * 7 + 6)).getMonth();
    if (mo !== lastMonth) {
      if (w - lastIdx < 3 && lastIdx >= 0) labels[lastIdx] = '';
      labels[w] = MONTHS_SHORT[mo];
      lastIdx = w;
      lastMonth = mo;
    }
  }
  if (weeks - lastIdx < 2 && lastIdx > 0) labels[lastIdx] = '';
  for (let w = 0; w < weeks; w++) {
    const wkStart = addDays(start, w * 7);
    months.appendChild(h('span', null, labels[w]));
    const col = h('div', { class: 'heat-col' });
    for (let i = 0; i < 7; i++) {
      const k = addDays(wkStart, i);
      const future = k > today;
      const lv = future ? null : level(k);
      const cell = h('button', {
        type: 'button',
        class: 'heat-cell' + (future ? ' future' : '') + (k === today ? ' today' : ''),
        'aria-label': k,
        disabled: future,
        onclick: () => onPick && onPick(k),
      });
      if (!future && lv != null) {
        const a = lv <= 0 ? 0.1 : 0.22 + 0.78 * lv;
        cell.style.background = color ? rgba(color, a) : `hsl(var(--h) var(--s) 62% / ${a})`;
      }
      col.appendChild(cell);
    }
    grid.appendChild(col);
  }
  const legend = h(
    'div',
    { class: 'heat-legend' },
    h('span', null, 'Menos'),
    ...[0.1, 0.35, 0.6, 0.85, 1].map((a) => h('i', { style: { background: color ? rgba(color, 0.15 + 0.85 * a) : `hsl(var(--h) var(--s) 62% / ${0.15 + 0.85 * a})` } })),
    h('span', null, 'Más'),
  );
  const dayLabels = h('div', { class: 'heat-days' }, ...Array.from({ length: 7 }, (_, i) => h('span', null, i % 2 === 0 ? WD_LETTER[(ws + i) % 7] : '')));
  return h('div', { class: 'heatmap' }, months, h('div', { class: 'heat-body' }, dayLabels, grid), legend);
}
