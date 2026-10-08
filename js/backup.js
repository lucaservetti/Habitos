// Respaldo manual: exportar / importar como archivo o texto.
import { h, todayKey } from './util.js';
import { openSheet, toast, undoToast, choiceDialog } from './ui.js';
import { exportData, importData, isValidBackup, snapshotState, restoreSnapshot } from './store.js';
import { downloadBlob, shareOrDownload } from './files.js';

const LAST = 'habitos-last-backup';

export function lastBackupAt() {
  try {
    return Number(localStorage.getItem(LAST)) || 0;
  } catch {
    return 0;
  }
}
function markBackup() {
  try {
    localStorage.setItem(LAST, String(Date.now()));
  } catch {}
}

const fileName = () => `habitos-respaldo-${todayKey()}.json`;

export function saveBackupFile() {
  const json = JSON.stringify(exportData());
  downloadBlob(new Blob([json], { type: 'application/json' }), fileName());
  markBackup();
  toast('Respaldo guardado 💾');
}

export async function shareBackup() {
  const json = JSON.stringify(exportData());
  const r = await shareOrDownload(new File([json], fileName(), { type: 'application/json' }), 'Respaldo de Hábitos');
  if (r !== 'cancelled') {
    markBackup();
    toast('Respaldo listo 💾');
  }
}

export async function copyBackup() {
  const json = JSON.stringify(exportData());
  try {
    await navigator.clipboard.writeText(json);
    markBackup();
    toast('Respaldo copiado al portapapeles 📋');
  } catch {
    toast('No se pudo copiar. Usa “Guardar archivo”.');
  }
}

async function applyBackup(obj) {
  if (!isValidBackup(obj)) {
    toast('Ese archivo no es un respaldo de Hábitos');
    return false;
  }
  const n = obj.data.habits.filter((x) => !x.deleted).length;
  const date = obj.exportedAt ? new Date(obj.exportedAt).toLocaleDateString('es') : 'fecha desconocida';
  const choice = await choiceDialog({
    title: 'Importar respaldo',
    message: `Respaldo del ${date} con ${n} hábito${n === 1 ? '' : 's'}. ¿Cómo quieres importarlo?`,
    options: [
      { label: 'Combinar con mis datos', value: 'merge', cls: 'primary' },
      { label: 'Reemplazar todo', value: 'replace', cls: 'danger-soft' },
      { label: 'Cancelar', value: null, cls: 'soft' },
    ],
  });
  if (!choice) return false;
  const snap = snapshotState();
  importData(obj, choice);
  undoToast('Respaldo importado ✅', () => restoreSnapshot(snap));
  return true;
}

export function pickBackupFile() {
  const input = h('input', { type: 'file', style: 'display:none' });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    let obj;
    try {
      obj = JSON.parse(await file.text());
    } catch {
      toast('No se pudo leer el archivo');
      return;
    }
    applyBackup(obj);
  });
  document.body.appendChild(input);
  input.click();
}

export function pasteBackupSheet() {
  openSheet({
    title: 'Pegar respaldo',
    build(body, api) {
      const ta = h('textarea', { class: 'input mono', rows: 8, placeholder: 'Pega aquí el texto del respaldo…' });
      body.append(
        ta,
        h(
          'div',
          { class: 'row-gap' },
          h('button', { type: 'button', class: 'btn soft grow', onclick: () => api.close() }, 'Cancelar'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn primary grow',
              onclick: async () => {
                let obj;
                try {
                  obj = JSON.parse(ta.value.trim());
                } catch {
                  toast('El texto no es un respaldo válido');
                  return;
                }
                if (await applyBackup(obj)) api.close();
              },
            },
            'Importar',
          ),
        ),
      );
    },
  });
}
