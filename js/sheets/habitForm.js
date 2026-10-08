// Formulario para crear / editar un hábito.
import { h, todayKey, clamp } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast, undoToast, confirmDialog, segmented, toggle, field, chips, colorPicker, emojiPicker, stepper, HABIT_COLORS, ROUTINES } from '../ui.js';
import { addHabit, updateHabit, archiveHabit, restoreHabit, deleteHabit, undeleteHabit, categories } from '../store.js';
import { TEMPLATES, DEFAULT_CATEGORIES, templateToHabit } from '../templates.js';
import { habitVars, scheduleText } from '../habitUi.js';
import { bus } from '../bus.js';
import { downloadICS } from '../ics.js';

const EDITABLE = ['name', 'emoji', 'color', 'categoryId', 'type', 'target', 'step', 'unit', 'avoid', 'savePerDay', 'timer', 'routine', 'schedule', 'reminder', 'startDate', 'why'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LETTER = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 0: 'D' };

function blank() {
  return {
    name: '',
    emoji: '✨',
    color: HABIT_COLORS[Math.floor(Math.random() * HABIT_COLORS.length)],
    categoryId: null,
    type: 'check',
    target: 1,
    step: 1,
    unit: '',
    avoid: false,
    savePerDay: 0,
    timer: 0,
    routine: 'any',
    schedule: { type: 'daily', days: [1, 2, 3, 4, 5], times: 3, every: 2 },
    reminder: { on: false, time: '09:00' },
    startDate: todayKey(),
    why: '',
  };
}

export function openHabitForm(habit = null, opts = {}) {
  const editing = !!habit;
  const f = editing ? { ...blank(), ...JSON.parse(JSON.stringify(Object.fromEntries(EDITABLE.map((k) => [k, habit[k]])))) } : { ...blank(), ...(opts.preset || {}) };
  if (!f.schedule.days || !f.schedule.days.length) f.schedule.days = [1, 2, 3, 4, 5];
  let showEmoji = false;

  openSheet({
    title: editing ? 'Editar hábito' : 'Nuevo hábito',
    full: true,
    build(body, api) {
      const content = h('div', { class: 'form' });
      body.append(content);

      const applyTemplate = (t) => {
        const dc = DEFAULT_CATEGORIES.find((c) => c.key === t.cat);
        const cat = dc ? categories().find((c) => c.name === dc.name) : null;
        Object.assign(f, templateToHabit(t, cat ? { [t.cat]: cat.id } : {}));
        if (!f.schedule.days || !f.schedule.days.length) f.schedule.days = [1, 2, 3, 4, 5];
        draw();
      };

      const save = () => {
        const name = (f.name || '').trim();
        if (!name) {
          toast('Ponle un nombre a tu hábito ✍️');
          return;
        }
        if (f.schedule.type === 'days' && !(f.schedule.days || []).length) {
          toast('Elige al menos un día de la semana');
          return;
        }
        const data = {
          ...f,
          name,
          unit: (f.unit || '').trim(),
          why: (f.why || '').trim(),
          target: f.type === 'count' ? Math.max(1, Number(f.target) || 1) : 1,
          step: Math.max(0.01, Number(f.step) || 1),
          timer: clamp(Math.round(Number(f.timer) || 0), 0, 600),
          savePerDay: f.avoid ? Math.max(0, Number(f.savePerDay) || 0) : 0,
          startDate: f.startDate || todayKey(),
          schedule: {
            ...f.schedule,
            times: clamp(Number(f.schedule.times) || 1, 1, 7),
            every: clamp(Number(f.schedule.every) || 2, 1, 60),
          },
        };
        const reminderChanged = data.reminder.on && (!editing || !habit.reminder.on || habit.reminder.time !== data.reminder.time);
        let saved;
        if (editing) {
          updateHabit(habit.id, data);
          saved = { ...habit, ...data };
        } else {
          saved = addHabit(data);
        }
        api.close();
        toast(editing ? 'Cambios guardados ✨' : `${saved.emoji} ${saved.name}: ¡listo!`);
        if (opts.onSaved) opts.onSaved(saved);
        if (reminderChanged) {
          setTimeout(async () => {
            const ok = await confirmDialog({
              title: '¿Añadir el recordatorio a tu Calendario?',
              message: `Se creará un evento repetido a las ${data.reminder.time} con alerta en la app Calendario de tu iPhone.`,
              confirmText: 'Añadir',
              cancelText: 'Ahora no',
            });
            if (ok) downloadICS([saved]);
          }, 420);
        }
      };

      const footer = h('div', { class: 'sheet-footer' }, h('button', { type: 'button', class: 'btn primary block', onclick: save }, editing ? 'Guardar cambios' : 'Crear hábito'));
      api.el.appendChild(footer);

      function draw() {
        const st = body.scrollTop;
        content.replaceChildren(...sections());
        body.scrollTop = st;
      }

      function sections() {
        const out = [];
        if (!editing) {
          out.push(
            h(
              'div',
              { class: 'field' },
              h('div', { class: 'field-label' }, 'Ideas rápidas'),
              h(
                'div',
                { class: 'hscroll ideas' },
                TEMPLATES.map((t) => h('button', { type: 'button', class: 'idea', onclick: () => applyTemplate(t) }, h('span', null, t.emoji), t.name)),
              ),
            ),
          );
        }

        const nameInput = h('input', {
          class: 'input name-input',
          type: 'text',
          placeholder: 'Nombre del hábito',
          maxlength: 60,
          value: f.name,
          enterkeyhint: 'done',
          oninput: (e) => {
            f.name = e.target.value;
          },
          onkeydown: (e) => {
            if (e.key === 'Enter') e.target.blur();
          },
        });
        out.push(
          h(
            'div',
            { class: 'form-hero', style: habitVars(f.color) },
            h(
              'button',
              {
                type: 'button',
                class: 'hbubble big' + (showEmoji ? ' active' : ''),
                'aria-label': 'Cambiar emoji',
                onclick: () => {
                  showEmoji = !showEmoji;
                  draw();
                },
              },
              f.emoji,
            ),
            h('div', { class: 'grow' }, nameInput, h('div', { class: 'hint' }, showEmoji ? 'Elige un emoji abajo' : 'Toca el emoji para cambiarlo')),
          ),
        );
        if (showEmoji) {
          out.push(
            emojiPicker(f.emoji, (e) => {
              f.emoji = e;
              showEmoji = false;
              draw();
            }),
          );
        }

        out.push(
          field(
            'Color',
            colorPicker(f.color, (c) => {
              f.color = c;
              draw();
            }),
          ),
        );

        const cats = categories();
        out.push(
          field(
            'Categoría',
            h(
              'div',
              null,
              chips(
                [{ value: null, label: 'Sin categoría' }, ...cats.map((c) => ({ value: c.id, label: c.name, emoji: c.emoji, color: c.color }))],
                f.categoryId,
                (v) => {
                  f.categoryId = v;
                  draw();
                },
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'link-btn',
                  onclick: () =>
                    bus.openCategoryForm(null, {
                      onSaved: (c) => {
                        f.categoryId = c.id;
                        draw();
                      },
                    }),
                },
                icon('plus', 16),
                'Nueva categoría',
              ),
            ),
          ),
        );

        out.push(
          field(
            'Tipo de registro',
            segmented(
              [
                { value: 'check', label: '✓ Hecho / no hecho' },
                { value: 'count', label: '🔢 Con cantidad' },
              ],
              f.type,
              (v) => {
                f.type = v;
                if (v === 'count' && (Number(f.target) || 1) < 2) f.target = 3;
                draw();
              },
            ),
            f.type === 'count' ? 'Para metas numéricas o varias veces al día: 8 vasos, 3 veces, 30 minutos…' : null,
          ),
        );
        if (f.type === 'count') {
          out.push(
            h(
              'div',
              { class: 'grid3' },
              field('Meta diaria', h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 1, value: String(f.target), oninput: (e) => (f.target = e.target.value) })),
              field('Unidad', h('input', { class: 'input', type: 'text', placeholder: 'vasos', maxlength: 16, value: f.unit, oninput: (e) => (f.unit = e.target.value) })),
              field('Suma de a', h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0.01, value: String(f.step || 1), oninput: (e) => (f.step = e.target.value) })),
            ),
          );
        }

        out.push(
          h(
            'div',
            { class: 'row-line' },
            h('div', { class: 'grow' }, h('div', { class: 'row-title' }, '🚫 Hábito para dejar'), h('div', { class: 'hint' }, 'Márcalo los días que logres evitarlo (ej. “sin azúcar”).')),
            toggle(f.avoid, (v) => {
              f.avoid = v;
              draw();
            }),
          ),
        );
        if (f.avoid) {
          out.push(
            field(
              '💰 ¿Cuánto ahorras cada día que lo logras? (opcional)',
              h('input', {
                class: 'input',
                type: 'number',
                inputmode: 'decimal',
                min: 0,
                placeholder: 'Ej.: 1500',
                value: f.savePerDay ? String(f.savePerDay) : '',
                oninput: (e) => (f.savePerDay = e.target.value),
              }),
              'Te mostraremos cuánto llevas ahorrado. Déjalo vacío si no aplica.',
            ),
          );
        }

        const s = f.schedule;
        const freqCtl = [];
        if (s.type === 'days') {
          freqCtl.push(
            h(
              'div',
              { class: 'day-pick' },
              DAY_ORDER.map((d) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: (s.days || []).includes(d) ? 'on' : '',
                    onclick: () => {
                      const set = new Set(s.days || []);
                      if (set.has(d)) set.delete(d);
                      else set.add(d);
                      s.days = [...set];
                      draw();
                    },
                  },
                  DAY_LETTER[d],
                ),
              ),
            ),
          );
        } else if (s.type === 'weekly') {
          freqCtl.push(
            h(
              'div',
              { class: 'row-line plain' },
              h('div', { class: 'grow' }, 'Veces por semana'),
              stepper(Number(s.times) || 1, {
                min: 1,
                max: 7,
                onChange: (v) => {
                  s.times = v;
                  draw();
                },
              }),
            ),
          );
        } else if (s.type === 'interval') {
          freqCtl.push(
            h(
              'div',
              { class: 'row-line plain' },
              h('div', { class: 'grow' }, 'Cada cuántos días'),
              stepper(Number(s.every) || 2, {
                min: 2,
                max: 60,
                onChange: (v) => {
                  s.every = v;
                  draw();
                },
              }),
            ),
          );
        }
        out.push(
          field(
            'Frecuencia',
            h(
              'div',
              null,
              segmented(
                [
                  { value: 'daily', label: 'Diario' },
                  { value: 'days', label: 'Días' },
                  { value: 'weekly', label: 'X / semana' },
                  { value: 'interval', label: 'Cada N' },
                ],
                s.type,
                (v) => {
                  s.type = v;
                  draw();
                },
                'small',
              ),
              freqCtl,
            ),
            `${scheduleText({ schedule: s })}${s.type === 'weekly' ? ' · cualquier día que elijas' : ''}`,
          ),
        );

        out.push(
          field(
            'Momento del día',
            chips(
              ROUTINES.map((r) => ({ value: r.id, label: r.label, emoji: r.emoji })),
              f.routine,
              (v) => {
                f.routine = v;
                draw();
              },
            ),
          ),
        );

        out.push(
          h(
            'div',
            { class: 'row-line' },
            h('div', { class: 'grow' }, h('div', { class: 'row-title' }, '⏱️ Temporizador'), h('div', { class: 'hint' }, 'Para hábitos de tiempo: inicia la cuenta atrás y se marca solo al terminar.')),
            toggle(f.timer > 0, (v) => {
              f.timer = v ? 10 : 0;
              draw();
            }),
          ),
        );
        if (f.timer > 0) {
          out.push(
            h(
              'div',
              { class: 'row-line plain' },
              h('div', { class: 'grow' }, 'Duración'),
              stepper(Number(f.timer), {
                min: 1,
                max: 180,
                step: f.timer >= 30 ? 5 : 1,
                suffix: ' min',
                onChange: (v) => {
                  f.timer = v;
                  draw();
                },
              }),
            ),
          );
        }

        out.push(
          h(
            'div',
            { class: 'row-line' },
            h('div', { class: 'grow' }, h('div', { class: 'row-title' }, '🔔 Recordatorio'), h('div', { class: 'hint' }, 'Se añade como alerta en la app Calendario.')),
            f.reminder.on
              ? h('input', {
                  class: 'input time-input',
                  type: 'time',
                  value: f.reminder.time,
                  onchange: (e) => {
                    f.reminder.time = e.target.value || '09:00';
                  },
                })
              : null,
            toggle(f.reminder.on, (v) => {
              f.reminder.on = v;
              draw();
            }),
          ),
        );

        out.push(
          field(
            'Fecha de inicio',
            h('input', {
              class: 'input',
              type: 'date',
              value: f.startDate,
              onchange: (e) => {
                f.startDate = e.target.value || todayKey();
              },
            }),
            'Puedes poner una fecha pasada para registrar días anteriores.',
          ),
        );

        out.push(
          field(
            '¿Por qué es importante para ti?',
            h('textarea', {
              class: 'input',
              rows: 2,
              maxlength: 200,
              placeholder: 'Ej.: Quiero tener más energía por las mañanas',
              oninput: (e) => (f.why = e.target.value),
            }, f.why || ''),
            'Te lo recordaremos en el detalle del hábito.',
          ),
        );

        if (editing) {
          out.push(
            h(
              'div',
              { class: 'danger-zone' },
              habit.archivedAt
                ? h(
                    'button',
                    {
                      type: 'button',
                      class: 'btn soft',
                      onclick: () => {
                        restoreHabit(habit.id);
                        api.close();
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
                        archiveHabit(habit.id);
                        api.close();
                        if (opts.onDeleted) opts.onDeleted();
                        undoToast('Hábito archivado 📦', () => restoreHabit(habit.id));
                      },
                    },
                    icon('archive', 18),
                    'Archivar',
                  ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn danger-soft',
                  onclick: async () => {
                    const ok = await confirmDialog({
                      title: '¿Eliminar para siempre?',
                      message: `Se borrará “${habit.name}” y todo su historial. Esto no se puede deshacer.`,
                      confirmText: 'Eliminar',
                      danger: true,
                    });
                    if (!ok) return;
                    const info = deleteHabit(habit.id);
                    api.close();
                    if (opts.onDeleted) opts.onDeleted();
                    undoToast('Hábito eliminado', () => undeleteHabit(info));
                  },
                },
                icon('trash', 18),
                'Eliminar',
              ),
            ),
          );
        }
        return out;
      }

      draw();
    },
  });
}
