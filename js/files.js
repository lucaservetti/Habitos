// Descargar / compartir archivos generados en el dispositivo.

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Intenta abrir la hoja de compartir del sistema; si no se puede, descarga el archivo.
export async function shareOrDownload(file, title) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  downloadBlob(file, file.name);
  return 'downloaded';
}

export function canShareFiles() {
  try {
    const f = new File(['x'], 'x.txt', { type: 'text/plain' });
    return !!(navigator.canShare && navigator.canShare({ files: [f] }));
  } catch {
    return false;
  }
}
