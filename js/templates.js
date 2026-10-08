// Categorías por defecto, ideas de hábitos y temas de color.

export const DEFAULT_CATEGORIES = [
  { key: 'salud', name: 'Salud', emoji: '💪', color: '#6fcf97' },
  { key: 'mente', name: 'Mente', emoji: '🧠', color: '#a58bf5' },
  { key: 'estudio', name: 'Estudio y trabajo', emoji: '📚', color: '#6bb8f2' },
  { key: 'hogar', name: 'Hogar', emoji: '🏡', color: '#f6a56f' },
  { key: 'bienestar', name: 'Bienestar', emoji: '🌿', color: '#5cc8b8' },
  { key: 'social', name: 'Social', emoji: '💬', color: '#f58bc3' },
];

export const TEMPLATES = [
  { name: 'Tomar agua', emoji: '💧', color: '#6bb8f2', cat: 'salud', type: 'count', target: 8, unit: 'vasos' },
  { name: 'Hacer ejercicio', emoji: '🏃', color: '#f28b82', cat: 'salud', routine: 'am', schedule: { type: 'weekly', times: 4 } },
  { name: 'Meditar', emoji: '🧘', color: '#a58bf5', cat: 'mente', routine: 'am', timer: 10 },
  { name: 'Leer 20 minutos', emoji: '📖', color: '#f2c46d', cat: 'mente', routine: 'night', timer: 20 },
  { name: 'Dormir 8 horas', emoji: '😴', color: '#7c9cf5', cat: 'salud', routine: 'night' },
  { name: 'Caminar', emoji: '🚶', color: '#b5d86b', cat: 'salud', type: 'count', target: 8000, step: 1000, unit: 'pasos' },
  { name: 'Comer saludable', emoji: '🥗', color: '#6fcf97', cat: 'salud' },
  { name: 'Estudiar', emoji: '🎓', color: '#6bb8f2', cat: 'estudio', routine: 'pm', schedule: { type: 'days', days: [1, 2, 3, 4, 5] } },
  { name: 'Ordenar mi espacio', emoji: '🧹', color: '#f6a56f', cat: 'hogar', routine: 'pm' },
  { name: 'Escribir en el diario', emoji: '✍️', color: '#d58bf5', cat: 'mente', routine: 'night' },
  { name: 'Sin pantallas antes de dormir', emoji: '📵', color: '#8d7b68', cat: 'bienestar', avoid: true, routine: 'night' },
  { name: 'Sin azúcar', emoji: '🍬', color: '#f58bc3', cat: 'salud', avoid: true },
  { name: 'Tomar vitaminas', emoji: '💊', color: '#f2c46d', cat: 'salud', routine: 'am' },
  { name: 'Estirar', emoji: '🤸', color: '#5cc8b8', cat: 'bienestar', routine: 'am', timer: 10 },
  { name: 'Llamar a alguien que quiero', emoji: '📞', color: '#f58bc3', cat: 'social', schedule: { type: 'weekly', times: 2 } },
  { name: 'Agradecer 3 cosas', emoji: '🙏', color: '#f2c46d', cat: 'bienestar', routine: 'night' },
  { name: 'Practicar un idioma', emoji: '🗣️', color: '#7c9cf5', cat: 'estudio', timer: 15 },
  { name: 'Cepillarme los dientes', emoji: '🪥', color: '#6bb8f2', cat: 'salud', type: 'count', target: 3, unit: 'veces' },
];

// Convierte una plantilla en datos de hábito. catIdByKey: { salud: 'c_...' }
export function templateToHabit(t, catIdByKey = {}) {
  return {
    name: t.name,
    emoji: t.emoji,
    color: t.color,
    categoryId: catIdByKey[t.cat] || null,
    type: t.type || 'check',
    target: t.target || 1,
    step: t.step || 1,
    unit: t.unit || '',
    avoid: !!t.avoid,
    timer: t.timer || 0,
    routine: t.routine || 'any',
    schedule: { type: 'daily', days: [1, 2, 3, 4, 5, 6, 0], times: 3, every: 2, ...(t.schedule || {}) },
  };
}

export const THEMES = [
  { id: 'lavanda', name: 'Lavanda', hue: 262, sat: 70 },
  { id: 'salvia', name: 'Salvia', hue: 148, sat: 30 },
  { id: 'durazno', name: 'Durazno', hue: 18, sat: 85 },
  { id: 'oceano', name: 'Océano', hue: 205, sat: 65 },
  { id: 'rosa', name: 'Rosa', hue: 338, sat: 68 },
  { id: 'arena', name: 'Arena', hue: 36, sat: 50 },
  { id: 'menta', name: 'Menta', hue: 168, sat: 48 },
  { id: 'medianoche', name: 'Medianoche', hue: 232, sat: 45 },
];

export function themeHueSat(settings) {
  if (settings.theme === 'custom' && settings.customHue != null) return { hue: settings.customHue, sat: 62 };
  const t = THEMES.find((x) => x.id === settings.theme) || THEMES[0];
  return { hue: t.hue, sat: t.sat };
}
