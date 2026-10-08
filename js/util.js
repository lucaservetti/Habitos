// Utilidades generales: DOM, fechas, colores.

const SVGNS = 'http://www.w3.org/2000/svg';

function applyProps(el, props, isSvg) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') {
      if (isSvg) el.setAttribute('class', v);
      else el.className = v;
    } else if (k === 'style') {
      if (typeof v === 'string') el.style.cssText = v;
      else {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv == null) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      }
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2), v);
    } else if (!isSvg && (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected')) {
      el[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
}

function appendKids(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : String(k));
  }
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  applyProps(el, props, false);
  appendKids(el, kids);
  return el;
}

export function svg(tag, props, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  applyProps(el, props, true);
  appendKids(el, kids);
  return el;
}

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function debounce(fn, ms = 300) {
  let t;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = (...a) => {
    clearTimeout(t);
    fn(...a);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

export const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function graphemes(str) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(str)].map((s) => s.segment);
  }
  return Array.from(str);
}

// ---------- Fechas (claves locales "YYYY-MM-DD") ----------
export const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayKey = () => toKey(new Date());
export const addDays = (k, n) => {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
};
const utc = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const diffDays = (a, b) => Math.round((utc(a) - utc(b)) / 86400000);
export const dow = (k) => fromKey(k).getDay();
export const weekStartKey = (k, ws = 1) => addDays(k, -((dow(k) - ws + 7) % 7));
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const keyOf = (y, m, d = 1) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const ymOf = (k) => {
  const [y, m] = k.split('-').map(Number);
  return { y, m: m - 1 };
};
export function* eachDay(from, to) {
  for (let k = from; k <= to; k = addDays(k, 1)) yield k;
}
export const addMonths = (y, m, n) => {
  const d = new Date(y, m + n, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const F = (o) => new Intl.DateTimeFormat('es', o);
const fLong = F({ weekday: 'long', day: 'numeric', month: 'long' });
const fMonthYear = F({ month: 'long', year: 'numeric' });
const fMonth = F({ month: 'long' });
const fDayMonth = F({ day: 'numeric', month: 'short' });
const fWeekdayShort = F({ weekday: 'short' });
const fWeekdayLong = F({ weekday: 'long' });
export const fmtLong = (k) => cap(fLong.format(fromKey(k)).replace(',', ''));
export const fmtMonthYear = (y, m) => cap(fMonthYear.format(new Date(y, m, 1)).replace(' de ', ' '));
export const fmtMonth = (m) => cap(fMonth.format(new Date(2021, m, 1)));
export const fmtDayMonth = (k) => fDayMonth.format(fromKey(k)).replace('.', '');
export const fmtWeekdayShort = (k) => cap(fWeekdayShort.format(fromKey(k)).replace('.', ''));
export const fmtWeekdayLong = (k) => cap(fWeekdayLong.format(fromKey(k)));
export const WD_LETTER = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
export const WD_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const WD_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// ---------- Colores ----------
export function hexToRgb(hex) {
  let x = String(hex || '#999999').replace('#', '');
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  const n = parseInt(x, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export const rgba = (hex, a) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
export function hexToHue(hex) {
  let { r, g, b } = hexToRgb(hex);
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 262;
  let hue;
  if (mx === r) hue = ((g - b) / d) % 6;
  else if (mx === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return Math.round((hue * 60 + 360) % 360);
}
export function hslToHex(hh, ss, ll) {
  ss /= 100; ll /= 100;
  const k = (n) => (n + hh / 30) % 12;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}
