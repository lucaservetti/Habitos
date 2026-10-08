// Crear / editar categorías.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { openSheet, toast, undoToast, confirmDialog, field, colorPicker, emojiPicker, HABIT_COLORS } from '../ui.js';
import { addCategory, updateCategory, deleteCategory, undeleteCategory } from '../store.js';
import { habitVars } from '../habitUi.js';

export function openCategoryForm(cat = null, opts = {}) {
  const f = cat ? { name: cat.name, emoji: cat.emoji, color: cat.color } : { name: '', emoji: '🌿', color: HABIT_COLORS[Math.floor(Math.random() * HABIT_COLORS.length)] };
  let showEmoji = false;

  openSheet({
    title: cat ? 'Editar categoría' : 'Nueva categoría',
    build(body, api) {
      const content = h('div', { class: 'form' });
      body.append(content);

      const save = () => {
        const name = (f.name || '').trim();
        if (!name) {
          toast('Ponle un nombre a la categoría');
          return;
        }
        let saved;
        if (cat) {
          updateCategory(cat.id, { ...f, name });
          saved = { ...cat, ...f, name };
        } else saved = addCategory({ ...f, name });
        api.close();
        if (opts.onSaved) opts.onSaved(saved);
      };

      api.el.appendChild(h('div', { class: 'sheet-footer' }, h('button', { type: 'button', class: 'btn primary block', onclick: save }, cat ? 'Guardar' : 'Crear categoría')));

      function draw() {
        const st = body.scrollTop;
        content.replaceChildren(
          h(
            'div',
            { class: 'form-hero', style: habitVars(f.color) },
            h(
              'button',
              {
                type: 'button',
                class: 'hbubble big' + (showEmoji ? ' active' : ''),
                onclick: () => {
                  showEmoji = !showEmoji;
                  draw();
                },
              },
              f.emoji,
            ),
            h(
              'div',
              { class: 'grow' },
              h('input', {
                class: 'input name-input',
                type: 'text',
                placeholder: 'Nombre (ej. Salud)',
                maxlength: 30,
                value: f.name,
                oninput: (e) => (f.name = e.target.value),
              }),
            ),
          ),
          showEmoji
            ? emojiPicker(f.emoji, (e) => {
                f.emoji = e;
                showEmoji = false;
                draw();
              })
            : null,
          field(
            'Color',
            colorPicker(f.color, (c) => {
              f.color = c;
              draw();
            }),
          ),
          cat
            ? h(
                'div',
                { class: 'danger-zone' },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn danger-soft',
                    onclick: async () => {
                      const ok = await confirmDialog({
                        title: '¿Eliminar categoría?',
                        message: 'Los hábitos de esta categoría quedarán sin categoría. No se borra ningún hábito.',
                        confirmText: 'Eliminar',
                        danger: true,
                      });
                      if (!ok) return;
                      const info = deleteCategory(cat.id);
                      api.close();
                      undoToast('Categoría eliminada', () => undeleteCategory(info));
                    },
                  },
                  icon('trash', 18),
                  'Eliminar categoría',
                ),
              )
            : null,
        );
        body.scrollTop = st;
      }
      draw();
    },
  });
}
