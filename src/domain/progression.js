/** Moteur de progression tennis — fonctions pures, sans dépendance navigateur/Supabase. */
export function groupCriteria(catalog = []) {
  const themes = new Map();
  for (const item of catalog) {
    const key = item.main_theme || 'Autres';
    if (!themes.has(key)) themes.set(key, new Map());
    const subs = themes.get(key);
    const sub = item.subtheme || '';
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub).push(item);
  }
  return [...themes.entries()].map(([theme, subs]) => ({
    theme,
    subthemes: [...subs.entries()].map(([subtheme, criteria]) => ({
      subtheme,
      positive: criteria.filter(x => x.criterion_type === 'positive').sort((a,b) => a.criterion.localeCompare(b.criterion, 'fr')),
      improvement: criteria.filter(x => x.criterion_type === 'improvement').sort((a,b) => a.criterion.localeCompare(b.criterion, 'fr'))
    }))
  }));
}

export function hasEvaluationContent(scores = {}, selected = []) {
  const hasScore = ['technical_score','tactical_score','physical_score','mental_score'].some(key => scores[key] !== null && scores[key] !== undefined && scores[key] !== '');
  return hasScore || selected.length > 0;
}

export function validateEvaluationCriteria(selected = []) {
  const ids = new Set();
  for (const row of selected) {
    if (!row.criterion_id || !['positive','improvement'].includes(row.criterion_type)) throw new Error('Un critère sélectionné est incomplet.');
    if (ids.has(row.criterion_id)) throw new Error('Un même critère ne peut être sélectionné deux fois dans un bilan.');
    ids.add(row.criterion_id);
    if (row.measured_value !== null && row.measured_value !== undefined && row.measured_value !== '' && !Number.isFinite(Number(row.measured_value))) throw new Error('La mesure doit être numérique.');
  }
  return true;
}

export function newlyUnlockedAchievements(rows = [], alreadyUnlockedIds = []) {
  const unlocked = new Set(alreadyUnlockedIds);
  const sessionsByCriterion = new Map();
  for (const row of rows) {
    if (row.criterion_type !== 'positive' || !row.criterion_id || !row.evaluation_id || unlocked.has(row.criterion_id)) continue;
    if (!sessionsByCriterion.has(row.criterion_id)) sessionsByCriterion.set(row.criterion_id, new Set());
    sessionsByCriterion.get(row.criterion_id).add(row.evaluation_id);
  }
  return [...sessionsByCriterion.entries()]
    .filter(([, evaluations]) => evaluations.size >= 3)
    .map(([criterion_id, evaluations]) => ({ criterion_id, validation_count: evaluations.size }));
}

export function recommendChallenge(rows = [], alreadyUnlockedIds = []) {
  const unlocked = new Set(alreadyUnlockedIds);
  const counts = new Map();
  for (const row of rows) {
    if (row.criterion_type !== 'improvement' || !row.criterion_id || !row.evaluation_id || unlocked.has(row.criterion_id)) continue;
    if (!counts.has(row.criterion_id)) counts.set(row.criterion_id, { criterion_id: row.criterion_id, criterion: row.criterion, evaluations: new Set() });
    counts.get(row.criterion_id).evaluations.add(row.evaluation_id);
  }
  return [...counts.values()].map(x => ({ criterion_id: x.criterion_id, criterion: x.criterion, occurrences: x.evaluations.size }))
    .sort((a,b) => b.occurrences-a.occurrences || a.criterion.localeCompare(b.criterion, 'fr'))[0] || null;
}

export function challengeEvaluationResult({ measuredValue, targetValue, operator = 'gte' }) {
  if (measuredValue === null || measuredValue === undefined || measuredValue === '' || targetValue === null || targetValue === undefined) return false;
  const measured = Number(measuredValue), target = Number(targetValue);
  if (!Number.isFinite(measured) || !Number.isFinite(target)) return false;
  if (operator === 'lte') return measured <= target;
  if (operator === 'eq') return measured === target;
  return measured >= target;
}

export function radarPoints(scores, size = 220) {
  const axes = [
    ['Technique', scores?.technical_score], ['Tactique', scores?.tactical_score],
    ['Physique', scores?.physical_score], ['Mental', scores?.mental_score]
  ];
  const center = size / 2, radius = size * .36;
  const angle = i => -Math.PI/2 + i * Math.PI/2;
  const points = axes.map(([, value], i) => {
    const r = value === null || value === undefined || value === '' ? 0 : Math.max(0, Math.min(20, Number(value))) / 20 * radius;
    return [center + Math.cos(angle(i))*r, center + Math.sin(angle(i))*r];
  });
  return { axes, polygon: points.map(p => p.join(',')).join(' '), center, radius };
}
