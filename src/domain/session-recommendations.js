/** Recommandation pédagogique déterministe, cloisonnée aux données du coach connecté. */
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
  const priority = recentPriority(evaluations, evaluationCriteria, playerId);
  if (!priority) return null;
  const focusTokens = tokens(priority.criterion);
  const activeChallenge = challenges.find(row => row.player_id === playerId && row.status === 'active') || null;
  const recentVideos = videoAnalyses.filter(row => row.player_id === playerId)
    .sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0,2);
  const videoFocus = recentVideos.flatMap(row => tokens([row.coach_summary,row.observations,row.recommendation].join(' ')));
  const allCandidates = library.filter(item => item.category === 'particulier')
    .map(item => {
      const repeat = isRecentRepeat(item, sessions, playerId);
      const videoMatch = videoFocus.some(token => tokens([item.title,item.theme,item.subtheme,item.objective,item.instructions].join(' ')).includes(token));
      return { item, score: itemScore(item, priority, focusTokens) + (videoMatch ? 2 : 0) - (repeat ? 5 : 0), repeat, videoMatch };
    })
    .filter(row => row.score > 0)
    .sort((a,b) => b.score-a.score || String(a.item.title).localeCompare(String(b.item.title),'fr'));
  const candidates = allCandidates.length ? allCandidates : library.filter(item => item.category === 'particulier')
    .map(item => ({ item, score: itemScore(item, priority, focusTokens), repeat: isRecentRepeat(item,sessions,playerId), videoMatch:false }))
    .filter(row => row.score > 0).sort((a,b)=>b.score-a.score || String(a.item.title).localeCompare(String(b.item.title),'fr'));
  if (!candidates.length) return { priority, activeChallenge, exerciseOne: null, exerciseTwo: null, reason: 'Aucun exercice de la bibliothèque ne correspond assez précisément à cet axe. Ajoute un contenu lié à ce thème pour obtenir une recommandation.' };
  const first = candidates[0];
  const second = candidates.find(row => row.item.id !== first.item.id && (
    normalize(row.item.theme) !== normalize(first.item.theme) ||
    row.score >= Math.max(2, first.score - 2)
  )) || candidates.find(row => row.item.id !== first.item.id) || null;
  const reasonParts = ['Exercices rapprochés du critère récurrent à partir du thème, du sous-thème, de l’objectif et des consignes.'];
  if (first.repeat) reasonParts.push('Un exercice récent reste proposé faute d’alternative suffisamment pertinente.');
  if (first.videoMatch) reasonParts.push('Les observations vidéo récentes renforcent cette piste.');
  if (activeChallenge) reasonParts.push('Le défi actif est intégré à la consigne de progression.');
  return {
    priority, activeChallenge, exerciseOne: first.item, exerciseTwo: second?.item || null,
    reason: reasonParts.join(' '),
    varietyApplied: !first.repeat,
    videoSignalUsed: first.videoMatch
  };
}
export function buildSessionCoachingPlan(recommendation, duration = 90) {
  const priority = recommendation?.priority;
  if (!priority?.criterion) return {
    objective: 'Installer une intention de jeu claire et observer les points forts du joueur.',
    cue: 'Faire verbaliser au joueur ce qu’il cherche à réussir avant chaque série.',
    constraint: 'Commencer sans contrainte, puis ajouter une règle simple si la réussite est stable.',
    success: 'Le joueur identifie son intention et la reproduit dans plusieurs échanges.',
    challenge: recommendation?.activeChallenge?.objective || null
  };
  const objective = 'Améliorer « ' + priority.criterion + ' » et le transférer en situation de points.';
  const cue = priority.subtheme
    ? 'Repère technique : ' + priority.subtheme + '. Donner une seule consigne à la fois.'
    : 'Garder une seule intention : ' + priority.criterion + '. Donner une consigne courte et observable.';
  const constraint = Number(duration) <= 60
    ? 'Privilégier une seule variable : zone, hauteur ou rythme. Augmenter la difficulté seulement après plusieurs réussites.'
    : 'Faire évoluer une variable à la fois : d’abord la régularité, puis la direction ou la vitesse, avant le jeu à thème.';
  const success = 'Sur une série de 10 balles, viser au moins 6 réalisations répondant au critère, puis vérifier son utilisation sur 5 points joués.';
  return { objective, cue, constraint, success, challenge: recommendation?.activeChallenge?.objective || null };
}
export function buildMatchTransfer(priority) {
  if (!priority?.criterion) return 'Jouer des points libres en observant les choix et la qualité d’exécution.';
  return 'Situation de points : chercher volontairement à mettre en pratique « ' + priority.criterion + ' ». Le coach note les réussites observables, puis ajuste la contrainte sans modifier l’objectif.';
}
