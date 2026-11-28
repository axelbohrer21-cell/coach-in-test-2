import { supabase } from '../core/supabase.js';
import { state } from '../core/state.js';
import { notificationService } from './notifications.js';
import { OBJECTIVES } from '../domain/session-curriculum.js';

async function unwrap(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function hydrateStorageUrls(rows, bucket, pathKey, urlKey) {
  const source = rows || [];
  const paths = [...new Set(source.map(row => row[pathKey]).filter(Boolean))];
  if (!paths.length) return source;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
  const urls = new Map((data || []).map(item => [item.path, item.signedUrl || null]));
  if (error) return source.map(row => row[pathKey] ? { ...row, [urlKey]: null } : row);
  return source.map(row => row[pathKey] ? { ...row, [urlKey]: urls.get(row[pathKey]) || null } : row);
}

async function hydrateMessages(rows) {
  return hydrateStorageUrls(rows, 'coach-in-attachments', 'attachment_path', 'attachment_url');
}

async function hydrateVideoAnalyses(rows) {
  return hydrateStorageUrls(rows, 'coach-in-videos', 'video_path', 'video_url');
}

async function hydratePlayerCardPhoto(profile) {
  const prefix='storage:player-card-photos:';
  const value=String(profile?.avatar_url||'');
  if(!value.startsWith(prefix))return profile;
  const path=value.slice(prefix.length);
  try{
    const {data,error}=await supabase.storage.from('player-card-photos').createSignedUrl(path,3600);
    if(error||!data?.signedUrl)return {...profile,avatar_url:null};
    return {...profile,avatar_url:data.signedUrl,avatar_storage_path:path};
  }catch(error){
    console.warn('Coach In: portrait joueur temporairement indisponible',error?.message||error);
    return {...profile,avatar_url:null};
  }
}

export const dataService = {
  async loadAdminWorkspace() {
    const { data, error } = await supabase.from('profiles').select('id,email,first_name,last_name,created_at,archived_at,is_admin').eq('role','coach').order('last_name');
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
    const [players, sessionRows, privateNotes, evaluations, groupSessions, groupSeries, groupCourseCancellations, bookingRequests, library, customSessionExercises, sessionObjectives, notifications, notificationPreferences, criteria, challenges, achievements, coachInvitations, coachPlayerShares, weeklyAvailability, messages, videoRows] = await Promise.all([
      playerIds.length ? unwrap(supabase.from('profiles').select('*').in('id', playerIds).eq('role', 'player').order('last_name')) : Promise.resolve([]),
      playerIds.length ? unwrap(supabase.from('training_sessions').select('*').in('player_id', playerIds).eq('created_by', userId).order('session_date', { ascending: false })) : Promise.resolve([]),
      unwrap(supabase.from('coach_session_notes').select('session_id,note').eq('coach_id', userId)),
      playerIds.length ? unwrap(supabase.from('evaluations').select('id,player_id,session_id,evaluated_at,score,technical_score,tactical_score,physical_score,mental_score,player_visible_comment,created_by,created_at').in('player_id', playerIds).eq('created_by', userId).order('evaluated_at', { ascending: false })) : Promise.resolve([]),
      unwrap(supabase.from('group_sessions').select('*').eq('coach_id', userId).order('session_date')),
      unwrap(supabase.from('group_course_series').select('*').eq('coach_id', userId).order('weekday').order('start_time')),
      unwrap(supabase.from('group_course_cancellations').select('*').eq('coach_id', userId).order('session_date')),
      unwrap(supabase.from('booking_requests').select('*').eq('coach_id', userId).order('session_date')),
      unwrap(supabase.from('session_library').select('*').eq('coach_id', userId).order('title')),
      unwrap(supabase.from('coach_session_exercises').select('*').eq('coach_id', userId).eq('active',true).order('theme').order('title')),
      unwrap(supabase.from('coach_session_objectives').select('*').eq('coach_id', userId).eq('active',true).order('display_order')),
      notificationService.listCoach(),
      notificationService.getPreferences(userId),
      unwrap(supabase.from('criteria_catalog').select('*').eq('coach_id', userId).order('display_order')),
      playerIds.length ? unwrap(supabase.from('player_challenges').select('*').in('player_id', playerIds).eq('coach_id', userId).order('created_at', { ascending: false })) : Promise.resolve([]),
      playerIds.length ? unwrap(supabase.from('player_achievements').select('*').in('player_id', playerIds).eq('coach_id', userId).order('unlocked_at', { ascending: false })) : Promise.resolve([]),
      unwrap(supabase.from('coach_player_invitation_inbox').select('*').order('created_at', { ascending: false })),
      unwrap(supabase.from('coach_player_invitations').select('id,player_id,invited_coach_email,status,created_at').eq('inviter_coach_id',userId).in('status',['pending','accepted']).order('created_at',{ascending:false})),
      unwrap(supabase.from('coach_weekly_availability').select('*').eq('coach_id',userId).order('weekday').order('start_time')),
      unwrap(supabase.from('coach_player_messages').select('*').eq('coach_id',userId).order('created_at')),
      unwrap(supabase.from('coach_video_analyses').select('*').eq('coach_id',userId).order('created_at',{ascending:false}))
    ]);
    const pendingBookingPlayerIds=[...new Set(bookingRequests.filter(row=>row.status==='pending').map(row=>row.player_id).filter(id=>id&&!playerIds.includes(id)))];
    const pendingBookingPlayers=pendingBookingPlayerIds.length
      ? await unwrap(supabase.from('profiles').select('*').in('id',pendingBookingPlayerIds).eq('role','player').order('last_name'))
      : [];
    const visiblePlayers=[...players,...pendingBookingPlayers];
    let loadedSessionObjectives=sessionObjectives;
    if(!loadedSessionObjectives.length){
      const defaults=OBJECTIVES.map((item,index)=>({coach_id:userId,objective_id:item.id,theme:item.theme,label:item.label,profile:item.profile,criteria:item.criteria,intent:item.intent,success:item.success,display_order:index+1,active:true}));
      loadedSessionObjectives=await unwrap(supabase.from('coach_session_objectives').insert(defaults).select('*'));
    }
    const evaluationIds = evaluations.map(row => row.id).filter(Boolean);
    const evaluationCriteria = evaluationIds.length
      ? await unwrap(supabase.from('evaluation_criteria').select('*').in('evaluation_id', evaluationIds))
      : [];
    const sessionFavorites = await unwrap(supabase.from('coach_session_favorites').select('session_id').eq('coach_id',userId));
    const favoriteSessionIds = sessionFavorites.map(row => row.session_id);
    const notesBySession = new Map(privateNotes.map(row => [row.session_id, row.note]));
    const sessions = sessionRows.map(row => {
      const note = notesBySession.get(row.id) || '';
      const match = note.match(/\n?\n?<!--COACH_IN_PROGRESS:([A-Za-z0-9+/=]+)-->/);
      let progress_review = null;
      if (match) {
        try { progress_review = JSON.parse(decodeURIComponent(escape(atob(match[1])))); } catch (_) { progress_review = null; }
      }
      return { ...row, coach_private_notes: note.replace(/\n?\n?<!--COACH_IN_PROGRESS:[A-Za-z0-9+/=]+-->/, '').trim(), progress_review };
    });
    const hydratedMessages=await hydrateMessages(messages);
    const videoAnalyses=await hydrateVideoAnalyses(videoRows);
    let videoCorrectionFollowups=[];
    if(playerIds.length){
      const {data:followupsData,error:followupsError}=await supabase.from('coach_video_correction_followups').select('*').eq('coach_id',userId).order('created_at',{ascending:false});
      if(followupsError){
        // La table de suivi vidéo est facultative pour le chargement général du tableau de bord.
        // Ne bloque pas toute la connexion si l'API PostgREST ne l'a pas encore publiée dans son cache.
        if(!['PGRST205','42P01'].includes(followupsError.code)) throw followupsError;
        console.warn('Coach In: suivi des corrections vidéo temporairement indisponible',followupsError.message);
      } else {
        videoCorrectionFollowups=followupsData||[];
      }
    }
    const [clubEvents, profileDetailsRows] = await Promise.all([
      unwrap(supabase.from('club_events').select('*').order('starts_at')),
      playerIds.length ? unwrap(supabase.from('player_profile_details').select('*').in('player_id',playerIds)) : Promise.resolve([])
    ]);
    const playerProfileDetailsById = Object.fromEntries(profileDetailsRows.map(row=>[row.player_id,row]));
    const hydratedPlayers=await Promise.all(visiblePlayers.map(hydratePlayerCardPhoto));
    const physicalPrograms = await unwrap(supabase.from('coach_physical_programs').select('*').eq('coach_id',userId).order('created_at',{ascending:false}));
    Object.assign(state, { physicalPrograms, players:hydratedPlayers, sessions, favoriteSessionIds, evaluations, groupSessions, groupSeries, groupCourseCancellations, bookingRequests, library, customSessionExercises, sessionObjectives:loadedSessionObjectives.map(row=>({...row,id:row.objective_id,db_id:row.id})), notifications, notificationPreferences, criteria, evaluationCriteria, challenges, achievements, coachInvitations, coachPlayerShares, weeklyAvailability, messages:hydratedMessages, videoAnalyses, videoCorrectionFollowups, clubEvents, playerProfileDetailsById });
  },

  async loadPlayerWorkspace() {
    const [sessions, evaluations, requests, notifications, notificationPreferences, challenges, achievements, coachLinks, videoRows] = await Promise.all([
      unwrap(supabase.from('player_sessions').select('*').order('session_date', { ascending: false })),
      unwrap(supabase.from('player_evaluations').select('*').order('evaluated_at', { ascending: false })),
      unwrap(supabase.from('booking_requests').select('*').order('session_date')),
      notificationService.listPlayer(),
      notificationService.getPreferences(state.user.id),
      unwrap(supabase.from('player_challenges').select('*').eq('player_id', state.user.id).order('created_at', { ascending: false })),
      unwrap(supabase.from('player_achievements').select('*').eq('player_id', state.user.id).order('unlocked_at', { ascending: false })),
      unwrap(supabase.from('coach_players').select('coach_id').eq('player_id', state.user.id)),
      unwrap(supabase.from('player_video_analyses').select('*').order('created_at',{ascending:false}))
    ]);
    const linkedCoachIds = coachLinks.map(row => row.coach_id);
    const historicalCoachIds = [...new Set([
      ...sessions.map(row => row.created_by),
      ...evaluations.map(row => row.created_by),
      ...challenges.map(row => row.coach_id),
      ...achievements.map(row => row.coach_id)
    ].filter(Boolean))];
    const historyOnlyIds = historicalCoachIds.filter(id => !linkedCoachIds.includes(id));
    const evaluationIds = evaluations.map(row => row.id).filter(Boolean);
    const [coachDirectory, playerCoachHistory, messages, evaluationCriteria] = await Promise.all([
      unwrap(supabase.from('player_coach_directory').select('id,first_name,last_name').order('id')),
      historyOnlyIds.length ? unwrap(supabase.from('profiles').select('id,first_name,last_name,email,archived_at').in('id', historyOnlyIds).order('last_name')) : Promise.resolve([]),
      unwrap(supabase.from('coach_player_messages').select('*').eq('player_id',state.user.id).order('created_at')),
      evaluationIds.length ? unwrap(supabase.from('evaluation_criteria').select('*').in('evaluation_id', evaluationIds)) : Promise.resolve([])
    ]);
    const playerCoaches = coachDirectory.filter(row => linkedCoachIds.includes(row.id));
    const activeCoachIds = playerCoaches.map(row => row.id);
    const sharedCourtOccupancy = activeCoachIds.length ? await unwrap(supabase.from('shared_court_occupancy').select('id,coach_id,session_date,start_time,end_time,court_number,source_kind,source_id,status').in('coach_id',activeCoachIds).order('session_date').order('start_time')) : [];
    const weeklyAvailability = activeCoachIds.length ? await unwrap(supabase.from('coach_weekly_availability').select('*').in('coach_id',activeCoachIds).eq('active',true).order('weekday').order('start_time')) : [];
    const { data: playerUnavailability = [], error: unavailabilityError } = activeCoachIds.length
      ? await supabase.rpc('get_player_coach_unavailability', { p_coach_ids: activeCoachIds })
      : { data: [], error: null };
    if (unavailabilityError) throw unavailabilityError;
    const [hydratedMessages, videoAnalyses] = await Promise.all([
      hydrateMessages(messages),
      hydrateVideoAnalyses(videoRows)
    ]);
    const [playerProfileDetails, matchJournal, clubEvents] = await Promise.all([
      supabase.from('player_profile_details').select('*').eq('player_id',state.user.id).maybeSingle().then(({data,error})=>{if(error)throw error;return data;}),
      unwrap(supabase.from('player_match_journal').select('*').order('match_date',{ascending:false})),
      unwrap(supabase.from('club_events').select('*').order('starts_at'))
    ]);
    state.profile=await hydratePlayerCardPhoto(state.profile);
    Object.assign(state, { players: [state.profile], sessions, evaluations, bookingRequests: requests, sharedCourtOccupancy, notifications, notificationPreferences, challenges, achievements, evaluationCriteria, playerCoaches, playerCoachHistory, weeklyAvailability, playerUnavailability, messages:hydratedMessages, videoAnalyses, playerProfileDetails, matchJournal, clubEvents });
  },

  async revokeCoachPlayerInvitation(invitationId) {
    const {error}=await supabase.rpc('revoke_coach_player_invitation',{p_invitation_id:invitationId});
    if(error)throw error;
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
  async updateSession(id, changes, coachId) {
    const { coach_private_notes = '', ...sessionChanges } = changes;
    const { data, error } = await supabase.from('training_sessions').update(sessionChanges).eq('id', id).eq('created_by', coachId).select().single();
    if (error) throw error;
    const { data: existing, error: readError } = await supabase.from('coach_session_notes').select('session_id,note').eq('session_id',id).eq('coach_id',coachId).maybeSingle();
    if (readError) throw readError;
    const note=String(coach_private_notes||'').trim();
    if(existing){
      const {error:noteError}=await supabase.from('coach_session_notes').update({note}).eq('session_id',id).eq('coach_id',coachId);
      if(noteError)throw noteError;
    }else if(note){
      const {error:noteError}=await supabase.from('coach_session_notes').insert({session_id:id,coach_id:coachId,note});
      if(noteError)throw noteError;
    }
    return data;
  },
  async saveSessionReview(sessionId, coachId, review) {
    const marker = '<!--COACH_IN_PROGRESS:' + btoa(unescape(encodeURIComponent(JSON.stringify(review)))) + '-->';
    const { data: existing, error: readError } = await supabase.from('coach_session_notes')
      .select('session_id,note').eq('session_id', sessionId).eq('coach_id', coachId).maybeSingle();
    if (readError) throw readError;
    const base = String(existing?.note || '').replace(/\n?\n?<!--COACH_IN_PROGRESS:[A-Za-z0-9+/=]+-->/, '').trim();
    const note = [base, marker].filter(Boolean).join('\n\n');
    if (existing) {
      const { error } = await supabase.from('coach_session_notes').update({ note }).eq('session_id', sessionId).eq('coach_id', coachId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('coach_session_notes').insert({ session_id: sessionId, coach_id: coachId, note });
      if (error) throw error;
    }
    return review;
  },
  async setSessionFavorite(sessionId, isFavorite, coachId) {
    if (isFavorite) {
      const { error } = await supabase.from('coach_session_favorites').insert({ coach_id: coachId, session_id: sessionId });
      if (error && error.code !== '23505') throw error;
    } else {
      const { error } = await supabase.from('coach_session_favorites').delete().eq('coach_id', coachId).eq('session_id', sessionId);
      if (error) throw error;
    }
  },
  async createEvaluation(payload) {
    const { data, error } = await supabase.from('evaluations').insert(payload).select('id,player_id,session_id,evaluated_at,score,technical_score,tactical_score,physical_score,mental_score,player_visible_comment,created_by,created_at').single();
    if (error) throw error;
    return data;
  },
  async updatePlayer(playerId, changes) {
    const { data, error } = await supabase.from('profiles').update(changes).eq('id', playerId).select().single();
    if (error) throw error;
    return data;
  },
  async updateCoachSessionObjective(id,changes) { const {data,error}=await supabase.from('coach_session_objectives').update({...changes,updated_at:new Date().toISOString()}).eq('objective_id',id).eq('coach_id',state.user.id).select().single(); if(error)throw error; return data; },
  async createCoachSessionExercise(payload) { const {data,error}=await supabase.from('coach_session_exercises').insert({...payload,coach_id:state.user.id}).select().single(); if(error)throw error; return data; },
  async updateCoachSessionExercise(id,changes) { const {data,error}=await supabase.from('coach_session_exercises').update({...changes,updated_at:new Date().toISOString()}).eq('id',id).eq('coach_id',state.user.id).select().single(); if(error)throw error; return data; },
  async deleteCoachSessionExercise(id) { const {error}=await supabase.from('coach_session_exercises').delete().eq('id',id).eq('coach_id',state.user.id); if(error)throw error; },
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
  async createPhysicalProgram(payload) { const {data,error}=await supabase.from('coach_physical_programs').insert({...payload,coach_id:state.user.id}).select().single(); if(error)throw error; return data; },
  async deletePhysicalProgram(id) { const {error}=await supabase.from('coach_physical_programs').delete().eq('id',id).eq('coach_id',state.user.id); if(error)throw error; },
  async loadMessagesForCurrentUser() {
    const isCoach = state.profile?.role === 'coach';
    const field = isCoach ? 'coach_id' : 'player_id';
    const { data, error } = await supabase.from('coach_player_messages').select('*')
      .eq(field, state.user.id).order('created_at');
    if (error) throw error;
    return hydrateMessages(data || []);
  },
  async markMessageRead(messageId) {
    const {error}=await supabase.rpc('mark_coach_in_message_read',{p_message_id:messageId}); if(error)throw error;
  },
  async sendMessage({coachId,playerId,senderId,body,file}) {
    if(!String(body||'').trim()&&!file)throw new Error('Écris un message ou ajoute une pièce jointe.');
    let attachmentPath=null;
    if(file){if(file.size>52428800)throw new Error('Le fichier dépasse 50 Mo.');const allowed=['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain'];if(!allowed.includes(file.type))throw new Error('Type de fichier non autorisé.');const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');attachmentPath=coachId+'/'+playerId+'/'+crypto.randomUUID()+'-'+safeName;const {error:uploadError}=await supabase.storage.from('coach-in-attachments').upload(attachmentPath,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;}
    const {data,error}=await supabase.from('coach_player_messages').insert({coach_id:coachId,player_id:playerId,sender_id:senderId,body,attachment_path:attachmentPath,attachment_name:file?.name||null,attachment_mime:file?.type||null,attachment_size:file?.size||null}).select().single();
    if(error){if(attachmentPath)await supabase.storage.from('coach-in-attachments').remove([attachmentPath]);throw error;}return data;
  },
  async createAvailability(payload) { const {data,error}=await supabase.from('coach_weekly_availability').insert(payload).select().single(); if(error)throw error; return data; },
  async deleteAvailability(id,coachId) { const {error}=await supabase.from('coach_weekly_availability').delete().eq('id',id).eq('coach_id',coachId); if(error)throw error; },
  async updateGroupSeries(id,changes,coachId) {
    const {error}=await supabase.from('group_course_series').update(changes).eq('id',id).eq('coach_id',coachId);if(error)throw error;
    const {error:futureError}=await supabase.from('group_sessions').update({title:changes.title,theme:changes.theme,start_time:changes.start_time,end_time:changes.end_time,court_number:null,court_count:changes.court_count}).eq('series_id',id).eq('coach_id',coachId).eq('status','scheduled').gte('session_date',new Date().toISOString().slice(0,10)).not('session_date','in','(2026-10-17,2026-12-19,2027-02-20,2027-04-17)');if(futureError)throw futureError;
  },
  async updateGroupSession(id,changes,coachId) { const {error}=await supabase.from('group_sessions').update(changes).eq('id',id).eq('coach_id',coachId);if(error)throw error; },
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
  },
  async setGroupCourseRainDay({ coachId, sessionDate, audience, weekday, rainy }) {
    const query = supabase.from('group_course_cancellations');
    if (rainy) {
      const { data, error } = await query.upsert({ coach_id:coachId, session_date:sessionDate, audience, weekday, reason:'Pluie' }, { onConflict:'coach_id,session_date,audience' }).select().single();
      if (error) throw error;
      return data;
    }
    const { error } = await query.delete().eq('coach_id',coachId).eq('session_date',sessionDate).eq('audience',audience);
    if (error) throw error;
    return null;
  }
};
