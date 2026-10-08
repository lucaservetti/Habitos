// Bienvenida: nombre, ambiente de color y primeros hábitos.
import { h } from '../util.js';
import { openSheet, toast, confetti } from '../ui.js';
import { settings, updateSettings, addCategory, addHabit, categories, getState, subscribe } from '../store.js';
import { DEFAULT_CATEGORIES, TEMPLATES, THEMES, templateToHabit } from '../templates.js';
import { bus } from '../bus.js';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function themeSwatch(t, on, onPick) {
  return h(
    'button',
    { type: 'button', class: 'theme-swatch' + (on ? ' on' : ''), onclick: onPick, 'aria-label': t.name },
    h('span', { class: 'ts-dot', style: { background: `linear-gradient(135deg, hsl(${t.hue} ${t.sat}% 72%), hsl(${t.hue + 40} ${t.sat}% 78%))` } }),
    h('span', { class: 'ts-name' }, t.name),
  );
}

// Las categorías por defecto usan un id fijo y una fecha de modificación antigua: así, si se crean en
// dos dispositivos, la sincronización las reconoce como la misma y cualquier edición real prevalece.
export function seedDefaultCategories() {
  const map = {};
  const existing = categories();
  const all = getState().categories;
  for (const c of DEFAULT_CATEGORIES) {
    const id = 'c_default_' + c.key;
    const found = existing.find((x) => x.id === id) || existing.find((x) => x.name === c.name);
    if (found) map[c.key] = found.id;
    else if (!all.some((x) => x.id === id)) map[c.key] = addCategory({ id, name: c.name, emoji: c.emoji, color: c.color, updatedAt: 1 }).id;
  }
  return map;
}

export function openOnboarding() {
  let step = 0;
  let finished = false;
  const f = { name: settings().name || '', theme: settings().theme || 'lavanda', picks: new Set(['Tomar agua', 'Leer 20 minutos', 'Meditar']) };

  const finish = ({ seed = true, habits = true, toSync = false } = {}) => {
    if (finished) return;
    finished = true;
    if (settings().onboarded) return;
    if (seed) {
      const map = seedDefaultCategories();
      if (habits) for (const t of TEMPLATES) if (f.picks.has(t.name)) addHabit(templateToHabit(t, map));
    }
    updateSettings({ onboarded: true, name: f.name.trim(), theme: f.theme });
    if (toSync) {
      bus.goto('settings');
      setTimeout(() => {
        const el = document.getElementById('sync-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    } else if (seed && habits) {
      if (settings().celebrate !== false) setTimeout(confetti, 350);
      toast(f.picks.size ? '¡Todo listo! Tu primer día empieza ahora 🌱' : '¡Todo listo! Crea tu primer hábito con el botón +');
    }
  };

  let unsub = null;
  openSheet({
    title: '',
    full: true,
    onClose: () => {
      if (unsub) unsub();
      finish({ seed: true, habits: false });
    },
    build(body, api) {
      const footer = h('div', { class: 'sheet-footer' });
      api.el.appendChild(footer);
      // Si los datos llegan por otro lado (sincronización o "Deshacer"), la bienvenida ya no hace falta.
      unsub = subscribe(() => {
        if (settings().onboarded && !finished) {
          finished = true;
          api.close();
        }
      });

      const draw = () => {
        body.scrollTop = 0;
        if (step === 0) {
          const nameInput = h('input', {
            class: 'input name-input center',
            type: 'text',
            placeholder: 'Tu nombre',
            maxlength: 30,
            value: f.name,
            autocomplete: 'given-name',
            oninput: (e) => (f.name = e.target.value),
          });
          body.replaceChildren(
            h(
              'div',
              { class: 'onb' },
              h('div', { class: 'onb-hero' }, '🌿'),
              h('h1', null, 'Hola 👋'),
              h('p', { class: 'muted' }, 'Este es tu espacio tranquilo para construir hábitos a tu ritmo, ver tu progreso y guardar lo más importante de cada día.'),
              h('label', { class: 'field-label center' }, '¿Cómo te llamas?'),
              nameInput,
              isIOS() && !isStandalone()
                ? h(
                    'div',
                    { class: 'banner' },
                    h('div', { class: 'banner-e' }, '📲'),
                    h(
                      'div',
                      { class: 'grow' },
                      h('b', null, 'Consejo: instálala primero'),
                      h('div', { class: 'muted' }, 'Toca Compartir ⬆︎ → “Añadir a pantalla de inicio” y abre la app desde el ícono. Lo que registres en Safari no pasa a la app instalada.'),
                    ),
                  )
                : null,
              h(
                'button',
                {
                  type: 'button',
                  class: 'link-btn center',
                  onclick: () => {
                    finish({ seed: false, toSync: true });
                    api.close();
                  },
                },
                'Ya uso Hábitos en otro dispositivo →',
              ),
            ),
          );
          footer.replaceChildren(
            h(
              'button',
              {
                type: 'button',
                class: 'btn primary block',
                onclick: () => {
                  step = 1;
                  draw();
                },
              },
              'Empezar',
            ),
          );
        } else if (step === 1) {
          body.replaceChildren(
            h(
              'div',
              { class: 'onb' },
              h('div', { class: 'onb-hero sm' }, '🎨'),
              h('h1', null, 'Elige tu ambiente'),
              h('p', { class: 'muted' }, 'Colores suaves para un espacio tranquilo. Se adapta al modo claro u oscuro de tu iPhone, y puedes cambiarlo en Ajustes.'),
              h(
                'div',
                { class: 'theme-grid' },
                THEMES.map((t) =>
                  themeSwatch(t, f.theme === t.id, () => {
                    f.theme = t.id;
                    updateSettings({ theme: t.id }, { silent: true });
                    bus.applyTheme();
                    draw();
                  }),
                ),
              ),
            ),
          );
          footer.replaceChildren(
            h(
              'div',
              { class: 'row-gap' },
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn soft',
                  onclick: () => {
                    step = 0;
                    draw();
                  },
                },
                'Atrás',
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn primary grow',
                  onclick: () => {
                    step = 2;
                    draw();
                  },
                },
                'Siguiente',
              ),
            ),
          );
        } else {
          body.replaceChildren(
            h(
              'div',
              { class: 'onb' },
              h('div', { class: 'onb-hero sm' }, '🌱'),
              h('h1', null, 'Tus primeros hábitos'),
              h('p', { class: 'muted' }, 'Elige algunos para empezar. Empieza con pocos: es mejor 3 hábitos que cumples que 10 que te agobian. Después podrás editarlos o crear los tuyos.'),
              h(
                'div',
                { class: 'tpl-grid' },
                TEMPLATES.map((t) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'tpl' + (f.picks.has(t.name) ? ' on' : ''),
                      style: { '--c': t.color },
                      onclick: () => {
                        if (f.picks.has(t.name)) f.picks.delete(t.name);
                        else f.picks.add(t.name);
                        const st = body.scrollTop;
                        draw();
                        body.scrollTop = st;
                      },
                    },
                    h('span', { class: 'tpl-e' }, t.emoji),
                    h('span', { class: 'tpl-n' }, t.name),
                  ),
                ),
              ),
            ),
          );
          footer.replaceChildren(
            h(
              'div',
              { class: 'row-gap' },
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn soft',
                  onclick: () => {
                    step = 1;
                    draw();
                  },
                },
                'Atrás',
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn primary grow',
                  onclick: () => {
                    finish({ seed: true });
                    api.close();
                  },
                },
                f.picks.size ? `Empezar con ${f.picks.size} hábito${f.picks.size === 1 ? '' : 's'}` : 'Empezar sin hábitos',
              ),
            ),
          );
        }
      };
      draw();
    },
  });
}
