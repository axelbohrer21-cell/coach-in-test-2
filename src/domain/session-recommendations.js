/** Recommandation déterministe d'exercices à partir des bilans du coach et de sa bibliothèque. */
function normalize(value) {
  return String(value || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const STOP_WORDS = new Set(['avec','dans','pour','plus','faire','etre','avoir','joueur','joueuse','point','points','balle','balles','son','ses','une','des','les','sur','par','que','qui','aux','elle','elles','lui','leur','tres','bien','tout','tous','mais','vers','entre','apres','avant']);

function tokens(value) {
  return normalize(value).split(/[^a-z0-9]+/).filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function recentPriority(evaluations, evaluationCriteria, playerId) {
  const reports = evaluations.filter(row => row.player_id === playerId)
    .sort((a,b) => String(b.evaluated_at || b.created_at || '').localeCompare(String(a.evaluated_at || a.created_at || '')))
    .slice(0, 3);
  const ids = new Set(reports.map(row => row.id));
  const counts = new Map();
  evaluationCriteria.filter(row => ids.has(row.evaluation_id) && row.criterion_type === 'improvement')
    .forEach(row => {
      const key = row.criterion_id || row.criterion;
      if (!key) return;
      if (!counts.has(key)) counts.set(key, { criterion_id: row.criterion_id || null, criterion: row.criterion || 'Axe de progression', main_theme: row.main_theme || '', subtheme: row.subtheme || '', reports: new Set() });
      counts.get(key).reports.add(row.evaluation_id);
    });
  return [...counts.values()].map(row => ({ ...row, occurrences: row.reports.size }))
    .sort((a,b) => b.occurrences-a.occurrences || a.criterion.localeCompare(b.criterion,'fr'))[0] || null;
}

function itemScore(item, priority, focusTokens) {
  const fields = [item.title,item.theme,item.subtheme,item.objective,item.instructions,item.setup,item.keywords?.join(' ')].join(' ');
  const itemTokens = new Set(tokens(fields));
  let score = 0;
  focusTokens.forEach(token => { if (itemTokens.has(token)) score += 3; });
  const themeTokens = tokens([priority?.main_theme, priority?.subtheme].join(' '));
  themeTokens.forEach(token => { if (itemTokens.has(token)) score += 2; });
  if (priority?.main_theme && normalize(item.theme).includes(normalize(priority.main_theme))) score += 4;
  if (priority?.subtheme && normalize(item.subtheme).includes(normalize(priority.subtheme))) score += 3;
  if (item.objective) score += 1;
  if (item.instructions) score += 1;
  return score;
}

export function recommendSessionExercises({ playerId, evaluations = [], evaluationCriteria = [], library = [] } = {}) {
  if (!playerId) return null;
  const priority = recentPriority(evaluations, evaluationCriteria, playerId);
  if (!priority) return null;
  const focusTokens = tokens(priority.criterion);
  const candidates = library.filter(item => item.category === 'particulier')
    .map(item => ({ item, score: itemScore(item, priority, focusTokens) }))
    .filter(row => row.score > 0)
    .sort((a,b) => b.score-a.score || String(a.item.title).localeCompare(String(b.item.title),'fr'));
  if (!candidates.length) return { priority, exerciseOne: null, exerciseTwo: null, reason: 'Aucun exercice de la bibliothèque ne correspond assez précisément à cet axe. Ajoute un contenu lié à ce thème pour obtenir une recommandation.' };
  const first = candidates[0];
  const second = candidates.find(row => row.item.id !== first.item.id && (
    normalize(row.item.theme) === normalize(first.item.theme) ||
    row.score >= Math.max(2, first.score - 2)
  )) || null;
  return {
    priority,
    exerciseOne: first.item,
    exerciseTwo: second?.item || null,
    reason: 'Exercices rapprochés du critère récurrent à partir de leur thème, sous-thème, objectif et consignes.'
  };
}

export function buildMatchTransfer(priority) {
  if (!priority?.criterion) return 'Jouer des points libres en observant les choix et la qualité d’exécution.';
  return 'Situation de points : chercher volontairement à mettre en pratique « ' + priority.criterion + ' ». Le coach note les réussites observables, puis ajuste la contrainte sans modifier l’objectif.';
}
