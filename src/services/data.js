import { supabase } from '../core/supabase.js';
import { state } from '../core/state.js';
import { notificationService } from './notifications.js';

async function unwrap(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function hydrateMessages(rows) {
  return Promise.all((rows||[]).map(async row=>{
    if(!row.attachment_path)return row;
    const {data,error}=await supabase.storage.from('coach-in-attachments').createSignedUrl(row.attachment_path,3600);
    return {...row,attachment_url:error?null:data?.signedUrl||null};
  }));
}

export const dataService = {
  async loadAdminWorkspace() {
    const { data, error } = await supabase.from('profiles').select('id,email,first_name,last_name,created_at,archived_at').eq('role','coach').order('last_name');
    if (error) throw error;
    state.adminCoaches = data || [];
  },
  async manageCoach(action,payload={}) { const {data,error}=await supabase.functions.invoke('manage-coaches',{body:{action,...payload}}); if(error)throw error; return data; },
  async loadProfile(userId) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    return data;
  },

  async loadCoachWorkspace(userId) {
    const links = await unwrap(supabase.from('coach_players').select('player_id').eq('coach_id', userId));
    const playerIds = links.map(link => link.player_id);
    const [players, sessionRows, privateNotes, evaluations, groupSessions, groupSeries, bookingRequests, library, notifications, criteria, evaluationCriteria, challenges, achievements, coachInvitations, weeklyAvailability, messages] = await Promise.all([
      playerIds.length ? unwrap(supabase.from('profiles').select('*').in('id', playerIds).eq('role', 'player').order('last_name')) : Promise.resolve([]),
      playerIds.length ? unwrap(supabase.from('training_sessions').select('*').in('player_id', playerIds).eq('created_by', userId).order('session_date', { ascending: false })) : Promise.resolve([]),
      unwrap(supabase.from('coach_session_notes').select('session_id,note').eq('coach_id', userId)),
      playerIds.length ? unwrap(supabase.from('evaluations').select('*').in('player_id', playerIds).eq('created_by', userId).order('evaluated_at', { ascending: false })) : Promise.resolve([]),
      unwrap(supabase.from('group_sessions').select('*').eq('coach_id', userId).order('session_date')),
      unwrap(supabase.from('group_course_series').select('*').eq('coach_id', userId).order('weekday').order('start_time')),
      unwrap(supabase.from('booking_requests').select('*').eq('coach_id', userId).order('session_date')),
      unwrap(supabase.from('session_library').select('*').eq('coach_id', userId).order('title')),
      notificationService.listCoach(),
      unwrap(supabase.from('criteria_catalog').select('*').eq('coach_id', userId).order('display_order')),
      playerIds.length ? unwrap(supabase.from('evaluation_criteria').select('*').in('evaluation_id', (await unwrap(supabase.from('evaluations').select('id').in('player_id', playerIds).eq('created_by', userId))).map(x => x.id))) : Promise.resolve([]),
      playerIds.length ? unwrap(supabase.from('player_challenges').select('*').in('player_id', playerIds).eq('coach_id', userId).order('created_at', { ascending: false })) : Promise.resolve([]),
      playerIds.length ? unwrap(supabase.from('player_achievements').select('*').in('player_id', playerIds).eq('coach_id', userId).order('unlocked_at', { ascending: false })) : Promise.resolve([]),
      unwrap(supabase.from('coach_player_invitation_inbox').select('*').order('created_at', { ascending: false })),
      unwrap(supabase.from('coach_weekly_availability').select('*').eq('coach_id',userId).order('weekday').order('start_time')),
      unwrap(supabase.from('coach_player_messages').select('*').eq('coach_id',userId).order('created_at'))
    ]);
    const notesBySession = new Map(privateNotes.map(row => [row.session_id, row.note]));
    const sessions = sessionRows.map(row => ({ ...row, coach_private_notes: notesBySession.get(row.id) || '' }));
    const hydratedMessages=await hydrateMessages(messages);
    Object.assign(state, { players, sessions, evaluations, groupSessions, groupSeries, bookingRequests, library, notifications, criteria, evaluationCriteria, challenges, achievements, coachInvitations, weeklyAvailability, messages:hydratedMessages });
  },

  async loadPlayerWorkspace() {
    const [sessions, evaluations, requests, notifications, challenges, achievements, coachLinks] = await Promise.all([
      unwrap(supabase.from('player_sessions').select('*').order('session_date', { ascending: false })),
      unwrap(supabase.from('player_evaluations').select('*').order('evaluated_at', { ascending: false })),
      unwrap(supabase.from('booking_requests').select('*').order('session_date')),
      notificationService.listPlayer(),
      unwrap(supabase.from('player_challenges').select('*').eq('player_id', state.user.id).order('created_at', { ascending: false })),
      unwrap(supabase.from('player_achievements').select('*').eq('player_id', state.user.id).order('unlocked_at', { ascending: false })),
      unwrap(supabase.from('coach_players').select('coach_id').eq('player_id', state.user.id))
    ]);
    const coachIds = coachLinks.map(row => row.coach_id);
    const playerCoaches = coachIds.length ? await unwrap(supabase.from('profiles').select('id,first_name,last_name,email').in('id', coachIds).order('last_name')) : [];
    const weeklyAvailability = coachIds.length ? await unwrap(supabase.from('coach_weekly_availability').select('*').in('coach_id',coachIds).eq('active',true).order('weekday').order('start_time')) : [];
    const messages = await unwrap(supabase.from('coach_player_messages').select('*').eq('player_id',state.user.id).order('created_at'));
    const evaluationIds = evaluations.map(row => row.id).filter(Boolean);
    const evaluationCriteria = evaluationIds.length ? await unwrap(supabase.from('evaluation_criteria').select('*').in('evaluation_id', evaluationIds)) : [];
    const hydratedMessages=await hydrateMessages(messages);
    Object.assign(state, { players: [state.profile], sessions, evaluations, bookingRequests: requests, notifications, challenges, achievements, evaluationCriteria, playerCoaches, weeklyAvailability, messages:hydratedMessages });
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
    const { coach_private_notes = '', ...sessionPayload } = payload;
    const { data, error } = await supabase.from('training_sessions').insert(sessionPayload).select().single();
    if (error) throw error;
    if (coach_private_notes.trim()) {
      const { error: noteError } = await supabase.from('coach_session_notes').insert({ session_id: data.id, coach_id: payload.created_by, note: coach_private_notes.trim() });
      if (noteError) {
        await supabase.from('training_sessions').delete().eq('id', data.id);
        throw noteError;
      }
    }
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
  async createLibraryItem(payload) {
    const { data, error } = await supabase.from('session_library').insert(payload).select().single();
    if (error) throw error;
    return data;
  },
  async updateLibraryItem(id, changes, coachId) {
    const { data, error } = await supabase.from('session_library').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).eq('coach_id', coachId).select().single();
    if (error) throw error;
    return data;
  },
  async sendMessage({coachId,playerId,senderId,body,file}) {
    let attachmentPath=null;
    if(file){if(file.size>52428800)throw new Error('Le fichier dépasse 50 Mo.');const allowed=['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain'];if(!allowed.includes(file.type))throw new Error('Type de fichier non autorisé.');const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');attachmentPath=coachId+'/'+playerId+'/'+crypto.randomUUID()+'-'+safeName;const {error:uploadError}=await supabase.storage.from('coach-in-attachments').upload(attachmentPath,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;}
    const {data,error}=await supabase.from('coach_player_messages').insert({coach_id:coachId,player_id:playerId,sender_id:senderId,body,attachment_path:attachmentPath,attachment_name:file?.name||null,attachment_mime:file?.type||null,attachment_size:file?.size||null}).select().single();
    if(error){if(attachmentPath)await supabase.storage.from('coach-in-attachments').remove([attachmentPath]);throw error;}return data;
  },
  async createAvailability(payload) { const {data,error}=await supabase.from('coach_weekly_availability').insert(payload).select().single(); if(error)throw error; return data; },
  async deleteAvailability(id,coachId) { const {error}=await supabase.from('coach_weekly_availability').delete().eq('id',id).eq('coach_id',coachId); if(error)throw error; },
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
