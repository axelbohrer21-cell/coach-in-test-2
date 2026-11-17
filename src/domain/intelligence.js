/** Analyses déterministes de progression. Les données restent dans l'espace du coach connecté. */
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

function average(rows, key) {
  const values = rows.map(row => Number(row[key])).filter(value => Number.isFinite(value) && value >= 0 && value <= 20);
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

  const strengths = countCriteria(recentCriteria, 'positive').filter(row => row.occurrences >= 2).slice(0, 3);
  const difficulties = countCriteria(recentCriteria, 'improvement').filter(row => row.occurrences >= 2).slice(0, 3);
  const trends = SCORE_FIELDS.map(([label, key]) => {
    const current = average(recent, key);
    const prior = average(previous, key);
    return { label, current, previous: prior, delta: current === null || prior === null ? null : Number((current - prior).toFixed(1)) };
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

  return {
    playerId: player.id,
    playerName: [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Joueur',
    reportCount: reports.length,
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
    activeChallenge
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
