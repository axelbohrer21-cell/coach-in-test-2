/** Recommandations pédagogiques déterministes. Les critères ne deviennent prioritaires que s'ils sont répétés dans un échantillon suffisant. */
function normalize(value) {
  return String(value || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function tokens(value) {
  return normalize(value).split(/[^a-z0-9]+/).filter(word => word.length > 2);
}
function recentPriority(evaluations, evaluationCriteria, playerId) {
  const reports = evaluations.filter(row => row.player_id === playerId)
    .sort((a,b) => String(b.evaluated_at || b.created_at || '').localeCompare(String(a.evaluated_at || a.created_at || '')))
    .slice(0, 3);
  if (reports.length < 3) return null;
  const ids = new Set(reports.map(row => row.id));
  const counts = new Map();
  evaluationCriteria.filter(row => ids.has(row.evaluation_id) && row.criterion_type === 'improvement')
    .forEach(row => {
      const key = row.criterion_id || normalize(row.criterion);
      if (!key) return;
      if (!counts.has(key)) counts.set(key, { criterion_id: row.criterion_id || null, criterion: row.criterion || 'Axe de progression', main_theme: row.main_theme || '', subtheme: row.subtheme || '', reports: new Set(), measuredReports: new Set() });
      const item = counts.get(key);
      item.reports.add(row.evaluation_id);
      if (row.measured_value !== null && row.measured_value !== undefined && row.measured_value !== '') item.measuredReports.add(row.evaluation_id);
    });
  return [...counts.values()]
    .map(row => ({ ...row, occurrences: row.reports.size, measuredOccurrences: row.measuredReports.size, confidence: row.reports.size >= 2 ? 'récurrent' : 'à confirmer' }))
    .filter(row => row.occurrences >= 2)
    .sort((a,b) => b.occurrences-a.occurrences || b.measuredOccurrences-a.measuredOccurrences || a.criterion.localeCompare(b.criterion,'fr'))[0] || null;
}
function itemScore(item, priority) {
  const fields = [item.title,item.theme,item.subtheme,item.objective,item.instructions,item.setup,(item.keywords || []).join(' ')].join(' ');
  const itemTokens = new Set(tokens(fields));
  const criterionTokens = tokens(priority.criterion);
  const subthemeTokens = tokens(priority.subtheme);
  const themeTokens = tokens(priority.main_theme);
  const criterionMatch = criterionTokens.filter(token => itemTokens.has(token)).length;
  const subthemeMatch = subthemeTokens.filter(token => itemTokens.has(token)).length;
  const themeMatch = themeTokens.filter(token => itemTokens.has(token)).length;
  return criterionMatch * 5 + subthemeMatch * 3 + themeMatch * 2;
}
function sessionText(session) {
  return normalize([session.theme,session.exercise_1,session.exercise_2].join(' '));
}
function isRecentRepeat(item, sessions, playerId) {
  const recent = sessions.filter(row => row.player_id === playerId)
    .sort((a,b) => String(b.session_date || '').localeCompare(String(a.session_date || ''))).slice(0,2);
  const title = normalize(item.title);
  return Boolean(title && recent.some(row => sessionText(row).includes(title)));
}
export function recommendSessionExercises({ playerId, evaluations = [], evaluationCriteria = [], library = [], sessions = [], challenges = [], videoAnalyses = [] } = {}) {
  if (!playerId) return null;
  const playerReports = evaluations.filter(row => row.player_id === playerId);
  const priority = recentPriority(evaluations, evaluationCriteria, playerId);
  const activeChallenge = challenges.find(row => row.player_id === playerId && row.status === 'active') || null;
  if (!priority) return {
    priority: null, activeChallenge, exerciseOne: null, exerciseTwo: null,
    reportCount: playerReports.length,
    reason: playerReports.length < 3
      ? 'Priorité non déterminée : il faut trois bilans distincts au minimum. Les observations actuelles restent visibles, mais ne suffisent pas à conclure.'
      : 'Aucun axe d’amélioration n’apparaît dans au moins deux des trois derniers bilans.'
  };
  const recentVideos = videoAnalyses.filter(row => row.player_id === playerId)
    .sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0,2);
  const videoFocus = recentVideos.flatMap(row => tokens([row.coach_summary,row.observations,row.recommendation].join(' ')));
  const candidates = library.filter(item => item.category === 'particulier')
    .map(item => {
      const videoMatch = videoFocus.some(token => tokens([item.title,item.theme,item.subtheme,item.objective,item.instructions].join(' ')).includes(token));
      const repeat = isRecentRepeat(item, sessions, playerId);
      return { item, score: itemScore(item, priority) + (videoMatch ? 1 : 0) - (repeat ? 12 : 0), repeat, videoMatch };
    })
    .filter(row => row.score > 0)
    .sort((a,b) => b.score-a.score || String(a.item.title).localeCompare(String(b.item.title),'fr'));
  const first = candidates[0] || null;
  const second = candidates.find(row => row.item.id !== first?.item.id && row.score >= Math.max(3, first.score - 3)) || null;
  return {
    priority, activeChallenge, exerciseOne: first?.item || null, exerciseTwo: second?.item || null,
    reportCount: playerReports.length,
    reason: first
      ? 'Priorité confirmée sur au moins deux des trois derniers bilans. Les exercices proposés correspondent aux mots-clés du critère, du sous-thème et du thème.'
      : 'Priorité confirmée, mais aucun exercice de la bibliothèque privée ne correspond assez précisément. La création originale peut construire des situations à partir du critère et du programme pédagogique.',
    varietyApplied: Boolean(first && !first.repeat),
    videoSignalUsed: Boolean(first?.videoMatch)
  };
}
export function buildSessionCoachingPlan(recommendation, duration = 90) {
  const priority = recommendation?.priority;
  if (!priority?.criterion) return {
    objective: 'Séance d’observation : choisir un comportement de jeu à évaluer avant de fixer une priorité.',
    cue: 'Observer une situation de jeu représentative et noter des faits précis, sans conclure sur une tendance.',
    constraint: 'Conserver une situation simple et relever les réussites et les difficultés observées.',
    success: 'Obtenir une première référence observable, puis la comparer lors de deux autres bilans.',
    challenge: recommendation?.activeChallenge?.objective || null
  };
  return {
    objective: 'Faire progresser « ' + priority.criterion + ' » et vérifier son transfert en situation de points.',
    cue: priority.subtheme ? 'Repère de travail : ' + priority.subtheme + '. Une seule consigne à la fois.' : 'Garder une intention observable : ' + priority.criterion + '.',
    constraint: Number(duration) <= 60 ? 'Faire évoluer une seule variable à la fois.' : 'Passer du contrôle à la variation, puis à la décision en points.',
    success: 'Noter le nombre de réussites sur une série définie, dans la même situation, puis vérifier le comportement en points.',
    challenge: recommendation?.activeChallenge?.objective || null
  };
}
export function buildMatchTransfer(priority) {
  if (!priority?.criterion) return 'Jouer des points libres et relever les comportements observés sans annoncer de priorité prématurée.';
  return 'Situation de points : chercher volontairement à mettre en pratique « ' + priority.criterion + ' ». Relever les réussites observables et le contexte dans lequel elles apparaissent.';
}
