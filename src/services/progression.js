import { supabase } from '../core/supabase.js';
import { calculateAverage } from '../domain/tennis.js';
import { newlyUnlockedAchievements, recommendChallenge, challengeEvaluationResult, validateEvaluationCriteria } from '../domain/progression.js';

async function rows(query) { const { data, error } = await query; if (error) throw error; return data || []; }

export const progressionService = {
  async saveEvaluation({ playerId, coachId, scores, selectedCriteria }) {
    validateEvaluationCriteria(selectedCriteria);
    const score = calculateAverage(scores);
    const { data: evaluation, error } = await supabase.from('evaluations').insert({
      player_id: playerId, created_by: coachId, ...scores, score
    }).select().single();
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

    await this.refreshAchievements(playerId, coachId);
    await this.updateActiveChallenge(playerId, detailRows);
    return evaluation;
  },

  async refreshAchievements(playerId, coachId) {
    const history = await rows(supabase.from('evaluation_criteria').select('evaluation_id,criterion_id,criterion_type').eq('criterion_type','positive').not('criterion_id','is',null));
    const [playerEvaluations, existing] = await Promise.all([
      rows(supabase.from('evaluations').select('id').eq('player_id', playerId)),
      rows(supabase.from('player_achievements').select('criterion_id').eq('player_id', playerId))
    ]);
    const ids = new Set(playerEvaluations.map(x => x.id));
    const playerRows = history.filter(x => ids.has(x.evaluation_id));
    const earned = newlyUnlockedAchievements(playerRows, existing.map(x => x.criterion_id));
    if (!earned.length) return;
    const catalogIds = earned.map(x => x.criterion_id);
    const catalog = await rows(supabase.from('criteria_catalog').select('id,criterion').in('id',catalogIds));
    const names = new Map(catalog.map(x => [x.id,x.criterion]));
    const inserts = earned.map(x => ({ coach_id:coachId, player_id:playerId, criterion_id:x.criterion_id, criterion:names.get(x.criterion_id)||'Compétence validée', validation_count:x.validation_count }));
    const { data: existingAfterCheck, error: checkError } = await supabase.from('player_achievements').select('criterion_id').eq('player_id',playerId);
    if (checkError) throw checkError;
    const known = new Set((existingAfterCheck||[]).map(x=>x.criterion_id));
    const missing = inserts.filter(x=>!known.has(x.criterion_id));
    if (missing.length) { const { error } = await supabase.from('player_achievements').insert(missing); if (error && error.code !== '23505') throw error; }
  },

  async updateActiveChallenge(playerId, selectedRows) {
    const { data: challenge, error } = await supabase.from('player_challenges').select('*').eq('player_id',playerId).eq('status','active').maybeSingle();
    if (error) throw error;
    if (!challenge) return;
    const match = selectedRows.find(x => x.criterion_id === challenge.criterion_id && x.criterion_type === 'improvement');
    const success = match && challengeEvaluationResult({ measuredValue:match.measured_value, targetValue:challenge.target_value, operator:challenge.comparison_operator || 'gte' });
    const nextCount = success ? Number(challenge.consecutive_successes || 0)+1 : 0;
    const changes = { consecutive_successes:nextCount, current_value:match?.measured_value ?? challenge.current_value };
    if (nextCount >= 2) Object.assign(changes,{status:'completed',completed_at:new Date().toISOString()});
    const { error:updateError } = await supabase.from('player_challenges').update(changes).eq('id',challenge.id);
    if (updateError) throw updateError;
  },

  async createNextChallenge(playerId, coachId) {
    const [{data:active,error:activeError},{data:allRows,error:rowsError},{data:unlocked,error:unlockedError}] = await Promise.all([
      supabase.from('player_challenges').select('id').eq('player_id',playerId).eq('status','active').maybeSingle(),
      supabase.from('evaluation_criteria').select('evaluation_id,criterion_id,criterion,criterion_type').eq('criterion_type','improvement').not('criterion_id','is',null),
      supabase.from('player_achievements').select('criterion_id').eq('player_id',playerId)
    ]);
    if(activeError)throw activeError;if(rowsError)throw rowsError;if(unlockedError)throw unlockedError;if(active)return null;
    const {data:evaluations,error:evaluationError}=await supabase.from('evaluations').select('id').eq('player_id',playerId);
    if(evaluationError)throw evaluationError;
    const ids=new Set((evaluations||[]).map(x=>x.id));
    if(ids.size<3)return null;
    const suggestion=recommendChallenge((allRows||[]).filter(x=>ids.has(x.evaluation_id)),(unlocked||[]).map(x=>x.criterion_id));
    if(!suggestion)return null;
    const {data:criterion,error:criterionError}=await supabase.from('criteria_catalog').select('main_theme,subtheme').eq('id',suggestion.criterion_id).single();
    if(criterionError)throw criterionError;
    return { ...suggestion, main_theme:criterion.main_theme, subtheme:criterion.subtheme };
  }
};
