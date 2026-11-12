import { supabase } from '../core/supabase.js';
import { state } from '../core/state.js';
import { notificationService } from './notifications.js';

async function unwrap(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export const dataService = {
  async loadProfile(userId) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    return data;
  },

  async loadCoachWorkspace(userId) {
    const links = await unwrap(supabase.from('coach_players').select('player_id').eq('coach_id', userId));
    const playerIds = links.map(link => link.player_id);
    const [players, sessions, evaluations, groupSessions, groupSeries, bookingRequests, library, notifications, criteria, evaluationCriteria, challenges, achievements, coachInvitations] = await Promise.all([
      playerIds.length ? unwrap(supabase.from('profiles').select('*').in('id', playerIds).eq('role', 'player').order('last_name')) : Promise.resolve([]),
      playerIds.length ? unwrap(supabase.from('training_sessions').select('*').in('player_id', playerIds).order('session_date', { ascending: false })) : Promise.resolve([]),
      playerIds.length ? unwrap(supabase.from('evaluations').select('*').in('player_id', playerIds).order('evaluated_at', { ascending: false })) : Promise.resolve([]),
      unwrap(supabase.from('group_sessions').select('*').eq('coach_id', userId).order('session_date')),
      unwrap(supabase.from('group_course_series').select('*').eq('coach_id', userId).order('weekday').order('start_time')),
      unwrap(supabase.from('booking_requests').select('*').eq('coach_id', userId).order('session_date')),
      unwrap(supabase.from('session_library').select('*').eq('coach_id', userId).order('title')),
      notificationService.listCoach(),
      unwrap(supabase.from('criteria_catalog').select('*').eq('coach_id', userId).order('display_order')),
      playerIds.length ? unwrap(supabase.from('evaluation_criteria').select('*').in('evaluation_id', (await unwrap(supabase.from('evaluations').select('id').in('player_id', playerIds))).map(x => x.id))) : Promise.resolve([]),
      playerIds.length ? unwrap(supabase.from('player_challenges').select('*').in('player_id', playerIds).order('created_at', { ascending: false })) : Promise.resolve([]),
      playerIds.length ? unwrap(supabase.from('player_achievements').select('*').in('player_id', playerIds).order('unlocked_at', { ascending: false })) : Promise.resolve([]),
      unwrap(supabase.from('coach_player_invitation_inbox').select('*').order('created_at', { ascending: false }))
    ]);
    Object.assign(state, { players, sessions, evaluations, groupSessions, groupSeries, bookingRequests, library, notifications, criteria, evaluationCriteria, challenges, achievements, coachInvitations });
  },

  async loadPlayerWorkspace() {
    const [sessions, evaluations, requests, notifications, challenges, achievements, coachLinks] = await Promise.all([
      unwrap(supabase.from('player_sessions').select('*').order('session_date', { ascending: false })),
      unwrap(supabase.from('player_evaluations').select('*').order('evaluated_at', { ascending: false })),
      unwrap(supabase.from('booking_requests').select('*').order('session_date')),
      notificationService.listPlayer(),
      unwrap(supabase.from('player_challenges').select('*').eq('player_id', state.user.id).eq('status', 'active')),
      unwrap(supabase.from('player_achievements').select('*').eq('player_id', state.user.id).order('unlocked_at', { ascending: false })),
      unwrap(supabase.from('coach_players').select('coach_id').eq('player_id', state.user.id))
    ]);
    const coachIds = coachLinks.map(row => row.coach_id);
    const playerCoaches = coachIds.length ? await unwrap(supabase.from('profiles').select('id,first_name,last_name').in('id', coachIds).order('last_name')) : [];
    const evaluationIds = evaluations.map(row => row.id).filter(Boolean);
    const evaluationCriteria = evaluationIds.length ? await unwrap(supabase.from('evaluation_criteria').select('*').in('evaluation_id', evaluationIds)) : [];
    Object.assign(state, { players: [state.profile], sessions, evaluations, bookingRequests: requests, notifications, challenges, achievements, evaluationCriteria, playerCoaches });
  },

  async respondToCoachInvitation(invitationId, accept) {
    const { error } = await supabase.rpc('respond_coach_player_invitation', { p_invitation_id: invitationId, p_accept: accept });
    if (error) throw error;
  },
  async inviteCoachToPlayer(playerId, coachEmail) {
    const { data, error } = await supabase.rpc('invite_coach_to_player', { p_player_id: playerId, p_coach_email: coachEmail });
    if (error) throw error;
    return data;
  },
  async createSession(payload) {
    const { data, error } = await supabase.from('training_sessions').insert(payload).select().single();
    if (error) throw error;
    return data;
  },
  async createEvaluation(payload) {
    const { data, error } = await supabase.from('evaluations').insert(payload).select().single();
    if (error) throw error;
    return data;
  },
  async updatePlayer(playerId, changes) {
    const { data, error } = await supabase.from('profiles').update(changes).eq('id', playerId).select().single();
    if (error) throw error;
    return data;
  },
  async createGroupSession(payload) {
    const { data, error } = await supabase.from('group_sessions').insert(payload).select().single();
    if (error) throw error;
    return data;
  },
  async createGroupSeries(payload) {
    const { data, error } = await supabase.from('group_course_series').insert(payload).select().single();
    if (error) throw error;
    return data;
  },
  async createGroupSessionsBatch(payload) {
    if (!payload.length) return [];
    const { data, error } = await supabase.from('group_sessions').insert(payload).select();
    if (error) throw error;
    return data || [];
  }
};
