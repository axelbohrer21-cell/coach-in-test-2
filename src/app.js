import { $, $$, escapeHtml, toast, showDialog, closeDialog, formatDate } from './core/dom.js';
import { state, resetState } from './core/state.js';
import { supabase } from './core/supabase.js';
import { authService } from './services/auth.js';
import { dataService } from './services/data.js';
import { pageMeta, renderPage, libraryItemsForCoach, libraryCard } from './views/pages.js';
import { bookingService } from './services/booking.js';
import { notificationService } from './services/notifications.js';
import { calculateAgeCategory, toLocalISO } from './domain/tennis.js';
import { PLAYER_COLORS } from './domain/player-colors.js';
import { isTeachingDate, isWithinTeachingWindow, isPrivateLessonDateAllowed, GROUP_SEASON } from './domain/group-calendar.js';
import { groupCriteria, recommendChallenge, hasEvaluationContent } from './domain/progression.js';
import { buildSeriesOccurrences } from './domain/group-series.js';
import { progressionService } from './services/progression.js';
import { recommendSessionExercises, buildMatchTransfer, buildSessionCoachingPlan } from './domain/session-recommendations.js';
import { generateOriginalSession } from './domain/session-generator.js';
import { OBJECTIVES, objectivesForTheme, findObjective } from './domain/session-curriculum.js';
import { buildPhysicalProgram, buildTemplateSession } from './domain/physical-training.js';
const coachObjectives=()=>state.sessionObjectives?.length?state.sessionObjectives:OBJECTIVES;
import { buildSessionProgression } from './domain/session-progression.js';
import { buildAdaptiveTrainingProgram } from './domain/intelligence.js';
import { analyzeVideoPose } from './domain/video-pose.js';
import { solveCourtHomography, calibratedFootDistances } from './domain/court-calibration.js';
const courtCalibrationSelections=new Map();

let signupMode = false;
let weatherRequest = 0;
let messageChannel = null;
let notificationChannel = null;
let notificationRefreshPromise = null;
let messageRefreshPromise = null;
let notificationRetryCount = 0;
let messageRetryCount = 0;
let videoCameraStream = null;
let videoCameraRecorder = null;
let videoCameraChunks = [];
const coachNav = [ ['dashboard','Vue d’ensemble','⌂'], ['intelligence','Intelligence','✦'], ['players','Joueurs','♙'], ['planning','Planning','▦'], ['group-calendar','Cours collectifs','◷'], ['sessions','Séances','◎'], ['physical','Prépa physique','↗'], ['videos','Analyse vidéo','▣'], ['reports','Évaluations','✦'], ['library','Bibliothèque','▤'], ['bookings','Réservations','◷'], ['notifications','Notifications','♧'], ['messages','Messages','✉'], ['club','Vie du club','♧'] ];
const adminNav = [ ['coaches','Gestion des coachs','♙'] ];
const playerNav = [ ['dashboard','Accueil','⌂'], ['planning','Planning des coachs','▦'], ['sessions','Séances','◎'], ['matches','Journal de match','▤'], ['videos','Vidéos','▣'], ['reports','Progression','↗'], ['club','Mon club','♧'], ['bookings','Réservations','◷'], ['notifications','Notifications','♢'], ['messages','Messages','✉'] ];

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
  if(page!=='videos') stopVideoCamera();
  const isCoach = state.profile?.role === 'coach';
  const isAdmin = state.profile?.is_admin === true || state.profile?.role === 'admin';
  const navItems = isCoach ? [...coachNav, ...(isAdmin ? adminNav : [])] : isAdmin ? [['coaches','Gestion des coachs','♙']] : playerNav;
  if (!navItems.some(item => item[0] === page)) page = 'dashboard';
  state.currentPage = page;
  subscribeToNotifications();
  $('#navigation').innerHTML = navItems.map(([key,label,icon]) => `<button class="nav-item ${key===page?'active':''}" data-page="${key}"><span>${icon}</span>${label}</button>`).join('');
  const [kicker,title,description] = pageMeta[page];
  $('#page-kicker').textContent=kicker; $('#page-title').textContent=title; $('#page-description').textContent=description;
  const showPlayerLogout = page==='dashboard' && !isCoach && !isAdmin;
  $('#page-actions').innerHTML = page==='players' && isCoach ? '<button class="btn primary" data-action="add-player">＋ Ajouter un joueur</button>' : showPlayerLogout ? '<button class="btn ghost" data-player-logout>↪ Déconnexion</button>' : '';
  $('#logout-mobile').hidden = !showPlayerLogout;
  $('#page-content').innerHTML=renderPage(page);
  if(page==='videos') initializeCourtCalibrationCanvases();
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

async function logoutCurrentAccount(){try{stopRealtimeChannels();await authService.signOut();resetState();showAuth();}catch(e){toast(e.message,'error');}}
$('#logout').addEventListener('click',logoutCurrentAccount);
$('#logout-mobile')?.addEventListener('click',logoutCurrentAccount);
$('#navigation').addEventListener('click',event=>{const button=event.target.closest('[data-page]');if(button)render(button.dataset.page);});
$('#page-actions').addEventListener('click', event => { if(event.target.closest('[data-player-logout]')) logoutCurrentAccount(); });

$('#page-actions').addEventListener('click', event => {
  const button = event.target.closest('[data-action="add-player"]');
  if (button) addPlayerDialog();
});

$('#page-content').addEventListener('submit',event=>{
 if(event.target?.id!=='physical-training-form')return;
 event.preventDefault();
 const form=new FormData(event.target);
 state.physicalTrainingPlan=buildPhysicalProgram({criteria:form.getAll('criteria'),groupSize:form.get('groupSize'),ageGroup:form.get('ageGroup'),level:form.get('level'),equipment:form.get('equipment')});
 render('physical');
});
$('#page-content').addEventListener('click',async event=>{
 const template=event.target.closest('[data-physical-template]');
 if(template){state.physicalTrainingPlan=buildTemplateSession(template.dataset.physicalTemplate,Number(template.dataset.physicalSession),{groupSize:6,ageGroup:'11-14',level:'intermediaire'});render('physical');return;}
 if(event.target.closest('[data-physical-reset]')){state.physicalTrainingPlan=null;render('physical');return;}
 if(event.target.closest('[data-physical-save]')){
  const plan=state.physicalTrainingPlan;if(!plan)return;
  try{const saved=await dataService.createPhysicalProgram({title:plan.title,program_type:plan.program_type||'generated',focus_criteria:plan.criteria||[],group_size:plan.groupSize,age_group:plan.ageGroup,level:plan.level,equipment:plan.equipment||'basic',duration_minutes:60,content:plan});state.physicalPrograms=[saved,...(state.physicalPrograms||[])];toast('Séance enregistrée dans ta bibliothèque.');render('physical');}catch(error){toast(error.message||'Impossible d’enregistrer la séance.','error');}return;
 }
 const open=event.target.closest('[data-physical-open]');
 if(open){const row=(state.physicalPrograms||[]).find(x=>x.id===open.dataset.physicalOpen);if(row){state.physicalTrainingPlan=row.content;render('physical');}return;}
 const remove=event.target.closest('[data-physical-delete]');
 if(remove){if(!confirm('Supprimer définitivement cette séance de ta bibliothèque ?'))return;try{await dataService.deletePhysicalProgram(remove.dataset.physicalDelete);state.physicalPrograms=(state.physicalPrograms||[]).filter(x=>x.id!==remove.dataset.physicalDelete);toast('Séance supprimée.');render('physical');}catch(error){toast(error.message||'Suppression impossible.','error');}}
});
$('#page-content').addEventListener('keydown', event=>{
  const card=event.target.closest('[data-calendar-event]');
  if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();card.click();}
});

$('#page-content').addEventListener('click', async event=>{
  const bookSlot=event.target.closest('[data-book-slot]');
  if(bookSlot){bookingDialog({coachId:bookSlot.dataset.coach,date:bookSlot.dataset.date,time:bookSlot.dataset.time,court:bookSlot.dataset.court});return;}
  const rosterCard=event.target.closest('[data-player-card-edit]');
  if(rosterCard&&!event.target.closest('button,a,label,input,select,textarea,[data-player-sheet],[data-edit-player],[data-share-player]')){editPlayerDialog(rosterCard.dataset.playerCardEdit);return;}
  const calibrationCanvas=event.target.closest('[data-court-calibration]');
  if(calibrationCanvas){addCourtCalibrationPoint(calibrationCanvas,event);return;}
  const calibrateButton=event.target.closest('[data-court-calibrate]');
  if(calibrateButton){await saveCourtCalibration(calibrateButton.dataset.analysisId);return;}
  if(event.target.closest('[data-camera-start]')){await startVideoCamera();return;}
  if(event.target.closest('[data-camera-record]')){if(videoCameraRecorder?.state==='recording')stopVideoRecording();else startVideoRecording();return;}
  if(event.target.closest('[data-camera-close]')){if(videoCameraRecorder?.state==='recording'){stopVideoRecording();return;}stopVideoCamera();const status=$('#camera-status');if(status)status.textContent='Caméra inactive';const start=$('[data-camera-start]');if(start)start.textContent='Ouvrir la caméra';return;}
  const deleteMatch=event.target.closest('[data-delete-match]');
  if(deleteMatch){
    if(!confirm('Supprimer ce match de ton journal personnel ?'))return;
    try{const {error}=await supabase.from('player_match_journal').delete().eq('id',deleteMatch.dataset.deleteMatch).eq('player_id',state.user.id);if(error)throw error;await refreshAndRender();toast('Match supprimé du journal.');}
    catch(error){toast(error.message||'Impossible de supprimer ce match.','error');}
    return;
  }
  const deleteClubEvent=event.target.closest('[data-delete-club-event]');
  if(deleteClubEvent){
    if(!confirm('Supprimer cet événement du club ?'))return;
    try{const {error}=await supabase.from('club_events').delete().eq('id',deleteClubEvent.dataset.deleteClubEvent).eq('created_by',state.user.id);if(error)throw error;await refreshAndRender();toast('Événement supprimé.');}
    catch(error){toast(error.message||'Impossible de supprimer cet événement.','error');}
    return;
  }

  const go=event.target.closest('[data-go]'); if(go){render(go.dataset.go);return;}
  const planSlot=event.target.closest('[data-plan-slot]'); if(planSlot)return sessionDialog(planSlot.dataset.slotDate,planSlot.dataset.slotTime);
  const share=event.target.closest('[data-share-player]'); if(share) return sharePlayerDialog(share.dataset.sharePlayer);
  const invitation=event.target.closest('[data-coach-invitation]'); if(invitation) return respondCoachInvitation(invitation.dataset.coachInvitation, invitation.dataset.accept==='true');
  const revokeShare=event.target.closest('[data-revoke-coach-share]'); if(revokeShare) return revokeCoachShare(revokeShare.dataset.revokeCoachShare,revokeShare.dataset.playerId);
  const favoriteSession=event.target.closest('[data-favorite-session]');
  if(favoriteSession){
    const sessionId=favoriteSession.dataset.favoriteSession;
    const isFavorite=(state.favoriteSessionIds||[]).includes(sessionId);
    favoriteSession.disabled=true;
    try{
      await dataService.setSessionFavorite(sessionId,!isFavorite,state.user.id);
      state.favoriteSessionIds=isFavorite?(state.favoriteSessionIds||[]).filter(id=>id!==sessionId):[...(state.favoriteSessionIds||[]),sessionId];
      render('sessions');toast(isFavorite?'Séance retirée des favoris.':'Séance ajoutée aux favoris.');
    }catch(error){favoriteSession.disabled=false;toast(error.message||'Impossible de modifier les favoris.','error');}
    return;
  }
  const duplicateSession=event.target.closest('[data-duplicate-session]');
  if(duplicateSession){
    const source=(state.sessions||[]).find(row=>row.id===duplicateSession.dataset.duplicateSession);
    if(!source){toast('Séance introuvable.','error');return;}
    sessionDialog(undefined,source.session_time||'17:00',{generated:true,player_id:source.player_id,duration_minutes:source.duration_minutes,theme:source.theme,exercise_1:source.exercise_1,exercise_2:source.exercise_2,player_visible_summary:source.player_visible_summary});
    return;
  }
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
  if(action==='new-coach-exercise') return coachExerciseDialog();
  const editCoachObjective=event.target.closest('[data-edit-coach-objective]'); if(editCoachObjective)return coachObjectiveDialog(editCoachObjective.dataset.editCoachObjective);
  const editCoachExercise=event.target.closest('[data-edit-coach-exercise]'); if(editCoachExercise)return coachExerciseDialog(editCoachExercise.dataset.editCoachExercise);
  const deleteCoachExercise=event.target.closest('[data-delete-coach-exercise]'); if(deleteCoachExercise){if(!confirm('Supprimer cet exercice de ta banque personnelle ?'))return;try{await dataService.deleteCoachSessionExercise(deleteCoachExercise.dataset.deleteCoachExercise);state.customSessionExercises=(state.customSessionExercises||[]).filter(row=>row.id!==deleteCoachExercise.dataset.deleteCoachExercise);render('library');toast('Exercice supprimé de ta banque.');}catch(error){toast(error.message||'Suppression impossible.','error');}return;}
  const editLibrary=event.target.closest('[data-edit-library]'); if(editLibrary) return libraryDialog(editLibrary.dataset.editLibrary);
  const addProgramItem=event.target.closest('[data-add-program-item]'); if(addProgramItem){const template=libraryItemsForCoach().find(item=>item.id===addProgramItem.dataset.addProgramItem);if(template)return libraryDialog('',template);}
  const useLibrary=event.target.closest('[data-use-library]'); if(useLibrary){const item=state.library.find(row=>row.id===useLibrary.dataset.useLibrary);if(item)return sessionDialog(undefined,undefined,item);}
  if(action==='add-player') return addPlayerDialog();
  const challenge=event.target.closest('[data-create-challenge]'); if(challenge) return challengeDialog(challenge.dataset.createChallenge, challenge.dataset.criterion, challenge.dataset.criterionId);
  const sheet=event.target.closest('[data-player-sheet]'); if(sheet) return playerSheetDialog(sheet.dataset.playerSheet);
  const edit=event.target.closest('[data-edit-player]'); if(edit) return editPlayerDialog(edit.dataset.editPlayer);
  const booking=event.target.closest('[data-booking]'); if(booking) return updateBooking(booking.dataset.booking,booking.dataset.status);
  const cancel=event.target.closest('[data-cancel-booking]'); if(cancel) return cancelBooking(cancel.dataset.cancelBooking);
  const completeGroup=event.target.closest('[data-complete-group]'); if(completeGroup) return completeGroupSession(completeGroup.dataset.completeGroup);
  const cancelGroup=event.target.closest('[data-cancel-group]'); if(cancelGroup) return cancelGroupSession(cancelGroup.dataset.cancelGroup);
  const cancelSession=event.target.closest('[data-cancel-session]');
  if(cancelSession)return cancelPrivateSession(cancelSession.dataset.cancelSession);
  const calendarEvent=event.target.closest('[data-calendar-event]');
  if(calendarEvent){
    if(calendarEvent.dataset.eventKind==='session')return sessionDialog(undefined,undefined,null,calendarEvent.dataset.eventId);
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
  const coachChoice=event.target.closest('[data-select-coach]'); if(coachChoice){state.selectedPlayerCoachId=coachChoice.dataset.selectCoach;render('planning');return;}
  const dayTab=event.target.closest('[data-planning-day]'); if(dayTab){state.planningDayIndex=Number(dayTab.dataset.planningDay);render(state.currentPage==='planning'?'planning':'bookings');return;}
  const week=event.target.closest('[data-week]'); if(week){state.planningWeekOffset=Number(week.dataset.week)===0?0:(state.planningWeekOffset||0)+Number(week.dataset.week);state.planningDayIndex=Math.max(0,Math.min(6,(new Date().getDay()+6)%7));render(state.currentPage==='planning'?'planning':'bookings');}
});
$('#dialog-content').addEventListener('click',async event=>{
  const personalizedSession=event.target.closest('[data-personalized-session]');
  if(personalizedSession){const programStep=personalizedSession.dataset.programObjective?{objective:personalizedSession.dataset.programObjective,title:personalizedSession.dataset.programTitle,stage:personalizedSession.dataset.programStage,exerciseId:personalizedSession.dataset.programExercise||null}:null;sessionBuilderDialog(personalizedSession.dataset.personalizedSession,personalizedSession.dataset.sessionDate,personalizedSession.dataset.sessionTime,Number(personalizedSession.dataset.sessionDuration)||90,programStep);return;}
  const exerciseOption=event.target.closest('[data-exercise-one-option]');
  if(exerciseOption&&generatedSessionPlan){
    const index=Number(exerciseOption.dataset.exerciseOneOption);
    const option=generatedSessionPlan.exercise_1_options?.[index];
    if(option){
      generatedSessionPlan.exercise_1=[generatedSessionPlan.exercise_1_corrective,option.formatted,generatedSessionPlan.exercise_1_options.filter((item,itemIndex)=>itemIndex!==index).map(item=>item.formatted||('EXERCICE · '+item.title+'\\n'+item.content)).join('\\n\\n'),generatedSessionPlan.coaching_notes,generatedSessionPlan.difficulty_note].filter(Boolean).join('\\n\\n');
      $('#session-builder-preview')?.querySelectorAll('[data-exercise-one-option]').forEach(button=>{button.textContent=Number(button.dataset.exerciseOneOption)===index?'Option retenue':'Choisir cet exercice';button.classList.toggle('primary',Number(button.dataset.exerciseOneOption)===index);button.classList.toggle('subtle',Number(button.dataset.exerciseOneOption)!==index);});
      toast('Exercice 1 sélectionné.','success');
    }
    return;
  }
  if(event.target.closest('[data-use-generated-session]')){if(!generatedSessionPlan)return;const plan=generatedSessionPlan;closeDialog();sessionDialog(plan.session_date,plan.session_time,plan);return;}
  const cancelSession=event.target.closest('[data-cancel-session]');
  if(cancelSession){event.preventDefault();const button=cancelSession;button.disabled=true;await cancelPrivateSession(button.dataset.cancelSession);return;}
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

let pendingPlayerPortrait=null;
let portraitSegmenterPromise=null;
async function removePortraitBackground(file){
  const image=await createImageBitmap(file);
  const {FilesetResolver,ImageSegmenter}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  if(!portraitSegmenterPromise)portraitSegmenterPromise=(async()=>{
    const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    return ImageSegmenter.createFromOptions(vision,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',delegate:'GPU'},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false});
  })();
  const segmenter=await portraitSegmenterPromise;
  const result=segmenter.segment(image);
  const mask=result.categoryMask;
  if(!mask)throw new Error('Le détourage n’a pas produit de masque.');
  const labels=mask.getAsUint8Array(),mw=mask.width,mh=mask.height;
  const source=document.createElement('canvas');source.width=image.width;source.height=image.height;
  const sourceCtx=source.getContext('2d',{willReadFrequently:true});sourceCtx.drawImage(image,0,0);
  const pixels=sourceCtx.getImageData(0,0,image.width,image.height);
  const maskCanvas=document.createElement('canvas');maskCanvas.width=mw;maskCanvas.height=mh;
  const maskCtx=maskCanvas.getContext('2d');const maskImage=maskCtx.createImageData(mw,mh);
  for(let i=0;i<labels.length;i++){const keep=labels[i]===0?0:255;const p=i*4;maskImage.data[p]=maskImage.data[p+1]=maskImage.data[p+2]=255;maskImage.data[p+3]=keep;}
  maskCtx.putImageData(maskImage,0,0);
  const alpha=document.createElement('canvas');alpha.width=image.width;alpha.height=image.height;
  const alphaCtx=alpha.getContext('2d');alphaCtx.imageSmoothingEnabled=true;alphaCtx.drawImage(maskCanvas,0,0,image.width,image.height);
  const alphaPixels=alphaCtx.getImageData(0,0,image.width,image.height).data;
  for(let i=0;i<pixels.data.length;i+=4)pixels.data[i+3]=Math.round(pixels.data[i+3]*alphaPixels[i+3]/255);
  sourceCtx.putImageData(pixels,0,0);
  const blob=await new Promise((resolve,reject)=>source.toBlob(value=>value?resolve(value):reject(new Error('Export PNG impossible.')),'image/png'));
  image.close?.();
  return {blob,url:URL.createObjectURL(blob)};
}
async function uploadPlayerPortrait(playerId,blob,uploadFromDialog){
  const player=state.players.find(row=>row.id===playerId);if(!player)throw new Error('Joueur introuvable dans ton effectif.');
  const path=playerId+'/'+crypto.randomUUID()+'.png';
  const {error:uploadError}=await supabase.storage.from('player-card-photos').upload(path,blob,{contentType:'image/png',upsert:false});
  if(uploadError)throw uploadError;
  const storageValue='storage:player-card-photos:'+path;
  const {data:updated,error:updateError}=await supabase.from('profiles').update({avatar_url:storageValue}).eq('id',playerId).eq('role','player').select().single();
  if(updateError){await supabase.storage.from('player-card-photos').remove([path]);throw updateError;}
  const {data:signed,error:signedError}=await supabase.storage.from('player-card-photos').createSignedUrl(path,3600);
  state.players=state.players.map(row=>row.id===playerId?{...updated,avatar_url:signedError?null:signed?.signedUrl||null,avatar_storage_path:path}:row);
  toast(signedError?'Photo enregistrée. Elle sera visible après actualisation.':'Portrait détouré et enregistré sur la carte.');
  if(uploadFromDialog)playerSheetDialog(playerId);else render('players');
}
function openPortraitCrop(playerId,url,uploadFromDialog){
  pendingPlayerPortrait={playerId,url,uploadFromDialog};
  showDialog('<div class="dialog-head"><div><p class="eyebrow">CARTE JOUEUR</p><h2>Recadrer le portrait</h2><p class="tiny muted">Déplace le cadrage et ajuste le zoom avant validation.</p></div><button class="btn icon-btn" data-close>✕</button></div><div class="portrait-crop-stage"><img id="portrait-crop-image" src="'+url+'" alt="Aperçu du portrait détouré"></div><div class="portrait-crop-controls"><label>Zoom <input type="range" min="1" max="2.8" step=".05" value="1" id="portrait-crop-zoom"></label><label>Horizontal <input type="range" min="0" max="100" value="50" id="portrait-crop-x"></label><label>Vertical <input type="range" min="0" max="100" value="35" id="portrait-crop-y"></label></div><div class="dialog-actions"><button type="button" class="btn subtle" data-close>Annuler</button><button type="button" class="btn primary" data-save-player-portrait>Valider le portrait</button></div>');
  const update=()=>{const img=$('#portrait-crop-image');if(!img)return;img.style.transform='scale('+($('#portrait-crop-zoom')?.value||1)+')';img.style.objectPosition=($('#portrait-crop-x')?.value||50)+'% '+($('#portrait-crop-y')?.value||35)+'%';};
  ['portrait-crop-zoom','portrait-crop-x','portrait-crop-y'].forEach(id=>$('#'+id)?.addEventListener('input',update));update();
}
document.addEventListener('change',async event=>{
  const photoInput=event.target.closest('[data-player-card-photo]');if(!photoInput)return;
  const file=photoInput.files?.[0];if(!file)return;
  const playerId=photoInput.dataset.playerCardPhoto,uploadFromDialog=!!photoInput.closest('#dialog-content');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Format photo non accepté. Utilise JPG, PNG ou WebP.','error');photoInput.value='';return;}
  if(file.size>8*1024*1024){toast('La photo doit faire 8 Mo maximum.','error');photoInput.value='';return;}
  photoInput.disabled=true;toast('Détourage en cours sur cet appareil…');
  try{const result=await removePortraitBackground(file);openPortraitCrop(playerId,result.url,uploadFromDialog);}
  catch(error){console.error('Coach In · détourage portrait',error);toast(error.message||'Le détourage a échoué. Réessaie avec une photo où le joueur est bien visible.','error');}
  finally{photoInput.disabled=false;photoInput.value='';}
});
$('#dialog-content').addEventListener('click',async event=>{
  const save=event.target.closest('[data-save-player-portrait]');if(!save||!pendingPlayerPortrait)return;
  save.disabled=true;
  try{
    const {playerId,url,uploadFromDialog}=pendingPlayerPortrait;
    const img=$('#portrait-crop-image');if(!img?.complete)throw new Error('L’aperçu du portrait n’est pas prêt.');
    const zoom=Number($('#portrait-crop-zoom')?.value||1),px=Number($('#portrait-crop-x')?.value||50)/100,py=Number($('#portrait-crop-y')?.value||35)/100;
    const ratio=4/5,iw=img.naturalWidth,ih=img.naturalHeight;
    let sw=iw/zoom,sh=sw/ratio;if(sh>ih){sh=ih/zoom;sw=sh*ratio;}
    const sx=Math.max(0,Math.min(iw-sw,px*(iw-sw))),sy=Math.max(0,Math.min(ih-sh,py*(ih-sh)));
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=1200;
    canvas.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Export du portrait impossible.')),'image/png'));
    URL.revokeObjectURL(url);pendingPlayerPortrait=null;closeDialog();await uploadPlayerPortrait(playerId,blob,uploadFromDialog);
  }catch(error){toast(error.message||'Impossible d’enregistrer le portrait.','error');save.disabled=false;}
});

$('#dialog-content').addEventListener('change',event=>{
  if(event.target.name==='player_id'&&event.target.form?.id==='evaluation-form'){updateEvaluationSessionOptions(event.target.value);}
  if(event.target.matches('input[name=criterion]')){
    const row=event.target.closest('.criterion-measure-row');
    const measure=row?.querySelector('.criterion-measure');
    if(measure){measure.disabled=!event.target.checked;if(!event.target.checked)measure.value='';}
    const form=event.target.closest('#evaluation-form');
    if(form){form.dataset.criteriaConfirmed='false';const confirm=form.querySelector('[data-confirm-criteria]');if(confirm){confirm.textContent='Valider les critères ✓';confirm.classList.remove('criteria-confirmed');}const title=form.querySelector('[data-validation-title]');if(title)title.textContent='Sélection à confirmer';const hint=form.querySelector('[data-validation-hint]');if(hint)hint.textContent='Ta sélection a changé : valide-la à nouveau.';updateEvaluationSelectionUI();}
  }
  if(event.target.name==='player_id'&&event.target.form?.id==='session-builder-form'){const form=event.target.form;generatedSessionRecommendation=recommendSessionExercises({playerId:event.target.value,evaluations:state.evaluations,evaluationCriteria:state.evaluationCriteria,library:state.library,sessions:state.sessions,challenges:state.challenges,videoAnalyses:state.videoAnalyses});const goal=coachObjectives().find(item=>item.criteria.some(c=>normTheme(c)===normTheme(generatedSessionRecommendation?.priority?.criterion)))||coachObjectives().find(item=>normTheme(item.theme)===normTheme(generatedSessionRecommendation?.priority?.main_theme));if(goal){form.elements.theme.value=goal.theme;updateSessionObjectiveOptions();form.elements.objective_id.value=goal.id;updateSessionCriterionOptions((state.criteria||[]).find(row=>normTheme(row.criterion)===normTheme(generatedSessionRecommendation?.priority?.criterion))?.id||'');}else{updateSessionCriterionOptions();}const tip=form.querySelector('.session-builder-tip');if(tip)tip.innerHTML='<strong>'+(generatedSessionRecommendation?.priority?'✦ Priorité issue des bilans : '+escapeHtml(generatedSessionRecommendation.priority.criterion):'Analyse en attente : priorité non confirmée')+'</strong><p>'+(generatedSessionRecommendation?.reason||'Données insuffisantes pour confirmer une priorité.')+'</p><small>Tu peux modifier librement le thème, l’objectif et le critère : la séance suivra ton choix.</small>';}
  if(event.target.name==='theme'&&event.target.form?.id==='session-builder-form'){updateSessionObjectiveOptions();updateSessionCriterionOptions();}
  
});
$('#page-content').addEventListener('change',async event=>{
  if(event.target.matches('#video-analysis-form [name="video_theme"]')){
    const form=event.target.form, theme=event.target.value;
    const normalize=value=>String(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    const key=normalize(theme);
    const criterionSelect=form?.elements.video_criterion;
    const catalog=(state.criteria||[]).filter(row=>normalize(row.subtheme)===key||normalize(row.main_theme)===key);
    const unique=new Map(catalog.map(row=>[String(row.id),row]));
    const rows=[...unique.values()].sort((a,b)=>String(a.subtheme||'').localeCompare(String(b.subtheme||''),'fr')||String(a.criterion||'').localeCompare(String(b.criterion||''),'fr'));
    if(criterionSelect){
      const options=rows.map(row=>{
        const subtheme=String(row.subtheme||'').trim();
        const criterion=String(row.criterion||'').trim();
        const label=subtheme&&normalize(subtheme)!==key?subtheme+' · '+criterion:criterion;
        return '<option value="'+escapeHtml(String(row.id))+'">'+escapeHtml(label)+'</option>';
      }).join('');
      criterionSelect.disabled=!theme||!rows.length;
      criterionSelect.innerHTML='<option value="">'+(theme?(rows.length?'Choisir un geste observé…':'Aucun geste associé à cette thématique'):'Choisis d’abord une thématique')+'</option>'+options;
      const hint=form.querySelector('[data-video-criterion-hint]');
      if(hint)hint.textContent=rows.length+' geste(s) disponible(s), réunis dans une seule liste.';
    }
    const strokeByTheme={'coup droit':'forehand','revers':'backhand','service':'service','retour':'return','retour de service':'return','volée':'volley','déplacements':'footwork'};
    if(form?.elements.stroke_type)form.elements.stroke_type.value=strokeByTheme[normalize(theme)]||'general';
    return;
  }
  const input=event.target.closest('[data-group-rain-day]');
  if(!input)return;
  const rainy=input.checked;
  input.disabled=true;
  try{
    const saved=await dataService.setGroupCourseRainDay({
      coachId:state.user.id,
      sessionDate:input.dataset.sessionDate,
      audience:input.dataset.audience,
      weekday:Number(input.dataset.weekday),
      rainy
    });
    const rows=state.groupCourseCancellations||[];
    state.groupCourseCancellations=rainy
      ? [...rows.filter(row=>!(row.session_date===input.dataset.sessionDate&&row.audience===input.dataset.audience)),saved]
      : rows.filter(row=>!(row.session_date===input.dataset.sessionDate&&row.audience===input.dataset.audience));
    render('group-calendar');
    toast(rainy?'Jour de pluie exclu du compteur.':'Date réintégrée dans le compteur.');
  }catch(error){
    input.checked=!rainy;
    input.disabled=false;
    toast(error.message||'Impossible d’enregistrer ce jour de pluie.','error');
  }
});
$('#page-content').addEventListener('submit',async event=>{
  const profileDetailsForm=event.target.closest('#player-profile-details-form');
  if(profileDetailsForm){
    event.preventDefault();
    const formData=new FormData(profileDetailsForm);
    const payload={player_id:state.user.id,objective:String(formData.get('objective')||'').trim(),motivation:String(formData.get('motivation')||'').trim(),strengths:String(formData.get('strengths')||'').trim(),focus:String(formData.get('focus')||'').trim(),updated_at:new Date().toISOString()};
    try{const {data,error}=await supabase.from('player_profile_details').upsert(payload,{onConflict:'player_id'}).select().single();if(error)throw error;state.playerProfileDetails=data;render('dashboard');toast('Ton profil tennis est à jour.');}
    catch(error){toast(error.message||'Impossible d’enregistrer ton profil.','error');}
    return;
  }
  const matchForm=event.target.closest('#player-match-form');
  if(matchForm){
    event.preventDefault();
    const values=Object.fromEntries(new FormData(matchForm).entries());
    const payload={player_id:state.user.id,match_date:values.match_date,opponent_name:String(values.opponent_name||'').trim(),opponent_ranking:String(values.opponent_ranking||'').trim(),competition:String(values.competition||'').trim(),score:String(values.score||'').trim(),result:values.result,feelings:String(values.feelings||'').trim(),worked_well:String(values.worked_well||'').trim(),to_improve:String(values.to_improve||'').trim()};
    try{const {error}=await supabase.from('player_match_journal').insert(payload);if(error)throw error;await refreshAndRender();toast('Match ajouté à ton journal.');}
    catch(error){toast(error.message||'Impossible d’enregistrer le match.','error');}
    return;
  }
  const clubEventForm=event.target.closest('#club-event-form');
  if(clubEventForm){
    event.preventDefault();
    const values=Object.fromEntries(new FormData(clubEventForm).entries());
    if(values.ends_at&&new Date(values.ends_at)<new Date(values.starts_at)){toast('La fin de l’événement doit être après son début.','error');return;}
    const payload={created_by:state.user.id,title:String(values.title||'').trim(),event_type:values.event_type,description:String(values.description||'').trim(),starts_at:new Date(values.starts_at).toISOString(),ends_at:values.ends_at?new Date(values.ends_at).toISOString():null,location:String(values.location||'').trim(),signup_url:String(values.signup_url||'').trim(),published:true};
    try{const {error}=await supabase.from('club_events').insert(payload);if(error)throw error;await refreshAndRender();toast('Événement publié dans la vie du club.');}
    catch(error){toast(error.message||'Impossible de publier cet événement.','error');}
    return;
  }

  const videoForm=event.target.closest('#video-analysis-form');
  if(videoForm){event.preventDefault();await submitVideoAnalysis(videoForm);return;}
  const reviewForm=event.target.closest('#video-review-form');
  if(reviewForm){event.preventDefault();await saveVideoReview(reviewForm);return;}
  const videoValidationForm=event.target.closest('.video-validation-form');
  if(videoValidationForm){event.preventDefault();await validateVideoAnalysis(videoValidationForm);return;}
  const followupForm=event.target.closest('.video-followup-form');
  if(followupForm){event.preventDefault();await saveVideoCorrectionFollowup(followupForm);return;}
  const coachObjectiveForm=event.target.closest('#coach-objective-form');
  if(coachObjectiveForm){
    event.preventDefault();
    const values=Object.fromEntries(new FormData(coachObjectiveForm).entries());
    const criteria=String(values.criteria||'').split(/\n|;/).map(x=>x.trim()).filter(Boolean);
    const validCriteria=new Set((state.criteria||[]).map(row=>row.criterion).filter(Boolean));
    const unknown=criteria.filter(value=>validCriteria.size&&!validCriteria.has(value));
    if(unknown.length){toast('Critères absents de ta banque d’évaluation : '+unknown.join(', '),'error');return;}
    try{
      const saved=await dataService.updateCoachSessionObjective(values.id,{label:String(values.label||'').trim(),intent:String(values.intent||'').trim(),success:String(values.success||'').trim(),criteria});
      state.sessionObjectives=(state.sessionObjectives||[]).map(row=>row.id===values.id?{...saved,id:saved.objective_id,db_id:saved.id}:row);
      closeDialog();render('library');toast('Objectif pédagogique mis à jour.');
    }catch(error){toast(error.message||'Impossible de modifier cet objectif.','error');}
    return;
  }
  const coachExerciseForm=event.target.closest('#coach-exercise-form');
  if(coachExerciseForm){
    event.preventDefault();
    const values=Object.fromEntries(new FormData(coachExerciseForm).entries());
    const objective=coachObjectives().find(goal=>goal.id===values.objective_id);
    const payload={objective_id:values.objective_id||null,theme:objective?.theme||values.theme,title:String(values.title||'').trim(),setup:String(values.setup||'').trim(),instructions:String(values.instructions||'').trim(),success_criteria:String(values.success_criteria||'').trim(),coaching_cue:String(values.coaching_cue||'').trim(),level:values.level||'Tous niveaux',active:true};
    try{
      const saved=values.id?await dataService.updateCoachSessionExercise(values.id,payload):await dataService.createCoachSessionExercise(payload);
      state.customSessionExercises=values.id?(state.customSessionExercises||[]).map(row=>row.id===values.id?saved:row):[...(state.customSessionExercises||[]),saved];
      closeDialog();render('library');toast(values.id?'Exercice mis à jour.':'Exercice ajouté à ta banque.');
    }catch(error){toast(error.message||'Impossible d’enregistrer cet exercice.','error');}
    return;
  }
  const form=event.target.closest('#notification-preferences-form'); if(!form)return;
  event.preventDefault();
  const preferences=Object.fromEntries(['booking_requests','booking_decisions','booking_changes','reminders_24h','messages','progress','session_changes'].map(key=>[key,form.elements[key].checked]));
  try{state.notificationPreferences=await notificationService.savePreferences(state.user.id,preferences);toast('Préférences de notifications enregistrées.');await refreshAndRender();render('notifications');}
  catch(error){toast(error.message||'Impossible d’enregistrer les préférences.','error');}
});
$('#page-content').addEventListener('input',event=>{
  if(event.target.id==='session-search')filterSessionCards();
  if(event.target.id==='player-search'){state.filters.search=event.target.value;filterPlayerCards();}
  if(event.target.matches('#message-form input[name=attachment]')){const label=$('[data-message-file-name]');if(label)label.textContent=event.target.files?.[0]?.name||'Photo, vidéo ou document';}
  if(['library-search','library-category','library-theme','library-level'].includes(event.target.id))filterLibrary();
});
$('#page-content').addEventListener('click',event=>{
  const closeConversation=event.target.closest('[data-message-close]');
  if(closeConversation){event.preventDefault();event.stopPropagation();state.messagePartnerId='';render('messages');return;}
  const conversation=event.target.closest('[data-message-open]');
  if(conversation){event.preventDefault();event.stopPropagation();state.messagePartnerId=conversation.dataset.messageOpen;render('messages');return;}
});
$('#page-content').addEventListener('change',event=>{
  if(event.target.id==='message-partner'){state.messagePartnerId=event.target.value;render('messages');}
  if(event.target.id==='player-type-filter'){state.filters.playerType=event.target.value;filterPlayerCards();}
  if(['library-category','library-theme','library-level'].includes(event.target.id))filterLibrary();
});

function filterSessionCards(){
  const normalize=value=>String(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
  const query=normalize($('#session-search')?.value||'');
  const cards=[...$('#page-content').querySelectorAll('[data-session-card]')];
  let visible=0;
  cards.forEach(card=>{const match=normalize(card.dataset.sessionSearch).includes(query);card.hidden=!match;if(match)visible++;});
  const empty=$('#session-search-empty');if(empty)empty.hidden=visible>0||!query;
}
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

async function startVideoCamera(){
  const form=$('#video-analysis-form'),panel=$('.camera-capture-panel'),preview=$('#video-camera-preview'),status=$('#camera-status'),record=$('[data-camera-record]');
  if(!form||!preview||!navigator.mediaDevices?.getUserMedia){toast('La caméra intégrée n’est pas disponible dans ce navigateur. Utilise l’import vidéo.','error');return;}
  if(!form.elements.player_id.value||!String(form.elements.title.value||'').trim()||!form.elements.video_theme.value){toast('Choisis le joueur, le titre et la thématique avant d’ouvrir la caméra.','error');return;}
  if(!form.elements.consent.checked){toast('Confirme l’autorisation du joueur avant de filmer.','error');return;}
  if(!window.MediaRecorder){toast('Enregistrement direct non pris en charge. Utilise l’import vidéo.','error');return;}
  try{
    stopVideoCamera();
    videoCameraStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:60}}});
    preview.srcObject=videoCameraStream;preview.classList.add('is-active');await preview.play();
    panel?.classList.add('is-fullscreen');document.body.classList.add('camera-fullscreen-open');
    const track=videoCameraStream.getVideoTracks()[0],settings=track.getSettings();
    if(status)status.textContent=(settings.width||'—')+' × '+(settings.height||'—')+' · caméra active';
    if(record){record.disabled=false;record.textContent='● Enregistrer';record.classList.remove('danger');record.classList.add('primary');}
    const start=$('[data-camera-start]');if(start)start.textContent='Caméra ouverte';
  }catch(error){stopVideoCamera();toast(error.message||'Accès caméra refusé ou indisponible.','error');}
}
function startVideoRecording(){
  if(!videoCameraStream||videoCameraRecorder?.state==='recording')return;
  if(!window.MediaRecorder){toast('Enregistrement direct non pris en charge. Utilise l’import vidéo.','error');return;}
  const types=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  const mimeType=types.find(type=>MediaRecorder.isTypeSupported(type))||'';
  try{
    videoCameraChunks=[];
    videoCameraRecorder=new MediaRecorder(videoCameraStream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:8000000});
    videoCameraRecorder.ondataavailable=event=>{if(event.data?.size)videoCameraChunks.push(event.data);};
    videoCameraRecorder.onstop=()=>{
      const recorder=videoCameraRecorder,type=recorder?.mimeType||mimeType||'video/webm';
      const ext=type.includes('mp4')?'mp4':'webm';
      const file=new File(videoCameraChunks,'coach-in-capture.'+ext,{type});
      const input=$('#video-analysis-form input[name=video]');
      if(input&&file.size){const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
      videoCameraChunks=[];
      if(videoCameraStream){videoCameraStream.getTracks().forEach(track=>track.stop());videoCameraStream=null;}
      const preview=$('#video-camera-preview');if(preview){preview.srcObject=null;preview.classList.remove('is-active');}
      $('.camera-capture-panel')?.classList.remove('is-fullscreen');document.body.classList.remove('camera-fullscreen-open');
      const status=$('#camera-status');if(status)status.textContent=file.size?'Vidéo prête · '+(file.size/1048576).toFixed(1)+' Mo · analyse automatique':'Aucun contenu vidéo enregistré';
      const hint=$('#camera-hint');if(hint)hint.textContent=file.size?'La vidéo est envoyée automatiquement à l’analyse IA.':'La capture est vide. Recommence l’enregistrement.';
      const record=$('[data-camera-record]');if(record){record.disabled=true;record.textContent='● Enregistrer';record.classList.remove('danger');record.classList.add('primary');}
      if(!file.size){toast('La vidéo enregistrée est vide. Recommence.','error');return;}
      const form=$('#video-analysis-form');if(form)void submitVideoAnalysis(form,{fromCamera:true});
    };
    videoCameraRecorder.start(1000);
    const record=$('[data-camera-record]');if(record){record.disabled=false;record.textContent='■ Stop';record.classList.remove('primary');record.classList.add('danger');}
    const status=$('#camera-status');if(status)status.textContent='Enregistrement en cours…';
    const hint=$('#camera-hint');if(hint)hint.textContent='Appuie sur Stop avec le même bouton pour terminer et lancer automatiquement l’analyse IA.';
  }catch(error){toast(error.message||'Impossible de démarrer l’enregistrement.','error');}
}
function stopVideoRecording(){if(videoCameraRecorder?.state==='recording')videoCameraRecorder.stop();}
function stopVideoCamera(){
  if(videoCameraRecorder?.state==='recording'){stopVideoRecording();return;}
  if(videoCameraStream){videoCameraStream.getTracks().forEach(track=>track.stop());videoCameraStream=null;}
  const preview=$('#video-camera-preview');if(preview){preview.srcObject=null;preview.classList.remove('is-active');}
  $('.camera-capture-panel')?.classList.remove('is-fullscreen');document.body.classList.remove('camera-fullscreen-open');
  const record=$('[data-camera-record]');if(record){record.disabled=true;record.textContent='● Enregistrer';record.classList.remove('danger');record.classList.add('primary');}
}
function initializeCourtCalibrationCanvases(){
  $$('[data-court-calibration]').forEach(canvas=>{
    const image=canvas.previousElementSibling;
    if(!image)return;
    const draw=()=>{
      if(!image.naturalWidth||!image.naturalHeight)return;
      canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
      let points=courtCalibrationSelections.get(canvas.dataset.analysisId);
      if(!points){try{points=JSON.parse(canvas.dataset.initialPoints||'[]');}catch{points=[];}courtCalibrationSelections.set(canvas.dataset.analysisId,points);}
      points.forEach((point,index)=>{
        const x=point.x*canvas.width,y=point.y*canvas.height;
        ctx.beginPath();ctx.arc(x,y,Math.max(12,canvas.width/65),0,Math.PI*2);ctx.fillStyle='#ffcf58';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='#06121d';ctx.stroke();
        ctx.fillStyle='#06121d';ctx.font='bold '+Math.max(15,canvas.width/45)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(index+1),x,y);
        if(index){const previous=points[index-1];ctx.beginPath();ctx.moveTo(previous.x*canvas.width,previous.y*canvas.height);ctx.lineTo(x,y);ctx.lineWidth=Math.max(3,canvas.width/220);ctx.strokeStyle='#ffcf58';ctx.stroke();}
      });
    };
    if(image.complete)draw();else image.addEventListener('load',draw,{once:true});
    canvas._redrawCalibration=draw;
  });
}
function addCourtCalibrationPoint(canvas,event){
  const id=canvas.dataset.analysisId,rect=canvas.getBoundingClientRect();
  const points=courtCalibrationSelections.get(id)||[];
  if(points.length>=4){courtCalibrationSelections.set(id,[]);canvas._redrawCalibration?.();toast('Les quatre points ont été réinitialisés. Recommence dans l’ordre indiqué.');return;}
  points.push({x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))});
  courtCalibrationSelections.set(id,points);canvas._redrawCalibration?.();
  const status=$('[data-court-calibration-status="'+id+'"]');if(status)status.textContent=points.length+'/4 points sélectionnés';
}
async function saveCourtCalibration(analysisId){
  const row=(state.videoAnalyses||[]).find(item=>item.id===analysisId);
  const points=courtCalibrationSelections.get(analysisId)||[];
  if(!row||points.length!==4){toast('Sélectionne les quatre coins du court dans l’ordre indiqué.','error');return;}
  const pose=row.analysis_result?.pose_analysis;
  if(!pose?.available||!Array.isArray(pose.frames)||!pose.frames.length){toast('Les repères de pose sont indisponibles pour cette vidéo.','error');return;}
  try{
    const matrix=solveCourtHomography(points,10.97,23.77);
    const footDistances=calibratedFootDistances(pose.frames,matrix);
    const valid=footDistances.map(item=>item.distance_m).filter(value=>Number.isFinite(value));
    if(!valid.length)throw new Error('Les pieds ne sont pas assez visibles sur les images analysées pour estimer leur écart.');
    const mean=Number((valid.reduce((sum,value)=>sum+value,0)/valid.length).toFixed(2));
    const calibration={court_width_m:10.97,court_length_m:23.77,points,matrix,foot_distances:footDistances,mean_foot_spacing_m:mean,calibrated_at:new Date().toISOString(),method:'Homographie manuelle à partir des quatre intersections fond / couloir de double',caveat:'Estimation au sol à partir des repères de pieds 2D ; dépend de la caméra fixe, du bon placement des points et de la visibilité des chaussures.'};
    const updated={...row.analysis_result,pose_analysis:{...pose,calibration}};
    const {error}=await supabase.from('coach_video_analyses').update({analysis_result:updated,updated_at:new Date().toISOString()}).eq('id',analysisId).eq('coach_id',state.user.id);
    if(error)throw error;
    await dataService.loadCoachWorkspace(state.user.id);render('videos');
    toast('Court calibré. Écart moyen estimé entre les pieds : '+mean+' m.');
  }catch(error){toast(error.message||'Impossible de calibrer le court.','error');}
}
async function getVideoDuration(file){
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
    return duration;
  }finally{URL.revokeObjectURL(objectUrl);video.removeAttribute('src');video.load();}
}
async function submitVideoAnalysis(form,{fromCamera=false}={}){
  const button=form.querySelector('button[type=submit]'),file=form.elements.video.files?.[0];
  const playerId=form.elements.player_id.value,title=String(form.elements.title.value||'').trim(),stroke=form.elements.stroke_type.value,theme=String(form.elements.video_theme?.value||'').trim(),criterionId=String(form.elements.video_criterion?.value||'').trim(),selectedCriterion=(state.criteria||[]).find(row=>String(row.id)===criterionId),objective=[ 'Thématique analysée : '+theme, selectedCriterion?'Geste observé : '+selectedCriterion.criterion+'. Sous-thème : '+(selectedCriterion.subtheme||theme) : '' ].filter(Boolean).join(' ');
  if(!file||!title||!playerId||!theme||!criterionId||!selectedCriterion){toast('Renseigne le joueur, le titre, la thématique, le critère observé et la vidéo.','error');return;}
  const videoMime=file.type.split(';')[0].trim();
  if(!['video/mp4','video/quicktime','video/webm'].includes(videoMime)){toast('Format accepté : MP4, MOV ou WEBM.','error');return;}
  if(file.size>262144000){toast('La vidéo dépasse la limite de 250 Mo.','error');return;}
  if(!form.elements.consent.checked){toast('Confirme que tu disposes de l’autorisation du joueur avant l’analyse.','error');return;}
  button.disabled=true;button.textContent='Préparation de la vidéo…';
  let analysisId=null,videoPath=null;
  try{
    const duration=await getVideoDuration(file);
    button.textContent='Détection des articulations sur le téléphone…';
    const poseAnalysis=await analyzeVideoPose(file);
    analysisId=crypto.randomUUID();
    const extension=file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'')||'mp4';
    videoPath=state.user.id+'/'+playerId+'/'+analysisId+'/original.'+extension;
    const {error:uploadError}=await supabase.storage.from('coach-in-videos').upload(videoPath,file,{contentType:file.type,upsert:false});
    if(uploadError)throw uploadError;
    const {error:insertError}=await supabase.from('coach_video_analyses').insert({id:analysisId,coach_id:state.user.id,player_id:playerId,title,stroke_type:stroke,video_path:videoPath,video_mime:file.type,video_size_bytes:file.size,duration_seconds:Number(duration.toFixed(2)),status:'uploaded'});
    if(insertError){await supabase.storage.from('coach-in-videos').remove([videoPath]);throw insertError;}
    button.textContent='Analyse locale en cours…';
    const {data,error}=await supabase.functions.invoke('analyze-tennis-video',{body:{analysis_id:analysisId,theme,objective,pose_analysis:poseAnalysis}});
    if(error||data?.error){
      const {data:latest}=await supabase.from('coach_video_analyses').select('status').eq('id',analysisId).maybeSingle();
      if(latest?.status!=='completed')throw new Error(data?.error||error?.message||'Le service IA n’a pas répondu. Vérifie le statut avant de relancer.');
    }
    toast('Analyse terminée. Vérifie les observations avant de les transmettre au joueur.');
    await dataService.loadCoachWorkspace(state.user.id);render('videos');
  }catch(error){
    toast(error.message||'Impossible de traiter cette vidéo.','error');
    try{await dataService.loadCoachWorkspace(state.user.id);render('videos');}catch(_){}
  }finally{if(button.isConnected){button.disabled=false;button.textContent='Lancer l’analyse locale';}}
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

async function validateVideoAnalysis(form){
  const analysisId=form.elements.analysis_id.value;
  const analysis=(state.videoAnalyses||[]).find(row=>row.id===analysisId);
  if(!analysis||analysis.status!=='completed'){toast('Cette analyse n’est pas disponible pour validation.','error');return;}
  if(analysis.analysis_result?.coach_validation?.evaluation_id){toast('Ce bilan a déjà été envoyé au joueur.','error');return;}
  const button=form.querySelector('button[type="submit"]');
  const scores={technical_score:null,tactical_score:null,physical_score:null,mental_score:null};
  for(const key of Object.keys(scores)){
    const raw=String(form.elements[key]?.value??'').trim();
    if(raw!==''){const value=Number(raw);if(!Number.isFinite(value)||value<0||value>20){toast('Les notes doivent être comprises entre 0 et 20.','error');return;}scores[key]=value;}
  }
  if(Object.values(scores).every(value=>value===null)){toast('Renseigne au moins une note sur 20 avant de valider le bilan.','error');return;}
  const comment=String(form.elements.player_visible_comment.value||'').trim();
  if(!comment){toast('Ajoute une synthèse pour la fiche joueur.','error');return;}
  if(button){button.disabled=true;button.textContent='Enregistrement du bilan…';}
  try{
    const evaluation=await progressionService.saveEvaluation({playerId:analysis.player_id,coachId:state.user.id,scores,selectedCriteria:[],playerVisibleComment:comment,notifyPlayer:false});
    const result={...(analysis.analysis_result||{}),coach_validation:{evaluation_id:evaluation.id,validated_at:new Date().toISOString(),scores,player_visible_comment:comment}};
    const {error:updateError}=await supabase.from('coach_video_analyses').update({coach_review:comment,shared_with_player:true,analysis_result:result,updated_at:new Date().toISOString()}).eq('id',analysisId).eq('coach_id',state.user.id);
    if(updateError)throw updateError;
    const {error:notificationError}=await supabase.rpc('notify_player_existing_evaluation',{p_evaluation_id:evaluation.id});
    await dataService.loadCoachWorkspace(state.user.id);
    render('videos');
    if(notificationError)toast('Bilan enregistré et vidéo ajoutée à la fiche joueur, mais la notification n’a pas pu être envoyée.','error');
    else toast('Bilan validé : évaluation enregistrée et vidéo ajoutée à la fiche joueur.');
  }catch(error){
    if(button){button.disabled=false;button.textContent='Valider et envoyer à la fiche joueur';}
    toast(error.message||'Impossible de valider ce bilan.','error');
  }
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


function coachObjectiveDialog(id=''){
 const item=coachObjectives().find(row=>row.id===id);
 if(!item){toast('Objectif introuvable.','error');return;}
 showDialog('<div class="dialog-head"><div><p class="eyebrow">CATALOGUE PÉDAGOGIQUE · COURS PARTICULIERS</p><h2>Modifier l’objectif</h2><p class="tiny muted">'+escapeHtml(item.theme)+' · '+escapeHtml(item.objective_id)+'</p></div><button class="btn icon-btn" data-close>✕</button></div><form id="coach-objective-form" class="form-grid"><input type="hidden" name="id" value="'+escapeHtml(item.id)+'"><label class="span-2">Intitulé<input name="label" required maxlength="180" value="'+escapeHtml(item.label)+'"></label><label class="span-2">Intention pédagogique<textarea name="intent" rows="3" required>'+escapeHtml(item.intent)+'</textarea></label><label class="span-2">Critère de réussite mesurable<textarea name="success" rows="2" required>'+escapeHtml(item.success)+'</textarea></label><label class="span-2">Critères d’évaluation associés (un par ligne)<textarea name="criteria" rows="5" required>'+escapeHtml((item.criteria||[]).join('\n'))+'</textarea><small>Conserve les intitulés exacts de ta banque d’évaluation pour garder le lien avec les bilans.</small></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Enregistrer l’objectif</button></div></form>');
}

function coachExerciseDialog(id=''){
 const item=(state.customSessionExercises||[]).find(row=>row.id===id)||{};
 const editing=Boolean(id);
 const themes=[...new Set(coachObjectives().map(goal=>goal.theme))];
 showDialog('<div class="dialog-head"><div><p class="eyebrow">BANQUE TACTIQUE PERSONNELLE</p><h2>'+(editing?'Modifier un exercice':'Ajouter un exercice')+'</h2><p class="tiny muted">Cet exercice sera privé à ton compte coach et proposé pour les cours particuliers.</p></div><button class="btn icon-btn" data-close>✕</button></div><form id="coach-exercise-form" class="form-grid"><input type="hidden" name="id" value="'+escapeHtml(item.id||'')+'"><label>Thème<select name="theme" required>'+themes.map(theme=>'<option value="'+escapeHtml(theme)+'" '+(item.theme===theme?'selected':'')+'>'+escapeHtml(theme)+'</option>').join('')+'</select></label><label>Niveau<select name="level">'+['Tous niveaux','Débutant','Intermédiaire','Confirmé','Compétition'].map(level=>'<option '+((item.level||'Tous niveaux')===level?'selected':'')+'>'+level+'</option>').join('')+'</select></label><label class="span-2">Objectif associé<select name="objective_id"><option value="">Tous les objectifs du thème</option>'+coachObjectives().map(goal=>'<option value="'+goal.id+'" '+(item.objective_id===goal.id?'selected':'')+'>'+escapeHtml(goal.theme+' · '+goal.label)+'</option>').join('')+'</select></label><label class="span-2">Nom de l’exercice<input name="title" required maxlength="140" value="'+escapeHtml(item.title||'')+'" placeholder="Ex. Défense haute puis reprise de terrain"></label><label class="span-2">Mise en place<textarea name="setup" rows="2" required>'+escapeHtml(item.setup||'')+'</textarea></label><label class="span-2">Déroulement et consignes tactiques<textarea name="instructions" rows="4" required>'+escapeHtml(item.instructions||'')+'</textarea></label><label class="span-2">Critère de réussite mesurable<textarea name="success_criteria" rows="2" required>'+escapeHtml(item.success_criteria||'')+'</textarea></label><label class="span-2">Point de vigilance coach<textarea name="coaching_cue" rows="2">'+escapeHtml(item.coaching_cue||'')+'</textarea></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">'+(editing?'Enregistrer les modifications':'Ajouter à ma banque')+'</button></div></form>');
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


function updateSessionObjectiveOptions(){
 const form=$('#session-builder-form');if(!form)return;
 const select=form.elements.objective_id;if(!select)return;
 const current=select.value,goals=coachObjectives().filter(item=>item.theme===form.elements.theme.value);
 select.innerHTML='<option value="">Choisir un objectif…</option>'+goals.map(x=>'<option value="'+x.id+'">'+escapeHtml(x.label)+'</option>').join('');
 if(goals.some(x=>x.id===current))select.value=current;
}

function updateSessionCriterionOptions(selectedId=''){
 const form=$('#session-builder-form');if(!form)return;
 const container=$('#session-criterion-options');if(!container)return;
 const theme=form.elements.theme.value;
 const normalize=value=>String(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 const rows=(state.criteria||[]).filter(row=>normalize(row.main_theme)===normalize(theme));
 const groups=new Map();
 rows.forEach(row=>{const key=String(row.subtheme||row.main_theme||'Autres');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);});
 const markup=[...groups.entries()].map(([group,items])=>'<div class="session-criterion-group"><strong>'+escapeHtml(group)+'</strong><div class="session-criterion-list">'+items.map(row=>'<label class="session-criterion-option"><input type="radio" name="work_criterion_id" value="'+escapeHtml(String(row.id))+'" '+(String(row.id)===String(selectedId)?'checked':'')+'><span>'+escapeHtml(row.criterion)+'</span></label>').join('')+'</div></div>').join('');
 container.innerHTML=rows.length?'<p class="tiny muted">Clique sur le critère exact à travailler. Les exercices seront construits à partir de ce choix.</p>'+markup:'<p class="tiny muted">Aucun critère enregistré pour cette thématique. La séance sera construite à partir du thème et de l’objectif pédagogique.</p>';
}

function sessionBuilderDialog(playerId=null, sessionDate=toLocalISO(new Date()), sessionTime='17:00', sessionDuration=90, programStep=null){
 if(!state.players.length){toast('Ajoute au moins un joueur à ton effectif avant de préparer une séance.','error');return;}
 const items=(state.library||[]).filter(x=>x.category==='particulier').sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'fr'));
 const options=items.map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.title||'Exercice')+' · '+escapeHtml(x.theme||'Sans thème')+'</option>').join('');
 const today=sessionDate||toLocalISO(new Date());generatedSessionPlan=null;
 generatedSessionRecommendation=playerId?recommendSessionExercises({playerId,evaluations:state.evaluations,evaluationCriteria:state.evaluationCriteria,library:state.library,sessions:state.sessions,challenges:state.challenges,videoAnalyses:state.videoAnalyses}):null;
 const player=state.players.find(x=>x.id===playerId)||state.players[0],priority=generatedSessionRecommendation?.priority;
 showDialog('<div class="dialog-head"><div><p class="eyebrow">COACH IN · CRÉATION DE SÉANCE</p><h2>Composer une séance</h2><p class="muted">Sélectionne le thème et le niveau de difficulté : la séance est générée automatiquement.</p></div><button class="btn icon-btn" data-close>✕</button></div><form id="session-builder-form" class="form-grid">'+
 '<label class="span-2">Joueur<select name="player_id" required>'+state.players.map(p=>'<option value="'+p.id+'" '+(p.id===player?.id?'selected':'')+'>'+escapeHtml(p.first_name)+' '+escapeHtml(p.last_name)+'</option>').join('')+'</select></label>'+
 '<label>Date<input name="session_date" type="date" required value="'+today+'"></label><label>Heure<input name="session_time" type="time" required value="'+(sessionTime||'17:00')+'"></label>'+
 '<fieldset class="duration-choice span-2"><legend>Durée du cours</legend><div class="duration-choice-options"><label><input type="radio" name="duration_minutes" value="60" '+(Number(sessionDuration||60)===60?'checked':'')+'><span>1 heure</span></label><label><input type="radio" name="duration_minutes" value="90" '+(Number(sessionDuration)===90?'checked':'')+'><span>1 h 30</span></label><label><input type="radio" name="duration_minutes" value="120" '+(Number(sessionDuration)===120?'checked':'')+'><span>2 heures</span></label></div></fieldset>'+
 '<label>Niveau<select name="level"><option>Débutant</option><option selected>Intermédiaire</option><option>Confirmé</option><option>Compétition</option></select></label>'+
 '<label class="span-2">Thématique de la séance<select name="theme" required>'+[...new Set(coachObjectives().map(item=>item.theme))].map(v=>'<option value="'+escapeHtml(v)+'" '+(priority&&normTheme(v)===normTheme(priority.main_theme)?'selected':'')+'>'+escapeHtml(v)+'</option>').join('')+'</select></label>'+ '<label class="span-2">Objectif pédagogique précis<select name="objective_id" id="session-objective-select"><option value="">Choisir un objectif…</option>'+coachObjectives().filter(x=>x.theme===(priority?.main_theme||'Coup droit')).map(x=>'<option value="'+x.id+'">'+escapeHtml(x.label)+'</option>').join('')+'</select><small>Les objectifs sont reliés aux critères de ta banque d’évaluation.</small></label>'+ '<div class="span-2 session-criterion-picker"><strong>Critère précis à travailler</strong><div id="session-criterion-options"></div></div>'+
 
 '<label class="span-2">Niveau de difficulté<select name="difficulty"><option value="very_easy">Très facile</option><option value="easy">Facile</option><option value="medium" selected>Moyen</option><option value="hard">Difficile</option><option value="very_hard">Très difficile</option></select></label>'+
 
 '<div class="span-2 session-builder-tip"><strong>'+(priority?'✦ Priorité issue des bilans : '+escapeHtml(priority.criterion):'Analyse en attente : priorité non confirmée')+'</strong><p>'+(priority?'Cette proposition s’appuie sur les critères d’amélioration retrouvés sur plusieurs journées d’évaluation.':'Coach In ne force pas de priorité sans observations suffisantes. Tu peux choisir un axe à partir du dernier bilan.')+'</p><small>Tu gardes la main : tu peux modifier le thème, l’objectif et le critère avant de générer la séance. La séance suivra le critère effectivement sélectionné.</small></div>'+
 '<div id="session-builder-preview" class="span-2"></div><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button type="submit" class="btn primary" data-generate-session>Générer la séance</button></div></form>');
 const form=$('#session-builder-form');if(form){updateSessionObjectiveOptions();updateSessionCriterionOptions((state.criteria||[]).find(row=>normTheme(row.criterion)===normTheme(priority?.criterion))?.id||'');if(priority&&!programStep?.objective&&!programStep?.exerciseId){const recommended=coachObjectives().find(goal=>goal.criteria.some(item=>normTheme(item)===normTheme(priority.criterion)))||coachObjectives().find(goal=>normTheme(goal.theme)===normTheme(priority.main_theme));if(recommended){form.elements.theme.value=recommended.theme;updateSessionObjectiveOptions();form.elements.objective_id.value=recommended.id;updateSessionCriterionOptions((state.criteria||[]).find(row=>normTheme(row.criterion)===normTheme(priority?.criterion))?.id||'');}}form.elements.level.value=player?.player_type==='Compétition'?'Compétition':'Intermédiaire';const tip=form.querySelector('.session-builder-tip');if(tip&&programStep)tip.innerHTML='<strong>'+escapeHtml(programStep.title||'Séance du cycle')+' · '+escapeHtml(programStep.stage||'')+'</strong><p>Objectif du cycle préchargé : '+escapeHtml(programStep.objective||'')+'</p>';}
}
function normTheme(v){return String(v||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function updateSessionBuilderMode(){const form=$('#session-builder-form');if(!form)return;const libraryMode=form.elements.creation_mode.value==='library',fields=$('#session-library-fields');if(fields)fields.classList.toggle('hidden',!libraryMode);const tip=form.querySelector('.session-builder-tip');if(tip)tip.innerHTML=libraryMode?'<strong>Bibliothèque du coach</strong><p>Les exercices enregistrés restent sélectionnables.</p>':'<strong>Création originale guidée</strong><p>Les situations sont inventées à partir du bilan, de tes objectifs pédagogiques et des thèmes du programme collectif.</p>';}
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

function renderStructuredExerciseContent(raw){
 const source=String(raw||'').replace(/\\\\n/g,'\n').replace(/\\n/g,'\n').replace(/\\r/g,'').trim();
 const labels=['Mise en place','Consignes','Déroulement','Critère ciblé','Réussite','Matériel','Rotation','Variante','Évolution','Repère coach'];
 const pattern=new RegExp('(?:^|\\n)\\s*('+labels.join('|')+')\\s*:\\s*','gi');
 const matches=[...source.matchAll(pattern)];
 if(!matches.length)return '<p>'+escapeHtml(source)+'</p>';
 const intro=source.slice(0,matches[0].index).trim();
 const sections=matches.map((match,index)=>({label:match[1],text:source.slice(match.index+match[0].length,index+1<matches.length?matches[index+1].index:source.length).trim()})).filter(item=>item.text);
 return (intro?'<p class="session-builder-exercise-intro">'+escapeHtml(intro)+'</p>':'')+'<div class="session-builder-instructions">'+sections.map(item=>'<div class="session-builder-instruction"><strong>'+escapeHtml(item.label)+'</strong><p>'+escapeHtml(item.text)+'</p></div>').join('')+'</div>';
}
function generateSessionPlan(){
 const form=$('#session-builder-form');if(!form)return;const values=Object.fromEntries(new FormData(form));
 const duration=Number(values.duration_minutes),player=state.players.find(p=>p.id===values.player_id)||{},selectedObjective=findObjective(values.objective_id),selectedCriterion=(state.criteria||[]).find(row=>String(row.id)===String(values.work_criterion_id))||null;
 let exerciseOne='',exerciseTwo='',theme=values.theme||'Construction du point',visibleSummary='',coachingPlan=null,phases=[];
 const recent=state.sessions.filter(x=>x.player_id===values.player_id).sort((a,b)=>String(b.session_date||'').localeCompare(String(a.session_date||'')));
 const age=player.date_of_birth?Math.floor((Date.now()-new Date(player.date_of_birth).getTime())/31557600000):player.age||null;
 const priorAdjustment=buildSessionProgression(recent,values.player_id,selectedObjective?.label||values.theme,state.evaluations,state.evaluationCriteria);const selectedPriority=selectedCriterion?{criterion:selectedCriterion.criterion,criterion_id:selectedCriterion.id,main_theme:selectedCriterion.main_theme,subtheme:selectedCriterion.subtheme,source:generatedSessionRecommendation?.priority&&normTheme(generatedSessionRecommendation.priority.criterion)===normTheme(selectedCriterion.criterion)?'bilan':'choix_coach'}:generatedSessionRecommendation?.priority||null;const generated=generateOriginalSession({theme:selectedObjective?.theme||selectedCriterion?.main_theme||values.theme||generatedSessionRecommendation?.priority?.main_theme||'Construction du point',selectedObjective,selectedCriterion,difficulty:values.difficulty||'medium',priorAdjustment,playerName:[player.first_name,player.last_name].filter(Boolean).join(' ')||'le joueur',level:values.level||'Intermédiaire',age,playerType:player.player_type||'Loisir',duration,priority:selectedPriority,challenge:generatedSessionRecommendation?.activeChallenge||null,recentSessions:recent,customExercises:state.customSessionExercises||[]});
 exerciseOne=generated.exercise_1+'\n\nNOTES COACH\n'+generated.coaching_notes+'\n\nNIVEAU DE DIFFICULTÉ · '+generated.difficulty+'\n'+generated.difficulty_rule;exerciseTwo=generated.exercise_2;theme=generated.theme;visibleSummary=generated.player_visible_summary;coachingPlan={objective:generated.objective,success:generated.success_criteria};phases=generated.phases;
 generatedSessionPlan={generated:true,player_id:values.player_id,session_date:values.session_date,session_time:values.session_time,duration_minutes:duration,theme,exercise_1:exerciseOne,exercise_2:exerciseTwo,exercise_1_options:generated.exercise_1_options||[],exercise_1_corrective:generated.exercise_1_corrective||'',exercise_1_phase2:generated.exercise_1_phase2||'',coaching_notes:generated.coaching_notes||'',difficulty_note:'NIVEAU DE DIFFICULTÉ · '+generated.difficulty+'\n'+generated.difficulty_rule,level:values.level,player_visible_summary:visibleSummary,generation_mode:'original',progression:buildSessionProgression(state.sessions.filter(x=>x.player_id===values.player_id),values.player_id,values.theme,state.evaluations,state.evaluationCriteria)};
 const preview=$('#session-builder-preview');if(preview)preview.innerHTML='<section class="session-builder-preview"><div class="session-builder-preview-head"><div><p class="eyebrow">SÉANCE GÉNÉRÉE · '+'CRÉATION GUIDÉE'+'</p><h3>'+escapeHtml(theme)+' · '+duration+' min</h3></div><span class="tag">'+escapeHtml(values.level)+'</span></div>'+
 (selectedPriority?'<div class="session-builder-focus"><strong>'+(selectedPriority.source==='choix_coach'?'Critère choisi':'Priorité issue des bilans')+'</strong><span>'+escapeHtml(selectedPriority.criterion)+'</span></div>':'')+(generatedSessionPlan.progression?.hasHistory?'<div class="session-builder-focus"><strong>'+escapeHtml(generatedSessionPlan.progression.label)+'</strong><span>'+escapeHtml(generatedSessionPlan.progression.guidance)+'</span></div>':'<div class="session-builder-focus"><strong>Premier repère</strong><span>La première séance évaluée servira de référence pour ajuster la suivante.</span></div>')+'<div class="session-builder-phase"><strong>Objectif pédagogique</strong><p>'+escapeHtml(coachingPlan?.objective||visibleSummary)+'</p><small>'+escapeHtml(coachingPlan?.success||'Réussite à observer en jeu')+'</small></div>'+
 (selectedCriterion?'<div class="session-builder-phase"><strong>Critère ciblé</strong><p>'+escapeHtml(selectedCriterion.main_theme+' · '+selectedCriterion.subtheme+' · '+selectedCriterion.criterion)+'</p></div>':'')+(selectedObjective?.criteria?.length?'<div class="session-builder-phase"><strong>Critères reliés au bilan</strong><p>'+selectedObjective.criteria.map(escapeHtml).join(' · ')+'</p></div>':'')+(phases.length?phases.map((p,i)=>'<div class="session-builder-phase '+(p.kind==='corrective'?'corrective':'')+'"><strong>0'+(i+1)+' · '+escapeHtml(p.name)+'</strong><small>'+p.minutes+' min</small>'+(p.content?'<div class="session-builder-exercise-content">'+renderStructuredExerciseContent(p.content)+'</div>':'')+(p.kind==='corrective'&&p.coach_cue?'<small>Repère : '+escapeHtml(p.coach_cue)+'</small>':'')+'</div>').join(''):'<div class="session-builder-phase"><strong>Exercices sélectionnés</strong><p>Contenus issus de ta bibliothèque.</p></div>')+(generatedSessionPlan.exercise_1_options.length?'<div class="session-builder-phase session-exercise-choice"><strong>Choisis l’exercice à placer en premier</strong><p>Les situations proposées travaillent le même critère. Toutes les étapes restent dans la séance ; tu peux choisir par quoi commencer.</p>'+generatedSessionPlan.exercise_1_options.map((option,index)=>'<article class="session-builder-exercise-option"><strong>Option '+(index+1)+' · '+escapeHtml(option.title)+'</strong><p>'+escapeHtml(option.content)+'</p><button type="button" class="btn '+(index===0?'primary':'subtle')+'" data-exercise-one-option="'+index+'">'+(index===0?'Option retenue':'Choisir cet exercice')+'</button></article>').join('')+'</div>':'')+'<div class="session-builder-actions"><button type="button" class="btn primary" data-use-generated-session>Utiliser cette séance →</button></div></section>';
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
async function cancelPrivateSession(sessionId){
  try{await dataService.updateSession(sessionId,{status:'Annulée'},state.user.id);closeDialog();await refreshAndRender();toast('Cours particulier annulé.');}
  catch(error){toast(error.message||'Impossible d’annuler ce cours.','error');}
}

function sessionDialog(date=toLocalISO(new Date()), time='17:00', libraryItem=null, sessionId=''){
  if(!state.players.length){toast('Associe d’abord un compte joueur à ton effectif.','error');return;}
  const existing=sessionId?state.sessions.find(row=>row.id===sessionId):null;
  if(sessionId&&!existing){toast('Cette séance est introuvable.','error');return;}
  const editing=Boolean(existing);
  const duration=Number(existing?.duration_minutes||60);
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">TERRAIN</p><h2>${editing?'Modifier la séance':'Planifier une séance'}</h2></div><button class="btn icon-btn" data-close>✕</button></div><form id="session-form" class="form-grid"><input type="hidden" name="id" value="${escapeHtml(existing?.id||'')}"><label class="span-2">Joueur<select name="player_id" required>${state.players.map(p=>`<option value="${p.id}" ${existing?.player_id===p.id?'selected':''}>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</option>`).join('')}</select></label><label>Date<input name="session_date" type="date" required value="${existing?.session_date||date}"></label><label>Heure<input name="session_time" type="time" required value="${existing?.session_time||time}"></label><fieldset class="duration-choice span-2"><legend>Durée du cours</legend><div class="duration-choice-options"><label><input type="radio" name="duration_minutes" value="60" ${duration===60?'checked':''}><span>1 heure</span></label><label><input type="radio" name="duration_minutes" value="90" ${duration===90?'checked':''}><span>1 h 30</span></label><label><input type="radio" name="duration_minutes" value="120" ${duration===120?'checked':''}><span>2 heures</span></label></div></fieldset><input type="hidden" name="court_number" value="${existing?.court_number||1}"><input type="hidden" name="theme" value="${escapeHtml(existing?.theme||'')}"><input type="hidden" name="exercise_1" value="${escapeHtml(existing?.exercise_1||'')}"><input type="hidden" name="exercise_2" value="${escapeHtml(existing?.exercise_2||'')}"><input type="hidden" name="player_visible_summary" value="${escapeHtml(existing?.player_visible_summary||'')}"><input type="hidden" name="coach_private_notes" value="${escapeHtml(existing?.coach_private_notes||'')}"><div class="dialog-actions span-2">${editing?'<button type="button" class="btn danger" data-cancel-session="'+existing.id+'">Annuler ce cours</button>':''}<button type="button" class="btn subtle" data-close>Fermer</button><button class="btn primary">${editing?'Enregistrer les modifications':'Enregistrer la séance'}</button></div></form>`);
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
function updateEvaluationSessionOptions(playerId, selectedSessionId = '') {
  const form=$('#evaluation-form');if(!form?.elements.session_id)return;
  const rows=(state.sessions||[]).filter(row=>row.player_id===playerId).sort((a,b)=>String(b.session_date||'').localeCompare(String(a.session_date||'')));
  form.elements.session_id.innerHTML='<option value="">Aucune séance associée</option>'+rows.map(row=>'<option value="'+escapeHtml(row.id)+'" '+(row.id===selectedSessionId?'selected':'')+'>'+escapeHtml(formatDate(row.session_date,{day:'2-digit',month:'short',year:'numeric'}))+' · '+escapeHtml(row.theme||'Séance')+' · '+Number(row.duration_minutes||60)+' min</option>').join('');
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
  const criteriaMarkup=groups.length?groups.map((group,index)=>`<details class="criterion-theme coach-theme evaluation-theme" data-theme-index="${index}">
    <summary><span class="theme-summary-main"><span class="theme-summary-dot">✦</span><span>${escapeHtml(group.theme)}</span></span><span class="theme-summary-meta"><small data-theme-count="${index}">0 sélectionné</small><span class="theme-chevron">⌄</span></span></summary>
    <div class="criterion-theme-content">${group.subthemes.map((sub,subIndex)=>`<details class="criterion-subtheme-card" ${subIndex===0?'open':''}><summary><span>${escapeHtml(sub.subtheme||group.theme)}</span><span class="subtheme-summary-meta"><small>Voir les observations</small><b>⌄</b></span></summary><div class="criterion-subtheme-body"><div class="criterion-columns"><div class="criterion-column-positive"><p class="criterion-positive-title"><span>✓</span> Réussites</p>${sub.positive.map(item=>`<label class="criterion-option positive"><input type="checkbox" name="criterion" value="${item.id}" data-criterion-id="${item.id}"><span>${escapeHtml(item.criterion)}</span></label>`).join('')||'<small class="muted">Aucun critère enregistré.</small>'}</div><div class="criterion-column-improvement"><p class="criterion-improvement-title"><span>↗</span> À améliorer</p>${sub.improvement.map(item=>`<div class="criterion-measure-row"><label class="criterion-option improvement"><input type="checkbox" name="criterion" value="${item.id}" data-criterion-id="${item.id}"><span>${escapeHtml(item.criterion)}</span></label><input class="criterion-measure" type="number" step="0.1" name="measure_${item.id}" aria-label="Mesure pour ${escapeHtml(item.criterion)}" placeholder="Mesure" disabled></div>`).join('')||'<small class="muted">Aucun critère enregistré.</small>'}</div></div></div></details>`).join('')}</div></details>`).join(''):'<div class="empty-state"><h3>Catalogue de critères non importé</h3><p>Le formulaire est prêt. Aucun critère n’a été inventé pour compléter les listes manquantes.</p></div>';
  showDialog(`<div class="dialog-head evaluation-dialog-head"><div><p class="eyebrow">COACH IN · SUIVI INDIVIDUEL</p><h2>Créer un bilan</h2><p class="muted">Un regard précis sur le travail réalisé et les prochaines étapes.</p></div><button class="btn icon-btn" data-close>✕</button></div>
  <form id="evaluation-form" class="form-grid evaluation-form evaluation-redesign">
    <div class="evaluation-intro-card span-2"><div class="evaluation-intro-icon">✦</div><div><strong>Le parcours de progression</strong><p>Choisis le joueur, relève les observations sur le terrain, puis attribue une note à chaque secteur.</p></div></div>
    <div class="evaluation-stepper span-2"><span class="step-current"><b>01</b> Joueur</span><i></i><span><b>02</b> Observations</span><i></i><span><b>03</b> Évaluation</span><i></i><span><b>04</b> Enregistrer</span></div>
    <section class="evaluation-player-section span-2"><div class="evaluation-block-heading"><span class="evaluation-block-number">01</span><div><p class="form-section-title">Joueur évalué</p><small>À qui s’adresse ce bilan ?</small></div></div><label class="evaluation-player-select"><span>Joueur</span><select name="player_id" required>${state.players.map(p=>`<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</option>`).join('')}</select></label><label class="evaluation-player-select"><span>Séance associée (facultatif)</span><select name="session_id"><option value="">Aucune séance associée</option></select><small>Relie ce bilan à un entraînement déjà enregistré.</small></label></section>
    <section class="evaluation-criteria-section span-2"><div class="evaluation-block-heading"><span class="evaluation-block-number">02</span><div><p class="form-section-title">Observations du terrain</p><small>Repère les réussites et les points à faire progresser.</small></div><span class="selection-total" data-selection-total>0 critère</span></div>${criteriaMarkup}
      <div class="criteria-validation"><div><strong data-validation-title>Sélection à confirmer</strong><small data-validation-hint>Plusieurs réussites et axes de progression peuvent être sélectionnés.</small></div><button type="button" class="btn subtle" data-confirm-criteria>Confirmer les observations ✓</button></div>
    </section>
    <section class="evaluation-scores-section span-2"><div class="evaluation-block-heading"><span class="evaluation-block-number">03</span><div><p class="form-section-title">Évaluation par secteur</p><small>Attribue une note de 0 à 20 selon ton observation.</small></div></div><div class="score-grid evaluation-score-grid">${[['technical_score','Technique','01','score-technique'],['tactical_score','Tactique','02','score-tactique'],['physical_score','Physique','03','score-physique'],['mental_score','Mental','04','score-mental']].map(([key,label,num,cls])=>`<label class="evaluation-score-card ${cls}"><span class="evaluation-score-top"><b>${label}</b><i>${num}</i></span><span class="evaluation-score-input"><input type="number" name="${key}" min="0" max="20" step="0.5" placeholder="—"><small>/ 20</small></span><span class="evaluation-score-scale">Note du coach</span></label>`).join('')}</div><p class="evaluation-score-note">La moyenne générale est calculée uniquement à partir des secteurs renseignés.</p></section>
    <div class="dialog-actions span-2 evaluation-dialog-actions"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Enregistrer le bilan <span>↗</span></button></div>
  </form>`);
  updateEvaluationSessionOptions(state.players[0]?.id||'');
  updateEvaluationSelectionUI();
}

function initializePlayerProfileTabs(){
  const dialog=$('#dialog-content');
  if(!dialog?.querySelector('.player-game-card'))return;
  const sections=[...dialog.querySelectorAll('.sheet-section')];
  const groups=[
    {id:'profile',label:'Profil',match:['IDENTITÉ SPORTIVE','PROJET DU JOUEUR','COLLABORATION MULTI-COACHS']},
    {id:'performance',label:'Performance',match:['BILAN DE PERFORMANCE','ANALYSE COUP PAR COUP','POINTS D’APPUI','AXES DE PROGRESSION','OBJECTIF PERSONNALISÉ']},
    {id:'objectives',label:'Objectifs',match:['COACH IN INTELLIGENCE','PROGRAMME','CYCLE ADAPTATIF']},
    {id:'success',label:'Réussites',match:['BADGES DE PROGRESSION','VUE D’ENSEMBLE']},
    {id:'history',label:'Historique',match:['CHRONOLOGIE COMPLÈTE','JOURNAL SPORTIF','TRAVAIL SUR LE COURT','ESPACE CONFIDENTIEL']}
  ];
  sections.forEach(section=>{
    const label=(section.querySelector('.eyebrow')?.textContent||'').trim().toLocaleUpperCase('fr');
    let group=groups.find(item=>item.match.some(match=>label.includes(match)));
    if(!group&&/BILAN|PERFORMANCE|OBSERVATION|ANALYSE COUP|POINTS D’APPUI|AXES DE PROGRESSION/.test(label))group=groups[1];
    if(!group&&/OBJECTIF|PROGRAMMATION|INTELLIGENCE|CYCLE|PROJET/.test(label))group=groups[2];
    if(!group&&/BADGE|RÉUSSITE|FORCES/.test(label))group=groups[3];
    if(!group&&/HISTORIQUE|CHRONOLOGIE|JOURNAL|TRAVAIL SUR LE COURT|CONFIDENTIEL/.test(label))group=groups[4];
    if(!group&&/IDENTITÉ|COLLABORATION|INFORMATIONS|PROFIL/.test(label))group=groups[0];
    section.dataset.profileSection=group?.id||'profile';
  });
  const nav='<nav class="player-profile-tabs" aria-label="Rubriques de la fiche joueur">'+groups.map((group,index)=>'<button type="button" class="player-profile-tab '+(index===0?'is-active':'')+'" data-profile-tab="'+group.id+'">'+group.label+'</button>').join('')+'</nav>';
  dialog.querySelector('.profile-hero-stats')?.insertAdjacentHTML('afterend',nav);
  const activate=id=>{
    dialog.querySelectorAll('[data-profile-section]').forEach(section=>{section.hidden=section.dataset.profileSection!==id;});
    dialog.querySelectorAll('[data-profile-tab]').forEach(button=>{const active=button.dataset.profileTab===id;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));});
  };
  activate('profile');
  dialog.querySelectorAll('[data-profile-tab]').forEach(button=>button.addEventListener('click',()=>activate(button.dataset.profileTab)));
}

const PLAYER_AVATAR_PRESETS=[["style:navy","Bleu marine"],["style:emerald","Vert profond"],["style:slate","Gris ardoise"],["style:burgundy","Bordeaux"],["style:teal","Bleu pétrole"],["style:graphite","Graphite"],["style:indigo","Indigo"],["style:bronze","Bronze"]];
function playerAvatarMarkup(profile,className){
  const value=String(profile?.avatar_url||'');
  if(value.startsWith('https://'))return '<div class="'+className+' player-avatar-photo"><img src="'+escapeHtml(value)+'" alt="Avatar du joueur"></div>';
  const style=PLAYER_AVATAR_PRESETS.some(row=>row[0]===value)?value.replace('style:',''):'navy';
  const initials=escapeHtml((profile?.first_name||'?').slice(0,1)+(profile?.last_name||'').slice(0,1));
  return '<div class="'+className+' player-avatar-monogram avatar-'+style+'" aria-label="Initiales du joueur">'+initials+'</div>';
}
function playerGameAvatarMarkup(profile){
  const photo=String(profile?.avatar_url||'');
  if(photo.startsWith('https://'))return '<div class="game-card-avatar player-avatar-photo"><img src="'+escapeHtml(photo)+'" alt="Avatar du joueur"></div>';
  return '<div class="game-card-avatar game-avatar-illustration" role="img" aria-label="Avatar illustré de joueur de tennis"><svg viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="gameAvatarJersey" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#62d8f2"/><stop offset="1" stop-color="#2456a8"/></linearGradient><linearGradient id="gameAvatarSkin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5c9a6"/><stop offset="1" stop-color="#b87556"/></linearGradient></defs><circle cx="48" cy="48" r="47" fill="#14243a"/><circle cx="48" cy="48" r="39" fill="#203d5b"/><g transform="rotate(18 75 52)" fill="none" stroke="#d8eaff" stroke-width="3"><ellipse cx="77" cy="36" rx="8" ry="13"/><path d="M77 49v19m-4-19 8-13m-8 0 8 13"/></g><path d="M13 96c2-20 14-31 35-31s33 11 35 31" fill="url(#gameAvatarJersey)"/><path d="M39 61h18v14H39z" fill="url(#gameAvatarSkin)"/><path d="M29 39c0-17 8-26 20-26s20 9 20 26v11c0 13-9 23-20 23S29 63 29 50z" fill="url(#gameAvatarSkin)"/><path d="M28 43c-3-20 7-32 22-32 14 0 22 10 20 28-5-2-9-7-11-12-8 8-18 12-31 12z" fill="#18202e"/><path d="M29 35c11 5 27 4 40-3l2 8c-15 7-30 8-43 2z" fill="#f4d34e"/><path d="M40 49h3m10 0h3" stroke="#563d35" stroke-width="2.5" stroke-linecap="round"/><path d="M44 59c3 2 6 2 9 0" fill="none" stroke="#8e4d42" stroke-width="2" stroke-linecap="round"/><path d="M30 78l18 11 18-11 8 18H22z" fill="#f3f7fb" opacity=".92"/><path d="M40 67l8 9 8-9" fill="none" stroke="#f3f7fb" stroke-width="2"/></svg></div>';
}
function playerMindmapMarkup(player,goals,average,reportCount,challenge,achievements){
  const node=(kind,icon,title,value,sub)=>'<article class="mindmap-node mindmap-'+kind+'"><span class="mindmap-node-icon">'+icon+'</span><div><small>'+title+'</small><strong>'+escapeHtml(value||'À compléter')+'</strong><span>'+escapeHtml(sub||'')+'</span></div></article>';
  return '<section class="player-mindmap-card"><div class="mindmap-heading"><div><p class="eyebrow">CARTE MENTALE DU JOUEUR</p><h3>Son univers tennis</h3><p>Une vue visuelle de son identité et de son parcours</p></div><span class="mindmap-mark">COACH IN · PLAYER MAP</span></div><div class="player-mindmap"><div class="mindmap-center"><span class="mindmap-center-mark" aria-hidden="true">CI</span><strong>'+escapeHtml([player.first_name,player.last_name].filter(Boolean).join(' '))+'</strong><span>'+escapeHtml(player.fft_ranking||'Classement à renseigner')+'</span><small>'+escapeHtml(player.player_type||'Loisir')+' · '+escapeHtml(player.age_category||'Catégorie à renseigner')+'</small></div><div class="mindmap-branches">'+
  node('identity','♙','PROFIL',player.birth_date?formatDate(player.birth_date):'Âge non renseigné',player.email||'Coordonnées à compléter')+
  node('goal','◎','OBJECTIF',goals.objective,goals.focus?'Axe : '+goals.focus:'Projet personnel')+
  node('performance','◈','PERFORMANCE',average===null?'En attente de bilan':average.toFixed(1).replace('.',',')+'/20',reportCount+' bilan(s) enregistré(s)')+
  node('progress','↗','PROGRESSION',challenge?.criterion||'Pas de défi actif',challenge?.objective||'Prochain défi à définir')+
  node('success','✦','RÉUSSITES',achievements.length+' badge(s)',achievements[0]?.criterion||'Les acquis apparaîtront ici')+
  '</div></div></section>';
}
function playerSheetDialog(playerId){
  try { return renderPlayerSheetDialog(playerId); }
  catch(error) {
    console.error('Coach In · chargement de la fiche joueur', error);
    toast(error?.message || 'La fiche joueur n’a pas pu être chargée. Réessaie après actualisation.', 'error');
  }
}

function renderPlayerSheetDialog(playerId){
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
  const playerGoals=state.playerProfileDetailsById?.[playerId]||{};
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
  const observationDayCount=new Set(reports.map(report=>String(report.evaluated_at||report.created_at||'').slice(0,10)).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value))).size;
  const scoreStats=scoreAxes.map(axis=>{
    const byDay=new Map();
    reports.forEach(report=>{
      const day=String(report.evaluated_at||report.created_at||'').slice(0,10),value=scoreValue(report,axis[1]);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(value)||value<0||value>20)return;
      if(!byDay.has(day))byDay.set(day,[]);
      byDay.get(day).push(value);
    });
    const daily=[...byDay.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,values])=>({date,value:values.reduce((sum,x)=>sum+x,0)/values.length}));
    const latest=daily.length?daily[daily.length-1].value:null;
    const average=daily.length?daily.reduce((sum,x)=>sum+x.value,0)/daily.length:null;
    const delta=daily.length>=6
      ? Number((daily.slice(-3).reduce((sum,x)=>sum+x.value,0)/3-daily.slice(-6,-3).reduce((sum,x)=>sum+x.value,0)/3).toFixed(1))
      : null;
    return {label:axis[0],key:axis[1],color:axis[2],latest,delta,average,count:daily.length};
  });
  const latestDay=reports[0]?String(reports[0].evaluated_at||reports[0].created_at||'').slice(0,10):'';
  const latest=reports[0];
  const latestValues=latest?scoreAxes.map(axis=>[axis[0],scoreValue(latest,axis[1])]):[];
  const validValues=latestValues.filter(x=>Number.isFinite(x[1])&&x[1]>=0&&x[1]<=20);
  let radar='<p class="chart-empty">Le radar affiche la moyenne des notes du dernier jour d’observation. Les tendances demandent six journées notées.</p>';
  if(validValues.length){
    const center=180,radius=118,angle=i=>-Math.PI/2+i*Math.PI/2;
    const xy=(value,index)=>{const d=Math.max(0,Math.min(20,value))/20*radius;return {x:center+Math.cos(angle(index))*d,y:center+Math.sin(angle(index))*d};};
    const outer=scoreAxes.map((axis,i)=>({x:center+Math.cos(angle(i))*radius,y:center+Math.sin(angle(i))*radius}));
    const sectors=scoreAxes.map((axis,i)=>'<polygon class="radar-sector" fill="'+axis[2]+'" points="'+center+','+center+' '+outer[i].x+','+outer[i].y+' '+outer[(i+1)%4].x+','+outer[(i+1)%4].y+'"/>').join('');
    const rings=[.2,.4,.6,.8,1].map((f,level)=>{const pts=Array.from({length:4},(_,i)=>{const d=radius*f;return (center+Math.cos(angle(i))*d)+','+(center+Math.sin(angle(i))*d);}).join(' ');return '<polygon class="radar-grid radar-grid-'+(level+1)+'" points="'+pts+'"/>';}).join('');
    const spokes=scoreAxes.map((axis,i)=>'<line class="radar-spoke radar-spoke-domain" stroke="'+axis[2]+'" x1="'+center+'" y1="'+center+'" x2="'+outer[i].x+'" y2="'+outer[i].y+'"/>').join('');
    const labels=scoreAxes.map((axis,i)=>{const p={x:center+Math.cos(angle(i))*151,y:center+Math.sin(angle(i))*151};const anchor=i===1?'start':i===3?'end':'middle';return '<text class="radar-label radar-domain-label" fill="'+axis[2]+'" text-anchor="'+anchor+'" x="'+p.x+'" y="'+(p.y+5)+'">'+axis[0]+'</text>';}).join('');
    const complete=validValues.length===4;
    const polygon=complete?latestValues.map((x,i)=>{const p=xy(x[1],i);return p.x+','+p.y;}).join(' '):'';
    const segments=complete?latestValues.map((x,i)=>{const p1=xy(x[1],i),p2=xy(latestValues[(i+1)%4][1],(i+1)%4);return '<line class="radar-color-segment" stroke="'+scoreAxes[i][2]+'" x1="'+p1.x+'" y1="'+p1.y+'" x2="'+p2.x+'" y2="'+p2.y+'"/>';}).join(''):'';
    const points=latestValues.map((x,i)=>{if(!Number.isFinite(x[1])||x[1]<0||x[1]>20)return '';const p=xy(x[1],i);return '<circle class="radar-point radar-domain-point" fill="'+scoreAxes[i][2]+'" cx="'+p.x+'" cy="'+p.y+'" r="7"/>';}).join('');
    radar='<div class="radar-wrap player-sheet-radar radar-premium"><p class="tiny muted">Dernier bilan enregistré · les bilans du même jour ne sont pas cumulés</p><svg viewBox="0 0 360 360" role="img" aria-label="Toile de compétences colorée sur 20"><defs><linearGradient id="playerRadarFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#43d4f2" stop-opacity=".48"/><stop offset="35%" stop-color="#a78bfa" stop-opacity=".36"/><stop offset="70%" stop-color="#66e0ad" stop-opacity=".34"/><stop offset="100%" stop-color="#ffb36e" stop-opacity=".42"/></linearGradient></defs>'+sectors+rings+spokes+(complete?'<polygon class="radar-area" fill="url(#playerRadarFill)" points="'+polygon+'"/>':'')+segments+points+labels+'<circle class="radar-center" cx="'+center+'" cy="'+center+'" r="5"/></svg></div>';
  }
  const averageLatest=validValues.length?validValues.reduce((sum,x)=>sum+x[1],0)/validValues.length:null;

  const ratedReports=reports.map(report=>{
    const values=scoreAxes.map(axis=>scoreValue(report,axis[1])).filter(value=>Number.isFinite(value)&&value>=0&&value<=20);
    return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
  }).filter(value=>value!==null);
  const bestPerformanceScore=ratedReports.length?Math.max(...ratedReports):null;
  const playerCardScore=bestPerformanceScore===null?0:Math.round(bestPerformanceScore*5);
  const playerCardTier=playerCardScore>=95?{id:'platinum',name:'Platine',next:null,min:95,max:100,mark:'IV'}:playerCardScore>=90?{id:'gold',name:'Or',next:'Platine',min:90,max:95,mark:'III'}:playerCardScore>=75?{id:'silver',name:'Argent',next:'Or',min:75,max:90,mark:'II'}:{id:'bronze',name:'Bronze',next:'Argent',min:0,max:75,mark:'I'};
  const tierProgress=playerCardTier.next?Math.max(0,Math.min(100,(playerCardScore-playerCardTier.min)/(playerCardTier.max-playerCardTier.min)*100)):100;
  const playerCardStats=scoreStats.map(item=>'<div class="game-stat"><div><span>'+item.label+'</span><strong>'+(item.latest===null?'—':Math.round(item.latest*5))+'</strong></div><i><b style="width:'+(item.latest===null?0:item.latest/20*100)+'%"></b></i></div>').join('');
  const progressionCardMarkup='<section class="player-game-card tier-'+playerCardTier.id+'"><div class="game-card-top"><span>COACH IN <b>PLAYER CARD</b></span><span>CARTE TENNIS · '+playerCardTier.mark+'</span></div><div class="game-card-main"><label class="game-card-photo-trigger" title="Cliquer pour ajouter ou remplacer la photo">'+playerGameAvatarMarkup(player)+'<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-player-card-photo="'+escapeHtml(player.id)+'" aria-label="Ajouter ou remplacer la photo du joueur"></label><div class="game-card-identity"><small>CARTE JOUEUR · '+escapeHtml(player.age_category||'TENNIS')+'</small><h2>'+escapeHtml(player.first_name)+' '+escapeHtml(player.last_name)+'</h2><span>'+escapeHtml(player.fft_ranking||'Classement à renseigner')+' · '+escapeHtml(player.player_type||'Loisir')+'</span><div class="game-card-rating"><strong>'+(bestPerformanceScore===null?'—':playerCardScore)+'</strong><small>'+(bestPerformanceScore===null?'À ÉVALUER':bestPerformanceScore.toFixed(1).replace('.',',')+'/20')+'</small></div><div class="game-card-quick-facts"><span>ÂGE <b>'+escapeHtml(playerAge)+'</b></span><span>CATÉGORIE <b>'+escapeHtml(player.age_category||'—')+'</b></span><span>OBJECTIF <b>'+escapeHtml(playerGoals.objective||challenge?.criterion||'À définir')+'</b></span></div></div></div><div class="game-card-stats">'+playerCardStats+'</div><div class="game-card-progress"><div><span>'+(playerCardTier.next?'PROGRESSION VERS '+playerCardTier.next.toUpperCase():'NIVEAU PLATINE ATTEINT')+'</span><b>'+(playerCardTier.next?(playerCardScore-playerCardTier.min)+' / '+(playerCardTier.max-playerCardTier.min)+' pts':'MAX')+'</b></div><i><b style="width:'+tierProgress+'%"></b></i></div><div class="game-card-bottom"><span>'+sessions.length+' SÉANCES</span><span>'+achievements.length+' BADGES</span><span>MEILLEUR SCORE VALIDÉ</span></div></section>';
  showDialog(progressionCardMarkup+'<p class="game-card-loading">Chargement du dossier joueur…</p>');

  const reportDayById=new Map(reports.map(report=>[report.id,String(report.evaluated_at||report.created_at||'').slice(0,10)]));
  const criterionFrequency=type=>{
    const map=new Map();
    criteria.filter(row=>row.criterion_type===type).forEach(row=>{
      const key=row.criterion_id||row.criterion,day=reportDayById.get(row.evaluation_id);
      if(!key||!day)return;
      if(!map.has(key))map.set(key,{criterion:row.criterion,days:new Set()});
      map.get(key).days.add(day);
    });
    return [...map.values()].map(item=>({criterion:item.criterion,count:item.days.size})).sort((a,b)=>b.count-a.count||a.criterion.localeCompare(b.criterion,'fr'));
  };
  const strengths=observationDayCount>=3?criterionFrequency('positive').filter(item=>item.count>=2).slice(0,4):[];
  const priorities=observationDayCount>=3?criterionFrequency('improvement').filter(item=>item.count>=2).slice(0,4):[];
  const criterionList=(items,kind)=>items.length?'<div class="profile-criterion-list">'+items.map(item=>'<div class="profile-criterion-item '+kind+'"><span>'+(kind==='strength'?'✓':'↗')+'</span><div><strong>'+escapeHtml(item.criterion)+'</strong><small>Présent sur '+item.count+' journée(s)</small></div></div>').join('')+'</div>':'<p class="muted">Les tendances apparaîtront avec les prochains bilans détaillés.</p>';
  const themeCounts=new Map();
  criteria.forEach(row=>{const key=row.main_theme||'Autres';themeCounts.set(key,(themeCounts.get(key)||0)+1);});
  const themeSummary=[...themeCounts].sort((a,b)=>b[1]-a[1]).map(([theme,count])=>'<div class="theme-progress-row"><span>'+escapeHtml(theme)+'</span><div class="theme-progress-track"><i style="width:'+Math.min(100,count/Math.max(1,...themeCounts.values())*100)+'%"></i></div><b>'+count+'</b></div>').join('');
  const normalizeShot=value=>String(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim();
  const shotDomains=[
    {id:'forehand',label:'Coup droit',match:['coup droit','cd ','cd-','cd_']},
    {id:'backhand',label:'Revers',match:['revers','rv ','rv-','rv_']},
    {id:'service',label:'Service',match:['service','premiere balle','deuxieme balle','lancer']},
    {id:'return',label:'Retour',match:['retour','retour de service']},
    {id:'volley',label:'Volée',match:['volee','volée']},
    {id:'movement',label:'Déplacements & physique',match:['physique','deplacement','rapidite','coordination','explosivite','vitesse']}
  ];
  const shotStatsMarkup='<section class="sheet-section shot-by-shot-section"><div class="section-heading"><div><p class="eyebrow">ANALYSE COUP PAR COUP</p><h3>Statistiques par domaine de jeu</h3><p class="tiny muted">Comptage des critères réellement cochés dans les bilans, sans note inventée.</p></div><span class="tag">'+criteria.length+' observations</span></div><div class="shot-domain-grid">'+shotDomains.map(domain=>{
    const rows=criteria.filter(row=>{const text=normalizeShot([row.main_theme,row.subtheme,row.criterion].join(' '));return domain.match.some(term=>text.includes(normalizeShot(term)));});
    const distinct=new Map();
    rows.forEach(row=>{const key=String(row.criterion_id||row.criterion||'');if(!key)return;if(!distinct.has(key))distinct.set(key,{label:row.criterion||domain.label,positive:new Set(),improvement:new Set()});const day=reportDayById.get(row.evaluation_id)||row.evaluation_id;const bucket=row.criterion_type==='positive'?'positive':row.criterion_type==='improvement'?'improvement':null;if(bucket)distinct.get(key)[bucket].add(day);});
    const items=[...distinct.values()].sort((a,b)=>(b.positive.size+b.improvement.size)-(a.positive.size+a.improvement.size)||a.label.localeCompare(b.label,'fr'));
    const positives=rows.filter(row=>row.criterion_type==='positive').length,improvements=rows.filter(row=>row.criterion_type==='improvement').length;
    return '<article class="shot-domain-card shot-'+domain.id+'"><div class="shot-domain-head"><span>'+domain.label+'</span><strong>'+items.length+'</strong></div><div class="shot-domain-totals"><span class="shot-positive">✓ '+positives+' réussites</span><span class="shot-improvement">↗ '+improvements+' axes de travail</span></div>'+(items.length?'<div class="shot-criterion-list">'+items.map(item=>'<div class="shot-criterion-row"><span>'+escapeHtml(item.label)+'</span><small><b class="shot-positive">'+item.positive.size+' ✓</b><b class="shot-improvement">'+item.improvement.size+' ↗</b></small></div>').join('')+'</div>':'<p class="tiny muted">Aucun critère évalué dans ce domaine.</p>')+'</article>';
  }).join('')+'</div></section>';
  const nextObjectiveMarkup=challenge
    ?'<div class="next-objective-card"><span class="eyebrow">OBJECTIF ACTIF · À FAIRE PROGRESSER</span><h4>'+escapeHtml(challenge.criterion)+'</h4><p>'+escapeHtml(challenge.objective||'Objectif défini avec le coach')+'</p><div class="next-objective-progress"><span>Progression renseignée</span><strong>'+escapeHtml(String(challenge.current_value??'—'))+' / '+escapeHtml(String(challenge.target_value??'—'))+'</strong></div><small>'+(challenge.consecutive_successes||0)+'/2 validations consécutives</small></div>'
    :portraitPriority
      ?'<div class="next-objective-card is-suggested"><span class="eyebrow">PROCHAINE PRIORITÉ SUGGÉRÉE</span><h4>'+escapeHtml(portraitPriority.criterion)+'</h4><p>Ce critère revient dans les bilans récents. Définis avec le joueur une cible mesurable pour en faire son prochain défi.</p><button class="btn primary" data-create-challenge="'+playerId+'" data-criterion="'+escapeHtml(portraitPriority.criterion)+'" data-criterion-id="'+escapeHtml(portraitPriority.criterion_id||'')+'">Créer le prochain objectif</button></div>'
      :'<div class="next-objective-card is-empty"><h4>Prochain objectif à définir</h4><p>Après plusieurs bilans détaillés, Coach In pourra faire ressortir un axe récurrent. Tu pourras ensuite le transformer en défi mesurable.</p></div>';
  const coachName=state.profile?[state.profile.first_name,state.profile.last_name].filter(Boolean).join(' '):'Ton espace coach';
  const sectorCards=scoreStats.map(item=>'<article class="profile-sector-card" style="--sector-color:'+item.color+'"><div class="profile-sector-heading"><span>'+item.label+'</span>'+(item.delta===null?'<small>—</small>':'<small class="'+(item.delta>=0?'positive':'improvement')+'">'+(item.delta>0?'+':'')+item.delta.toFixed(1).replace('.',',')+' pts</small>')+'</div><strong>'+(item.latest===null?'—':item.latest.toFixed(1).replace('.',',')+'/20')+'</strong><div class="profile-sector-track"><i style="width:'+(item.latest===null?0:item.latest/20*100)+'%"></i></div><small>'+(item.count?'Moyenne '+item.average.toFixed(1).replace('.',',')+'/20 · '+item.count+' journée(s)':'Pas encore noté')+'</small></article>').join('');
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
  const activeChallenges=(state.challenges||[]).filter(row=>row.player_id===playerId&&row.coach_id===coachId);
  const portraitRecommendation=recommendSessionExercises({
    playerId,
    evaluations:reports,
    evaluationCriteria:criteria,
    library:state.library||[],
    sessions,
    challenges:activeChallenges,
    videoAnalyses:videoRows
  });
  const recentVideo=[...videoRows].sort((a,b)=>String(b.analyzed_at||b.created_at||'').localeCompare(String(a.analyzed_at||a.created_at||'')))[0]||null;
  const portraitPriority=portraitRecommendation?.priority||null;
  const portraitStrengths=strengths.slice(0,2);
  const portraitTrend=scoreStats.filter(item=>item.delta!==null).sort((a,b)=>b.delta-a.delta);
  const portraitExercises=[portraitRecommendation?.exerciseOne,portraitRecommendation?.exerciseTwo].filter(Boolean);
  const adaptiveProgram=buildAdaptiveTrainingProgram({
    player,
    evaluations:reports,
    evaluationCriteria:criteria,
    sessions,
    videoAnalyses:videoRows,
    challenges:activeChallenges,
    library:state.library||[]
  });
  const adaptiveProgramMarkup='<section class="sheet-section adaptive-training-program"><div class="section-heading"><div><p class="eyebrow">PROGRAMMATION INTELLIGENTE</p><h3>Cycle personnalisé · 10 séances</h3></div><span class="tag">'+(adaptiveProgram.ready?'Programme prêt':'À compléter')+'</span></div><p class="tiny muted">Un parcours de 10 séances, de la stabilisation au transfert en match. Chaque étape s’adapte aux observations du joueur.</p>'+(adaptiveProgram.ready?'<div class="profile-program-focus"><small>Fil conducteur du cycle</small><strong>'+escapeHtml(adaptiveProgram.focus)+'</strong><small>'+adaptiveProgram.completedSessionCount+' séance(s) enregistrée(s) dans son historique · cycle proposé indépendamment du calendrier</small></div><div class="profile-program-weeks">'+adaptiveProgram.sessions.map((item,index)=>'<article class="profile-program-week"><div class="profile-program-week-heading"><span class="profile-program-number">'+String(item.number).padStart(2,'0')+'</span><div><small>SÉANCE '+item.number+' · '+escapeHtml(item.stage)+'</small><h4>'+escapeHtml(item.title)+'</h4></div></div><p>'+escapeHtml(item.objective)+'</p><div class="profile-program-detail"><small>Consigne coach</small><span>'+escapeHtml(item.coachAction)+'</span></div><div class="profile-program-detail"><small>Validation</small><span>'+escapeHtml(item.success)+'</span></div>'+(item.exercise?'<div class="profile-program-exercise"><span>Exercice conseillé</span><strong>'+escapeHtml(item.exercise.title)+'</strong><button class="btn subtle" data-use-library="'+item.exercise.id+'">Utiliser cet exercice</button></div>':'<p class="tiny muted">Aucun exercice suffisamment proche dans la bibliothèque pour cette étape.</p>')+'<button class="btn primary" data-personalized-session="'+playerId+'" data-program-objective="'+escapeHtml(item.objective)+'" data-program-title="'+escapeHtml(item.title)+'" data-program-stage="'+escapeHtml(item.stage)+'" data-program-exercise="'+escapeHtml(item.exercise?.id||'')+'">Préparer cette séance</button></article>').join('')+'</div>'+(adaptiveProgram.activeChallenge?'<p class="tiny muted">Défi intégré au cycle : '+escapeHtml(adaptiveProgram.activeChallenge.objective||adaptiveProgram.activeChallenge.criterion)+'</p>':''):'<div class="empty-state"><strong>Encore un peu d’observation avant de programmer.</strong><p>'+escapeHtml(adaptiveProgram.reason)+'</p><small>Un deuxième bilan permettra de comparer les observations et de construire un cycle fiable.</small></div>')+'</section>';
  const portraitMarkup='<section class="sheet-section player-learning-twin"><div class="section-heading"><div><p class="eyebrow">COACH IN · JUMEAU PÉDAGOGIQUE</p><h3>Le portrait vivant du joueur</h3></div><span class="tag">Mis à jour automatiquement</span></div><p class="tiny muted">Une synthèse construite à partir des données déjà enregistrées dans ton espace coach.</p><div class="profile-info-grid"><div><small>Priorité actuelle</small><strong>'+escapeHtml(portraitPriority?.criterion||portraitRecommendation?.priority?.criterion||'À définir avec les prochains bilans')+'</strong></div><div><small>Point d’appui</small><strong>'+escapeHtml(portraitStrengths[0]?.criterion||'À observer')+'</strong></div><div><small>Défi en cours</small><strong>'+escapeHtml(challenge?.criterion||'Aucun défi actif')+'</strong></div><div><small>Dernière analyse vidéo</small><strong>'+escapeHtml(recentVideo?.title||'Aucune analyse disponible')+'</strong></div></div><div class="profile-criterion-list">'+(portraitStrengths.length?portraitStrengths.map(item=>'<div class="profile-criterion-item strength"><span>✓</span><div><strong>'+escapeHtml(item.criterion)+'</strong><small>Point fort confirmé sur '+item.count+' journée(s)</small></div></div>').join(''):'<p class="muted">Les points forts récurrents apparaîtront avec les prochains bilans.</p>')+(portraitPriority?'<div class="profile-criterion-item improvement"><span>↗</span><div><strong>'+escapeHtml(portraitPriority.criterion)+'</strong><small>Axe récurrent sur au moins deux journées d’observation</small></div></div>':'')+'</div><div class="profile-info-grid">'+(portraitTrend.length?portraitTrend.slice(0,2).map(item=>'<div><small>Évolution · '+escapeHtml(item.label)+'</small><strong class="'+(item.delta>=0?'positive':'improvement')+'">'+(item.delta>0?'+':'')+item.delta.toFixed(1).replace('.',',')+' pts</strong></div>').join(''):'<div class="span-2"><small>Tendance</small><strong>Six journées notées sont nécessaires : trois pour la période récente et trois pour la période précédente.</strong></div>')+'</div>'+(recentVideo?'<p class="tiny muted"><b>Dernier retour vidéo :</b> '+escapeHtml(recentVideo.analysis_result?.summary||'Analyse enregistrée, sans résumé disponible.')+'</p>':'')+'<div class="sheet-section"><p class="eyebrow">PROCHAINE ÉTAPE CONSEILLÉE</p>'+(portraitExercises.length?'<div class="list-stack">'+portraitExercises.map((item,index)=>'<article class="list-card"><div class="list-main"><strong>'+escapeHtml(item.title||'Exercice conseillé')+'</strong><span>'+(index===0?'Priorité recommandée':'Variante complémentaire')+(item.theme?' · '+escapeHtml(item.theme):'')+'</span></div><button class="btn subtle" data-use-library="'+item.id+'">Utiliser</button></article>').join('')+'</div>':'<p class="muted">'+escapeHtml(portraitRecommendation?.reason||'Ajoute des critères dans les bilans et des exercices dans ta bibliothèque pour obtenir des recommandations ciblées.')+'</p>')+'</div></section>';
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
  showDialog(progressionCardMarkup+playerMindmapMarkup(player,playerGoals,averageLatest,reports.length,challenge,achievements)+'<section class="profile-hero-stats"><div><span>ÂGE</span><strong>'+playerAge+'</strong></div><div><span>SÉANCES</span><strong>'+sessions.length+'</strong></div><div><span>BILANS</span><strong>'+reports.length+'</strong></div><div><span>TEMPS DE JEU</span><strong>'+Math.floor(totalMinutes/60)+' h '+(totalMinutes%60)+' min</strong></div></section>'+
  '<section class="sheet-section session-intelligence-cta"><div><p class="eyebrow">COACH IN INTELLIGENCE</p><h3>Préparer la prochaine séance</h3><p class="tiny muted">Construire une séance à partir des derniers bilans et des exercices de ta bibliothèque.</p></div><button class="btn primary" data-personalized-session="'+playerId+'">✦ Générer une séance personnalisée</button></section>'+adaptiveProgramMarkup+'<section class="sheet-section player-personal-info"><div class="section-heading"><div><p class="eyebrow">IDENTITÉ SPORTIVE</p><h3>Informations du joueur</h3></div></div><div class="profile-info-grid"><div><small>Naissance</small><strong>'+(player.birth_date?formatDate(player.birth_date):'Non renseignée')+'</strong></div><div><small>Classement FFT</small><strong>'+escapeHtml(player.fft_ranking||'Non renseigné')+'</strong></div><div><small>Catégorie d’âge</small><strong>'+escapeHtml(player.age_category||'Non renseignée')+'</strong></div><div><small>Profil</small><strong>'+escapeHtml(player.player_type||'Loisir')+'</strong></div><div class="span-2"><small>E-mail</small><strong>'+escapeHtml(player.email||'Non renseigné')+'</strong></div></div></section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">PROJET DU JOUEUR</p><h3>Ses objectifs et motivations</h3></div></div><div class="profile-info-grid"><div class="span-2"><small>Objectif principal</small><strong>'+escapeHtml(playerGoals.objective||'Non renseigné')+'</strong></div><div><small>Motivation</small><strong>'+escapeHtml(playerGoals.motivation||'Non renseignée')+'</strong></div><div><small>Points forts identifiés par le joueur</small><strong>'+escapeHtml(playerGoals.strengths||'Non renseignés')+'</strong></div><div class="span-2"><small>Prochain axe de travail</small><strong>'+escapeHtml(playerGoals.focus||'Non renseigné')+'</strong></div></div></section>'+'<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">COLLABORATION MULTI-COACHS</p><h3>Accès partagés</h3></div><span class="tag">'+shares.length+'</span></div><p class="tiny muted">Chaque coach invité possède son propre planning, ses bilans, ses défis et ses notes confidentielles.</p><div class="list-stack">'+sharesMarkup+'</div></section>'+
  '<section class="sheet-section performance-report-section"><div class="performance-report-heading"><div><p class="eyebrow">BILAN DE PERFORMANCE · '+(latest?formatDate(latest.evaluated_at||latest.created_at,{day:'2-digit',month:'long',year:'numeric'}):'EN ATTENTE')+'</p><h3>Vue d’ensemble du joueur</h3><p class="tiny muted">Une lecture visuelle des quatre dimensions de son jeu.</p></div><span class="performance-report-pill">'+reports.length+' bilan(s)</span></div><div class="performance-report-hero"><div class="performance-average-ring" style="--score-progress:'+((averageLatest??0)/20*100)+'%"><div><strong>'+(averageLatest===null?'—':averageLatest.toFixed(1).replace('.',','))+'</strong><small>/ 20</small></div></div><div class="performance-report-hero-copy"><span>MOYENNE DU DERNIER BILAN</span><strong>'+(averageLatest===null?'Notes à renseigner':averageLatest>=15?'Très bon niveau observé':averageLatest>=12?'Des bases solides':averageLatest>=10?'Progression en construction':'Axes de travail prioritaires')+'</strong><p>'+(latest?.player_visible_comment?escapeHtml(latest.player_visible_comment):'Les observations et les notes des prochains bilans enrichiront cette synthèse.')+'</p></div></div><div class="performance-report-grid"><article class="performance-radar-panel"><div class="performance-panel-heading"><span>01</span><div><b>Radar des compétences</b><small>Équilibre des secteurs · dernier bilan</small></div></div>'+radar+'</article><article class="performance-sectors-panel"><div class="performance-panel-heading"><span>02</span><div><b>Notes par secteur</b><small>Résultats sur 20</small></div></div><div class="profile-sector-list">'+sectorCards+'</div></article></div><div class="performance-observation-panel"><div class="performance-panel-heading"><span>03</span><div><b>Répartition des observations</b><small>Critères relevés dans les bilans</small></div></div><div class="criterion-donut-row">'+(totalCriteria?'<div class="donut-chart" role="img" aria-label="'+positive+' réussites et '+improvement+' points à améliorer" style="background:conic-gradient(#66e0ad 0deg '+positiveAngle+'deg,#ffb36e '+positiveAngle+'deg 360deg)"><div><strong>'+totalCriteria+'</strong><small>observations</small></div></div><div class="chart-legend"><span><i class="legend-dot positive"></i><b>'+positive+'</b> réussites</span><span><i class="legend-dot improvement"></i><b>'+improvement+'</b> axes de travail</span></div>':'<p class="chart-empty">Les critères apparaîtront après les premiers bilans détaillés.</p>')+'</div></div></section>'+
  shotStatsMarkup+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">POINTS D’APPUI</p><h3>Forces récurrentes</h3></div></div>'+criterionList(strengths,'strength')+'</section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">AXES DE PROGRESSION</p><h3>Points à travailler</h3></div></div>'+criterionList(priorities,'improvement')+'</section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">OBJECTIF PERSONNALISÉ</p><h3>Prochain objectif</h3></div></div>'+nextObjectiveMarkup+'</section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">BADGES DE PROGRESSION</p><h3>Réussites débloquées</h3></div><span class="tag">'+achievements.length+'</span></div><div class="achievement-grid">'+(achievements.map(a=>'<div class="achievement-card"><span class="achievement-symbol">✦</span><strong>'+escapeHtml(a.criterion)+'</strong><small>Débloquée le '+formatDate(a.unlocked_at,{day:'2-digit',month:'short',year:'numeric'})+'</small></div>').join('')||'<p class="muted">Aucune réussite débloquée pour le moment.</p>')+'</div></section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">VUE D’ENSEMBLE</p><h3>Thèmes travaillés</h3></div></div>'+(themeSummary||'<p class="muted">Aucun critère détaillé enregistré.</p>')+'</section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">CHRONOLOGIE COMPLÈTE</p><h3>Parcours du joueur</h3></div><span class="tag">'+journeyEvents.length+' événement(s)</span></div><p class="tiny muted">Séances, bilans, réussites, défis et suivis vidéo réunis dans l’ordre chronologique.</p><div class="journey-timeline profile-journey-timeline">'+(journeyMarkup||'<p class="muted">Le parcours apparaîtra au fil des séances et des bilans.</p>')+'</div></section>'+  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">JOURNAL SPORTIF</p><h3>Historique des bilans</h3></div><span class="tag">'+reports.length+'</span></div>'+(historyReports||'<p class="muted">Aucun bilan enregistré.</p>')+'</section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">TRAVAIL SUR LE COURT</p><h3>Historique des séances</h3></div><span class="tag">'+sessions.length+'</span></div>'+(historySessions||'<p class="muted">Aucune séance.</p>')+'</section>'+
  '<section class="sheet-section"><div class="section-heading"><div><p class="eyebrow">ESPACE CONFIDENTIEL</p><h3>Notes privées du coach</h3></div><span class="tag">Privé</span></div>'+(privateNotes||'<p class="muted">Aucune note privée enregistrée.</p>')+'</section>');
  const dialogContent=$('#dialog-content');
  if(dialogContent&&!dialogContent.querySelector('[data-player-sheet-back]')){
    const back=document.createElement('button');
    back.type='button';back.className='btn subtle player-sheet-back';back.dataset.playerSheetBack='true';back.textContent='← Retour aux joueurs';
    back.addEventListener('click',()=>closeDialog());
    dialogContent.prepend(back);
  }
  initializePlayerProfileTabs();
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
function bookingDialog(prefill={}){
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">COURS PARTICULIER</p><h2>Demander un créneau</h2></div><button class="btn icon-btn" data-close>✕</button></div><p class="muted">Choisis une date, une heure, une durée et un court. Le créneau sera soumis au contrôle des conflits puis restera en attente de validation.</p><form id="booking-form" class="form-grid"><label class="span-2">Coach<select name="coach_id" required data-prefill-coach="${prefill.coachId||""}">${(state.playerCoaches||[]).map(c=>`<option value="${c.id}" ${prefill.coachId===c.id?"selected":""}>${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</option>`).join('')}</select></label><label>Date<input name="date" type="date" required min="${toLocalISO(new Date())}" value="${prefill.date||""}"></label><label>Heure<input name="time" type="time" required value="${prefill.time||""}"></label><label>Durée<select name="duration"><option value="60">1 heure</option><option value="90">1 h 30</option><option value="120">2 heures</option></select></label><label>Court<select name="court"><option value="1" ${String(prefill.court||1)==="1"?"selected":""}>Court 1</option><option value="2" ${String(prefill.court||1)==="2"?"selected":""}>Court 2</option><option value="3" ${String(prefill.court||1)==="3"?"selected":""}>Court 3</option><option value="4" ${String(prefill.court||1)==="4"?"selected":""}>Court 4</option></select></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Envoyer la demande</button></div></form>`);
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
  const usedColors=new Set(state.players.filter(row=>row.id!==id&&row.player_color).map(row=>row.player_color));
  const availableCount=PLAYER_COLORS.filter(color=>!usedColors.has(color)).length;
  const colorOptions=PLAYER_COLORS.map((color,index)=>{
    const used=usedColors.has(color),selected=p.player_color===color;
    return `<label class="player-color-option ${used?'is-used':''} ${selected?'is-selected':''}" title="${used?'Déjà attribuée':'Couleur '+(index+1)}">
      <input type="radio" name="player_color" value="${color}" ${selected?'checked':''} ${used?'disabled':''} required>
      <span style="--swatch:${color}"></span><small>${String(index+1).padStart(2,'0')}</small>
    </label>`;
  }).join('');
  const fftRankings=['NC','40','30/5','30/4','30/3','30/2','30/1','30','15/5','15/4','15/3','15/2','15/1','15','5/6','4/6','3/6','2/6','1/6','0','-2/6','-4/6','-15','-30','Promotion','Deuxième série','Première série'];
  const rankingOptions=['',...fftRankings].map(value=>`<option value="${escapeHtml(value)}" ${(p.fft_ranking||'')===value?'selected':''}>${value?escapeHtml(value):'Choisir un classement'}</option>`).join('');
  const ageCategories=['8 ans et moins','9 ans','10 ans','11 ans','12 ans','13/14 ans','15/16 ans','17/18 ans','Seniors','+35 ans','+40 ans','+45 ans','+50 ans','+55 ans','+60 ans','+65 ans','+70 ans','+75 ans','+80 ans','+85 ans'];
  const ageOptions=['',...ageCategories].map(value=>`<option value="${escapeHtml(value)}" ${(p.age_category||'')===value?'selected':''}>${value?escapeHtml(value):'Choisir une catégorie'}</option>`).join('');
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">FICHE JOUEUR</p><h2>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</h2></div><button class="btn icon-btn" data-close>✕</button></div><form id="player-form" class="form-grid"><input type="hidden" name="id" value="${p.id}"><label>Prénom<input name="first_name" required value="${escapeHtml(p.first_name)}"></label><label>Nom<input name="last_name" required value="${escapeHtml(p.last_name)}"></label><label>Date de naissance<input type="date" name="birth_date" value="${p.birth_date||''}"></label><label>Classement FFT<select name="fft_ranking">${rankingOptions}</select></label><label>Catégorie d’âge<select name="age_category">${ageOptions}</select></label><label>Profil<select name="player_type"><option ${p.player_type==='Loisir'?'selected':''}>Loisir</option><option ${p.player_type==='Compétition'?'selected':''}>Compétition</option></select></label><section class="player-color-picker span-2"><div class="player-color-picker-head"><div><b>Couleur du joueur</b><small>Une couleur unique parmi les 50 disponibles.</small></div><strong>${availableCount}/50 libres</strong></div><div class="player-color-grid">${colorOptions}</div><small class="player-color-help">Les couleurs déjà utilisées par un autre joueur sont verrouillées.</small></section><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Enregistrer la fiche</button></div></form>`);
}

$('#dialog-content').addEventListener('click',event=>{if(event.target.closest('[data-close]'))return closeDialog();const challenge=event.target.closest('[data-create-challenge]');if(challenge){event.preventDefault();return challengeDialog(challenge.dataset.createChallenge,challenge.dataset.criterion,challenge.dataset.criterionId);}});
$('#dialog-content').addEventListener('change',event=>{if(['theme','level','exercise_one'].includes(event.target.name)&&event.target.form?.id==='session-builder-form')updateSessionBuilderExerciseOptions();if(event.target.name==='audience' && event.target.form?.id==='group-series-form'){const target=event.target.form.elements.target_sessions;const weekday=event.target.form.elements.weekday;if(target)target.value=event.target.value==='adultes'?28:30;if(weekday)weekday.value=event.target.value==='adultes'?'1':'3';}if(event.target.name==='birth_date'){ const category=$('#player-form [name=age_category]');if(category)category.value=calculateAgeCategory(event.target.value, new Date().getFullYear());}if(event.target.matches('input[name=criterion]')){const row=event.target.closest('.criterion-measure-row');const measure=row?.querySelector('.criterion-measure');if(measure)measure.disabled=!event.target.checked;}});
$('#dialog-content').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;
  if(form.id==='session-builder-form'){
    const button=form.querySelector('[data-generate-session]');
    if(button)button.disabled=true;
    try{generateSessionPlan();}
    catch(error){console.error('Coach In · génération de séance',error);toast(error?.message||'La génération a échoué. Vérifie les informations et réessaie.','error');}
    finally{if(button)button.disabled=false;}
    return;
  }
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
      const conflict=findScheduleConflict({session_date:values.session_date,session_time:values.session_time,duration_minutes:Number(values.duration_minutes),excludeSessionId:values.id||null});
      if(conflict)throw new Error('Ce créneau chevauche déjà '+conflict+'. Choisis un autre horaire.');
      const payload={...values,player_id:values.player_id,created_by:state.user.id,duration_minutes:Number(values.duration_minutes),court_number:Number(values.court_number),status:'Prévue'};
      if(values.id){await dataService.updateSession(values.id,payload,state.user.id);toast('Séance modifiée.');}
      else{await dataService.createSession(payload);toast('Séance enregistrée.');}
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
      await progressionService.saveEvaluation({playerId:values.player_id,coachId:state.user.id,scores,selectedCriteria:selected,sessionId:values.session_id||null});
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
      const {id,...changes}=values;
      if(!PLAYER_COLORS.includes(changes.player_color))throw new Error('Choisis une couleur parmi les 50 couleurs proposées.');
      if(state.players.some(player=>player.id!==id&&player.player_color===changes.player_color))throw new Error('Cette couleur est déjà attribuée à un autre joueur.');
      await dataService.updatePlayer(id,{...changes,first_name:changes.first_name.trim(),last_name:changes.last_name.trim()});
      toast('Fiche joueur et couleur mises à jour.');
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

function findScheduleConflict({session_date,session_time,duration_minutes,excludeGroupId=null,excludeSessionId=null}){
  const start=timeToMinutes(session_time),end=start+Number(duration_minutes||0);
  if(!session_date||end<=start)return null;
  const events=[
    ...(state.sessions||[]).filter(row=>row.session_date===session_date&&row.id!==excludeSessionId&&!['cancelled','annulée','annulee'].includes(String(row.status||'').toLowerCase())).map(row=>({
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
async function completeGroupSession(id){
  try{const {error}=await supabase.from('group_sessions').update({status:'completed'}).eq('id',id).eq('coach_id',state.user.id).eq('status','scheduled');if(error)throw error;toast('Cours collectif marqué comme effectué : le compteur est mis à jour.');await refreshAndRender();}catch(e){toast(e.message,'error');}
}
async function cancelGroupSession(id){
  try{const {error}=await supabase.from('group_sessions').update({status:'cancelled'}).eq('id',id).eq('coach_id',state.user.id).eq('status','scheduled');if(error)throw error;toast('Cours collectif annulé : il ne sera pas compté comme réalisé.');await refreshAndRender();}catch(e){toast(e.message,'error');}
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
  if(notificationChannel){const channel=notificationChannel;notificationChannel=null;supabase.removeChannel(channel).catch(()=>{});}
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
 const summary=$('#weather-summary'); if(summary)summary.textContent='Chargement des prévisions…';
 try{
  const url='https://api.open-meteo.com/v1/forecast?latitude=43.282&longitude=5.516&current=temperature_2m,weather_code,wind_speed_10m&hourly=precipitation_probability,precipitation,weather_code,wind_speed_10m&forecast_days=2&timezone=Europe%2FParis';
  const response=await fetch(url); if(!response.ok)throw new Error('Prévisions indisponibles');
  const data=await response.json(); if(request!==weatherRequest||state.currentPage!=='planning')return;
  const now=Date.now(); const times=data.hourly.time||[];
  const next=times.map((time,index)=>({time,index,stamp:new Date(time).getTime(),prob:Number(data.hourly.precipitation_probability?.[index]||0),rain:Number(data.hourly.precipitation?.[index]||0)})).filter(row=>row.stamp>=now&&row.stamp<=now+8*3600000);
  const max=next.reduce((best,row)=>row.prob>best.prob?row:best,{prob:0,rain:0,time:''});
  const fmt=time=>new Date(time).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  const current=data.current||{};
  const title=$('#weather-title'); if(title)title.textContent=(current.temperature_2m??'—')+' °C · '+weatherDescription(current.weather_code);
  const icon=$('#weather-icon'); if(icon)icon.textContent=weatherIcon(current.weather_code);
  const windRows=next.map(row=>Number(data.hourly.wind_speed_10m?.[row.index]??0));
  const wind=Math.round(Number(current.wind_speed_10m??(windRows.length?windRows.reduce((sum,value)=>sum+value,0)/windRows.length:0)));
  const rainText=!next.length?'Prévisions horaires indisponibles.':max.prob===0?'Aucune pluie prévue sur les 8 prochaines heures.':'Risque de pluie '+max.prob+' %'+(max.time?' vers '+fmt(max.time):'')+'.';
  if(summary)summary.textContent=rainText+' Vent : '+wind+' km/h.'+(max.rain>0?' Cumul horaire le plus élevé : '+max.rain.toFixed(1)+' mm.':'');
  const riskValue=$('#weather-risk-value'); if(riskValue)riskValue.textContent=next.length?max.prob+' %':'— %';
  const riskBar=$('#weather-risk-bar'); if(riskBar)riskBar.style.width=(next.length?Math.max(0,Math.min(100,max.prob)):0)+'%';
  const riskLabel=$('#weather-risk-label');
  const vigilance=$('#weather-vigilance');
  if(vigilance)vigilance.dataset.level=max.prob>=60?'high':max.prob>=30?'moderate':'low';
  if(riskLabel)riskLabel.textContent=!next.length?'Données indisponibles':max.prob>=60?'Risque élevé · anticipe les terrains':max.prob>=30?'Risque modéré · reste attentif':'Risque faible · conditions plutôt favorables';
 }catch(error){if(request===weatherRequest&&state.currentPage==='planning'&&summary)summary.textContent='La météo ne peut pas être chargée pour le moment. Le planning reste disponible.';}
}
function weatherDescription(code){const c=Number(code);if(c===0)return'ciel dégagé';if([1,2,3].includes(c))return'partiellement nuageux';if([45,48].includes(c))return'brouillard';if([51,53,55,56,57].includes(c))return'bruine';if([61,63,65,66,67,80,81,82].includes(c))return'pluie';if([71,73,75,77,85,86].includes(c))return'neige';if([95,96,99].includes(c))return'orage';return'conditions météo';}
function weatherIcon(code){const c=Number(code);if(c===0)return'☀️';if([1,2].includes(c))return'🌤️';if([3,45,48].includes(c))return'☁️';if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(c))return'🌧️';if([71,73,75,77,85,86].includes(c))return'🌨️';if([95,96,99].includes(c))return'⛈️';return'🌤️';}


function subscribeToNotifications(){
 if(notificationChannel||!state.user||!state.profile)return;
 const isCoach=state.profile.role==='coach';
 const table=isCoach?'coach_notifications':'player_notifications';
 const field=isCoach?'coach_id':'player_id';
 const channel=supabase.channel('coach-in-notifications-'+state.user.id+'-'+Date.now())
  .on('postgres_changes',{event:'INSERT',schema:'public',table,filter:field+'=eq.'+state.user.id},()=>{
   refreshNotificationsOnly().catch(error=>toast(error.message||'Actualisation des notifications impossible.','error'));
  });
 notificationChannel=channel;
 channel.subscribe(status=>{
  if(status==='SUBSCRIBED')notificationRetryCount=0;
  if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)&&notificationChannel===channel){
   notificationChannel=null;
   supabase.removeChannel(channel).catch(()=>{});
   if(notificationRetryCount<3){
    notificationRetryCount++;
    window.setTimeout(()=>{if(state.user&&state.profile&&!notificationChannel)subscribeToNotifications();},2000*notificationRetryCount);
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
