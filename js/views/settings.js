// Pantalla "Ajustes": perfil, apariencia, hábitos, categorías, recordatorios, sincronización, respaldo y privacidad.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { settings, updateSettings, activeHabits, archivedHabits, categories, moveHabit, restoreHabit, deleteHabit, undeleteHabit, resetAll, allHabits, snapshotState, restoreSnapshot } from '../store.js';
import { segmented, toast, undoToast, confirmDialog, openSheet, hueSlider, toggle } from '../ui.js';
import { THEMES } from '../templates.js';
import { themeSwatch, seedDefaultCategories } from '../sheets/onboarding.js';
import { scheduleText } from '../habitUi.js';
import { downloadICS } from '../ics.js';
import { saveBackupFile, shareBackup, copyBackup, pickBackupFile, pasteBackupSheet, lastBackupAt } from '../backup.js';
import { pinSetupSheet, verifyPinSheet } from '../lock.js';
import { syncStatus, parseConfig, saveConfig, removeConfig, signInGoogle, signInEmail, resetPassword, signOutSync, syncNow, authErrorText, getConfig } from '../sync.js';
import { canShareFiles } from '../files.js';
import { bus } from '../bus.js';

export const APP_VERSION = '1.1.0';
let showArchived = false;

function section(title, ...kids) {
  return h('section', { class: 'set-section' }, h('div', { class: 'section-title' }, title), h('div', { class: 'card set-card' }, ...kids));
}

function row({ emoji, title, sub, right, onclick, danger }) {
  return h(
    onclick ? 'button' : 'div',
    { type: onclick ? 'button' : null, class: 'set-row' + (onclick ? ' tap' : '') + (danger ? ' danger' : ''), onclick },
    emoji ? h('span', { class: 'set-e' }, emoji) : null,
    h('span', { class: 'set-main' }, h('span', { class: 'set-title' }, title), sub ? h('span', { class: 'set-sub' }, sub) : null),
    right !== undefined ? right : onclick ? h('span', { class: 'set-chev' }, icon('right', 18)) : null,
  );
}

const relTime = (ms) => {
  if (!ms) return 'nunca';
  const d = Math.round((Date.now() - ms) / 60000);
  if (d < 1) return 'hace un momento';
  if (d < 60) return `hace ${d} min`;
  const hr = Math.round(d / 60);
  if (hr < 24) return `hace ${hr} h`;
  const days = Math.round(hr / 24);
  return `hace ${days} día${days === 1 ? '' : 's'}`;
};

const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}`;

function copyText(text, msg = 'Copiado 📋') {
  navigator.clipboard
    .writeText(text)
    .then(() => toast(msg))
    .catch(() => toast('No se pudo copiar'));
}

function setupSheet() {
  openSheet({
    title: 'Configurar sincronización',
    full: true,
    build(body, api) {
      const ta = h('textarea', { class: 'input mono', rows: 7, placeholder: 'const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  projectId: "...",\n  ...\n};' });
      const cur = getConfig();
      if (cur) ta.value = JSON.stringify(cur, null, 2);
      body.append(
        h('p', { class: 'muted' }, 'Tus datos se guardarán en tu propio proyecto gratuito de Firebase (de Google). Solo tú podrás leerlos. Se hace una sola vez y tarda unos 10 minutos:'),
        guideSteps(),
        h('div', { class: 'field-label' }, 'Pega aquí tu firebaseConfig'),
        ta,
        h(
          'button',
          {
            type: 'button',
            class: 'btn primary block',
            onclick: async () => {
              const cfg = parseConfig(ta.value);
              if (!cfg) {
                toast('No encuentro apiKey, authDomain, projectId y appId en el texto');
                return;
              }
              api.close();
              toast('Conectando con Firebase…');
              await saveConfig(cfg);
              bus.render();
            },
          },
          'Guardar y conectar',
        ),
      );
    },
  });
}

function guideSteps() {
  return h(
    'ol',
    { class: 'steps' },
    h('li', null, 'Entra en ', h('b', null, 'console.firebase.google.com'), ' con tu cuenta de Google y toca ', h('b', null, 'Crear proyecto'), ' (puedes desactivar Google Analytics).'),
    h('li', null, 'Ve a ', h('b', null, 'Authentication → Comenzar'), ' y activa ', h('b', null, 'Google'), ' y también ', h('b', null, 'Correo electrónico/contraseña'), '.'),
    h('li', null, 'En ', h('b', null, 'Authentication → Configuración → Dominios autorizados'), ', agrega: ', h('code', { class: 'copyable', onclick: () => copyText(location.hostname) }, location.hostname), '.'),
    h('li', null, 'Ve a ', h('b', null, 'Firestore Database → Crear base de datos'), ' (modo producción, la ubicación más cercana).'),
    h(
      'li',
      null,
      'En ',
      h('b', null, 'Firestore → Reglas'),
      ', reemplaza todo por esto y toca ',
      h('b', null, 'Publicar'),
      ':',
      h('pre', { class: 'code' }, RULES),
      h('button', { type: 'button', class: 'btn soft sm', onclick: () => copyText(RULES, 'Reglas copiadas 📋') }, icon('copy', 16), 'Copiar reglas'),
    ),
    h('li', null, 'En ', h('b', null, '⚙️ Configuración del proyecto → Tus apps'), ', toca el ícono web ', h('b', null, '</>'), ', registra la app (sin Hosting) y copia el bloque ', h('code', null, 'firebaseConfig'), '.'),
  );
}

function emailSheet() {
  openSheet({
    title: 'Entrar con correo',
    build(body, api) {
      const email = h('input', { class: 'input', type: 'email', placeholder: 'tu@correo.com', autocomplete: 'email', inputmode: 'email' });
      const pass = h('input', { class: 'input', type: 'password', placeholder: 'Contraseña (mínimo 6 caracteres)', autocomplete: 'current-password' });
      const err = h('p', { class: 'error-txt' });
      const go = async (create) => {
        err.textContent = '';
        try {
          await signInEmail(email.value.trim(), pass.value, create);
          api.close();
          toast(create ? 'Cuenta creada ✅' : 'Sesión iniciada ✅');
        } catch (e) {
          err.textContent = authErrorText(e);
        }
      };
      body.append(
        h('p', { class: 'muted' }, 'Usa el mismo correo y contraseña en tu iPhone y en tu Mac para ver los mismos datos.'),
        h('div', { class: 'col-gap' }, email, pass),
        err,
        h('div', { class: 'row-gap' }, h('button', { type: 'button', class: 'btn soft grow', onclick: () => go(true) }, 'Crear cuenta'), h('button', { type: 'button', class: 'btn primary grow', onclick: () => go(false) }, 'Entrar')),
        h(
          'button',
          {
            type: 'button',
            class: 'link-btn center',
            onclick: async () => {
              if (!email.value.trim()) {
                err.textContent = 'Escribe tu correo arriba.';
                return;
              }
              try {
                await resetPassword(email.value.trim());
                toast('Te enviamos un correo para cambiar la contraseña 📧');
              } catch (e) {
                err.textContent = authErrorText(e);
              }
            },
          },
          'Olvidé mi contraseña',
        ),
      );
    },
  });
}

function syncSection() {
  const st = syncStatus();
  const kids = [];
  if (!st.configured) {
    kids.push(
      row({ emoji: '☁️', title: 'Sincronizar con Google', sub: 'Respaldo automático y tus datos en iPhone y Mac. Gratis.', onclick: setupSheet }),
    );
  } else if (!st.user) {
    kids.push(
      h(
        'div',
        { class: 'sync-box' },
        h('p', { class: 'muted' }, st.status === 'loading' ? 'Conectando con Firebase…' : st.status === 'error' ? st.msg : 'Inicia sesión para sincronizar tus datos.'),
        h(
          'div',
          { class: 'col-gap' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn primary block',
              disabled: !st.ready,
              onclick: async () => {
                try {
                  await signInGoogle();
                  toast('Sesión iniciada ✅');
                } catch (e) {
                  toast(authErrorText(e), 4200);
                }
              },
            },
            h('span', { class: 'g-logo' }, 'G'),
            'Continuar con Google',
          ),
          h('button', { type: 'button', class: 'btn soft block', disabled: !st.ready, onclick: emailSheet }, '✉️ Usar correo y contraseña'),
        ),
        h('p', { class: 'hint' }, 'Si “Continuar con Google” no funciona en la app instalada, usa correo y contraseña: funciona igual de bien.'),
      ),
      row({ emoji: '🛠️', title: 'Cambiar configuración de Firebase', onclick: setupSheet }),
    );
  } else {
    const icons = { synced: '✅', syncing: '🔄', offline: '📴', error: '⚠️', loading: '🔄' };
    kids.push(
      row({
        emoji: icons[st.status] || '☁️',
        title: st.user.email || st.user.name || 'Conectado',
        sub: st.status === 'synced' ? `Sincronizado ${relTime(st.lastSync)}` : st.msg || 'Conectado',
        right: h('button', { type: 'button', class: 'btn soft sm', onclick: () => syncNow() }, icon('refresh', 16), 'Ahora'),
      }),
      row({
        emoji: '🚪',
        title: 'Cerrar sesión',
        sub: 'Tus datos se quedan en este dispositivo y en la nube',
        onclick: async () => {
          await signOutSync();
          toast('Sesión cerrada');
        },
      }),
    );
  }
  if (st.configured) {
    kids.push(
      row({
        emoji: '🧹',
        title: 'Desconectar Firebase',
        sub: 'Borra la configuración de este dispositivo (no borra datos)',
        danger: true,
        onclick: async () => {
          if (await confirmDialog({ title: '¿Desconectar Firebase?', message: 'Se dejará de sincronizar en este dispositivo. Tus datos locales y los de la nube no se borran.', confirmText: 'Desconectar' })) {
            await removeConfig();
            bus.render();
          }
        },
      }),
    );
  }
  return h('section', { class: 'set-section', id: 'sync-section' }, h('div', { class: 'section-title' }, '☁️ Sincronización'), h('div', { class: 'card set-card' }, ...kids));
}

export function renderSettings() {
  const s = settings();
  const root = h('div', { class: 'view view-settings' });
  root.append(h('header', { class: 'page-head' }, h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, 'A tu manera'), h('h1', null, 'Ajustes'))));

  // Perfil
  root.append(
    section(
      '🙂 Perfil',
      h(
        'div',
        { class: 'set-row' },
        h('span', { class: 'set-e' }, '✍️'),
        h('input', {
          class: 'input flat',
          type: 'text',
          placeholder: 'Tu nombre',
          maxlength: 30,
          value: s.name,
          oninput: (e) => updateSettings({ name: e.target.value }, { silent: true }),
          onchange: () => bus.render(),
        }),
      ),
    ),
  );

  // Apariencia
  root.append(
    section(
      '🎨 Apariencia',
      h(
        'div',
        { class: 'set-block' },
        h('div', { class: 'field-label' }, 'Ambiente'),
        h(
          'div',
          { class: 'theme-grid' },
          THEMES.map((t) => themeSwatch(t, s.theme === t.id, () => updateSettings({ theme: t.id }))),
          h(
            'button',
            {
              type: 'button',
              class: 'theme-swatch' + (s.theme === 'custom' ? ' on' : ''),
              onclick: () => updateSettings({ theme: 'custom', customHue: s.customHue ?? 280 }),
            },
            h('span', { class: 'ts-dot rainbow' }),
            h('span', { class: 'ts-name' }, 'Tu color'),
          ),
        ),
        s.theme === 'custom'
          ? h(
              'div',
              { class: 'hue-wrap' },
              hueSlider(s.customHue ?? 280, (v) => {
                updateSettings({ customHue: v }, { silent: true });
                bus.applyTheme();
              }),
            )
          : null,
        h('div', { class: 'field-label' }, 'Modo'),
        segmented(
          [
            { value: 'auto', label: '🌗 Automático' },
            { value: 'light', label: '☀️ Claro' },
            { value: 'dark', label: '🌙 Oscuro' },
          ],
          s.mode,
          (v) => updateSettings({ mode: v }),
        ),
        h('div', { class: 'field-label' }, 'La semana empieza el'),
        segmented(
          [
            { value: 1, label: 'Lunes' },
            { value: 0, label: 'Domingo' },
          ],
          s.weekStart ?? 1,
          (v) => updateSettings({ weekStart: v }),
        ),
      ),
      row({
        emoji: '🎉',
        title: 'Celebrar con confeti',
        sub: 'Al completar todos los hábitos del día',
        right: toggle(s.celebrate !== false, (v) => updateSettings({ celebrate: v })),
      }),
    ),
  );

  // Hábitos
  const act = activeHabits();
  const arch = archivedHabits();
  root.append(
    section(
      `🌱 Tus hábitos (${act.length})`,
      act.map((hb, i) =>
        h(
          'div',
          { class: 'set-row habit-row' },
          h('button', { type: 'button', class: 'hr-main', onclick: () => bus.openHabitForm(hb) }, h('span', { class: 'set-e bubble-sm', style: { background: hb.color + '33' } }, hb.emoji), h('span', { class: 'set-main' }, h('span', { class: 'set-title' }, hb.name), h('span', { class: 'set-sub' }, scheduleText(hb)))),
          h(
            'span',
            { class: 'reorder' },
            h('button', { type: 'button', class: 'icon-btn ghost sm', 'aria-label': 'Subir', disabled: i === 0, onclick: () => moveHabit(hb.id, -1) }, icon('up', 18)),
            h('button', { type: 'button', class: 'icon-btn ghost sm', 'aria-label': 'Bajar', disabled: i === act.length - 1, onclick: () => moveHabit(hb.id, 1) }, icon('down', 18)),
          ),
        ),
      ),
      row({ emoji: '➕', title: 'Nuevo hábito', onclick: () => bus.openHabitForm(null) }),
      arch.length
        ? row({
            emoji: '📦',
            title: `Archivados (${arch.length})`,
            right: h('span', { class: 'set-chev' }, icon(showArchived ? 'up' : 'down', 18)),
            onclick: () => {
              showArchived = !showArchived;
              bus.render();
            },
          })
        : null,
      showArchived
        ? arch.map((hb) =>
            h(
              'div',
              { class: 'set-row habit-row archived' },
              h('span', { class: 'set-e' }, hb.emoji),
              h('span', { class: 'set-main' }, h('span', { class: 'set-title' }, hb.name), h('span', { class: 'set-sub' }, 'Archivado')),
              h(
                'span',
                { class: 'reorder' },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn soft sm',
                    onclick: () => {
                      restoreHabit(hb.id);
                      toast('Hábito restaurado 🌱');
                    },
                  },
                  'Restaurar',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'icon-btn ghost sm danger-ic',
                    'aria-label': 'Eliminar',
                    onclick: async () => {
                      if (await confirmDialog({ title: '¿Eliminar para siempre?', message: `Se borrará “${hb.name}” y todo su historial.`, confirmText: 'Eliminar', danger: true })) {
                        const info = deleteHabit(hb.id);
                        undoToast('Hábito eliminado', () => undeleteHabit(info));
                      }
                    },
                  },
                  icon('trash', 18),
                ),
              ),
            ),
          )
        : null,
    ),
  );

  // Categorías
  const cats = categories();
  const all = allHabits();
  root.append(
    section(
      `🏷️ Categorías (${cats.length})`,
      cats.map((c) =>
        row({
          emoji: c.emoji,
          title: c.name,
          sub: `${all.filter((x) => x.categoryId === c.id && !x.archivedAt).length} hábitos`,
          right: h('span', { class: 'color-dot', style: { background: c.color } }),
          onclick: () => bus.openCategoryForm(c),
        }),
      ),
      row({ emoji: '➕', title: 'Nueva categoría', onclick: () => bus.openCategoryForm(null) }),
      !cats.length
        ? row({
            emoji: '✨',
            title: 'Añadir categorías sugeridas',
            sub: 'Salud, Mente, Estudio, Hogar, Bienestar, Social',
            onclick: () => {
              seedDefaultCategories();
              toast('Categorías añadidas');
            },
          })
        : null,
    ),
  );

  // Recordatorios
  const withRem = act.filter((x) => x.reminder.on);
  root.append(
    section(
      '🔔 Recordatorios',
      h('p', { class: 'set-note' }, 'Los recordatorios se añaden a la app Calendario de tu iPhone como eventos repetidos con alerta: funcionan siempre, incluso sin internet. Actívalos al editar cada hábito.'),
      withRem.map((hb) => row({ emoji: hb.emoji, title: hb.name, sub: `${hb.reminder.time} · ${scheduleText(hb)}`, onclick: () => bus.openHabitForm(hb) })),
      withRem.length
        ? row({ emoji: '📅', title: withRem.length === 1 ? 'Añadir al Calendario' : `Añadir los ${withRem.length} al Calendario`, onclick: () => downloadICS(withRem) })
        : row({ emoji: '💡', title: 'Ningún hábito tiene recordatorio', sub: 'Edita un hábito y activa “Recordatorio”' }),
    ),
  );

  // Sincronización
  root.append(syncSection());

  // Respaldo
  root.append(
    section(
      '💾 Respaldo',
      h('p', { class: 'set-note' }, `Último respaldo manual: ${relTime(lastBackupAt())}.`),
      canShareFiles() ? row({ emoji: '📤', title: 'Compartir respaldo', sub: 'Guárdalo en Archivos, iCloud Drive o envíatelo', onclick: () => shareBackup().then(() => bus.render()) }) : null,
      row({
        emoji: '⬇️',
        title: 'Descargar archivo de respaldo',
        onclick: () => {
          saveBackupFile();
          bus.render();
        },
      }),
      row({ emoji: '📋', title: 'Copiar respaldo como texto', onclick: () => copyBackup().then(() => bus.render()) }),
      row({ emoji: '⬆️', title: 'Importar desde archivo', onclick: pickBackupFile }),
      row({ emoji: '📝', title: 'Importar desde texto', onclick: pasteBackupSheet }),
    ),
  );

  // Privacidad
  root.append(
    section(
      '🔒 Privacidad',
      s.pinHash
        ? [
            row({ emoji: '🔑', title: 'Cambiar PIN', onclick: () => verifyPinSheet(() => pinSetupSheet()) }),
            row({
              emoji: '🔓',
              title: 'Quitar PIN',
              onclick: () =>
                verifyPinSheet(() => {
                  updateSettings({ pinHash: null, pinSalt: null });
                  toast('PIN desactivado');
                }),
            }),
            h(
              'div',
              { class: 'set-block' },
              h('div', { class: 'field-label' }, 'Bloquear al salir de la app'),
              segmented(
                [
                  { value: 0, label: 'Al instante' },
                  { value: 1, label: '1 min' },
                  { value: 5, label: '5 min' },
                  { value: 15, label: '15 min' },
                ],
                s.lockAfter ?? 1,
                (v) => updateSettings({ lockAfter: v }),
                'small',
              ),
            ),
          ]
        : row({ emoji: '🔒', title: 'Bloquear con PIN', sub: 'Protege tu diario con un código de 4 dígitos', onclick: () => pinSetupSheet() }),
    ),
  );

  // Ayuda y acerca de
  root.append(
    section(
      '💡 Consejos',
      h(
        'ul',
        { class: 'tips' },
        h('li', null, 'Toca ✓ para marcar un hábito. Mantén pulsado para marcar ', h('b', null, 'día de descanso'), ' 🌙: no cuenta y no rompe tu racha.'),
        h('li', null, 'En hábitos con cantidad, mantén pulsado ', h('b', null, '+'), ' para escribir el número exacto.'),
        h('li', null, 'En la pestaña ', h('b', null, 'Mes'), ' puedes marcar cualquier día pasado tocando la cuadrícula.'),
        h('li', null, 'Toca un día en el calendario o en el mapa de calor para ver su nota y sus hábitos.'),
      ),
    ),
  );

  root.append(
    section(
      '⚠️ Zona de cuidado',
      row({
        emoji: '🗑️',
        title: 'Borrar todos los datos',
        sub: 'Hábitos, registros, notas y categorías de este dispositivo',
        danger: true,
        onclick: async () => {
          const ok = await confirmDialog({
            title: '¿Borrar todo?',
            message: 'Se borrarán todos tus hábitos, registros y notas de este dispositivo. Si tienes sincronización activa, también se cerrará la sesión (los datos de la nube no se borran). Te recomendamos guardar un respaldo antes.',
            confirmText: 'Borrar todo',
            danger: true,
          });
          if (!ok) return;
          const snap = snapshotState();
          await signOutSync();
          resetAll();
          undoToast('Datos borrados', () => restoreSnapshot(snap));
          bus.render();
        },
      }),
    ),
  );

  root.append(h('div', { class: 'about' }, h('div', { class: 'about-e' }, '🌿'), h('div', null, `Hábitos v${APP_VERSION}`), h('div', { class: 'muted' }, 'Hecho con calma, solo para ti.')));
  return root;
}
