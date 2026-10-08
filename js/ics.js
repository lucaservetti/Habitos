// Genera archivos de calendario (.ics) con recordatorios repetidos para cada hábito.
import { h, todayKey, addDays, diffDays, dow } from './util.js';
import { openSheet, toast } from './ui.js';
import { downloadBlob, shareOrDownload, canShareFiles } from './files.js';

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const l = enc.encode(ch).length;
    if (len + l > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function matches(hb, k) {
  const s = hb.schedule;
  if (s.type === 'days') return (s.days || []).includes(dow(k));
  if (s.type === 'interval') return diffDays(k, hb.startDate) % Math.max(1, s.every || 1) === 0;
  return true;
}

function firstDate(hb) {
  let k = hb.startDate > todayKey() ? hb.startDate : todayKey();
  for (let i = 0; i < 90; i++) {
    if (matches(hb, k)) return k;
    k = addDays(k, 1);
  }
  return k;
}

function rrule(hb) {
  const s = hb.schedule;
  if (s.type === 'days') {
    const days = (s.days || []).map((d) => BYDAY[d]).join(',');
    return `FREQ=WEEKLY;BYDAY=${days || 'MO'}`;
  }
  if (s.type === 'interval' && (s.every || 1) > 1) return `FREQ=DAILY;INTERVAL=${s.every}`;
  return 'FREQ=DAILY';
}

export function buildICS(habits) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Habitos//Recordatorios//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const hb of habits) {
    const [hh, mm] = (hb.reminder.time || '09:00').split(':');
    const date = firstDate(hb).replace(/-/g, '');
    const title = `${hb.emoji} ${hb.name}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:habitos-${hb.id}@habitos.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${date}T${hh}${mm}00`,
      'DURATION:PT15M',
      `RRULE:${rrule(hb)}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc((hb.why ? hb.why + '\n' : '') + 'Recordatorio de tu app Hábitos ✨')}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(title)}`,
      'TRIGGER:PT0S',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

const slug = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'habito';

// Muestra una hoja con las opciones para llevar los recordatorios al Calendario.
export function downloadICS(habits) {
  const list = habits.filter((hb) => hb && hb.reminder && hb.reminder.on);
  if (!list.length) {
    toast('No hay hábitos con recordatorio activado');
    return;
  }
  const text = buildICS(list);
  const name = list.length === 1 ? `recordatorio-${slug(list[0].name)}.ics` : 'habitos-recordatorios.ics';
  const file = new File([text], name, { type: 'text/calendar' });
  openSheet({
    title: 'Añadir al Calendario',
    build(body, api) {
      body.append(
        h('p', { class: 'muted' }, list.length === 1 ? `Recordatorio: ${list[0].emoji} ${list[0].name} a las ${list[0].reminder.time}.` : `${list.length} recordatorios listos.`),
        h(
          'ol',
          { class: 'steps' },
          h('li', null, 'Toca ', h('b', null, 'Guardar archivo'), ' (o ', h('b', null, 'Compartir'), ' → ', h('b', null, 'Guardar en Archivos'), ').'),
          h('li', null, 'Abre el archivo desde la app ', h('b', null, 'Archivos'), ' (o desde Descargas).'),
          h('li', null, 'Toca ', h('b', null, 'Añadir todo'), ' y elige tu calendario. ¡Listo! 🔔'),
        ),
        h('p', { class: 'hint' }, 'Si vuelves a importar el mismo hábito, el Calendario actualiza el evento en vez de duplicarlo. Para cambiar la hora, edita el hábito y vuelve a añadirlo.'),
        h(
          'div',
          { class: 'col-gap' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn primary block',
              onclick: () => {
                downloadBlob(new Blob([text], { type: 'text/calendar;charset=utf-8' }), name);
                api.close();
              },
            },
            'Guardar archivo',
          ),
          canShareFiles()
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'btn soft block',
                  onclick: async () => {
                    const r = await shareOrDownload(file, 'Recordatorios de Hábitos');
                    if (r !== 'cancelled') api.close();
                  },
                },
                'Compartir…',
              )
            : null,
        ),
      );
    },
  });
}
