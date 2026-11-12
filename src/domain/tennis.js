/** Règles métier pures : testables sans navigateur ni Supabase. */
export const EVALUATION_SECTORS = Object.freeze([
  { key: 'technical_score', label: 'Technique' },
  { key: 'tactical_score', label: 'Tactique' },
  { key: 'physical_score', label: 'Physique' },
  { key: 'mental_score', label: 'Mental' }
]);

export function calculateAverage(scores) {
  const values = EVALUATION_SECTORS.map(({ key }) => scores?.[key])
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(Number);
  if (!values.length) return null;
  if (values.some(value => !Number.isFinite(value) || value < 0 || value > 20)) {
    throw new RangeError('Chaque note doit être comprise entre 0 et 20.');
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10;
}

export function calculateAge(birthDate, referenceDate = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > referenceDate) return null;
  let age = referenceDate.getFullYear() - birth.getFullYear();
  const monthDiff = referenceDate.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birth.getDate())) age--;
  return age;
}

/** Catégorie indicative calculée sur l'année civile de la saison FFT (à valider avec le référentiel FFT annuel). */
export function calculateAgeCategory(birthDate, seasonYear = new Date().getFullYear()) {
  if (!birthDate) return '';
  const birthYear = Number(String(birthDate).slice(0, 4));
  if (!Number.isInteger(birthYear) || birthYear > seasonYear) return '';
  const age = seasonYear - birthYear;
  if (age <= 6) return '6 ans et moins';
  if (age <= 8) return '8 ans';
  if (age <= 10) return '10 ans';
  if (age <= 12) return '12 ans';
  if (age <= 14) return '14 ans';
  if (age <= 16) return '16 ans';
  if (age <= 18) return '18 ans';
  return 'Senior';
}

export function validateBooking({ date, time, duration, court }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Choisis une date valide.');
  const [year, month, day] = date.split('-').map(Number);
  const parsedDate = new Date(year, month - 1, day);
  if (parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) throw new Error('Choisis une date valide.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) throw new Error('Choisis un horaire valide.');
  if (![60, 90, 120].includes(Number(duration))) throw new Error('Durée autorisée : 1 h, 1 h 30 ou 2 h.');
  if (![1, 2, 3].includes(Number(court))) throw new Error('Choisis un court disponible.');
  const start = new Date(`${date}T${time}:00`);
  if (Number.isNaN(start.getTime()) || start <= new Date()) throw new Error('Le créneau doit être dans le futur.');
  return true;
}

export function canPlayerCancel(sessionStart, now = new Date()) {
  const start = new Date(sessionStart);
  return Number.isFinite(start.getTime()) && start.getTime() - now.getTime() >= 24 * 60 * 60 * 1000;
}

export function countDistinctValidations(rows) {
  const byCriterion = new Map();
  for (const row of rows || []) {
    if (row.criterion_type !== 'positive' || !row.criterion || !row.evaluation_id) continue;
    if (!byCriterion.has(row.criterion)) byCriterion.set(row.criterion, new Set());
    byCriterion.get(row.criterion).add(row.evaluation_id);
  }
  return [...byCriterion.entries()].filter(([, evaluations]) => evaluations.size >= 3)
    .map(([criterion, evaluations]) => ({ criterion, validationCount: evaluations.size }));
}

export function nextChallenge(rows, alreadyUnlocked = []) {
  const unlocked = new Set(alreadyUnlocked);
  const counts = new Map();
  const evaluationsByCriterion = new Map();
  for (const row of rows || []) {
    if (row.criterion_type !== 'improvement' || !row.criterion || !row.evaluation_id || unlocked.has(row.criterion)) continue;
    if (!evaluationsByCriterion.has(row.criterion)) evaluationsByCriterion.set(row.criterion, new Set());
    evaluationsByCriterion.get(row.criterion).add(row.evaluation_id);
  }
  for (const [criterion, evaluations] of evaluationsByCriterion) counts.set(criterion, evaluations.size);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
  return ranked.length ? { criterion: ranked[0][0], occurrences: ranked[0][1] } : null;
}

export function weekStart(date = new Date()) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

export function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
