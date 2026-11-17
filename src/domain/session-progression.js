const normalize = value => String(value || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function buildSessionProgression(sessions = [], playerId, objective = '') {
  const previous = sessions
    .filter(row => row.player_id === playerId && row.progress_review?.reviewed_at)
    .sort((a, b) => String(b.session_date || '').localeCompare(String(a.session_date || '')))[0];
  if (!previous) {
    return { hasHistory: false, difficulty: 'progressive', direction: 'baseline', label: 'Établir un repère', guidance: 'Mesurer une première série de 10 tentatives avant de modifier la difficulté.', sourceSessionId: null };
  }
  const review = previous.progress_review;
  const attempts = Number(review.attempts);
  const successes = Number(review.successes);
  const ratio = Number.isFinite(attempts) && attempts > 0 && Number.isFinite(successes) ? successes / attempts : null;
  const rating = Number(review.coach_rating);
  let direction = 'maintain', difficulty = 'progressive', label = 'Consolider', guidance = 'Garder la même difficulté et chercher une exécution plus régulière.';
  if ((ratio !== null && ratio >= 0.75) || (ratio === null && Number.isFinite(rating) && rating >= 8)) {
    direction = 'increase'; difficulty = 'hard'; label = 'Augmenter le défi';
    guidance = 'La réussite est solide : réduire légèrement les zones, ajouter une lecture ou une décision et vérifier le transfert en points.';
  } else if ((ratio !== null && ratio <= 0.45) || (ratio === null && Number.isFinite(rating) && rating <= 4)) {
    direction = 'decrease'; difficulty = 'easy'; label = 'Revenir aux repères';
    guidance = 'La réussite reste fragile : simplifier une seule contrainte, ralentir le rythme et sécuriser le geste avant de complexifier.';
  }
  const previousObjective = String(review.objective || previous.theme || '');
  const sameObjective = objective && previousObjective && normalize(objective).includes(normalize(previousObjective));
  return {
    hasHistory: true, direction, difficulty, label, guidance,
    previousObjective, sameObjective,
    ratio: ratio === null ? null : Number((ratio * 100).toFixed(0)),
    coachRating: Number.isFinite(rating) ? rating : null,
    sourceSessionId: previous.id,
    observed: String(review.observation || ''),
    successCriterion: String(review.success_criterion || ''),
    nextAdjustment: String(review.next_adjustment || '')
  };
}
