import { supabase } from '../core/supabase.js';
import { calculateAverage } from '../domain/tennis.js';
import { newlyUnlockedAchievements, recommendChallenge, challengeEvaluationResult, validateEvaluationCriteria } from '../domain/progression.js';

async function rows(query) { const { data, error } = await query; if (error) throw error; return data || []; }

export const progressionService = {
  async saveEvaluation({ playerId, coachId, scores, selectedCriteria, playerVisibleComment = '', notifyPlayer = true }) {
    validateEvaluationCriteria(selectedCriteria);
    const score = calculateAverage(scores);
    const { data: evaluation, error } = await supabase.from('evaluations').insert({
      player_id: playerId, created_by: coachId, ...scores, score,
      player_visible_comment: String(playerVisibleComment || '').trim()
    }).select('id,player_id,session_id,evaluated_at,score,technical_score,tactical_score,physical_score,mental_score,player_visible_comment,created_by,created_at').single();
    if (error) throw error;

    const detailRows = selectedCriteria.map(item => ({
      evaluation_id: evaluation.id,
      criterion_id: item.criterion_id,
      main_theme: item.main_theme,
      subtheme: item.subtheme || '',
      criterion: item.criterion,
      criterion_type: item.criterion_type,
      measured_value: item.measured_value === '' || item.measured_value == null ? null : Number(item.measured_value)
    }));
    if (detailRows.length) {
      const { error: detailError } = await supabase.from('evaluation_criteria').insert(detailRows);
      if (detailError) throw detailError;
    }


if (detailRows.length) {
  await this.refreshAchievements(playerId, coachId);
  const hadActiveChallenge = await this.updateActiveChallenge(playerId, coachId, detailRows);
  if (!hadActiveChallenge) await this.createNextChallenge(playerId, coachId);
}

if (notifyPlayer) {
  const { error: notificationError } = await supabase.rpc(
    'notify_player_existing_evaluation',
    { p_evaluation_id: evaluation.id }
  );
  if (notificationError) throw notificationError;
}

return evaluation;

  },

  async refreshAchievements(playerId, coachId) {
    // Ne lire que les bilans de ce joueur créés par ce coach : les réussites
    // restent ainsi strictement cloisonnées entre les différents coachs.
    const [playerEvaluations, existing] = await Promise.all([
      rows(supabase.from('evaluations').select('id').eq('player_id', playerId).eq('created_by', coachId)),
      rows(supabase.from('player_achievements').select('criterion_id').eq('player_id', playerId).eq('coach_id', coachId))
    ]);

    const evaluationIds = playerEvaluations.map(row => row.id);
    if (!evaluationIds.length) return;

    const history = await rows(
      supabase.from('evaluation_criteria')
        .select('evaluation_id,criterion_id,criterion_type')
        .in('evaluation_id', evaluationIds)
        .eq('criterion_type', 'positive')
        .not('criterion_id', 'is', null)
    );

    // newlyUnlockedAchievements compte les bilans distincts, pas les clics :
    // un même critère doit être positif dans au moins trois bilans différents.
    const earned = newlyUnlockedAchievements(history, existing.map(row => row.criterion_id));
    if (!earned.length) return;

    const catalogIds = earned.map(row => row.criterion_id);
    const catalog = await rows(
      supabase.from('criteria_catalog').select('id,criterion').in('id', catalogIds)
    );
    const names = new Map(catalog.map(row => [row.id, row.criterion]));
    const inserts = earned.map(row => ({
      coach_id: coachId,
      player_id: playerId,
      criterion_id: row.criterion_id,
      criterion: names.get(row.criterion_id) || 'Compétence validée',
      validation_count: row.validation_count
    }));

    // Relecture juste avant insertion pour éviter de recréer une réussite déjà
    // débloquée si deux enregistrements de bilan arrivent presque simultanément.
    const { data: existingNow, error: checkError } = await supabase
      .from('player_achievements')
      .select('criterion_id')
      .eq('player_id', playerId)
      .eq('coach_id', coachId);
    if (checkError) throw checkError;

    const known = new Set((existingNow || []).map(row => row.criterion_id));
    const missing = inserts.filter(row => !known.has(row.criterion_id));
    if (!missing.length) return;

    // Notifier uniquement les réussites réellement créées, sans doublon concurrent.
    for (const achievement of missing) {
      const { data: created, error: insertError } = await supabase
        .from('player_achievements')
        .insert(achievement)
        .select('id')
        .single();
      if (insertError) {
        if (insertError.code === '23505') continue;
        throw insertError;
      }

      // La notification est créée automatiquement par le trigger SQL après insertion.
    }
  },

  async updateActiveChallenge(playerId, coachId, selectedRows = []) {
    const { data: challenge, error } = await supabase
      .from('player_challenges').select('*')
      .eq('player_id', playerId).eq('coach_id', coachId)
      .eq('status', 'active').maybeSingle();
    if (error) throw error;
    if (!challenge) return false;

    let currentValue = challenge.current_value;
    let success = false;
    if (challenge.tracking_mode === 'frequency_3') {
      // Défi automatique : compter le critère dans les trois derniers bilans du coach.
      const evaluations = await rows(
        supabase.from('evaluations').select('id')
          .eq('player_id', playerId).eq('created_by', coachId)
          .order('evaluated_at', { ascending: false }).limit(3)
      );
      if (evaluations.length < 3) return true;
      const ids = evaluations.map(row => row.id);
      const history = await rows(
        supabase.from('evaluation_criteria').select('evaluation_id')
          .in('evaluation_id', ids).eq('criterion_id', challenge.criterion_id)
          .eq('criterion_type', 'improvement')
      );
      currentValue = new Set(history.map(row => row.evaluation_id)).size;
      success = challengeEvaluationResult({
        measuredValue: currentValue, targetValue: challenge.target_value, operator: 'lte'
      });
    } else {
      // Conserver le fonctionnement des défis manuels fondés sur une mesure saisie.
      const match = selectedRows.find(row => row.criterion_id === challenge.criterion_id && row.criterion_type === 'improvement');
      success = Boolean(match) && challengeEvaluationResult({
        measuredValue: match.measured_value, targetValue: challenge.target_value,
        operator: challenge.comparison_operator || 'gte'
      });
      currentValue = match?.measured_value ?? challenge.current_value;
    }

    const nextCount = success ? Number(challenge.consecutive_successes || 0) + 1 : 0;
    const changes = { current_value: currentValue, consecutive_successes: nextCount };
    if (nextCount >= 2) Object.assign(changes, { status: 'completed', completed_at: new Date().toISOString() });
    const { error: updateError } = await supabase.from('player_challenges').update(changes).eq('id', challenge.id);
    if (updateError) throw updateError;
    return true;
  },

  async createNextChallenge(playerId, coachId) {
    const [{ data: active, error: activeError }, { data: evaluations, error: evaluationError }, { data: unlocked, error: unlockedError }, { data: completed, error: completedError }] = await Promise.all([
      supabase.from('player_challenges').select('id').eq('player_id', playerId).eq('coach_id', coachId).eq('status', 'active').maybeSingle(),
      supabase.from('evaluations').select('id,evaluated_at').eq('player_id', playerId).eq('created_by', coachId).order('evaluated_at', { ascending: false }).limit(3),
      supabase.from('player_achievements').select('criterion_id').eq('player_id', playerId).eq('coach_id', coachId),
      supabase.from('player_challenges').select('criterion_id').eq('player_id', playerId).eq('coach_id', coachId).eq('status', 'completed')
    ]);
    if (activeError) throw activeError;
    if (evaluationError) throw evaluationError;
    if (unlockedError) throw unlockedError;
    if (completedError) throw completedError;
    if (active || (evaluations || []).length < 3) return null;

    const ids = evaluations.map(row => row.id);
    const history = await rows(
      supabase.from('evaluation_criteria')
        .select('evaluation_id,criterion_id,criterion,criterion_type')
        .in('evaluation_id', ids).eq('criterion_type', 'improvement')
        .not('criterion_id', 'is', null)
    );
    const excluded = [
      ...(unlocked || []).map(row => row.criterion_id),
      ...(completed || []).map(row => row.criterion_id)
    ].filter(Boolean);
    const suggestion = recommendChallenge(history, excluded);
    if (!suggestion) return null;

    const { data: criterion, error: criterionError } = await supabase
      .from('criteria_catalog').select('main_theme,subtheme')
      .eq('id', suggestion.criterion_id).single();
    if (criterionError) throw criterionError;

    // Cible calculée sur l'historique réel : au moins une occurrence de moins
    // dans une fenêtre de trois bilans, puis deux fenêtres consécutives réussies.
    const baseline = Number(suggestion.occurrences);
    const target = Math.max(0, baseline - 1);
    const objective = `Faire apparaître « ${suggestion.criterion} » dans au plus ${target} bilan(s) sur les 3 prochains (contre ${baseline} sur les 3 derniers).`;
    const { data: created, error: insertError } = await supabase
      .from('player_challenges')
      .insert({
        coach_id: coachId, player_id: playerId, criterion_id: suggestion.criterion_id,
        criterion: suggestion.criterion, objective, target_value: target,
        current_value: baseline, comparison_operator: 'lte', tracking_mode: 'frequency_3', status: 'active'
      })
      .select().single();
    if (insertError) throw insertError;
    return { ...created, main_theme: criterion.main_theme, subtheme: criterion.subtheme };
  }};
