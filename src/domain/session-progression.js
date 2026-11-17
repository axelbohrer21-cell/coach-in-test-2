const normalize = value => String(value || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function buildSessionProgression(sessions = [], playerId, objective = '', evaluations = [], evaluationCriteria = []) {
  const previous = sessions
    .filter(row => row.player_id === playerId && row.progress_review?.reviewed_at)
    .sort((a, b) => String(b.session_date || '').localeCompare(String(a.session_date || '')))[0];
  if (previous) {
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
    return {
      hasHistory: true, direction, difficulty, label, guidance,
      previousObjective, sameObjective: Boolean(objective && previousObjective && normalize(objective).includes(normalize(previousObjective))),
      ratio: ratio === null ? null : Number((ratio * 100).toFixed(0)),
      coachRating: Number.isFinite(rating) ? rating : null,
      sourceSessionId: previous.id, source: 'session_review',
      observed: String(review.observation || ''),
      successCriterion: String(review.success_criterion || ''),
      nextAdjustment: String(review.next_adjustment || '')
    };
  }

  // Fallback automatique : s'appuyer sur le dernier bilan pédagogique déjà existant.
  // Aucun résultat de séance n'est inventé et aucune donnée n'est écrite en base.
  const latestEvaluation = evaluations
    .filter(row => row.player_id === playerId)
    .sort((a, b) => String(b.evaluated_at || b.created_at || '').localeCompare(String(a.evaluated_at || a.created_at || '')))[0];
  if (!latestEvaluation) {
    return { hasHistory: false, difficulty: 'progressive', direction: 'baseline', label: 'Établir un repère', guidance: 'Coach In utilisera automatiquement les évaluations et les défis existants dès qu’ils seront disponibles.', source: 'baseline', sourceSessionId: null };
  }

  const dimensions = ['technical_score', 'tactical_score', 'physical_score', 'mental_score']
    .map(key => Number(latestEvaluation[key])).filter(value => Number.isFinite(value));
  const score = Number.isFinite(Number(latestEvaluation.score)) ? Number(latestEvaluation.score)
    : dimensions.length ? dimensions.reduce((sum, value) => sum + value, 0) / dimensions.length : null;
  const recentEvaluations = evaluations.filter(row => row.player_id === playerId)
    .sort((a, b) => String(b.evaluated_at || b.created_at || '').localeCompare(String(a.evaluated_at || a.created_at || ''))).slice(0, 3);
  const ids = new Set(recentEvaluations.map(row => row.id));
  const recurring = new Map();
  evaluationCriteria.filter(row => ids.has(row.evaluation_id) && row.criterion_type === 'improvement')
    .forEach(row => {
      const key = row.criterion_id || row.criterion;
      if (!key) return;
      if (!recurring.has(key)) recurring.set(key, { criterion: row.criterion, main_theme: row.main_theme, count: 0 });
      recurring.get(key).count += 1;
    });
  const priority = [...recurring.values()].sort((a, b) => b.count - a.count)[0];
  const automaticObjective = priority?.criterion || objective || '';
  const rating = score === null ? null : score / 2;
  let direction = 'maintain', difficulty = 'progressive', label = 'Consolider automatiquement';
  let guidance = 'Poursuivre le travail engagé et faire évoluer une seule contrainte à la fois.';
  if (rating !== null && rating >= 7.5) {
    direction = 'increase'; difficulty = 'hard'; label = 'Faire progresser le défi';
    guidance = 'Le dernier bilan global est solide : augmenter progressivement la précision et ajouter une décision en situation de points.';
  } else if (rating !== null && rating <= 5) {
    direction = 'decrease'; difficulty = 'easy'; label = 'Sécuriser les fondamentaux';
    guidance = 'Le dernier bilan montre un besoin de consolidation : simplifier la contrainte et stabiliser les repères avant de complexifier.';
  }
  return {
    hasHistory: true, direction, difficulty, label, guidance, source: 'latest_evaluation',
    previousObjective: automaticObjective, sameObjective: Boolean(objective && automaticObjective && normalize(objective).includes(normalize(automaticObjective))),
    ratio: null, coachRating: rating === null ? null : Number(rating.toFixed(1)),
    evaluationScore: score, sourceEvaluationId: latestEvaluation.id,
    observed: priority ? 'Axe récurrent dans les derniers bilans : ' + priority.criterion : 'Adaptation fondée sur le dernier bilan pédagogique enregistré.',
    successCriterion: '', nextAdjustment: ''
  };
}
