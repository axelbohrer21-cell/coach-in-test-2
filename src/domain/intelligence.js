/** Analyses déterministes de progression. Les données restent dans l'espace du coach connecté. */
import { recommendSessionExercises } from './session-recommendations.js';
const SCORE_FIELDS = [
  ['Technique', 'technical_score'],
  ['Tactique', 'tactical_score'],
  ['Physique', 'physical_score'],
  ['Mental', 'mental_score']
];

function dateValue(row) {
  const value = row?.evaluated_at || row?.created_at || row?.session_date || '';
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function distinctEvaluationCount(rows) {
  return new Set(rows.map(row => row.evaluation_id).filter(Boolean)).size;
}

function scoreValues(rows, key) {
  return rows.map(row => Number(row[key])).filter(value => Number.isFinite(value) && value >= 0 && value <= 20);
}

function average(rows, key) {
  const values = scoreValues(rows, key);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function analyzePlayerProgress({ player, evaluations = [], evaluationCriteria = [], sessions = [], videoAnalyses = [], challenges = [], now = Date.now() }) {
  const reports = [...evaluations].filter(row => row.player_id === player.id).sort((a, b) => dateValue(b) - dateValue(a));
  const recent = reports.slice(0, 3);
  const previous = reports.slice(3, 6);
  const recentIds = new Set(recent.map(row => row.id));
  const previousIds = new Set(previous.map(row => row.id));
  const recentCriteria = evaluationCriteria.filter(row => recentIds.has(row.evaluation_id));
  const previousCriteria = evaluationCriteria.filter(row => previousIds.has(row.evaluation_id));

  const countCriteria = (rows, type) => {
    const grouped = new Map();
    rows.filter(row => row.criterion_type === type).forEach(row => {
      const key = row.criterion_id || row.criterion;
      if (!key) return;
      if (!grouped.has(key)) grouped.set(key, { criterion_id: row.criterion_id || null, criterion: row.criterion || 'Critère non nommé', evaluations: new Set() });
      if (row.evaluation_id) grouped.get(key).evaluations.add(row.evaluation_id);
    });
    return [...grouped.values()].map(row => ({ ...row, occurrences: row.evaluations.size }))
      .sort((a, b) => b.occurrences - a.occurrences || a.criterion.localeCompare(b.criterion, 'fr'));
  };

  const enoughReportsForCriteria = recent.length >= 3;
  const strengths = (enoughReportsForCriteria ? countCriteria(recentCriteria, 'positive').filter(row => row.occurrences >= 2) : []).slice(0, 3);
  const difficulties = (enoughReportsForCriteria ? countCriteria(recentCriteria, 'improvement').filter(row => row.occurrences >= 2) : []).slice(0, 3);
  const criteriaConfidence = !enoughReportsForCriteria ? 'insufficient' : (strengths.length || difficulties.length ? 'recurrent' : 'no-recurrence');
  const trends = SCORE_FIELDS.map(([label, key]) => {
    const current = average(recent, key);
    const prior = average(previous, key);
    const enoughHistory = scoreValues(recent, key).length >= 3 && scoreValues(previous, key).length >= 3;
    return { label, current, previous: prior, delta: current === null || prior === null || !enoughHistory ? null : Number((current - prior).toFixed(1)) };
  });
  const priority = difficulties[0] || null;
  const playerSessions = sessions.filter(row => row.player_id === player.id).sort((a, b) => String(b.session_date || '').localeCompare(String(a.session_date || '')));
  const playerVideos = videoAnalyses.filter(row => row.player_id === player.id);
  const activeChallenge = challenges.find(row => row.player_id === player.id && row.status === 'active') || null;
  const lastReportDate = reports[0] ? String(reports[0].evaluated_at || reports[0].created_at || '').slice(0, 10) : null;
  const lastSessionDate = playerSessions[0]?.session_date || null;
  const reportAgeDays = lastReportDate ? Math.max(0, Math.floor((now - Date.parse(lastReportDate + 'T12:00:00')) / 86400000)) : null;
  const sessionAgeDays = lastSessionDate ? Math.max(0, Math.floor((now - Date.parse(lastSessionDate + 'T12:00:00')) / 86400000)) : null;

  let status = 'À suivre';
  let statusReason = 'Données encore insuffisantes pour dégager une tendance fiable.';
  if (!reports.length) {
    status = 'Premier bilan à réaliser';
    statusReason = 'Aucun bilan enregistré dans cet espace coach.';
  } else if (reportAgeDays !== null && reportAgeDays > 30) {
    status = 'Bilan à actualiser';
    statusReason = 'Le dernier bilan remonte à plus de 30 jours.';
  } else if (!enoughReportsForCriteria) {
    status = 'Observations à consolider';
    statusReason = 'Moins de trois bilans distincts : aucune priorité ni réussite récurrente n’est confirmée.';
  } else if (difficulties.length) {
    status = 'Axe de progression identifié';
    statusReason = 'Un même point à travailler revient dans plusieurs bilans récents.';
  } else if (strengths.length) {
    status = 'Progression positive observée';
    statusReason = 'Des réussites sont confirmées dans plusieurs bilans récents.';
  }

  const suggestedFocus = priority
    ? 'Travailler : ' + priority.criterion
    : trends.filter(row => row.current !== null).sort((a, b) => a.current - b.current)[0]?.label
      ? 'Consolider le secteur : ' + trends.filter(row => row.current !== null).sort((a, b) => a.current - b.current)[0].label
      : 'Réaliser un bilan pour établir une première priorité';
  const fastestProgress = trends.filter(row => row.delta !== null && row.delta > 0)
    .sort((a,b) => b.delta-a.delta)[0] || null;
  const stagnation = trends.filter(row => row.delta !== null && Math.abs(row.delta) < 0.5)
    .map(row => row.label);
  const decliningAreas = trends.filter(row => row.delta !== null && row.delta < -0.5)
    .sort((a,b)=>a.delta-b.delta);
  const planFocus = priority?.criterion || (decliningAreas[0] ? decliningAreas[0].label : suggestedFocus.replace('Travailler : ',''));
  const fourWeekPlan = reports.length >= 3 ? [
    { week: 1, title: 'Reconstruction des repères', objective: 'Stabiliser '+planFocus+' avec une situation fermée et une seule consigne observable.', success: 'Réussir au moins 6 répétitions sur 10 avec une qualité gestuelle stable.' },
    { week: 2, title: 'Variabilité contrôlée', objective: 'Faire évoluer une seule variable : direction, hauteur, rythme ou déplacement.', success: 'Conserver au moins 6 réussites sur 10 malgré la variation.' },
    { week: 3, title: 'Lecture et décision', objective: 'Introduire une information à lire et laisser le joueur choisir sa réponse.', success: 'Faire le bon choix sur au moins 6 situations sur 10.' },
    { week: 4, title: 'Transfert et validation', objective: 'Réinvestir '+planFocus+' dans des points à thème puis comparer au prochain bilan.', success: 'Retrouver le comportement ciblé dans au moins 6 points sur 10 et actualiser le bilan.' }
  ] : [];

  return {
    playerId: player.id,
    playerName: [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Joueur',
    reportCount: reports.length,
    criteriaConfidence,
    criteriaSampleSize: recent.length,
    scoreSampleSizes: trends.map(row => ({ label: row.label, recent: scoreValues(recent, SCORE_FIELDS.find(([label]) => label === row.label)?.[1] || '').length, previous: scoreValues(previous, SCORE_FIELDS.find(([label]) => label === row.label)?.[1] || '').length })),
    sessionCount: playerSessions.length,
    videoCount: playerVideos.length,
    lastReportDate,
    lastSessionDate,
    reportAgeDays,
    sessionAgeDays,
    status,
    statusReason,
    strengths,
    difficulties,
    trends,
    priority,
    suggestedFocus,
    activeChallenge,
    fastestProgress,
    stagnation,
    decliningAreas,
    fourWeekPlan
  };
}

export function buildCoachIntelligence({ players = [], evaluations = [], evaluationCriteria = [], sessions = [], videoAnalyses = [], challenges = [], now = Date.now() } = {}) {
  const activePlayers = players.filter(player => !player.archived_at);
  const insights = activePlayers.map(player => analyzePlayerProgress({
    player, evaluations, evaluationCriteria, sessions, videoAnalyses, challenges, now
  }));
  const common = new Map();
  insights.forEach(insight => insight.difficulties.forEach(item => {
    const key = item.criterion_id || item.criterion;
    if (!common.has(key)) common.set(key, { criterion: item.criterion, players: new Set() });
    common.get(key).players.add(insight.playerId);
  }));
  const recurringThemes = [...common.values()]
    .map(item => ({ criterion: item.criterion, playerCount: item.players.size }))
    .sort((a, b) => b.playerCount - a.playerCount || a.criterion.localeCompare(b.criterion, 'fr'));

  return {
    insights,
    playersWithoutReport: insights.filter(row => row.reportCount === 0).length,
    reportsToRefresh: insights.filter(row => row.reportAgeDays !== null && row.reportAgeDays > 30).length,
    playersWithPriority: insights.filter(row => row.priority).length,
    recurringThemes
  };
}


/**
 * Construit un cycle pédagogique de quatre semaines à partir des données réelles
 * du joueur. Le programme reste une proposition coach, jamais une réservation automatique.
 */
export function buildAdaptiveTrainingProgram({ player, evaluations = [], evaluationCriteria = [], sessions = [], videoAnalyses = [], challenges = [], library = [], now = Date.now() } = {}) {
  if (!player?.id) return { ready: false, reason: 'Joueur introuvable.', sessions: [] };
  const analysis = analyzePlayerProgress({ player, evaluations, evaluationCriteria, sessions, videoAnalyses, challenges, now });
  if (analysis.reportCount < 2) {
    return {
      ready: false,
      reason: 'Il faut au moins deux bilans pour construire un cycle personnalisé fiable.',
      analysis,
      sessions: []
    };
  }
  const recommendation = recommendSessionExercises({
    playerId: player.id, evaluations, evaluationCriteria, library, sessions, challenges, videoAnalyses
  });
  const exercises = [recommendation?.exerciseOne, recommendation?.exerciseTwo].filter(Boolean);
  const focus = analysis.priority?.criterion || analysis.suggestedFocus;
  const stages = [
    { title: 'État des lieux et repères', objective: 'Observer le comportement ciblé et installer une première référence stable.', action: 'Faire réaliser des séries courtes sans multiplier les consignes.', success: 'Établir un niveau de réussite de départ sur 10 tentatives.', stage: 'Diagnostic' },
    { title: 'Répétition maîtrisée', objective: 'Stabiliser '+focus+' dans une situation simple et reproductible.', action: 'Garder une seule consigne technique et un rythme contrôlé.', success: 'Atteindre au moins 6 réussites sur 10 tentatives.', stage: 'Stabilisation' },
    { title: 'Régularité sous contrôle', objective: 'Répéter le comportement avec une qualité constante.', action: 'Allonger les séries sans augmenter la difficulté.', success: 'Conserver au moins 6 réussites sur 10 sur deux séries.', stage: 'Stabilisation' },
    { title: 'Première variation', objective: 'Faire évoluer une seule variable : direction, hauteur, rythme ou déplacement.', action: 'Introduire une variation à la fois et revenir au repère si nécessaire.', success: 'Réussir au moins 6 situations sur 10 malgré la variation.', stage: 'Variabilité' },
    { title: 'Variation et déplacement', objective: 'Maintenir '+focus+' avec un déplacement ou une balle différente.', action: 'Alterner une situation connue et une situation nouvelle.', success: 'Retrouver le comportement ciblé dans 6 situations sur 10.', stage: 'Variabilité' },
    { title: 'Lecture de trajectoire', objective: 'Identifier l’information utile avant de déclencher la réponse.', action: 'Faire verbaliser la lecture puis laisser le joueur agir.', success: 'Faire un choix adapté dans au moins 6 situations sur 10.', stage: 'Prise de décision' },
    { title: 'Choix tactique', objective: 'Choisir quand et comment utiliser '+focus+' selon la situation de jeu.', action: 'Proposer deux réponses possibles et faire justifier le choix.', success: 'Choisir la bonne intention dans 6 situations sur 10.', stage: 'Prise de décision' },
    { title: 'Enchaînement et construction', objective: 'Relier le comportement travaillé à la frappe ou décision suivante.', action: 'Construire des séquences de deux à trois frappes avec une intention claire.', success: 'Construire au moins 5 séquences cohérentes sur 8.', stage: 'Enchaînement' },
    { title: 'Transfert en points à thème', objective: 'Réinvestir '+focus+' dans des points avec une contrainte tactique.', action: 'Laisser jouer, observer et ne corriger qu’après la séquence.', success: 'Retrouver le comportement dans au moins 6 points sur 10.', stage: 'Transfert match' },
    { title: 'Validation et nouveau cap', objective: 'Mesurer les acquis, identifier ce qui est transféré et définir la prochaine priorité.', action: 'Comparer les observations au point de départ puis réaliser un bilan actualisé.', success: 'Valider les acquis observables et choisir le prochain axe de travail.', stage: 'Bilan de cycle' }
  ];
  const plannedSessions = stages.map((phase, index) => ({
    number: index + 1,
    title: phase.title,
    objective: phase.objective,
    coachAction: phase.action,
    success: phase.success,
    stage: phase.stage,
    focus,
    exercise: exercises.length ? exercises[index % exercises.length] : null,
    challenge: analysis.activeChallenge?.objective || analysis.activeChallenge?.criterion || null
  }));
  return {
    ready: true,
    playerId: player.id,
    playerName: analysis.playerName,
    focus,
    status: analysis.status,
    reason: recommendation?.reason || 'Cycle construit à partir des bilans disponibles.',
    activeChallenge: analysis.activeChallenge,
    completedSessionCount: sessions.filter(row => row.player_id === player.id && row.status !== 'cancelled').length,
    sessions: plannedSessions
  };
}
