import { $, $$, escapeHtml, toast, showDialog, closeDialog, formatDate } from './core/dom.js';
import { state, resetState } from './core/state.js';
import { supabase } from './core/supabase.js';
import { authService } from './services/auth.js';
import { dataService } from './services/data.js';
import { pageMeta, renderPage, libraryItemsForCoach, libraryCard } from './views/pages.js';
import { bookingService } from './services/booking.js';
import { notificationService } from './services/notifications.js';
import { calculateAgeCategory, toLocalISO } from './domain/tennis.js';
import { isTeachingDate, isWithinTeachingWindow, isPrivateLessonDateAllowed, GROUP_SEASON } from './domain/group-calendar.js';
import { groupCriteria, recommendChallenge, hasEvaluationContent } from './domain/progression.js';
import { buildSeriesOccurrences } from './domain/group-series.js';
import { progressionService } from './services/progression.js';
import { recommendSessionExercises, buildMatchTransfer, buildSessionCoachingPlan } from './domain/session-recommendations.js';
import { generateOriginalSession } from './domain/session-generator.js';
import { buildSessionProgression } from './domain/session-progression.js';

let signupMode = false;
let weatherRequest = 0;
let messageChannel = null;
let notificationChannel = null;
let notificationRefreshPromise = null;
let messageRefreshPromise = null;
let notificationRetryCount = 0;
let messageRetryCount = 0;
const coachNav = [ ['dashboard','Vue d’ensemble','⌂'], ['intelligence','Intelligence','✦'], ['players','Joueurs','♙'], ['planning','Planning','▦'], ['group-calendar','Cours collectifs','◷'], ['sessions','Séances','◎'], ['videos','Analyse vidéo','▣'], ['reports','Évaluations','✦'], ['library','Bibliothèque','▤'], ['bookings','Réservations','◷'], ['notifications','Notifications','♧'], ['availability','Disponibilités','◷'], ['messages','Messages','✉'] ];
const adminNav = [ ['coaches','Gestion des coachs','♙'] ];
const playerNav = [ ['dashboard','Mon espace','⌂'], ['sessions','Mes séances','◎'], ['videos','Mes vidéos','▣'], ['reports','Mon parcours','✦'], ['bookings','Réservations','◷'], ['notifications','Notifications','♧'], ['messages','Messages','✉'] ];

function showAuth(message='') {
  $('#auth-view').classList.remove('hidden'); $('#app-view').classList.add('hidden');
  if (message) { $('#auth-error').textContent=message; $('#auth-error').classList.remove('hidden'); }
}
function showApp() { $('#auth-view').classList.add('hidden'); $('#app-view').classList.remove('hidden'); }

let workspaceLoadPromise = null;
async function loadWorkspace() {
  if (workspaceLoadPromise) return workspaceLoadPromise;
  workspaceLoadPromise = (async () => {
    const user = await authService.getCurrentUser();
    if (!user) return showAuth();
    state.user = user;
    state.profile = await dataService.loadProfile(user.id);
    const isAdmin = state.profile.is_admin === true || state.profile.role === 'admin';
    if (state.profile.role === 'coach') await dataService.loadCoachWorkspace(user.id);
    else if (!isAdmin) await dataService.loadPlayerWorkspace();
    if (isAdmin) await dataService.loadAdminWorkspace();
    showApp();
    const roleLabel = state.profile.role === 'coach' && isAdmin ? 'Coach · Administrateur' : state.profile.role === 'admin' ? 'Administrateur' : state.profile.role === 'coach' ? 'Coach' : 'Joueur';
    $('#account-label').textContent = `${state.profile.first_name || ''} ${state.profile.last_name || ''} · ${roleLabel}`;
    render('dashboard');
  })();
  try {
    return await workspaceLoadPromise;
  } finally {
    workspaceLoadPromise = null;
  }
}

function render(page) {
  const isCoach = state.profile?.role === 'coach';
  const isAdmin = state.profile?.is_admin === true || state.profile?.role === 'admin';
  const navItems = isCoach ? [...coachNav, ...(isAdmin ? adminNav : [])] : isAdmin ? [['coaches','Gestion des coachs','♙']] : playerNav;
  if (!navItems.some(item => item[0] === page)) page = 'dashboard';
  state.currentPage = page;
  subscribeToNotifications();
  $('#navigation').innerHTML = navItems.map(([key,label,icon]) => `<button class="nav-item ${key===page?'active':''}" data-page="${key}"><span>${icon}</span>${label}</button>`).join('');
  const [kicker,title,description] = pageMeta[page];
  $('#page-kicker').textContent=kicker; $('#page-title').textContent=title; $('#page-description').textContent=description;
  $('#page-actions').innerHTML = page==='players' && isCoach ? '<button class="btn primary" data-action="add-player">＋ Ajouter un joueur</button>' : '';
  $('#page-content').innerHTML=renderPage(page);
  if(page==='planning') loadWeatherForecast();
  if(page==='messages'){subscribeToMessages();markVisibleConversationRead();}
  else if(messageChannel){supabase.removeChannel(messageChannel);messageChannel=null;}
}

$('#auth-toggle').addEventListener('click', () => {
  signupMode=!signupMode;
  $('#auth-title').textContent=signupMode?'Créer mon compte joueur':'Connexion';
  $('#auth-submit').textContent=signupMode?'Créer mon compte':'Se connecter';
  $('#auth-toggle').textContent=signupMode?'J’ai déjà un compte':'Créer un compte joueur';
  $('#signup-fields').classList.toggle('hidden',!signupMode);
  $('#auth-error').classList.add('hidden');
});

$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const button=$('#auth-submit'); button.disabled=true;
  try {
    if (signupMode) {
      const result=await authService.signUp({email:String(form.get('email')).trim().toLowerCase(),password:form.get('password'),firstName:form.get('first_name'),lastName:form.get('last_name')});
      if (!result.session) showAuth('Compte créé. Vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.');
      else await loadWorkspace();
    } else {
      await authService.signIn(String(form.get('email')).trim().toLowerCase(),form.get('password'));
      await loadWorkspace();
    }
  } catch(error) { showAuth(error.message || 'Impossible de se connecter.'); }
  finally { button.disabled=false; }
});

$('#logout').addEventListener('click', async()=>{try{stopRealtimeChannels();await authService.signOut();resetState();showAuth();}catch(e){toast(e.message,'error');}});
$('#navigation').addEventListener('click',event=>{const button=event.target.closest('[data-page]');if(button)render(button.dataset.page);});

$('#page-actions').addEventListener('click', event => {
  const button = event.target.closest('[data-action="add-player"]');
  if (button) addPlayerDialog();
});

$('#page-content').addEventListener('keydown', event=>{
  const card=event.target.closest('[data-calendar-event]');
  if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();card.click();}
});

$('#page-content').addEventListener('click', async event=>{
  const go=event.target.closest('[data-go]'); if(go){render(go.dataset.go);return;}
  const planSlot=event.target.closest('[data-plan-slot]'); if(planSlot)return sessionDialog(planSlot.dataset.slotDate,planSlot.dataset.slotTime);
  const share=event.target.closest('[data-share-player]'); if(share) return sharePlayerDialog(share.dataset.sharePlayer);
  const invitation=event.target.closest('[data-coach-invitation]'); if(invitation) return respondCoachInvitation(invitation.dataset.coachInvitation, invitation.dataset.accept==='true');
  const revokeShare=event.target.closest('[data-revoke-coach-share]'); if(revokeShare) return revokeCoachShare(revokeShare.dataset.revokeCoachShare,revokeShare.dataset.playerId);
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='generate-session') return sessionBuilderDialog();
  const reviewSession=event.target.closest('[data-review-session]'); if(reviewSession) return sessionReviewDialog(reviewSession.dataset.reviewSession);
  const deleteVideo=event.target.closest('[data-delete-video]'); if(deleteVideo)return showDialog('<div class="dialog-head"><div><p class="eyebrow">CONFIDENTIALITÉ</p><h2>Supprimer cette vidéo ?</h2><p class="tiny muted">La vidéo originale et son analyse seront définitivement supprimées.</p></div><button class="btn icon-btn" data-close>✕</button></div><div class="dialog-actions"><button class="btn subtle" data-close>Annuler</button><button class="btn danger" data-confirm-delete-video="'+deleteVideo.dataset.deleteVideo+'">Supprimer définitivement</button></div>');
  const shareVideo=event.target.closest('[data-share-video]'); if(shareVideo) return toggleVideoShare(shareVideo.dataset.shareVideo,shareVideo.dataset.shared==='true');
  if(action==='new-session') return sessionDialog();
  if(action==='add-availability') return availabilityDialog();
  if(action==='invite-coach') return inviteCoachDialog();
  if(action==='new-group-session') return groupSessionDialog();
  const editGroup=event.target.closest('[data-edit-group]'); if(editGroup) return groupSessionDialog(editGroup.dataset.editGroup);
  const editSeries=event.target.closest('[data-edit-series]'); if(editSeries) return groupSeriesDialog(editSeries.dataset.editSeries);
  if(action==='add-group-series') return groupSeriesDialog();
  if(action==='request-booking') return bookingDialog();
  if(action==='new-evaluation') return evaluationDialog();
  if(action==='new-library-item') return libraryDialog();
  const editLibrary=event.target.closest('[data-edit-library]'); if(editLibrary) return libraryDialog(editLibrary.dataset.editLibrary);
  const addProgramItem=event.target.closest('[data-add-program-item]'); if(addProgramItem){const template=libraryItemsForCoach().find(item=>item.id===addProgramItem.dataset.addProgramItem);if(template)return libraryDialog('',template);}
  const useLibrary=event.target.closest('[data-use-library]'); if(useLibrary){const item=state.library.find(row=>row.id===useLibrary.dataset.useLibrary);if(item)return sessionDialog(undefined,undefined,item);}
  if(action==='add-player') return addPlayerDialog();
  const challenge=event.target.closest('[data-create-challenge]'); if(challenge) return challengeDialog(challenge.dataset.createChallenge, challenge.dataset.criterion, challenge.dataset.criterionId);
  const sheet=event.target.closest('[data-player-sheet]'); if(sheet) return playerSheetDialog(sheet.dataset.playerSheet);
  const edit=event.target.closest('[data-edit-player]'); if(edit) return editPlayerDialog(edit.dataset.editPlayer);
  const booking=event.target.closest('[data-booking]'); if(booking) return updateBooking(booking.dataset.booking,booking.dataset.status);
  const cancel=event.target.closest('[data-cancel-booking]'); if(cancel) return cancelBooking(cancel.dataset.cancelBooking);
  const cancelGroup=event.target.closest('[data-cancel-group]'); if(cancelGroup) return cancelGroupSession(cancelGroup.dataset.cancelGroup);
  const calendarEvent=event.target.closest('[data-calendar-event]');
  if(calendarEvent){
    const wasSelected=calendarEvent.classList.contains('is-selected');
    $('#page-content').querySelectorAll('[data-calendar-event].is-selected').forEach(card=>{card.classList.remove('is-selected');card.setAttribute('aria-pressed','false');});
    if(!wasSelected){calendarEvent.classList.add('is-selected');calendarEvent.setAttribute('aria-pressed','true');}
    return;
  }
  const removeAvailability=event.target.closest('[data-delete-availability]'); if(removeAvailability) return deleteAvailability(removeAvailability.dataset.deleteAvailability);
  const coachState=event.target.closest('[data-coach-state]'); if(coachState) return setCoachState(coachState.dataset.coachState,coachState.dataset.coachId);
  const generateSeries=event.target.closest('[data-generate-series]'); if(generateSeries) return generateGroupSeries(generateSeries.dataset.generateSeries);
  const openNotification=event.target.closest('[data-open-notification]');
  if(openNotification){
    try{
      if(state.profile.role==='coach')await notificationService.markCoachRead(openNotification.dataset.openNotification);else await notificationService.markPlayerRead(openNotification.dataset.openNotification);
      const path=['reports','messages','sessions','bookings','planning'].includes(openNotification.dataset.targetPath)?openNotification.dataset.targetPath:'dashboard';
      if(path==='messages'&&openNotification.dataset.partnerId)state.messagePartnerId=openNotification.dataset.partnerId;
      await refreshAndRender();render(path);
    }catch(error){toast(error.message||'Impossible d’ouvrir cette notification.','error');}
    return;
  }
  const read=event.target.closest('[data-read-notification]'); if(read) return markNotificationRead(read.dataset.readNotification);
  const week=event.target.closest('[data-week]'); if(week){state.planningWeekOffset=Number(week.dataset.week)===0?0:(state.planningWeekOffset||0)+Number(week.dataset.week);render('planning');}
});
$('#dialog-content').addEventListener('click',async event=>{
  if(event.target.closest('[data-generate-session]')){generateSessionPlan();return;}
  const personalizedSession=event.target.closest('[data-personalized-session]');
  if(personalizedSession){sessionBuilderDialog(personalizedSession.dataset.personalizedSession);return;}
  if(event.target.closest('[data-use-generated-session]')){if(!generatedSessionPlan)return;const plan=generatedSessionPlan;closeDialog();sessionDialog(plan.session_date,plan.session_time,plan);return;}
  const confirmCriteria=event.target.closest('[data-confirm-criteria]');
  if(confirmCriteria){
    const form=$('#evaluation-form');
    const count=form?.querySelectorAll('input[name=criterion]:checked').length||0;
    if(!count){toast('Sélectionne au moins un critère avant de valider.','error');return;}
    form.dataset.criteriaConfirmed='true';
    confirmCriteria.textContent='Critères validés ✓';
    confirmCriteria.classList.add('criteria-confirmed');
    const title=form.querySelector('[data-validation-title]');if(title)title.textContent='Sélection validée';
    const hint=form.querySelector('[data-validation-hint]');if(hint)hint.textContent=count+' critère(s) prêt(s) à être enregistrés.';
    return;
  }
  const send=event.target.closest('[data-send-evaluation]');
  if(send){
    send.disabled=true;
    try{
      const {error}=await supabase.rpc('notify_player_existing_evaluation',{p_evaluation_id:send.dataset.sendEvaluation});
      if(error)throw error;
      send.textContent='Bilan envoyé';
      toast('Notification envoyée au joueur.');
    }catch(error){
      send.disabled=false;
      toast(error.message||'Impossible d’envoyer le bilan.','error');
    }
    return;
  }
  const confirmVideoDelete=event.target.closest('[data-confirm-delete-video]');
  if(confirmVideoDelete){confirmVideoDelete.disabled=true;await deleteVideoAnalysis(confirmVideoDelete.dataset.confirmDeleteVideo);return;}
  if(event.target.closest('[data-close]'))closeDialog();
});
$('#dialog-content').addEventListener('change',event=>{
  if(event.target.matches('input[name=criterion]')){
    const row=event.target.closest('.criterion-measure-row');
    const measure=row?.querySelector('.criterion-measure');
    if(measure){measure.disabled=!event.target.checked;if(!event.target.checked)measure.value='';}
    const form=event.target.closest('#evaluation-form');
    if(form){form.dataset.criteriaConfirmed='false';const confirm=form.querySelector('[data-confirm-criteria]');if(confirm){confirm.textContent='Valider les critères ✓';confirm.classList.remove('criteria-confirmed');}const title=form.querySelector('[data-validation-title]');if(title)title.textContent='Sélection à confirmer';const hint=form.querySelector('[data-validation-hint]');if(hint)hint.textContent='Ta sélection a changé : valide-la à nouveau.';updateEvaluationSelectionUI();}
  }
  if(event.target.name==='player_id'&&event.target.form?.id==='session-builder-form')applySessionRecommendationToBuilder(event.target.value);
  if(event.target.name==='creation_mode'&&event.target.form?.id==='session-builder-form')updateSessionBuilderMode();
});
$('#page-content').addEventListener('submit',async event=>{
  const videoForm=event.target.closest('#video-analysis-form');
  if(videoForm){event.preventDefault();await submitVideoAnalysis(videoForm);return;}
  const reviewForm=event.target.closest('#video-review-form');
  if(reviewForm){event.preventDefault();await saveVideoReview(reviewForm);return;}
  const followupForm=event.target.closest('.video-followup-form');
  if(followupForm){event.preventDefault();await saveVideoCorrectionFollowup(followupForm);return;}
  const form=event.target.closest('#notification-preferences-form'); if(!form)return;
  event.preventDefault();
  const preferences=Object.fromEntries(['booking_requests','booking_decisions','booking_changes','reminders_24h','messages','progress','session_changes'].map(key=>[key,form.elements[key].checked]));
  try{state.notificationPreferences=await notificationService.savePreferences(state.user.id,preferences);toast('Préférences de notifications enregistrées.');await refreshAndRender();render('notifications');}
  catch(error){toast(error.message||'Impossible d’enregistrer les préférences.','error');}
});
$('#page-content').addEventListener('input',event=>{
  if(event.target.id==='player-search'){state.filters.search=event.target.value;filterPlayerCards();}
  if(['library-search','library-category','library-theme','library-level'].includes(event.target.id))filterLibrary();
});
$('#page-content').addEventListener('change',event=>{
  if(event.target.id==='message-partner'){state.messagePartnerId=event.target.value;render('messages');}
  if(event.target.id==='player-type-filter'){state.filters.playerType=event.target.value;filterPlayerCards();}
  if(['library-category','library-theme','library-level'].includes(event.target.id))filterLibrary();
});

function filterPlayerCards(){
  const normalize=value=>String(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
  const query=normalize(state.filters.search);
  const type=state.filters.playerType||'all';
  $('#page-content').querySelectorAll('[data-player-search]').forEach(card=>{
    const matchesText=normalize(card.dataset.playerSearch).includes(query);
    const matchesType=type==='all'||card.dataset.playerType===type;
    card.hidden=!(matchesText&&matchesType);
  });
}

async function extractVideoFrames(file){
  const objectUrl=URL.createObjectURL(file),video=document.createElement('video');
  video.muted=true;video.playsInline=true;video.preload='metadata';
  const waitFor=(target,event)=>new Promise((resolve,reject)=>{
    const done=()=>{cleanup();resolve();};
    const fail=()=>{cleanup();reject(new Error('Impossible de décoder cette vidéo. Vérifie son format et son intégrité.'));};
    const cleanup=()=>{target.removeEventListener(event,done);target.removeEventListener('error',fail);};
    target.addEventListener(event,done,{once:true});target.addEventListener('error',fail,{once:true});
  });
  try{
    const metadataReady=waitFor(video,'loadedmetadata');video.src=objectUrl;await metadataReady;
    const duration=Number(video.duration),sourceWidth=Number(video.videoWidth),sourceHeight=Number(video.videoHeight);
    if(!Number.isFinite(duration)||duration<=0||duration>600)throw new Error('La vidéo doit durer 10 minutes maximum.');
    if(!sourceWidth||!sourceHeight)throw new Error('Les dimensions de la vidéo sont illisibles.');
    const maxDimension=768,scale=Math.min(1,maxDimension/Math.max(sourceWidth,sourceHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(sourceWidth*scale));
    canvas.height=Math.max(1,Math.round(sourceHeight*scale));
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)throw new Error('Impossible de préparer les images de cette vidéo.');
    const frames=[],frameCount=8;
    for(let i=0;i<frameCount;i++){
      const timestamp=duration*(i+0.5)/frameCount;
      const seekReady=waitFor(video,'seeked');video.currentTime=timestamp;await seekReady;
      context.drawImage(video,0,0,canvas.width,canvas.height);
      const dataUrl=canvas.toDataURL('image/jpeg',.62);
      if(dataUrl.length>950000)throw new Error('Une image extraite est trop volumineuse. Essaie une vidéo plus courte ou une résolution inférieure.');
      frames.push({timestamp:Number(timestamp.toFixed(2)),data_url:dataUrl});
    }
    return {duration,frames};
  }finally{URL.revokeObjectURL(objectUrl);video.removeAttribute('src');video.load();}
}
async function submitVideoAnalysis(form){
  const button=form.querySelector('button[type=submit]'),file=form.elements.video.files?.[0];
  const playerId=form.elements.player_id.value,title=String(form.elements.title.value||'').trim(),stroke=form.elements.stroke_type.value;
  if(!file||!title||!playerId){toast('Renseigne le joueur, le titre et la vidéo.','error');return;}
  if(!['video/mp4','video/quicktime','video/webm'].includes(file.type)){toast('Format accepté : MP4, MOV ou WEBM.','error');return;}
  if(file.size>262144000){toast('La vidéo dépasse la limite de 250 Mo.','error');return;}
  if(!form.elements.consent.checked){toast('Confirme que tu disposes de l’autorisation du joueur avant l’analyse.','error');return;}
  button.disabled=true;button.textContent='Préparation de la vidéo…';
  let analysisId=null,videoPath=null;
  try{
    const {duration,frames}=await extractVideoFrames(file);
    const totalFrameBytes=frames.reduce((total,frame)=>total+frame.data_url.length,0);
    if(totalFrameBytes>6500000)throw new Error('Les images extraites sont trop volumineuses pour une analyse fiable. Essaie une vidéo plus courte.');
    analysisId=crypto.randomUUID();
    const extension=file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'')||'mp4';
    videoPath=state.user.id+'/'+playerId+'/'+analysisId+'/original.'+extension;
    const {error:uploadError}=await supabase.storage.from('coach-in-videos').upload(videoPath,file,{contentType:file.type,upsert:false});
    if(uploadError)throw uploadError;
    const {error:insertError}=await supabase.from('coach_video_analyses').insert({id:analysisId,coach_id:state.user.id,player_id:playerId,title,stroke_type:stroke,video_path:videoPath,video_mime:file.type,video_size_bytes:file.size,duration_seconds:Number(duration.toFixed(2)),status:'uploaded'});
    if(insertError){await supabase.storage.from('coach-in-videos').remove([videoPath]);throw insertError;}
    button.textContent='Analyse IA en cours…';
    const {data,error}=await supabase.functions.invoke('analyze-tennis-video',{body:{analysis_id:analysisId,frames}});
    if(error||data?.error){
      const {data:latest}=await supabase.from('coach_video_analyses').select('status').eq('id',analysisId).maybeSingle();
      if(latest?.status!=='completed')throw new Error(data?.error||error?.message||'Le service IA n’a pas répondu. Vérifie le statut avant de relancer.');
    }
    toast('Analyse terminée. Vérifie les observations avant de les transmettre au joueur.');
    await dataService.loadCoachWorkspace(state.user.id);render('videos');
  }catch(error){
    toast(error.message||'Impossible de traiter cette vidéo.','error');
    try{await dataService.loadCoachWorkspace(state.user.id);render('videos');}catch(_){}
  }finally{if(button.isConnected){button.disabled=false;button.textContent='Lancer l’analyse IA';}}
}
async function toggleVideoShare(id,current){
  try{const {error}=await supabase.from('coach_video_analyses').update({shared_with_player:!current,updated_at:new Date().toISOString()}).eq('id',id).eq('coach_id',state.user.id);if(error)throw error;await dataService.loadCoachWorkspace(state.user.id);render('videos');toast(!current?'Analyse partagée avec le joueur.':'Partage retiré.');}
  catch(error){toast(error.message||'Impossible de modifier le partage.','error');}
}
async function deleteVideoAnalysis(id){
  const row=(state.videoAnalyses||[]).find(item=>item.id===id);
  if(!row){toast('Cette vidéo est introuvable.','error');return;}
  try{
    if(row.video_path){
      const {error:storageError}=await supabase.storage.from('coach-in-videos').remove([row.video_path]);
      if(storageError)throw storageError;
    }
    const {error}=await supabase.from('coach_video_analyses').delete().eq('id',id).eq('coach_id',state.user.id);
    if(error)throw error;
    closeDialog();
    await dataService.loadCoachWorkspace(state.user.id);render('videos');
    toast('Vidéo et analyse supprimées.');
  }catch(error){toast(error.message||'Impossible de supprimer cette vidéo.','error');}
}

async function saveVideoReview(form){
  const id=form.elements.analysis_id.value,review=String(form.elements.coach_review.value||'').trim();
  try{const {error}=await supabase.from('coach_video_analyses').update({coach_review:review,updated_at:new Date().toISOString()}).eq('id',id).eq('coach_id',state.user.id);if(error)throw error;await dataService.loadCoachWorkspace(state.user.id);render('videos');toast('Commentaire coach enregistré.');}
  catch(error){toast(error.message||'Impossible d’enregistrer le commentaire.','error');}
}

async function saveVideoCorrectionFollowup(form){
  const analysisId=form.elements.analysis_id.value;
  const correctionIndex=Number(form.elements.correction_index.value);
  const analysis=(state.videoAnalyses||[]).find(row=>row.id===analysisId);
  const correction=analysis?.analysis_result?.corrections?.[correctionIndex];
  if(!analysis||!correction||!Number.isInteger(correctionIndex)){toast('Cette fiche de correction est introuvable.','error');return;}
  const evaluationId=form.elements.evaluation_id.value||null;
  const evaluation=evaluationId?(state.evaluations||[]).find(row=>row.id===evaluationId):null;
  if(evaluationId&&!evaluation){toast('Le bilan sélectionné est introuvable.','error');return;}
  const status=form.elements.status.value;
  const payload={
    coach_id:state.user.id,player_id:analysis.player_id,analysis_id:analysisId,correction_index:correctionIndex,
    evaluation_id:evaluationId,session_id:evaluation?.session_id||null,status,
    coach_observation:String(form.elements.coach_observation.value||'').trim(),
    correction_data:correction,checked_at:['verified','not_achieved'].includes(status)?new Date().toISOString():null,updated_at:new Date().toISOString()
  };
  try{
    const {error}=await supabase.from('coach_video_correction_followups').upsert(payload,{onConflict:'analysis_id,correction_index'});
    if(error)throw error;
    await dataService.loadCoachWorkspace(state.user.id);render('videos');
    toast('Correction reliée au suivi pédagogique.');
  }catch(error){toast(error.message||'Impossible d’enregistrer le suivi de cette correction.','error');}
}

function libraryDialog(itemId='', seedItem=null){
  const item=state.library.find(row=>row.id===itemId)||seedItem||{};
  const editing=Boolean(itemId);
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">BIBLIOTHÈQUE</p><h2>${editing?'Modifier une séance':'Ajouter une séance'}</h2></div><button class="btn icon-btn" data-close>✕</button></div>
  <form id="library-form" class="form-grid">
    <input type="hidden" name="id" value="${escapeHtml(editing ? item.id||'' : '')}">
    <label>Format<select name="category"><option value="particulier" ${item.category==='particulier'?'selected':''}>Cours particulier</option><option value="collectif" ${item.category==='collectif'?'selected':''}>Cours collectif</option></select></label>
    <label>Niveau<input name="level" value="${escapeHtml(item.level||'Tous niveaux')}" placeholder="Tous niveaux, débutant, confirmé…"></label>
    <label class="span-2">Titre<input name="title" required value="${escapeHtml(item.title||'')}"></label>
    <label>Thème<input name="theme" required value="${escapeHtml(item.theme||'')}"></label>
    <label>Sous-thème<input name="subtheme" value="${escapeHtml(item.subtheme||'')}"></label>
    <label class="span-2">Mots-clés (séparés par des virgules)<input name="keywords" value="${escapeHtml((item.keywords||[]).join(', '))}"></label>
    <label class="span-2">Objectif<textarea name="objective" rows="2">${escapeHtml(item.objective||'')}</textarea></label>
    <label class="span-2">Matériel<textarea name="equipment" rows="2">${escapeHtml(item.equipment||'')}</textarea></label>
    <label class="span-2">Mise en place<textarea name="setup" rows="2">${escapeHtml(item.setup||'')}</textarea></label>
    <label class="span-2">Consignes<textarea name="instructions" rows="3">${escapeHtml(item.instructions||'')}</textarea></label>
    <label class="span-2">Rotations<textarea name="rotations" rows="2">${escapeHtml(item.rotations||'')}</textarea></label>
    <label class="span-2">Variantes<textarea name="variations" rows="2">${escapeHtml(item.variations||'')}</textarea></label>
    <label>Durée (minutes)<input type="number" name="duration_minutes" min="1" value="${item.duration_minutes||''}"></label>
    <label>Terrain (optionnel)<select name="court_number"><option value="">Non défini</option>${[1,2,3,4].map(n=>`<option value="${n}" ${Number(item.court_number)===n?'selected':''}>Terrain ${n}</option>`).join('')}</select></label>
    <label>Semaine source<input type="number" name="source_week" min="1" max="52" value="${item.source_week||''}"></label>
    <label class="span-2">Illustration (URL https)<input type="url" name="illustration_url" value="${escapeHtml(item.illustration_url||'')}" placeholder="https://…"></label>
    <div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">${editing?'Enregistrer les modifications':'Ajouter à la bibliothèque'}</button></div>
  </form>`);
}


let generatedSessionPlan = null;
let generatedSessionRecommendation = null;

function updateSessionBuilderExerciseOptions(){
  const form=$('#session-builder-form');if(!form)return;
  const theme=form.elements.theme.value,level=form.elements.level.value;
  const filtered=(state.library||[]).filter(item=>item.category==='particulier'&&(!theme||item.theme===theme)&&(level==='Tous niveaux'||item.level==='Tous niveaux'||item.level===level)).sort((x,y)=>String(x.title||'').localeCompare(String(y.title||''),'fr'));
  const first=form.elements.exercise_one,second=form.elements.exercise_two;
  const oldFirst=first.value,oldSecond=second.value;
  const optionMarkup=filtered.map(item=>'<option value="'+escapeHtml(item.id)+'">'+escapeHtml(item.title||'Exercice')+' · '+escapeHtml(item.theme||'Sans thème')+' · '+escapeHtml(item.level||'Tous niveaux')+'</option>').join('');
  first.innerHTML=optionMarkup||'<option value="">Aucun exercice pour ces filtres</option>';
  second.innerHTML='<option value="">Aucun · séance centrée sur un exercice</option>'+optionMarkup;
  if(filtered.some(item=>String(item.id)===oldFirst))first.value=oldFirst;
  else if(filtered.length)first.value=String(filtered[0].id);
  if(filtered.some(item=>String(item.id)===oldSecond)&&oldSecond!==first.value)second.value=oldSecond;
  else if(filtered.length>1)second.value=String(filtered.find(item=>String(item.id)!==first.value)?.id||'');
}

function sessionBuilderDialog(playerId=null){
 if(!state.players.length){toast('Ajoute au moins un joueur à ton effectif avant de préparer une séance.','error');return;}
 const items=(state.library||[]).filter(x=>x.category==='particulier').sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'fr'));
 const options=items.map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.title||'Exercice')+' · '+escapeHtml(x.theme||'Sans thème')+'</option>').join('');
 const today=toLocalISO(new Date());generatedSessionPlan=null;
 generatedSessionRecommendation=playerId?recommendSessionExercises({playerId,evaluations:state.evaluations,evaluationCriteria:state.evaluationCriteria,library:state.library,sessions:state.sessions,challenges:state.challenges,videoAnalyses:state.videoAnalyses}):null;
 const player=state.players.find(x=>x.id===playerId)||state.players[0],priority=generatedSessionRecommendation?.priority;
 showDialog('<div class="dialog-head"><div><p class="eyebrow">COACH IN · CRÉATION DE SÉANCE</p><h2>Composer une séance</h2><p class="muted">Création originale ou bibliothèque personnalisée.</p></div><button class="btn icon-btn" data-close>✕</button></div><form id="session-builder-form" class="form-grid">'+
 '<label class="span-2">Joueur<select name="player_id" required>'+state.players.map(p=>'<option value="'+p.id+'" '+(p.id===player?.id?'selected':'')+'>'+escapeHtml(p.first_name)+' '+escapeHtml(p.last_name)+'</option>').join('')+'</select></label>'+
 '<label>Date<input name="session_date" type="date" required value="'+today+'"></label><label>Heure<input name="session_time" type="time" required value="17:00"></label>'+
 '<label>Durée<select name="duration_minutes"><option value="60">1 heure</option><option value="90" selected>1 h 30</option><option value="120">2 heures</option></select></label>'+
 '<label>Niveau<select name="level"><option>Débutant</option><option selected>Intermédiaire</option><option>Confirmé</option><option>Compétition</option></select></label>'+
 '<label class="span-2">Mode de création<select name="creation_mode"><option value="original" selected>Création originale · sans bibliothèque</option><option value="library">Utiliser ma bibliothèque</option></select></label>'+
 '<label class="span-2">Thème principal<select name="theme">'+['Service','Retour','Volée','Défense','Construction du point','Attaque','Déplacements et appuis','Mental'].map(v=>'<option value="'+escapeHtml(v)+'" '+(priority&&normTheme(v)===normTheme(priority.main_theme)?'selected':'')+'>'+escapeHtml(v)+'</option>').join('')+'</select></label>'+
 '<label class="span-2">Objectif personnalisé (facultatif)<input name="custom_objective" placeholder="Ex. prise de balle tôt en revers, varier les effets au service…"></label>'+
 '<label class="span-2">Niveau de difficulté<select name="difficulty"><option value="auto" selected>Automatique · selon le dernier bilan</option><option value="easy">Accessible · sécuriser le geste</option><option value="progressive">Progressif · faire évoluer la contrainte</option><option value="hard">Exigeant · pression et décision</option></select></label>'+
 '<div id="session-library-fields" class="span-2 hidden"><label>Exercice 1<select name="exercise_one">'+(options||'<option value="">Aucun exercice</option>')+'</select></label><label>Exercice 2<select name="exercise_two"><option value="">Aucun</option>'+options+'</select></label></div>'+
 '<div class="span-2 session-builder-tip"><strong>'+(priority?'Priorité du joueur : '+escapeHtml(priority.criterion):'Création pédagogique autonome')+'</strong><p>Coach In crée ateliers, consignes, adaptations et situations de match sans utiliser ta bibliothèque.</p></div>'+
 '<div id="session-builder-preview" class="span-2"></div><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button type="button" class="btn primary" data-generate-session>Générer la séance</button></div></form>');
 updateSessionBuilderExerciseOptions();const form=$('#session-builder-form');if(form){form.elements.creation_mode.value='original';form.elements.level.value=player?.player_type==='Compétition'?'Compétition':'Intermédiaire';updateSessionBuilderMode();}
}
function normTheme(v){return String(v||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function updateSessionBuilderMode(){const form=$('#session-builder-form');if(!form)return;const libraryMode=form.elements.creation_mode.value==='library',fields=$('#session-library-fields');if(fields)fields.classList.toggle('hidden',!libraryMode);const tip=form.querySelector('.session-builder-tip');if(tip)tip.innerHTML=libraryMode?'<strong>Bibliothèque du coach</strong><p>Les exercices enregistrés restent sélectionnables.</p>':'<strong>Création originale indépendante</strong><p>Ateliers, consignes, critères de réussite et transfert au match seront créés sans puiser dans ta bibliothèque.</p>';}
function applySessionRecommendationToBuilder(playerId){
  generatedSessionRecommendation=recommendSessionExercises({playerId,evaluations:state.evaluations,evaluationCriteria:state.evaluationCriteria,library:state.library,sessions:state.sessions,challenges:state.challenges,videoAnalyses:state.videoAnalyses});
  const form=$('#session-builder-form');
  if(!form)return;
  if(generatedSessionRecommendation?.exerciseOne){
    const suggestedTheme=generatedSessionRecommendation.exerciseOne.theme||'';
    if(suggestedTheme&&[...form.elements.theme.options].some(option=>option.value===suggestedTheme))form.elements.theme.value=suggestedTheme;
    updateSessionBuilderExerciseOptions();
    form.elements.exercise_one.value=String(generatedSessionRecommendation.exerciseOne.id);
    if(generatedSessionRecommendation.exerciseTwo)form.elements.exercise_two.value=String(generatedSessionRecommendation.exerciseTwo.id);
  }
  const tip=form.querySelector('.session-builder-tip');
  if(tip){
    const title=generatedSessionRecommendation?.priority?'Priorité détectée : '+generatedSessionRecommendation.priority.criterion:'Préparation guidée';
    const detail=generatedSessionRecommendation?.reason||'Aucune priorité récurrente n’a été identifiée. Tu peux choisir librement les exercices.';
    tip.innerHTML='<strong>'+escapeHtml(title)+'</strong><p>'+escapeHtml(detail)+'</p>';
  }
  const preview=$('#session-builder-preview');
  if(preview)preview.innerHTML='';
}

function sessionBuilderExerciseText(item){
  return [
    item.objective?'Objectif : '+item.objective:'',
    item.equipment?'Matériel : '+item.equipment:'',
    item.setup?'Mise en place : '+item.setup:'',
    item.instructions?'Consignes : '+item.instructions:'',
    item.rotations?'Rotations : '+item.rotations:'',
    item.variations?'Variantes : '+item.variations:''
  ].filter(Boolean).join('\n\n')||'Contenu à compléter depuis la bibliothèque.';
}

function generateSessionPlan(){
 const form=$('#session-builder-form');if(!form)return;const values=Object.fromEntries(new FormData(form));
 if(!isPrivateLessonDateAllowed(values.session_date)){toast('Cette date tombe pendant une période sans cours particuliers. Choisis une autre date.','error');return;}
 const duration=Number(values.duration_minutes),player=state.players.find(p=>p.id===values.player_id)||{},mode=values.creation_mode||'original';
 let exerciseOne='',exerciseTwo='',theme=values.theme||'Construction du point',visibleSummary='',coachingPlan=null,phases=[];
 if(mode==='library'){
  const one=state.library.find(x=>String(x.id)===String(values.exercise_one)),two=values.exercise_two?state.library.find(x=>String(x.id)===String(values.exercise_two)):null;
  if(!one){toast('Sélectionne un exercice de ta bibliothèque ou passe en création originale.','error');return;}
  const split=duration===60?{warm:10,one:20,two:20,match:10}:duration===120?{warm:20,one:40,two:40,match:20}:{warm:15,one:30,two:30,match:15};
  coachingPlan=buildSessionCoachingPlan(generatedSessionRecommendation,duration);
  exerciseOne='ÉCHAUFFEMENT · '+split.warm+' min\nMise en route progressive.\n\nEXERCICE 1 · '+split.one+' min\n'+sessionBuilderExerciseText(one)+'\n\nOBJECTIF · '+coachingPlan.objective+'\nCONSIGNE · '+coachingPlan.cue+'\nRÉUSSITE · '+coachingPlan.success;
  exerciseTwo=(two?'EXERCICE 2 · '+split.two+' min\n'+sessionBuilderExerciseText(two)+'\n\n':'')+'RETOUR AU MATCH · '+(split.match+(two?0:split.two))+' min\n'+buildMatchTransfer(generatedSessionRecommendation?.priority);
  theme=values.theme||one.theme||'Tennis';visibleSummary=coachingPlan.objective+' Réinvestissement prévu au retour au match.';
 }else{
  const recent=state.sessions.filter(x=>x.player_id===values.player_id).sort((a,b)=>String(b.session_date||'').localeCompare(String(a.session_date||'')));
  const custom=String(values.custom_objective||'').trim(),age=player.date_of_birth?Math.floor((Date.now()-new Date(player.date_of_birth).getTime())/31557600000):player.age||null;
  const priorAdjustment=buildSessionProgression(recent,values.player_id,custom||values.theme,state.evaluations,state.evaluationCriteria);const generated=generateOriginalSession({theme:values.theme||generatedSessionRecommendation?.priority?.main_theme||'Construction du point',customObjective:custom,difficulty:values.difficulty||'auto',priorAdjustment,playerName:[player.first_name,player.last_name].filter(Boolean).join(' ')||'le joueur',level:values.level||'Intermédiaire',age,playerType:player.player_type||'Loisir',duration,priority:generatedSessionRecommendation?.priority||null,challenge:generatedSessionRecommendation?.activeChallenge||null,recentSessions:recent});
  exerciseOne=generated.exercise_1+'\n\nNOTES COACH\n'+generated.coaching_notes+'\n\nNIVEAU DE DIFFICULTÉ · '+generated.difficulty+'\n'+generated.difficulty_rule;exerciseTwo=generated.exercise_2;theme=generated.theme;visibleSummary=generated.player_visible_summary;coachingPlan={objective:generated.objective,success:generated.success_criteria};phases=generated.phases;
 }
 generatedSessionPlan={generated:true,player_id:values.player_id,session_date:values.session_date,session_time:values.session_time,duration_minutes:duration,theme,exercise_1:exerciseOne,exercise_2:exerciseTwo,level:values.level,player_visible_summary:visibleSummary,generation_mode:mode,progression:mode==='original'?buildSessionProgression(state.sessions.filter(x=>x.player_id===values.player_id),values.player_id,values.custom_objective||values.theme,state.evaluations,state.evaluationCriteria):null};
 const preview=$('#session-builder-preview');if(preview)preview.innerHTML='<section class="session-builder-preview"><div class="session-builder-preview-head"><div><p class="eyebrow">SÉANCE GÉNÉRÉE · '+(mode==='original'?'CRÉATION ORIGINALE':'BIBLIOTHÈQUE')+'</p><h3>'+escapeHtml(theme)+' · '+duration+' min</h3></div><span class="tag">'+escapeHtml(values.level)+'</span></div>'+
 (generatedSessionRecommendation?.priority?'<div class="session-builder-focus"><strong>Priorité joueur</strong><span>'+escapeHtml(generatedSessionRecommendation.priority.criterion)+'</span></div>':'')+(generatedSessionPlan.progression?.hasHistory?'<div class="session-builder-focus"><strong>'+escapeHtml(generatedSessionPlan.progression.label)+'</strong><span>'+escapeHtml(generatedSessionPlan.progression.guidance)+'</span></div>':'<div class="session-builder-focus"><strong>Premier repère</strong><span>La première séance évaluée servira de référence pour ajuster la suivante.</span></div>')+'<div class="session-builder-phase"><strong>Objectif pédagogique</strong><p>'+escapeHtml(coachingPlan?.objective||visibleSummary)+'</p><small>'+escapeHtml(coachingPlan?.success||'Réussite à observer en jeu')+'</small></div>'+
 (phases.length?phases.map((p,i)=>'<div class="session-builder-phase"><strong>0'+(i+1)+' · '+escapeHtml(p.name)+'</strong><small>'+p.minutes+' min</small></div>').join(''):'<div class="session-builder-phase"><strong>Exercices sélectionnés</strong><p>Contenus issus de ta bibliothèque.</p></div>')+'<div class="session-builder-actions"><button type="button" class="btn primary" data-use-generated-session>Utiliser cette séance →</button></div></section>';
}
function sessionReviewDialog(sessionId){
  const session=state.sessions.find(row=>row.id===sessionId);
  if(!session||state.profile?.role!=='coach')return;
  const review=session.progress_review||{};
  const player=state.players.find(row=>row.id===session.player_id);
  const targetMatch=String(session.exercise_2||'').match(/(?:Critère de réussite|RÉUSSITE)\\s*[·:]\\s*([^\\n]+)/i);
  const successTarget=targetMatch?.[1]||'Objectif à préciser avec le coach';
  showDialog('<div class="dialog-head"><div><p class="eyebrow">BOUCLE DE PROGRESSION</p><h2>Bilan de séance</h2><p class="muted">'+escapeHtml(player?[player.first_name,player.last_name].filter(Boolean).join(' '):'Joueur')+' · '+escapeHtml(session.theme||'Séance')+'</p></div><button class="btn icon-btn" data-close>✕</button></div>'+
    '<form id="session-review-form" class="form-grid"><input type="hidden" name="session_id" value="'+escapeHtml(session.id)+'">'+
    '<div class="span-2 session-builder-tip"><strong>Objectif travaillé</strong><p>'+escapeHtml(session.theme||'Objectif à préciser')+'</p><strong>Critère de réussite prévu</strong><p>'+escapeHtml(successTarget)+'</p><small>Compare les tentatives réelles au critère prévu. Le bilan reste privé dans ton espace coach.</small></div>'+
    '<label>Réussites<input name="successes" type="number" min="0" max="50" required value="'+(review.successes??'')+'" placeholder="Ex. 7"></label>'+
    '<label>Tentatives<input name="attempts" type="number" min="1" max="50" required value="'+(review.attempts??10)+'"></label>'+
    '<label class="span-2">Ma perception de la séance<select name="coach_rating" required>'+Array.from({length:10},(_,i)=>i+1).map(n=>'<option value="'+n+'" '+(Number(review.coach_rating||6)===n?'selected':'')+'>'+n+'/10</option>').join('')+'</select></label>'+
    '<label class="span-2">Ce que tu as observé<textarea name="observation" rows="3" placeholder="Ex. contact plus tôt, mais équilibre encore instable…">'+escapeHtml(review.observation||'')+'</textarea></label>'+
    '<label class="span-2">Ajustement à prévoir<textarea name="next_adjustment" rows="2" placeholder="Ex. réduire la vitesse et élargir la cible avant de remettre de la pression…">'+escapeHtml(review.next_adjustment||'')+'</textarea></label>'+
    '<div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Enregistrer le bilan</button></div></form>');
}
function sessionDialog(date=toLocalISO(new Date()), time='17:00', libraryItem=null){
  if(!state.players.length){toast('Associe d’abord un compte joueur à ton effectif.','error');return;}
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">TERRAIN</p><h2>Planifier une séance</h2></div><button class="btn icon-btn" data-close>✕</button></div><form id="session-form" class="form-grid"><label class="span-2">Joueur<select name="player_id" required>${state.players.map(p=>`<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</option>`).join('')}</select></label><label>Date<input name="session_date" type="date" required value="${date}"></label><label>Heure<input name="session_time" type="time" required value="${time}"></label><label>Durée<select name="duration_minutes"><option value="60">1 heure</option><option value="90">1 h 30</option><option value="120">2 heures</option></select></label><label>Court<select name="court_number"><option value="1">Court 1</option><option value="2">Court 2</option><option value="3">Court 3</option><option value="4">Court 4</option></select></label><label>Thème<input name="theme" required placeholder="Ex. Construction du point"></label><label class="span-2">Exercice 1<textarea name="exercise_1" rows="2"></textarea></label><label class="span-2">Exercice 2<textarea name="exercise_2" rows="2"></textarea></label><label class="span-2">Synthèse visible joueur<textarea name="player_visible_summary" rows="2"></textarea></label><label class="span-2">Notes privées coach<textarea name="coach_private_notes" rows="2"></textarea></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Enregistrer la séance</button></div></form>`);
  if(libraryItem) applyLibraryItemToSessionForm(libraryItem);
}
function applyLibraryItemToSessionForm(item){
  const form=$('#session-form'); if(!form||!item)return;
  if(item.generated){
    if(form.elements.player_id&&item.player_id)form.elements.player_id.value=item.player_id;
    if(form.elements.duration_minutes&&[60,90,120].includes(Number(item.duration_minutes)))form.elements.duration_minutes.value=String(item.duration_minutes);
    if(form.elements.theme)form.elements.theme.value=item.theme||'';
    if(form.elements.exercise_1)form.elements.exercise_1.value=item.exercise_1||'';
    if(form.elements.exercise_2)form.elements.exercise_2.value=item.exercise_2||'';
    if(form.elements.player_visible_summary)form.elements.player_visible_summary.value=item.player_visible_summary||'';
    return;
  }
  if(form.elements.theme)form.elements.theme.value=item.theme||item.title||'';
  if(form.elements.exercise_1)form.elements.exercise_1.value=[item.objective,item.setup,item.instructions,item.equipment?'Matériel : '+item.equipment:''].filter(Boolean).join('\n\n');
  if(form.elements.exercise_2)form.elements.exercise_2.value=[item.rotations,item.variations].filter(Boolean).join('\n\n');
  if(form.elements.duration_minutes&&[60,90,120].includes(Number(item.duration_minutes)))form.elements.duration_minutes.value=String(item.duration_minutes);
}
function updateEvaluationSelectionUI(){
  const form=$('#evaluation-form');if(!form)return;
  const checked=[...form.querySelectorAll('input[name=criterion]:checked')];
  const total=form.querySelector('[data-selection-total]');if(total)total.textContent=checked.length+' critère'+(checked.length>1?'s':'');
  form.querySelectorAll('[data-theme-index]').forEach(theme=>{
    const count=theme.querySelectorAll('input[name=criterion]:checked').length;
    const label=theme.querySelector('[data-theme-count]');if(label)label.textContent=count+' sélectionné'+(count>1?'s':'');
    theme.classList.toggle('has-selection',count>0);
  });
}

function evaluationDialog(){
  if(!state.players.length){toast('Aucun joueur dans ton effectif.','error');return;}
  const groups=groupCriteria(state.criteria||[]);
  const criteriaMarkup=groups.length?groups.map((group,index)=>`<details class="criterion-theme coach-theme" data-theme-index="${index}">
    <summary><span class="theme-summary-main"><span class="theme-summary-dot">●</span><span>${escapeHtml(group.theme)}</span></span><span class="theme-summary-meta"><small data-theme-count="${index}">0 sélectionné</small><span class="theme-chevron">⌄</span></span></summary>
    <div class="criterion-theme-content">${group.subthemes.map((sub,subIndex)=>`<details class="criterion-subtheme-card" ${subIndex===0?'open':''}><summary><span>${escapeHtml(sub.subtheme||group.theme)}</span><span class="subtheme-summary-meta"><small>Ouvrir les critères</small><b>⌄</b></span></summary><div class="criterion-subtheme-body"><div class="criterion-columns"><div><p class="criterion-positive-title">✓ Réussites</p>${sub.positive.map(item=>`<label class="criterion-option positive"><input type="checkbox" name="criterion" value="${item.id}" data-criterion-id="${item.id}"><span>${escapeHtml(item.criterion)}</span></label>`).join('')||'<small class="muted">Aucun critère enregistré.</small>'}</div><div><p class="criterion-improvement-title">↗ À améliorer</p>${sub.improvement.map(item=>`<div class="criterion-measure-row"><label class="criterion-option improvement"><input type="checkbox" name="criterion" value="${item.id}" data-criterion-id="${item.id}"><span>${escapeHtml(item.criterion)}</span></label><input class="criterion-measure" type="number" step="0.1" name="measure_${item.id}" aria-label="Mesure pour ${escapeHtml(item.criterion)}" placeholder="Mesure" disabled></div>`).join('')||'<small class="muted">Aucun critère enregistré.</small>'}</div></div></div></details>`).join('')}</div></details>`).join(''):'<div class="empty-state"><h3>Catalogue de critères non importé</h3><p>Le formulaire est prêt. Aucun critère n’a été inventé pour compléter les listes manquantes.</p></div>';
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">PROGRESSION · BILAN DE SÉANCE</p><h2>Nouveau bilan tennis</h2><p class="muted">Un parcours guidé, étape par étape.</p></div><button class="btn icon-btn" data-close>✕</button></div>
  <form id="evaluation-form" class="form-grid evaluation-form">
    <div class="evaluation-stepper span-2"><span class="step-current">1 Joueur</span><i></i><span>2 Thèmes</span><i></i><span>3 Notes</span><i></i><span>4 Validation</span></div>
    <label class="span-2">Joueur<select name="player_id" required>${state.players.map(p=>`<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</option>`).join('')}</select></label>
    <div class="span-2"><div class="evaluation-section-heading"><div><p class="form-section-title">Thèmes et sous-thèmes travaillés</p><p class="tiny muted">Appuie sur un thème pour afficher ses sous-thèmes, puis coche les observations.</p></div><span class="selection-total" data-selection-total>0 critère</span></div>${criteriaMarkup}
      <div class="criteria-validation"><div><strong data-validation-title>Sélection à confirmer</strong><small data-validation-hint>Tu peux choisir plusieurs réussites et axes de progression.</small></div><button type="button" class="btn subtle" data-confirm-criteria>Valider les critères ✓</button></div>
    </div>
    <div class="span-2"><p class="form-section-title">Notes par secteur /20</p><div class="score-grid">${[['technical_score','Technique'],['tactical_score','Tactique'],['physical_score','Physique'],['mental_score','Mental']].map(([key,label])=>`<label>${label}<input type="number" name="${key}" min="0" max="20" step="0.5" placeholder="—"></label>`).join('')}</div><small class="muted">La moyenne est calculée uniquement sur les secteurs renseignés.</small></div>
    <div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Enregistrer le bilan</button></div>
  </form>`);
  updateEvaluationSelectionUI();
}

function playerSheetDialog(playerId){
  const player=state.players.find(p=>p.id===playerId);if(!player)return;
  const coachId=state.user?.id;
  const reports=state.evaluations.filter(r=>r.player_id===playerId&&(!coachId||r.created_by===coachId)).sort((a,b)=>String(b.evaluated_at||b.created_at).localeCompare(String(a.evaluated_at||a.created_at)));
  const reportIds=new Set(reports.map(r=>r.id));
  const sessions=state.sessions.filter(x=>x.player_id===playerId&&(!coachId||x.created_by===coachId)).sort((a,b)=>String(b.session_date).localeCompare(String(a.session_date)));
  const criteria=state.evaluationCriteria.filter(x=>reportIds.has(x.evaluation_id));
  const achievements=state.achievements.filter(x=>x.player_id===playerId&&(!coachId||x.coach_id===coachId)).sort((a,b)=>String(b.unlocked_at).localeCompare(String(a.unlocked_at)));
  const challenge=state.challenges.find(x=>x.player_id===playerId&&x.status==='active'&&(!coachId||x.coach_id===coachId));
  const shares=(state.coachPlayerShares||[]).filter(row=>row.player_id===playerId&&['pending','accepted'].includes(row.status));
  const sharesMarkup=shares.length?shares.map(row=>'<article class="list-card"><div class="list-main"><strong>'+escapeHtml(row.invited_coach_email||'Coach invité')+'</strong><span>'+(row.status==='accepted'?'Accès partagé · suivi indépendant':'Invitation en attente')+'</span></div><button class="btn danger" data-revoke-coach-share="'+row.id+'" data-player-id="'+playerId+'">'+(row.status==='accepted'?'Retirer l’accès':'Annuler l’invitation')+'</button></article>').join(''):'<p class="muted">Aucun autre coach n’a accès à cette fiche pour le moment.</p>';
  const birthDate=player.birth_date?new Date(player.birth_date+'T12:00:00'):null;
  const today=new Date();let playerAge='Non renseigné';
  if(birthDate&&!Number.isNaN(birthDate.getTime())){playerAge=today.getFullYear()-birthDate.getFullYear();if(today.getMonth()<birthDate.getMonth()||(today.getMonth()===birthDate.getMonth()&&today.getDate()<birthDate.getDate()))playerAge--;playerAge+=' ans';}
  const totalMinutes=sessions.reduce((sum,row)=>sum+Number(row.duration_minutes||0),0);
  const positive=criteria.filter(x=>x.criterion_type==='positive').length;
  const improvement=criteria.filter(x=>x.criterion_type==='improvement').length;
  const totalCriteria=positive+improvement;
  const positiveAngle=totalCriteria?positive/totalCriteria*360:0;
  const scoreAxes=[['Technique','technical_score','#43d4f2'],['Tactique','tactical_score','#a78bfa'],['Physique','physical_score','#66e0ad'],['Mental','mental_score','#ffb36e']];
  const scoreValue=(report,key)=>report[key]===null||report[key]===undefined||report[key]===''?null:Number(report[key]);
  const scoreStats=scoreAxes.map(axis=>{
    const scored=reports.map(report=>({value:scoreValue(report,axis[1])})).filter(x=>Number.isFinite(x.value)&&x.value>=0&&x.value<=20).reverse();
    const latest=scored.length?scored[scored.length-1].value:null;
    const first=scored.length?scored[0].value:null;
    const delta=scored.length>1?latest-first:null;
    const average=scored.length?scored.reduce((sum,x)=>sum+x.value,0)/scored.length:null;
    return {label:axis[0],key:axis[1],color:axis[2],latest,delta,average,count:scored.length};
  });
  const latest=reports[0];
  const latestValues=latest?scoreAxes.map(axis=>[axis[0],scoreValue(latest,axis[1])]):[];
  const validValues=latestValues.filter(x=>Number.isFinite(x[1])&&x[1]>=0&&x[1]<=20);
  let radar='<p class="chart-empty">Le radar complet apparaîtra dès qu’un bilan aura les quatre secteurs notés.</p>';
  if(validValues.length===4){
    const center=110,radius=76;
    const point=(value,index)=>{const angle=-Math.PI/2+index*Math.PI/2;const distance=value/20*radius;return (center+Math.cos(angle)*distance)+','+(center+Math.sin(angle)*distance);};
    const rings=[.25,.5,.75,1].map(f=>{const pts=Array.from({length:4},(_,i)=>{const angle=-Math.PI/2+i*Math.PI/2;return (center+Math.cos(angle)*radius*f)+','+(center+Math.sin(angle)*radius*f);}).join(' ');return '<polygon class="radar-grid" points="'+pts+'"/>';}).join('');
    const polygon=latestValues.map((x,i)=>point(x[1],i)).join(' ');
    const labels=scoreAxes.map((axis,i)=>{const angle=-Math.PI/2+i*Math.PI/2;return '<text class="radar-label" x="'+(center+Math.cos(angle)*98)+'" y="'+(center+Math.sin(angle)*98+3)+'">'+axis[0]+'</text>';}).join('');
    radar='<div class="radar-wrap player-sheet-radar"><svg viewBox="0 0 220 220" role="img" aria-label="Radar des quatre secteurs">'+rings+'<polygon class="radar-area" points="'+polygon+'"/>'+labels+'</svg></div>';
  }
  const averageLatest=validValues.length?validValues.reduce((sum,x)=>sum+x[1],0)/validValues.length:null;
  const criterionFrequency=type=>{
    const map=new Map();
    criteria.filter(row=>row.criterion_type===type).forEach(row=>{
      const key=row.criterion_id||row.criterion;
      if(!map.has(key))map.set(key,{criterion:row.criterion,evaluations:new Set()});
      map.get(key).evaluations.add(row.evaluation_id);
    });
    return [...map.values()].map(item=>({criterion:item.criterion,count:item.evaluations.size})).sort((a,b)=>b.count-a.count||a.criterion.localeCompare(b.criterion,'fr')).slice(0,4);
  };
  const strengths=criterionFrequency('positive');
  const priorities=criterionFrequency('improvement');
  const criterionList=(items,kind)=>items.length?'<div class="profile-criterion-list">'+items.map(item=>'<div class="profile-criterion-item '+kind+'"><span>'+(kind==='strength'?'✓':'↗')+'</span><div><strong>'+escapeHtml(item.criterion)+'</strong><small>Présent dans '+item.count+' bilan(s)</small></div></div>').join('')+'</div>':'<p class="muted">Les tendances apparaîtront avec les prochains bilans détaillés.</p>';
  const themeCounts=new Map();
  criteria.forEach(row=>{const key=row.main_theme||'Autres';themeCounts.set(key,(themeCounts.get(key)||0)+1);});
  const themeSummary=[...themeCounts].sort((a,b)=>b[1]-a[1]).map(([theme,count])=>'<div class="theme-progress-row"><span>'+escapeHtml(theme)+'</span><div class="theme-progress-track"><i style="width:'+Math.min(100,count/Math.max(1,...themeCounts.values())*100)+'%"></i></div><b>'+count+'</b></div>').join('');
  const coachName=state.profile?[state.profile.first_name,state.profile.last_name].filter(Boolean).join(' '):'Ton espace coach';
  const sectorCards=scoreStats.map(item=>'<article class="profile-sector-card" style="--sector-color:'+item.color+'"><div class="profile-sector-heading"><span>'+item.label+'</span>'+(item.delta===null?'<small>—</small>':'<small class="'+(item.delta>=0?'positive':'improvement')+'">'+(item.delta>0?'+':'')+item.delta.toFixed(1).replace('.',',')+' pts</small>')+'</div><strong>'+(item.latest===null?'—':item.latest.toFixed(1).replace('.',',')+'/20')+'</strong><div class="profile-sector-track"><i style="width:'+(item.latest===null?0:item.latest/20*100)+'%"></i></div><small>'+(item.count?'Moyenne '+item.average.toFixed(1).replace('.',',')+'/20 · '+item.count+' bilan(s)':'Pas encore noté')+'</small></article>').join('');
  const historyReports=reports.map(report=>{
    const rows=criteria.filter(c=>c.evaluation_id===report.id);
    const author=[report.coach_first_name,report.coach_last_name].filter(Boolean).join(' ')||coachName;
    const scores=scoreAxes.map(axis=>({label:axis[0],value:scoreValue(report,axis[1])})).filter(x=>Number.isFinite(x.value)&&x.value>=0&&x.value<=20);
    const average=scores.length?scores.reduce((sum,x)=>sum+x.value,0)/scores.length:null;
    return '<article class="journal-card profile-history-card"><div class="profile-history-top"><div><div class="journal-date">'+formatDate(report.evaluated_at||report.created_at,{day:'2-digit',month:'long',year:'numeric'})+' · '+escapeHtml(author)+'</div><strong>Bilan de progression</strong></div><span class="tag">'+(average===null?'Non noté':average.toFixed(1).replace('.',',')+'/20')+'</span></div><div class="radar-mini">'+scores.map(x=>'<span>'+x.label+' : '+x.value+'/20</span>').join(' · ')+'</div><div class="profile-history-counts"><span class="positive">'+rows.filter(x=>x.criterion_type==='positive').length+' réussites</span><span class="improvement">'+rows.filter(x=>x.criterion_type==='improvement').length+' axes de travail</span></div><div class="journal-criteria">'+rows.slice(0,8).map(row=>'<span class="journal-tag '+(row.criterion_type==='positive'?'positive':'improvement')+'">'+(row.criterion_type==='positive'?'✓':'↗')+' '+escapeHtml(row.criterion)+'</span>').join('')+(rows.length>8?'<small class="muted">+ '+(rows.length-8)+' autre(s) critère(s)</small>':'')+'</div>'+(report.player_visible_comment?'<p class="profile-visible-comment">'+escapeHtml(report.player_visible_comment)+'</p>':'')+'<button class="btn subtle" data-send-evaluation="'+report.id+'">Envoyer le bilan au joueur</button></article>';
  }).join('');
  const historySessions=sessions.map(session=>'<article class="list-card profile-session-card"><div class="list-date"><strong>'+formatDate(session.session_date,{day:'2-digit',month:'short'})+'</strong><small>'+(session.duration_minutes||60)+' min</small></div><div class="list-main"><strong>'+escapeHtml(session.theme||'Séance de tennis')+'</strong><span>'+escapeHtml(session.player_visible_summary||'Séance enregistrée')+'</span><small>'+escapeHtml(session.exercise_1||'')+(session.exercise_2?' · '+escapeHtml(session.exercise_2):'')+(session.return_to_match?' · Retour match : '+escapeHtml(session.return_to_match):'')+'</small></div></article>').join('');
  const videoRows=(state.videoAnalyses||[]).filter(row=>row.player_id===playerId&&row.coach_id===coachId);
  const followups=(state.videoCorrectionFollowups||[]).filter(row=>row.player_id===playerId&&row.coach_id===coachId);
  const journeyEvents=[
    ...sessions.map(row=>({kind:'session',date:row.session_date,row})),
    ...reports.map(row=>({kind:'evaluation',date:row.evaluated_at||row.created_at,row})),
    ...achievements.map(row=>({kind:'achievement',date:row.unlocked_at,row})),
    ...state.challenges.filter(row=>row.player_id===playerId&&row.coach_id===coachId&&row.status==='completed').map(row=>({kind:'challenge',date:row.completed_at||row.updated_at||row.created_at,row})),
    ...videoRows.map(row=>({kind:'video',date:row.analyzed_at||row.created_at,row})),
    ...followups.map(row=>({kind:'correction',date:row.checked_at||row.updated_at||row.created_at,row}))
  ].filter(event=>event.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const journeyMarkup=journeyEvents.map(event=>{
    const row=event.row;
    const date=formatDate(event.date,{day:'2-digit',month:'long',year:'numeric'});
    if(event.kind==='session')return '<article class="journey-event journey-session"><span class="journey-marker">●</span><div class="journey-event-body"><div class="journal-date">'+date+' · Séance</div><h3>'+escapeHtml(row.theme||'Séance de tennis')+'</h3><p>'+escapeHtml(row.player_visible_summary||'Séance enregistrée')+'</p></div></article>';
    if(event.kind==='evaluation'){
      const rows=criteria.filter(item=>item.evaluation_id===row.id);
      const values=scoreAxes.map(axis=>scoreValue(row,axis[1])).filter(value=>Number.isFinite(value)&&value>=0&&value<=20);
      const average=values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
      return '<article class="journey-event journey-evaluation"><span class="journey-marker">↗</span><div class="journey-event-body"><div class="journal-date">'+date+' · Bilan</div><h3>Évaluation de progression'+(average===null?'':' · '+average.toFixed(1).replace('.',',')+'/20')+'</h3>'+(row.player_visible_comment?'<p>'+escapeHtml(row.player_visible_comment)+'</p>':'')+'<div class="journal-criteria">'+rows.map(item=>'<span class="journal-tag '+(item.criterion_type==='positive'?'positive':'improvement')+'">'+(item.criterion_type==='positive'?'✓':'↗')+' '+escapeHtml(item.criterion)+'</span>').join('')+'</div></div></article>';
    }
    if(event.kind==='achievement')return '<article class="journey-event journey-achievement"><span class="journey-marker">✦</span><div class="journey-event-body"><div class="journal-date">'+date+'</div><h3>Réussite débloquée</h3><p>'+escapeHtml(row.criterion)+'</p><small>'+Number(row.validation_count||3)+' validations positives</small></div></article>';
    if(event.kind==='challenge')return '<article class="journey-event journey-challenge"><span class="journey-marker">★</span><div class="journey-event-body"><div class="journal-date">'+date+'</div><h3>Défi relevé</h3><p>'+escapeHtml(row.criterion)+'</p><small>'+escapeHtml(row.objective||'Objectif atteint')+'</small></div></article>';
    if(event.kind==='video'){
      const result=row.analysis_result||{};
      return '<article class="journey-event journey-video"><span class="journey-marker">▶</span><div class="journey-event-body"><div class="journal-date">'+date+' · Analyse vidéo'+(row.stroke_type?' · '+escapeHtml(row.stroke_type):'')+'</div><h3>'+escapeHtml(row.title||'Analyse technique')+'</h3><p>'+escapeHtml(result.summary||'Analyse enregistrée')+'</p><small>'+(row.shared_with_player?'Partagée avec le joueur':'Visible uniquement par le coach')+'</small></div></article>';
    }
    const correction=row.correction_data||{};
    const statusLabels={pending:'À travailler',in_progress:'En cours',verified:'Correction vérifiée',not_achieved:'À reprendre'};
    return '<article class="journey-event journey-correction"><span class="journey-marker">✓</span><div class="journey-event-body"><div class="journal-date">'+date+' · Suivi vidéo</div><h3>'+escapeHtml(correction.exercise_name||correction.coach_instruction||'Correction technique')+'</h3><p>'+escapeHtml(row.coach_observation||correction.observation||'Point de correction suivi sur le terrain')+'</p><small>'+statusLabels[row.status]+'</small></div></article>';
  }).join('');
  const privateNotes=sessions.filter(s=>s.coach_private_notes?.trim()).map(s=>'<article class="journal-card"><div class="journal-date">'+formatDate(s.session_date,{day:'2-digit',month:'long',year:'numeric'})+' · '+escapeHtml(s.theme||'Séance de tennis')+'</div><p>'+escapeHtml(s.coach_private_notes)+'</p></article>').join('');
  showDialog('<div class="dialog-head player-profile-head"><div class="player-profile-identity"><div class="player-profile-avatar">'+escapeHtml((player.first_name||'?').slice(0,1))+escapeHtml((player.last_name||'').slice(0,1))+'</div><div class="player-profile-copy"><p class="eyebrow">DOSSIER JOUEUR · SUIVI INDIVIDUEL</p><h2>'+escapeHtml(player.first_name)+' '+escapeHtml(player.last_name)+'</h2><p class="muted">'+escapeHtml(player.fft_ranking||'Classement non renseigné')+' · '+escapeHtml(player.age_category||'Catégorie non renseignée')+' · '+escapeHtml(player.player_type||'Loisir')+'</p><small class="profile-coach-attribution">Suivi par '+escapeHtml(coachName)+'</small></div></div><button class="btn icon-btn" data-close aria-label="Fermer la fiche">✕</button></div>'+
  '<section class="profile-hero-stats"><div><span>ÂGE</span><strong>'+playerAge+'</strong></div><div><span>SÉANCES</span><strong>'+sessions.length+'</strong></div><div><span>BILANS</span><strong>'+reports.length+'</strong></div><div><span>TEMPS DE JEU</span><strong>'+Math.floor(totalMinutes/60)+' h '+(totalMinutes%60)+' min</strong></div></section>'+
  '<section class="sheet-section session-intelligence-cta"><div><p class="eyebrow">COACH IN INTELLIGENCE</p><h3>Préparer la prochaine séance</h3><p class="tiny muted">Construire une séance à partir des derniers bilans et des exercices de ta bibliothèque.</p></div><button class="btn primary" data-personalized-session="'+playerId+'">✦ Générer une séance personnalisée</button></section>'+'<section class="sheet-section player-personal-info"><div class="section-heading"><div><p class="eyebrow">IDENTITÉ SPORTIVE</p><h3>Informations du joueur</h3></div></div><div class="profile-info-grid"><div><small>Naissance</small><strong>'+(player.birth_date?formatDate(player.birth_date):'Non renseignée')+'</strong></div><div><small>Classement FFT</small><strong>'+escapeHtml(player.fft_ranking||'Non renseigné')+'</strong></div><div><small>Catégorie d’âge</small><strong>'+escapeHtml(player.age_category||'Non renseignée')+'</strong></div><div><small>Profil</small><strong>'+escapeHtml(player.player_type||'Loisir')+'</strong></div><div class="span-2"><small>E-mail</small><strong>'+escapeHtml(player.email||'Non renseigné')+'</strong></div></div></section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">COLLABORATION MULTI-COACHS</p><h3>Accès partagés</h3></div><span class="tag">'+shares.length+'</span></div><p class="tiny muted">Chaque coach invité possède son propre planning, ses bilans, ses défis et ses notes confidentielles.</p><div class="list-stack">'+sharesMarkup+'</div></section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">DERNIER BILAN · '+(latest?formatDate(latest.evaluated_at||latest.created_at,{day:'2-digit',month:'short',year:'numeric'}):'EN ATTENTE')+'</p><h3>Profil de performance</h3></div><span class="tag">'+(averageLatest===null?'—':averageLatest.toFixed(1).replace('.',',')+'/20')+'</span></div><div class="player-sheet-analytics"><article class="dashboard-chart-card"><h3>Radar des compétences</h3>'+radar+'</article><article class="dashboard-chart-card"><h3>Dernières notes par secteur</h3><div class="profile-sector-list">'+sectorCards+'</div></article></div><div class="criterion-donut-row">'+(totalCriteria?'<div class="donut-chart" role="img" aria-label="'+positive+' réussites et '+improvement+' points à améliorer" style="background:conic-gradient(#66e0ad 0deg '+positiveAngle+'deg,#ffb36e '+positiveAngle+'deg 360deg)"><div><strong>'+totalCriteria+'</strong><small>observations</small></div></div><div class="chart-legend"><span><i class="legend-dot positive"></i><b>'+positive+'</b> réussites</span><span><i class="legend-dot improvement"></i><b>'+improvement+'</b> axes de travail</span></div>':'<p class="chart-empty">Les critères apparaîtront après les premiers bilans détaillés.</p>')+'</div></section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">POINTS D’APPUI</p><h3>Forces récurrentes</h3></div></div>'+criterionList(strengths,'strength')+'</section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">AXES DE PROGRESSION</p><h3>Points à travailler</h3></div></div>'+criterionList(priorities,'improvement')+'</section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">OBJECTIF PERSONNALISÉ</p><h3>Défi prioritaire</h3></div></div>'+(challenge?'<div class="challenge-strip"><b>'+escapeHtml(challenge.criterion)+'</b><span>'+escapeHtml(challenge.objective)+'</span><small>'+(challenge.current_value??'—')+' / '+(challenge.target_value??'—')+' · '+(challenge.consecutive_successes||0)+'/2 validations consécutives</small></div>':'<p class="muted">Aucun défi actif pour ce suivi coach.</p>')+'</section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">BADGES DE PROGRESSION</p><h3>Réussites débloquées</h3></div><span class="tag">'+achievements.length+'</span></div><div class="achievement-grid">'+(achievements.map(a=>'<div class="achievement-card"><span class="achievement-symbol">✦</span><strong>'+escapeHtml(a.criterion)+'</strong><small>Débloquée le '+formatDate(a.unlocked_at,{day:'2-digit',month:'short',year:'numeric'})+'</small></div>').join('')||'<p class="muted">Aucune réussite débloquée pour le moment.</p>')+'</div></section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">VUE D’ENSEMBLE</p><h3>Thèmes travaillés</h3></div></div>'+(themeSummary||'<p class="muted">Aucun critère détaillé enregistré.</p>')+'</section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">CHRONOLOGIE COMPLÈTE</p><h3>Parcours du joueur</h3></div><span class="tag">'+journeyEvents.length+' événement(s)</span></div><p class="tiny muted">Séances, bilans, réussites, défis et suivis vidéo réunis dans l’ordre chronologique.</p><div class="journey-timeline profile-journey-timeline">'+(journeyMarkup||'<p class="muted">Le parcours apparaîtra au fil des séances et des bilans.</p>')+'</div></section>'+  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">JOURNAL SPORTIF</p><h3>Historique des bilans</h3></div><span class="tag">'+reports.length+'</span></div>'+(historyReports||'<p class="muted">Aucun bilan enregistré.</p>')+'</section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">TRAVAIL SUR LE COURT</p><h3>Historique des séances</h3></div><span class="tag">'+sessions.length+'</span></div>'+(historySessions||'<p class="muted">Aucune séance.</p>')+'</section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">ESPACE CONFIDENTIEL</p><h3>Notes privées du coach</h3></div><span class="tag">Privé</span></div>'+(privateNotes||'<p class="muted">Aucune note privée enregistrée.</p>')+'</section>');
}

function challengeDialog(playerId, criterion, criterionId){
  const player=state.players.find(row=>row.id===playerId); if(!player)return;
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">DÉFI PERSONNALISÉ</p><h2>${escapeHtml(player.first_name)} ${escapeHtml(player.last_name)}</h2></div><button class="btn icon-btn" data-close>✕</button></div><form id="challenge-form" class="form-grid"><input type="hidden" name="player_id" value="${playerId}"><input type="hidden" name="criterion" value="${escapeHtml(criterion)}"><input type="hidden" name="criterion_id" value="${escapeHtml(criterionId||'')}"><label class="span-2">Critère prioritaire<input value="${escapeHtml(criterion)}" disabled></label><label class="span-2">Objectif concret et mesurable<textarea name="objective" rows="3" required placeholder="Ex. Réussir 8 retours sur 10 dans la zone ciblée"></textarea></label><label>Opérateur<select name="comparison_operator"><option value="gte">Atteindre ou dépasser</option><option value="lte">Être inférieur ou égal</option><option value="eq">Atteindre exactement</option></select></label><label>Valeur cible numérique<input type="number" name="target_value" step="0.1" required placeholder="Ex. 8"></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Créer le défi</button></div></form>`);
}
function inviteCoachDialog(){
 showDialog(`<div class="dialog-head"><div><p class="eyebrow">ADMINISTRATION</p><h2>Inviter un coach</h2></div><button class="btn icon-btn" data-close>✕</button></div><p class="muted">Le coach recevra un e-mail d’invitation pour créer son accès.</p><form id="invite-coach-form" class="form-grid"><label>Prénom<input name="first_name" required></label><label>Nom<input name="last_name" required></label><label class="span-2">Adresse e-mail<input type="email" name="email" required></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Envoyer l’invitation</button></div></form>`);
}
async function setCoachState(action,id){try{const {error}=await supabase.functions.invoke('manage-coaches',{body:{action,coach_id:id}});if(error)throw error;toast(action==='archive'?'Compte coach suspendu.':'Compte coach réactivé.');await refreshAndRender();}catch(e){toast(e.message||'Action impossible.','error');}}

function availabilityDialog(){
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">DISPONIBILITÉS</p><h2>Ajouter une plage réservable</h2></div><button class="btn icon-btn" data-close>✕</button></div><p class="muted">Les joueurs associés pourront demander un cours uniquement dans ces horaires.</p><form id="availability-form" class="form-grid"><label>Jour<select name="weekday" required><option value="" selected disabled>Choisir un jour</option><option value="1">Lundi</option><option value="2">Mardi</option><option value="3">Mercredi</option><option value="4">Jeudi</option><option value="5">Vendredi</option><option value="6">Samedi</option></select></label><label>Terrain<select name="court_number"><option value="">Tous les terrains</option><option value="1">Terrain 1</option><option value="2">Terrain 2</option><option value="3">Terrain 3</option><option value="4">Terrain 4</option></select></label><label>Début<input type="time" name="start_time" required value="08:00"></label><label>Fin<input type="time" name="end_time" required value="16:00"></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Publier la disponibilité</button></div></form>`);
}
async function deleteAvailability(id){try{await dataService.deleteAvailability(id,state.user.id);toast('Disponibilité supprimée.');await refreshAndRender();}catch(e){toast(e.message||'Suppression impossible.','error');}}

function groupSeriesDialog(seriesId=''){
  const series=state.groupSeries.find(x=>x.id===seriesId)||{}; const editing=Boolean(seriesId);
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">PARAMÉTRAGE ANNUEL</p><h2>${editing?'Modifier le créneau annuel':'Ajouter un créneau collectif'}</h2></div><button class="btn icon-btn" data-close>✕</button></div><p class="muted">Crée un compteur indépendant pour chaque bloc orange. Renseigne les horaires et le court du créneau collectif.</p><form id="group-series-form" class="form-grid"><input type="hidden" name="id" value="${seriesId}"><label class="span-2">Nom du créneau<input name="title" required value="${escapeHtml(series.title||'')}" placeholder="Ex. Cours adultes débutants"></label><input type="hidden" name="audience" value="${series.audience||'adultes'}" ${editing?'':'disabled'}><label>Public<select name="${editing?'audience_display':'audience'}" ${editing?'disabled':''}><option value="adultes" ${series.audience==='adultes'?'selected':''}>Adultes · objectif 28</option><option value="enfants" ${series.audience==='enfants'?'selected':''}>Enfants · objectif 30</option></select></label><input type="hidden" name="weekday" value="${series.weekday||1}" ${editing?'':'disabled'}><label>Jour<select name="${editing?'weekday_display':'weekday'}" ${editing?'disabled':''}><option value="1" ${Number(series.weekday)===1?'selected':''}>Lundi</option><option value="2" ${Number(series.weekday)===2?'selected':''}>Mardi</option><option value="3" ${Number(series.weekday)===3?'selected':''}>Mercredi</option><option value="4" ${Number(series.weekday)===4?'selected':''}>Jeudi</option><option value="5" ${Number(series.weekday)===5?'selected':''}>Vendredi</option><option value="6" ${Number(series.weekday)===6?'selected':''}>Samedi</option></select></label><label>Début<input name="start_time" type="time" required value="${series.start_time||''}"></label><label>Fin<input name="end_time" type="time" required value="${series.end_time||''}"></label><label>Court<select name="court_number"><option value="1" ${Number(series.court_number)===1?'selected':''}>Court 1</option><option value="2" ${Number(series.court_number)===2?'selected':''}>Court 2</option><option value="3" ${Number(series.court_number)===3?'selected':''}>Court 3</option><option value="4" ${Number(series.court_number)===4?'selected':''}>Court 4</option></select></label><label>Objectif annuel<input name="target_sessions" type="number" min="1" value="${series.target_sessions||28}" required></label><label class="span-2">Thème / précision<input name="theme" value="${escapeHtml(series.theme||'')}" placeholder="Facultatif"></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">${editing?'Enregistrer le créneau':'Créer le compteur'}</button></div></form>`);
}

function groupSessionDialog(sessionId=''){
  const session=state.groupSessions.find(x=>x.id===sessionId)||{}; const editing=Boolean(sessionId);
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">COURS COLLECTIF</p><h2>${editing?'Modifier ce cours':'Ajouter un cours collectif'}</h2></div><button class="btn icon-btn" data-close>✕</button></div><form id="group-session-form" class="form-grid"><input type="hidden" name="id" value="${sessionId}"><label class="span-2">Intitulé<input name="title" required value="${escapeHtml(session.title||'')}" placeholder="Ex. Entraînement adultes"></label><label>Date<input name="session_date" type="date" required value="${session.session_date||toLocalISO(new Date())}"></label><label>Public<select name="audience"><option value="adultes" ${session.audience==='adultes'?'selected':''}>Adultes</option><option value="enfants" ${session.audience==='enfants'?'selected':''}>Enfants</option></select></label><label>Début<input name="start_time" type="time" required value="${session.start_time||'18:00'}"></label><label>Fin<input name="end_time" type="time" required value="${session.end_time||'19:30'}"></label><label>Court<select name="court_number"><option value="1" ${Number(session.court_number)===1?'selected':''}>Court 1</option><option value="2" ${Number(session.court_number)===2?'selected':''}>Court 2</option><option value="3" ${Number(session.court_number)===3?'selected':''}>Court 3</option><option value="4" ${Number(session.court_number)===4?'selected':''}>Court 4</option></select></label><label>Thème<input name="theme" value="${escapeHtml(session.theme||'')}"></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">${editing?'Enregistrer les modifications':'Enregistrer'}</button></div></form>`);
}
function bookingDialog(){
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">COURS PARTICULIER</p><h2>Demander un créneau</h2></div><button class="btn icon-btn" data-close>✕</button></div><p class="muted">Choisis une date, une heure, une durée et un court. Le créneau sera soumis au contrôle des conflits puis restera en attente de validation.</p><form id="booking-form" class="form-grid"><label class="span-2">Coach<select name="coach_id" required>${(state.playerCoaches||[]).map(c=>`<option value="${c.id}">${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</option>`).join('')}</select></label><label>Date<input name="date" type="date" required min="${toLocalISO(new Date())}"></label><label>Heure<input name="time" type="time" required></label><label>Durée<select name="duration"><option value="60">1 heure</option><option value="90">1 h 30</option><option value="120">2 heures</option></select></label><label>Court<select name="court"><option value="1">Court 1</option><option value="2">Court 2</option><option value="3">Court 3</option><option value="4">Court 4</option></select></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Envoyer la demande</button></div></form>`);
}
function sharePlayerDialog(playerId){
  const player=state.players.find(item=>item.id===playerId); if(!player)return;
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">DOSSIER PARTAGÉ</p><h2>Partager ${escapeHtml(player.first_name)} ${escapeHtml(player.last_name)}</h2></div><button class="btn icon-btn" data-close>✕</button></div><p class="muted">Le coach invité devra accepter. Après acceptation, il accédera à la fiche d’identité du joueur et créera son propre suivi. Tes séances, bilans et notes privées resteront visibles uniquement par toi.</p><form id="share-player-form" class="stack"><input type="hidden" name="player_id" value="${player.id}"><label>E-mail du coach<input type="email" name="coach_email" required placeholder="coach@email.fr"></label><div class="dialog-actions"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Envoyer l’invitation</button></div></form>`);
}
function addPlayerDialog(){
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">EFFECTIF</p><h2>Associer un joueur</h2></div><button class="btn icon-btn" data-close>✕</button></div><p class="muted">Le joueur doit avoir créé et confirmé son compte avec cette adresse e-mail. Pour créer un compte à sa place, il faudra une fonction d’invitation sécurisée côté serveur.</p><form id="associate-form" class="stack"><label>E-mail du joueur<input type="email" name="email" required placeholder="joueur@email.fr"></label><div class="dialog-actions"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Rechercher et associer</button></div></form>`);
}
function editPlayerDialog(id){
  const p=state.players.find(x=>x.id===id);if(!p)return;
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">FICHE JOUEUR</p><h2>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</h2></div><button class="btn icon-btn" data-close>✕</button></div><form id="player-form" class="form-grid"><input type="hidden" name="id" value="${p.id}"><label>Prénom<input name="first_name" required value="${escapeHtml(p.first_name)}"></label><label>Nom<input name="last_name" required value="${escapeHtml(p.last_name)}"></label><label>Date de naissance<input type="date" name="birth_date" value="${p.birth_date||''}"></label><label>Classement FFT<input name="fft_ranking" value="${escapeHtml(p.fft_ranking||'')}"></label><label>Catégorie d’âge<input name="age_category" value="${escapeHtml(p.age_category||'')}" placeholder="À calculer selon la saison FFT"></label><label>Profil<select name="player_type"><option ${p.player_type==='Loisir'?'selected':''}>Loisir</option><option ${p.player_type==='Compétition'?'selected':''}>Compétition</option></select></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Enregistrer la fiche</button></div></form>`);
}

$('#dialog-content').addEventListener('click',event=>{if(event.target.closest('[data-close]'))closeDialog();});
$('#dialog-content').addEventListener('change',event=>{if(['theme','level','exercise_one'].includes(event.target.name)&&event.target.form?.id==='session-builder-form')updateSessionBuilderExerciseOptions();if(event.target.name==='audience' && event.target.form?.id==='group-series-form'){const target=event.target.form.elements.target_sessions;const weekday=event.target.form.elements.weekday;if(target)target.value=event.target.value==='adultes'?28:30;if(weekday)weekday.value=event.target.value==='adultes'?'1':'3';}if(event.target.name==='birth_date'){ const category=$('#player-form [name=age_category]');if(category)category.value=calculateAgeCategory(event.target.value, new Date().getFullYear());}if(event.target.matches('input[name=criterion]')){const row=event.target.closest('.criterion-measure-row');const measure=row?.querySelector('.criterion-measure');if(measure)measure.disabled=!event.target.checked;}});
$('#dialog-content').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;
  if(form.dataset.submitting==='true')return;
  form.dataset.submitting='true';
  const submitButtons=[...form.querySelectorAll('button[type="submit"],button:not([type])')];
  submitButtons.forEach(button=>{button.dataset.originalText=button.textContent;button.disabled=true;button.textContent='Enregistrement…';});
  const values=Object.fromEntries(new FormData(form));
  try{
    if(form.id==='session-review-form'){
      const session=state.sessions.find(row=>row.id===values.session_id);
      if(!session)throw new Error('Séance introuvable. Actualise la page.');
      const attempts=Number(values.attempts),successes=Number(values.successes),rating=Number(values.coach_rating);
      if(!Number.isInteger(attempts)||attempts<1||attempts>50||!Number.isInteger(successes)||successes<0||successes>attempts)throw new Error('Les réussites doivent être comprises entre 0 et le nombre de tentatives.');
      if(!Number.isInteger(rating)||rating<1||rating>10)throw new Error('Choisis une note entre 1 et 10.');
      const targetMatch=String(session.exercise_2||'').match(/(?:Critère de réussite|RÉUSSITE)\\s*[·:]\\s*([^\\n]+)/i);const review={objective:session.theme||'Séance',success_criterion:targetMatch?.[1]||'',successes,attempts,coach_rating:rating,observation:String(values.observation||'').trim(),next_adjustment:String(values.next_adjustment||'').trim(),reviewed_at:new Date().toISOString()};
      await dataService.saveSessionReview(session.id,state.user.id,review);
      toast('Bilan enregistré. La prochaine séance sera adaptée à ces résultats.');
    } else if(form.id==='notification-preferences-form'){
      const preferences=Object.fromEntries(['booking_requests','booking_decisions','booking_changes','reminders_24h','messages','progress','session_changes'].map(key=>[key,form.elements[key].checked]));
      state.notificationPreferences=await notificationService.savePreferences(state.user.id,preferences);
      toast('Préférences de notifications enregistrées.');
    } else if(form.id==='message-form'){
      const file=form.elements.attachment.files[0]||null;
      await dataService.sendMessage({coachId:state.profile.role==='coach'?state.user.id:values.coach_id,playerId:state.profile.role==='coach'?values.player_id:state.user.id,senderId:state.user.id,body:values.body.trim(),file});
      toast('Message envoyé.');
    } else if(form.id==='invite-coach-form'){
      const {error}=await supabase.functions.invoke('manage-coaches',{body:{action:'invite',email:values.email,first_name:values.first_name,last_name:values.last_name}});if(error)throw error;toast('Invitation envoyée au coach.');
    } else if(form.id==='availability-form'){
      if(values.end_time<=values.start_time) throw new Error('L’heure de fin doit être après l’heure de début.');
      await dataService.createAvailability({coach_id:state.user.id,weekday:Number(values.weekday),start_time:values.start_time,end_time:values.end_time,court_number:values.court_number?Number(values.court_number):null,active:true});
      toast('Disponibilité ajoutée. Les joueurs associés pourront demander ces créneaux.');
    } else if(form.id==='booking-form'){
      await bookingService.request({coachId:values.coach_id,date:values.date,time:values.time,duration:values.duration,court:values.court});toast('Demande envoyée. Elle est en attente de validation.');
    } else if(form.id==='share-player-form'){
      await dataService.inviteCoachToPlayer(values.player_id,values.coach_email.trim().toLowerCase());toast('Invitation envoyée au coach. Le partage sera actif après son acceptation.');
    } else if(form.id==='group-series-form'){
      const weekday=Number(values.weekday), audience=values.audience;
      const allowed=audience==='adultes'?[1,2,4,5]:[3,6]; if(!allowed.includes(weekday)) throw new Error('Ce jour ne correspond pas au public choisi.');
      if(values.end_time<=values.start_time) throw new Error('L’heure de fin doit être après l’heure de début.');
      const seriesPayload={title:values.title.trim(),audience,weekday,start_time:values.start_time,end_time:values.end_time,court_number:Number(values.court_number),target_sessions:Number(values.target_sessions),theme:values.theme||''};
      if(values.id){await dataService.updateGroupSeries(values.id,seriesPayload,state.user.id);toast('Créneau annuel et séances futures actualisés.');}
      else{await dataService.createGroupSeries({coach_id:state.user.id,...seriesPayload});toast('Créneau annuel créé. Tu peux maintenant générer ses dates.');}
    } else if(form.id==='group-session-form'){
      if(values.end_time<=values.start_time) throw new Error('L’heure de fin doit être après l’heure de début.');
      if(values.session_date>=GROUP_SEASON.start&&values.session_date<=GROUP_SEASON.end&&!isTeachingDate(values.session_date,values.audience)) throw new Error('Ce cours collectif ne peut pas être programmé ce jour : vérifie le jour autorisé, les vacances Zone B et les jours fériés.');
      if(values.session_date>=GROUP_SEASON.start&&values.session_date<=GROUP_SEASON.end&&!isWithinTeachingWindow(values.session_date,values.start_time,values.end_time)) throw new Error('Les cours enfants doivent respecter les horaires du mercredi (9 h 30–18 h) ou du samedi (9 h 30–14 h 30).');
      const groupDuration=timeToMinutes(values.end_time)-timeToMinutes(values.start_time);
      const conflict=findScheduleConflict({session_date:values.session_date,session_time:values.start_time,duration_minutes:groupDuration,excludeGroupId:values.id});
      if(conflict)throw new Error('Ce créneau chevauche déjà '+conflict+'. Choisis un autre horaire.');
      const groupPayload={title:values.title.trim(),theme:values.theme||'',session_date:values.session_date,start_time:values.start_time,end_time:values.end_time,court_number:Number(values.court_number),audience:values.audience};
      if(values.id){await dataService.updateGroupSession(values.id,groupPayload,state.user.id);toast('Cours collectif modifié.');}
      else{await dataService.createGroupSession({coach_id:state.user.id,...groupPayload,status:'scheduled'});toast('Cours collectif ajouté au planning.');}
    } else if(form.id==='session-form'){
      if(!isPrivateLessonDateAllowed(values.session_date)) throw new Error('Les cours particuliers sont suspendus pendant les vacances scolaires et les jours fériés (sauf le 8 mai).');
      const conflict=findScheduleConflict({session_date:values.session_date,session_time:values.session_time,duration_minutes:Number(values.duration_minutes)});
      if(conflict)throw new Error('Ce créneau chevauche déjà '+conflict+'. Choisis un autre horaire.');
      const payload={...values,player_id:values.player_id,created_by:state.user.id,duration_minutes:Number(values.duration_minutes),court_number:Number(values.court_number),status:'Prévue'};
      await dataService.createSession(payload);toast('Séance enregistrée.');
    } else if(form.id==='evaluation-form'){
      const keys=['technical_score','tactical_score','physical_score','mental_score'];
      const scores=Object.fromEntries(keys.map(k=>[k,values[k]===''?null:Number(values[k])]));
      const selected=[...form.querySelectorAll('input[name=criterion]:checked')].map(input=>{
        const item=state.criteria.find(x=>x.id===input.value); if(!item)return null;
        const measured=form.elements[`measure_${item.id}`]?.value ?? '';
        return {criterion_id:item.id,main_theme:item.main_theme,subtheme:item.subtheme,criterion:item.criterion,criterion_type:item.criterion_type,measured_value:measured};
      }).filter(Boolean);
      if(selected.length && form.dataset.criteriaConfirmed!=='true') throw new Error('Valide ta sélection de critères avant d’enregistrer le bilan.');
      if(!hasEvaluationContent(scores,selected)) throw new Error('Renseigne au moins une note ou sélectionne un critère observé.');
      await progressionService.saveEvaluation({playerId:values.player_id,coachId:state.user.id,scores,selectedCriteria:selected});
      toast('Bilan enregistré. Les réussites et le défi actif ont été actualisés.');
    } else if(form.id==='library-form'){
      if(values.illustration_url && !/^https:\/\//i.test(values.illustration_url)) throw new Error('L’illustration doit utiliser une adresse HTTPS.');
      const payload={
        coach_id:state.user.id, category:values.category, title:values.title.trim(),
        theme:values.theme.trim(), subtheme:values.subtheme.trim(), level:values.level.trim()||'Tous niveaux',
        keywords:values.keywords.split(',').map(x=>x.trim()).filter(Boolean),
        objective:values.objective.trim(), equipment:values.equipment.trim(), setup:values.setup.trim(),
        instructions:values.instructions.trim(), rotations:values.rotations.trim(), variations:values.variations.trim(),
        duration_minutes:values.duration_minutes?Number(values.duration_minutes):null,
        court_number:values.court_number?Number(values.court_number):null,
        source_week:values.source_week?Number(values.source_week):null,
        illustration_url:values.illustration_url.trim()||null
      };
      if(values.id) await dataService.updateLibraryItem(values.id,payload,state.user.id);
      else await dataService.createLibraryItem(payload);
      toast(values.id?'Séance mise à jour.':'Séance ajoutée à la bibliothèque.');
    } else if(form.id==='challenge-form'){
      const playerId=values.player_id;
      const reportIds=new Set(state.evaluations.filter(row=>row.player_id===playerId).map(row=>row.id));
      const rows=state.evaluationCriteria.filter(row=>reportIds.has(row.evaluation_id));
      const unlocked=state.achievements.filter(row=>row.player_id===playerId).map(row=>row.criterion_id);
      const suggested=recommendChallenge(rows,unlocked);
      if(!suggested || suggested.criterion_id!==values.criterion_id) throw new Error('La priorité a changé. Actualise la page avant de créer le défi.');
      const target=Number(values.target_value); if(!Number.isFinite(target)) throw new Error('Saisis un objectif numérique.');
      const {error}=await supabase.from('player_challenges').insert({coach_id:state.user.id,player_id:playerId,criterion_id:values.criterion_id||null,criterion:values.criterion,objective:values.objective.trim(),comparison_operator:values.comparison_operator,target_value:target,current_value:null,status:'active'}); if(error)throw error; toast('Défi créé.');
    } else if(form.id==='associate-form'){
    
const email = String(values.email).trim().toLowerCase();

const { data: playerId, error } = await supabase.rpc(
  'add_existing_player_to_coach',
  { p_player_email: email }
);

if (error) throw error;

toast('Joueur ajouté à ton effectif.');

    } else if(form.id==='player-form'){
      const {id,...changes}=values;await dataService.updatePlayer(id,{...changes,first_name:changes.first_name.trim(),last_name:changes.last_name.trim()});toast('Fiche joueur mise à jour.');
    }
    closeDialog();await refreshAndRender();
  }catch(error){
    form.dataset.submitting='false';
    submitButtons.forEach(button=>{button.disabled=false;button.textContent=button.dataset.originalText||'Enregistrer';});
    toast(error.message||'Une erreur est survenue.','error');
  }
});

function timeToMinutes(value){
  const [hours,minutes]=String(value||'00:00').slice(0,5).split(':').map(Number);
  return (Number.isFinite(hours)?hours:0)*60+(Number.isFinite(minutes)?minutes:0);
}

function findScheduleConflict({session_date,session_time,duration_minutes,excludeGroupId=null}){
  const start=timeToMinutes(session_time),end=start+Number(duration_minutes||0);
  if(!session_date||end<=start)return null;
  const events=[
    ...(state.sessions||[]).filter(row=>row.session_date===session_date&&!['cancelled','annulée','annulee'].includes(String(row.status||'').toLowerCase())).map(row=>({
      start:timeToMinutes(row.session_time),end:timeToMinutes(row.session_time)+Number(row.duration_minutes||60),
      label:'un cours particulier ('+((state.players||[]).find(player=>player.id===row.player_id)?.first_name||'joueur')+')'
    })),
    ...(state.groupSessions||[]).filter(row=>row.session_date===session_date&&row.status!=='cancelled'&&row.id!==excludeGroupId).map(row=>({
      start:timeToMinutes(row.start_time),end:timeToMinutes(row.end_time),
      label:'un cours collectif (« '+(row.title||'cours collectif')+' »)'
    })),
    ...(state.bookingRequests||[]).filter(row=>row.session_date===session_date&&(row.start_time||row.session_time)&&['pending','accepted','confirmed'].includes(String(row.status||'').toLowerCase())).map(row=>({
      start:timeToMinutes(row.start_time||row.session_time),
      end:timeToMinutes(row.start_time||row.session_time)+Number(row.duration_minutes||row.duration||60),
      label:'une réservation '+(String(row.status).toLowerCase()==='pending'?'en attente':'confirmée')
    }))
  ];
  const conflict=events.find(event=>event.end>event.start&&start<event.end&&event.start<end);
  return conflict?.label||null;
}

async function updateBooking(id,status){
  try{await bookingService.review(id,status);toast(status==='accepted'?'Demande acceptée.':'Demande refusée.');await refreshAndRender();}catch(e){toast(e.message,'error');}
}
async function generateGroupSeries(id){
  try{
    const series=state.groupSeries.find(row=>row.id===id); if(!series)throw new Error('Créneau introuvable.');
    const all=buildSeriesOccurrences(series);
    const existing=new Set(state.groupSessions.filter(row=>row.series_id===id).map(row=>row.session_date));
    const missing=all.filter(row=>!existing.has(row.session_date));
    if(!missing.length){toast('Toutes les dates de la saison sont déjà générées.');return;}
    const conflicts=missing.filter(row=>findScheduleConflict({
      session_date:row.session_date,
      session_time:row.start_time,
      duration_minutes:timeToMinutes(row.end_time)-timeToMinutes(row.start_time)
    }));
    if(conflicts.length){
      toast('Certaines dates de cette série chevauchent déjà un cours ou une réservation. Modifie le créneau avant de générer la saison.','error');
      return;
    }
    await dataService.createGroupSessionsBatch(missing);
    toast(`${missing.length} dates ajoutées au planning pour « ${series.title} ».`); await refreshAndRender();
  }catch(error){toast(error.message||'Impossible de générer les dates.','error');}
}
async function cancelGroupSession(id){
  try{const {error}=await supabase.from('group_sessions').update({status:'cancelled'}).eq('id',id).eq('coach_id',state.user.id);if(error)throw error;toast('Cours collectif annulé.');await refreshAndRender();}catch(e){toast(e.message,'error');}
}
async function cancelBooking(id){
  try{await bookingService.cancel(id);toast('Réservation annulée.');await refreshAndRender();}catch(e){toast(e.message,'error');}
}
async function markNotificationRead(id){
  try{if(state.profile.role==='coach')await notificationService.markCoachRead(id);else await notificationService.markPlayerRead(id);await refreshAndRender();render('notifications');}catch(e){toast(e.message,'error');}
}
async function markVisibleConversationRead(){
  if(state.currentPage!=='messages'||!state.messagePartnerId)return;
  const incoming=(state.messages||[]).filter(m=>m.sender_id!==state.user.id&&!m.read_at&&(state.profile.role==='coach'?m.player_id===state.messagePartnerId:m.coach_id===state.messagePartnerId));
  for(const message of incoming){try{await dataService.markMessageRead(message.id);message.read_at=new Date().toISOString();}catch(error){toast(error.message||'Lecture du message impossible.','error');}}
  if(incoming.length&&state.currentPage==='messages')render('messages');
}
function filterLibrary(){
  const normalize=value=>String(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const q=normalize($('#library-search')?.value||'');
  const category=$('#library-category')?.value||'all', theme=$('#library-theme')?.value||'all', level=$('#library-level')?.value||'all';
  const list=libraryItemsForCoach().filter(x=>(category==='all'||x.category===category)&&(theme==='all'||x.theme===theme)&&(level==='all'||x.level===level)&&normalize([x.title,x.theme,x.subtheme,x.level,x.objective,x.equipment,x.setup,x.instructions,x.rotations,x.variations,(x.keywords||[]).join(' ')].join(' ')).includes(q)).sort((a,b)=>String(a.title).localeCompare(String(b.title),'fr'));
  const target=$('#library-results');
  if(target){let previous='';target.innerHTML=list.map(item=>{const letter=(String(item.title||'#').trim()[0]||'#').toLocaleUpperCase('fr');const heading=letter!==previous?'<h3 class="library-letter-heading">'+escapeHtml(letter)+'</h3>':'';previous=letter;return heading+libraryCard(item);}).join('')||'<p class="muted">Aucun exercice correspondant.</p>';}
  const count=$('.library-count-line span');if(count)count.textContent=list.length+' contenu(s) affiché(s)';
}
async function revokeCoachShare(id,playerId){
 try{await dataService.revokeCoachPlayerInvitation(id);toast('Accès du coach retiré.');await refreshAndRender();playerSheetDialog(playerId);}
 catch(error){toast(error.message||'Impossible de retirer cet accès.','error');}
}
async function respondCoachInvitation(id, accept){
  try{await dataService.respondToCoachInvitation(id,accept);toast(accept?'Partage accepté : le dossier joueur est maintenant accessible.':'Invitation refusée.');await refreshAndRender();}catch(error){toast(error.message||'Impossible de traiter cette invitation.','error');}
}
async function refreshAndRender(){
  const isAdmin=state.profile.is_admin===true||state.profile.role==='admin';
  if(state.profile.role==='coach')await dataService.loadCoachWorkspace(state.user.id);
  else if(!isAdmin)await dataService.loadPlayerWorkspace();
  if(isAdmin)await dataService.loadAdminWorkspace();
  render(state.currentPage);
}

async function refreshNotificationsOnly(){
  if(notificationRefreshPromise)return notificationRefreshPromise;
  notificationRefreshPromise=(async()=>{
    const rows=state.profile.role==='coach'
      ?await notificationService.listCoach()
      :await notificationService.listPlayer();
    state.notifications=rows;
    if(state.currentPage==='notifications')render('notifications');
  })();
  try{return await notificationRefreshPromise;}
  finally{notificationRefreshPromise=null;}
}

async function refreshMessagesOnly(){
  if(messageRefreshPromise)return messageRefreshPromise;
  messageRefreshPromise=(async()=>{
    state.messages=await dataService.loadMessagesForCurrentUser();
    if(state.currentPage==='messages')render('messages');
  })();
  try{return await messageRefreshPromise;}
  finally{messageRefreshPromise=null;}
}

function stopRealtimeChannels(){
  if(messageChannel){const channel=messageChannel;messageChannel=null;supabase.removeChannel(channel);}
  if(notificationChannel){const channel=notificationChannel;notificationChannel=null;supabase.removeChannel(channel);}
  messageRetryCount=0;notificationRetryCount=0;
}

supabase.auth.onAuthStateChange((_event,session)=>{
  if(session?.user){
    window.setTimeout(()=>loadWorkspace().catch(error=>showAuth(`Erreur de chargement : ${error.message}`)),0);
  }else{
    stopRealtimeChannels();
    resetState();
    showAuth();
  }
});
supabase.auth.getSession().then(({data,error})=>{if(error)return showAuth(error.message);if(data.session)loadWorkspace().catch(e=>showAuth(`Erreur de chargement : ${e.message}`));else showAuth();});


async function loadWeatherForecast(){
 const panel=$('#weather-panel'); if(!panel)return;
 const request=++weatherRequest;
 const summary=$('#weather-summary'); if(summary)summary.textContent='Chargement des prévisions de pluie…';
 try{
  const url='https://api.open-meteo.com/v1/forecast?latitude=43.282&longitude=5.516&current=temperature_2m,weather_code&hourly=precipitation_probability,precipitation,weather_code&forecast_days=2&timezone=Europe%2FParis';
  const response=await fetch(url); if(!response.ok)throw new Error('Prévisions indisponibles');
  const data=await response.json(); if(request!==weatherRequest||state.currentPage!=='planning')return;
  const now=Date.now(); const times=data.hourly.time||[];
  const next=times.map((time,index)=>({time,index,stamp:new Date(time).getTime(),prob:Number(data.hourly.precipitation_probability?.[index]||0),rain:Number(data.hourly.precipitation?.[index]||0)})).filter(row=>row.stamp>=now&&row.stamp<=now+8*3600000);
  const max=next.reduce((best,row)=>row.prob>best.prob?row:best,{prob:0,rain:0,time:''});
  const fmt=time=>new Date(time).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  const current=data.current||{};
  const title=$('#weather-title'); if(title)title.textContent=(current.temperature_2m??'—')+' °C · '+weatherDescription(current.weather_code);
  if(summary)summary.textContent=next.length?('Sur les 8 prochaines heures : risque maximal de pluie '+max.prob+' %'+(max.time?' vers '+fmt(max.time):'')+'. '+(max.rain>0?'Précipitations prévues : '+max.rain.toFixed(1)+' mm sur l’heure la plus arrosée.':'Pas de pluie horaire significative indiquée.')):'Prévisions horaires indisponibles pour les prochaines heures.';
 }catch(error){if(request===weatherRequest&&state.currentPage==='planning'&&summary)summary.textContent='La météo ne peut pas être chargée pour le moment. Le planning reste disponible.';}
}
function weatherDescription(code){const c=Number(code);if(c===0)return'ciel dégagé';if([1,2,3].includes(c))return'nuageux';if([45,48].includes(c))return'brouillard';if([51,53,55,56,57].includes(c))return'bruine';if([61,63,65,66,67,80,81,82].includes(c))return'pluie';if([71,73,75,77,85,86].includes(c))return'neige';if([95,96,99].includes(c))return'orage';return'conditions météo';}


function subscribeToNotifications(){
 if(notificationChannel||!state.user||!state.profile)return;
 const isCoach=state.profile.role==='coach';
 const table=isCoach?'coach_notifications':'player_notifications';
 const field=isCoach?'coach_id':'player_id';
 const channel=supabase.channel('coach-in-notifications-'+state.user.id)
  .on('postgres_changes',{event:'INSERT',schema:'public',table,filter:field+'=eq.'+state.user.id},()=>{
   refreshNotificationsOnly().catch(error=>toast(error.message||'Actualisation des notifications impossible.','error'));
  });
 notificationChannel=channel;
 channel.subscribe(status=>{
  if(status==='SUBSCRIBED')notificationRetryCount=0;
  if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)&&notificationChannel===channel){
   notificationChannel=null;
   if(notificationRetryCount<3){
    notificationRetryCount++;
    window.setTimeout(()=>{if(state.user&&state.profile&&!notificationChannel)subscribeToNotifications();},1500*notificationRetryCount);
   }
  }
 });
}

function subscribeToMessages(){
 if(messageChannel||!state.user||!state.profile)return;
 const field=state.profile.role==='coach'?'coach_id':'player_id';
 const channel=supabase.channel('coach-in-messages-'+state.user.id)
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'coach_player_messages',filter:field+'=eq.'+state.user.id},()=>{
   if(state.currentPage==='messages')refreshMessagesOnly().catch(error=>toast(error.message||'Actualisation des messages impossible.','error'));
  })
  .on('postgres_changes',{event:'UPDATE',schema:'public',table:'coach_player_messages',filter:field+'=eq.'+state.user.id},payload=>{
   if(state.currentPage==='messages'&&payload?.new?.sender_id===state.user.id){
    refreshMessagesOnly().catch(error=>toast(error.message||'Actualisation des accusés de lecture impossible.','error'));
   }
  });
 messageChannel=channel;
 channel.subscribe(status=>{
  if(status==='SUBSCRIBED')messageRetryCount=0;
  if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)&&messageChannel===channel){
   messageChannel=null;
   if(messageRetryCount<3){
    messageRetryCount++;
    window.setTimeout(()=>{if(state.user&&state.profile&&state.currentPage==='messages'&&!messageChannel)subscribeToMessages();},1500*messageRetryCount);
   }
  }
 });
}
