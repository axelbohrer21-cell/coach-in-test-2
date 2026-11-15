import { $, $$, escapeHtml, toast, showDialog, closeDialog, formatDate } from './core/dom.js';
import { state, resetState } from './core/state.js';
import { supabase } from './core/supabase.js';
import { authService } from './services/auth.js';
import { dataService } from './services/data.js';
import { pageMeta, renderPage } from './views/pages.js';
import { bookingService } from './services/booking.js';
import { notificationService } from './services/notifications.js';
import { calculateAgeCategory, toLocalISO } from './domain/tennis.js';
import { groupCriteria, recommendChallenge, hasEvaluationContent } from './domain/progression.js';
import { buildSeriesOccurrences } from './domain/group-series.js';
import { progressionService } from './services/progression.js';

let signupMode = false;
let weatherRequest = 0;
const coachNav = [ ['dashboard','Vue d’ensemble','⌂'], ['players','Joueurs','♙'], ['planning','Planning','▦'], ['group-calendar','Cours collectifs','◷'], ['sessions','Séances','◎'], ['reports','Évaluations','✦'], ['library','Bibliothèque','▤'], ['bookings','Réservations','◷'], ['notifications','Notifications','♧'], ['availability','Disponibilités','◷'], ['messages','Messages','✉'] ];
const adminNav = [ ['dashboard','Administration','⌂'], ['coaches','Gestion des coachs','♙'] ];
const playerNav = [ ['dashboard','Mon espace','⌂'], ['sessions','Mes séances','◎'], ['reports','Mon parcours','✦'], ['bookings','Réservations','◷'], ['notifications','Notifications','♧'], ['messages','Messages','✉'] ];

function showAuth(message='') {
  $('#auth-view').classList.remove('hidden'); $('#app-view').classList.add('hidden');
  if (message) { $('#auth-error').textContent=message; $('#auth-error').classList.remove('hidden'); }
}
function showApp() { $('#auth-view').classList.add('hidden'); $('#app-view').classList.remove('hidden'); }

async function loadWorkspace() {
  const user = await authService.getCurrentUser();
  if (!user) return showAuth();
  state.user = user;
  state.profile = await dataService.loadProfile(user.id);
  if (state.profile.role === 'admin') await dataService.loadAdminWorkspace();
  else if (state.profile.role === 'coach') await dataService.loadCoachWorkspace(user.id);
  else await dataService.loadPlayerWorkspace();
  showApp();
  $('#account-label').textContent = `${state.profile.first_name || ''} ${state.profile.last_name || ''} · ${{admin:'Administrateur',coach:'Coach',player:'Joueur'}[state.profile.role] || 'Compte'}`;
  render('dashboard');
}

function render(page) {
  const isCoach = state.profile?.role === 'coach';
  const isAdmin = state.profile?.role === 'admin';
  const navItems = isAdmin ? adminNav : isCoach ? coachNav : playerNav;
  if (!navItems.some(item => item[0] === page)) page = 'dashboard';
  state.currentPage = page;
  $('#navigation').innerHTML = navItems.map(([key,label,icon]) => `<button class="nav-item ${key===page?'active':''}" data-page="${key}"><span>${icon}</span>${label}</button>`).join('');
  const [kicker,title,description] = pageMeta[page];
  $('#page-kicker').textContent=kicker; $('#page-title').textContent=title; $('#page-description').textContent=description;
  $('#page-actions').innerHTML = page==='players' && isCoach ? '<button class="btn primary" data-action="add-player">＋ Ajouter un joueur</button>' : '';
  $('#page-content').innerHTML=renderPage(page);
  if(page==='planning') loadWeatherForecast();
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

$('#logout').addEventListener('click', async()=>{try{await authService.signOut();resetState();showAuth();}catch(e){toast(e.message,'error');}});
$('#navigation').addEventListener('click',event=>{const button=event.target.closest('[data-page]');if(button)render(button.dataset.page);});

$('#page-actions').addEventListener('click', event => {
  const button = event.target.closest('[data-action="add-player"]');
  if (button) addPlayerDialog();
});

$('#page-content').addEventListener('click', async event=>{
  const go=event.target.closest('[data-go]'); if(go){render(go.dataset.go);return;}
  const planSlot=event.target.closest('[data-plan-slot]'); if(planSlot)return sessionDialog(planSlot.dataset.slotDate,planSlot.dataset.slotTime);
  const share=event.target.closest('[data-share-player]'); if(share) return sharePlayerDialog(share.dataset.sharePlayer);
  const invitation=event.target.closest('[data-coach-invitation]'); if(invitation) return respondCoachInvitation(invitation.dataset.coachInvitation, invitation.dataset.accept==='true');
  const action=event.target.closest('[data-action]')?.dataset.action;
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
  if(action==='add-player') return addPlayerDialog();
  const challenge=event.target.closest('[data-create-challenge]'); if(challenge) return challengeDialog(challenge.dataset.createChallenge, challenge.dataset.criterion, challenge.dataset.criterionId);
  const sheet=event.target.closest('[data-player-sheet]'); if(sheet) return playerSheetDialog(sheet.dataset.playerSheet);
  const edit=event.target.closest('[data-edit-player]'); if(edit) return editPlayerDialog(edit.dataset.editPlayer);
  const booking=event.target.closest('[data-booking]'); if(booking) return updateBooking(booking.dataset.booking,booking.dataset.status);
  const cancel=event.target.closest('[data-cancel-booking]'); if(cancel) return cancelBooking(cancel.dataset.cancelBooking);
  const cancelGroup=event.target.closest('[data-cancel-group]'); if(cancelGroup) return cancelGroupSession(cancelGroup.dataset.cancelGroup);
  const removeAvailability=event.target.closest('[data-delete-availability]'); if(removeAvailability) return deleteAvailability(removeAvailability.dataset.deleteAvailability);
  const coachState=event.target.closest('[data-coach-state]'); if(coachState) return setCoachState(coachState.dataset.coachState,coachState.dataset.coachId);
  const generateSeries=event.target.closest('[data-generate-series]'); if(generateSeries) return generateGroupSeries(generateSeries.dataset.generateSeries);
  const openNotification=event.target.closest('[data-open-notification]');
  if(openNotification){
    try{
      await notificationService.markPlayerRead(openNotification.dataset.openNotification);
      await refreshAndRender();
      render(openNotification.dataset.targetPath==='reports'?'reports':'dashboard');
    }catch(error){toast(error.message||'Impossible d’ouvrir cette notification.','error');}
    return;
  }
  const read=event.target.closest('[data-read-notification]'); if(read) return markNotificationRead(read.dataset.readNotification);
  const week=event.target.closest('[data-week]'); if(week){state.planningWeekOffset=Number(week.dataset.week)===0?0:(state.planningWeekOffset||0)+Number(week.dataset.week);render('planning');}
});
$('#dialog-content').addEventListener('click',async event=>{
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
  if(event.target.closest('[data-close]'))closeDialog();
});
$('#dialog-content').addEventListener('change',event=>{
  if(event.target.matches('input[name=criterion]')){
    const row=event.target.closest('.criterion-measure-row');
    const measure=row?.querySelector('.criterion-measure');
    if(measure){measure.disabled=!event.target.checked;if(!event.target.checked)measure.value='';}
  }
});
$('#page-content').addEventListener('input',event=>{
  if(event.target.id==='player-search'){state.filters.search=event.target.value;render('players');const input=$('#player-search');input.focus();input.setSelectionRange(input.value.length,input.value.length);}
  if(event.target.id==='library-search'||event.target.id==='library-category')filterLibrary();
});
$('#page-content').addEventListener('change',event=>{
  if(event.target.id==='message-partner'){state.messagePartnerId=event.target.value;render('messages');}
  if(event.target.id==='player-type-filter'){state.filters.playerType=event.target.value;render('players');}
  if(event.target.id==='library-category')filterLibrary();
});

function libraryDialog(itemId=''){
  const item=state.library.find(row=>row.id===itemId)||{};
  const editing=Boolean(itemId);
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">BIBLIOTHÈQUE</p><h2>${editing?'Modifier une séance':'Ajouter une séance'}</h2></div><button class="btn icon-btn" data-close>✕</button></div>
  <form id="library-form" class="form-grid">
    <input type="hidden" name="id" value="${escapeHtml(item.id||'')}">
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

function sessionDialog(date=toLocalISO(new Date()), time='17:00'){
  if(!state.players.length){toast('Associe d’abord un compte joueur à ton effectif.','error');return;}
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">TERRAIN</p><h2>Planifier une séance</h2></div><button class="btn icon-btn" data-close>✕</button></div><form id="session-form" class="form-grid"><label class="span-2">Joueur<select name="player_id" required>${state.players.map(p=>`<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</option>`).join('')}</select></label><label>Date<input name="session_date" type="date" required value="${date}"></label><label>Heure<input name="session_time" type="time" required value="${time}"></label><label>Durée<select name="duration_minutes"><option value="60">1 heure</option><option value="90">1 h 30</option><option value="120">2 heures</option></select></label><label>Court<select name="court_number"><option value="1">Court 1</option><option value="2">Court 2</option><option value="3">Court 3</option><option value="4">Court 4</option></select></label><label>Thème<input name="theme" required placeholder="Ex. Construction du point"></label><label class="span-2">Exercice 1<textarea name="exercise_1" rows="2"></textarea></label><label class="span-2">Exercice 2<textarea name="exercise_2" rows="2"></textarea></label><label class="span-2">Synthèse visible joueur<textarea name="player_visible_summary" rows="2"></textarea></label><label class="span-2">Notes privées coach<textarea name="coach_private_notes" rows="2"></textarea></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Enregistrer la séance</button></div></form>`);
}
function evaluationDialog(){
  if(!state.players.length){toast('Aucun joueur dans ton effectif.','error');return;}
  const groups=groupCriteria(state.criteria||[]);
  const criteriaMarkup=groups.length?groups.map(group=>`<details class="criterion-theme" open><summary>${escapeHtml(group.theme)}</summary>${group.subthemes.map(sub=>`<div class="criterion-subtheme"><h4>${escapeHtml(sub.subtheme||group.theme)}</h4><div class="criterion-columns"><div><p class="criterion-positive-title">Réussites</p>${sub.positive.map(item=>`<label class="criterion-option positive"><input type="checkbox" name="criterion" value="${item.id}" data-criterion-id="${item.id}"><span>${escapeHtml(item.criterion)}</span></label>`).join('')||'<small class="muted">Aucun critère enregistré.</small>'}</div><div><p class="criterion-improvement-title">À améliorer</p>${sub.improvement.map(item=>`<div class="criterion-measure-row"><label class="criterion-option improvement"><input type="checkbox" name="criterion" value="${item.id}" data-criterion-id="${item.id}"><span>${escapeHtml(item.criterion)}</span></label><input class="criterion-measure" type="number" step="0.1" name="measure_${item.id}" aria-label="Mesure pour ${escapeHtml(item.criterion)}" placeholder="Mesure" disabled></div>`).join('')||'<small class="muted">Aucun critère enregistré.</small>'}</div></div></div>`).join('')}</details>`).join(''):'<div class="empty-state"><h3>Catalogue de critères non importé</h3><p>Le formulaire est prêt. Il faut importer le catalogue validé dans Supabase pour afficher les critères ici. Aucun critère n’a été inventé.</p></div>';
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">PROGRESSION</p><h2>Nouveau bilan tennis</h2></div><button class="btn icon-btn" data-close>✕</button></div><form id="evaluation-form" class="form-grid evaluation-form"><label class="span-2">Joueur<select name="player_id" required>${state.players.map(p=>`<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</option>`).join('')}</select></label><div class="span-2"><p class="form-section-title">Notes par secteur /20</p><div class="score-grid">${[['technical_score','Technique'],['tactical_score','Tactique'],['physical_score','Physique'],['mental_score','Mental']].map(([key,label])=>`<label>${label}<input type="number" name="${key}" min="0" max="20" step="0.5" placeholder="—"></label>`).join('')}</div><small class="muted">La moyenne est calculée uniquement sur les secteurs renseignés.</small></div><div class="span-2"><p class="form-section-title">Critères observés</p><p class="tiny muted">Sélectionne plusieurs réussites et points à améliorer. Les mesures chiffrées servent au suivi du défi actif.</p>${criteriaMarkup}</div><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Enregistrer le bilan</button></div></form>`);
}

function playerSheetDialog(playerId){
  const player=state.players.find(p=>p.id===playerId);if(!player)return;
  const reports=state.evaluations.filter(r=>r.player_id===playerId).sort((a,b)=>String(b.evaluated_at||b.created_at).localeCompare(String(a.evaluated_at||a.created_at)));
  const sessions=state.sessions.filter(x=>x.player_id===playerId).sort((a,b)=>String(b.session_date).localeCompare(String(a.session_date)));
  const ids=new Set(reports.map(r=>r.id));const criteria=state.evaluationCriteria.filter(x=>ids.has(x.evaluation_id));
  const achievements=state.achievements.filter(x=>x.player_id===playerId);
const birthDate = player.birth_date ? new Date(`${player.birth_date}T12:00:00`) : null;
const today = new Date();
let playerAge = 'Non renseigné';

if (birthDate && !Number.isNaN(birthDate.getTime())) {
  playerAge = today.getFullYear() - birthDate.getFullYear();
  const birthdayNotReached =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
     today.getDate() < birthDate.getDate());

  if (birthdayNotReached) playerAge--;
  playerAge += ' ans';
}
const challenge=state.challenges.find(x=>x.player_id===playerId&&x.status==='active');
  const grouped=new Map();for(const c of criteria){const k=c.main_theme||'Autres';grouped.set(k,[...(grouped.get(k)||[]),c]);}
  const themeSummary=[...grouped].map(([theme,rows])=>`<div class="theme-progress-row"><span>${escapeHtml(theme)}</span><div class="theme-progress-track"><i style="width:${Math.min(100,rows.length*8)}%"></i></div><b>${rows.length}</b></div>`).join('');
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">FICHE DE PROGRESSION</p><h2>${escapeHtml(player.first_name)} ${escapeHtml(player.last_name)}</h2><p class="muted">${escapeHtml(player.fft_ranking||'Classement non renseigné')} · ${escapeHtml(player.player_type||'Loisir')}</p></div><button class="btn icon-btn" data-close>✕</button></div>
  
<section class="sheet-section player-personal-info">
  <h3>Informations du joueur</h3>
  <div class="stats-grid">
    <div class="stat-card blue">
      <span>DATE DE NAISSANCE</span>
      <strong>${player.birth_date ? formatDate(player.birth_date) : 'Non renseignée'}</strong>
    </div>
    <div class="stat-card purple">
      <span>ÂGE</span>
      <strong>${playerAge}</strong>
    </div>
    <div class="stat-card green">
      <span>CLASSEMENT FFT</span>
      <strong>${escapeHtml(player.fft_ranking || 'Non renseigné')}</strong>
    </div>
    <div class="stat-card orange">
      <span>CATÉGORIE</span>
      <strong>${escapeHtml(player.age_category || 'Non renseignée')}</strong>
    </div>
    <div class="stat-card blue">
      <span>E-MAIL</span>
      <strong>${escapeHtml(player.email || 'Non renseigné')}</strong>
    </div>
    <div class="stat-card purple">
      <span>PROFIL</span>
      <strong>${escapeHtml(player.player_type || 'Loisir')}</strong>
    </div>
  </div>
</section>

  <div class="stats-grid"><div class="stat-card blue"><span>SÉANCES</span><strong>${sessions.length}</strong></div><div class="stat-card purple"><span>BILANS</span><strong>${reports.length}</strong></div><div class="stat-card green"><span>RÉUSSITES</span><strong>${achievements.length}</strong></div><div class="stat-card orange"><span>À TRAVAILLER</span><strong>${criteria.filter(x=>x.criterion_type==='improvement').length}</strong></div></div>
  <section class="sheet-section"><h3>Défi prioritaire</h3>${challenge?`<div class="challenge-strip"><b>${escapeHtml(challenge.criterion)}</b><span>${escapeHtml(challenge.objective)}</span><small>${challenge.current_value??'—'} / ${challenge.target_value??'—'} · ${challenge.consecutive_successes||0}/2 validations consécutives</small></div>`:'<p class="muted">Aucun défi actif.</p>'}</section>
  <section class="sheet-section"><h3>Réussites débloquées</h3><div class="achievement-grid">${achievements.map(a=>`<div class="achievement-card"><span>✦</span><strong>${escapeHtml(a.criterion)}</strong></div>`).join('')||'<p class="muted">Aucune réussite débloquée pour le moment.</p>'}</div></section>
  <section class="sheet-section"><h3>Thèmes travaillés</h3>${themeSummary||'<p class="muted">Aucun critère détaillé enregistré.</p>'}</section>
  <section class="sheet-section"><h3>Historique des bilans</h3>${reports.map(r=>{const rows=criteria.filter(c=>c.evaluation_id===r.id);return `<article class="journal-card"><div class="journal-date">${formatDate(r.evaluated_at||r.created_at,{day:'2-digit',month:'long',year:'numeric'})}</div><div class="radar-mini">${[['Technique',r.technical_score],['Tactique',r.tactical_score],['Physique',r.physical_score],['Mental',r.mental_score]].filter(x=>x[1]!==null&&x[1]!==undefined).map(x=>`<span>${x[0]} : ${x[1]}/20</span>`).join(' · ')}</div><div class="journal-criteria">${rows.map(c=>`<span class="journal-tag ${c.criterion_type==='positive'?'positive':'improvement'}">${c.criterion_type==='positive'?'✓':'↗'} ${escapeHtml(c.criterion)}</span>`).join('')||'<small class="muted">Aucun critère associé à ce bilan.</small>'}</div><button class="btn subtle" data-send-evaluation="${r.id}">Envoyer le bilan au joueur</button></article>`}).join('')||'<p class="muted">Aucun bilan enregistré.</p>'}</section>
<section class="sheet-section">
  <h3>Historique des séances</h3>
  ${sessions.map(s=>`<article class="list-card"><div class="list-date"><strong>${formatDate(s.session_date,{day:'2-digit',month:'short'})}</strong><small>${s.duration_minutes||60} min</small></div><div class="list-main"><strong>${escapeHtml(s.theme||'Séance de tennis')}</strong><span>${escapeHtml(s.player_visible_summary||'Séance enregistrée')}</span></div></article>`).join('')||'<p class="muted">Aucune séance.</p>'}
</section>

<section class="sheet-section">
  <h3>Notes privées du coach</h3>
  ${sessions.filter(s => s.coach_private_notes?.trim()).map(s => `
    <article class="journal-card">
      <div class="journal-date">
        ${formatDate(s.session_date, {day:'2-digit', month:'long', year:'numeric'})}
        · ${escapeHtml(s.theme || 'Séance de tennis')}
      </div>
      <p>${escapeHtml(s.coach_private_notes)}</p>
    </article>
  `).join('') || '<p class="muted">Aucune note privée enregistrée.</p>'}
</section>`);
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
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">DISPONIBILITÉS</p><h2>Ajouter une plage réservable</h2></div><button class="btn icon-btn" data-close>✕</button></div><p class="muted">Les joueurs associés pourront demander un cours uniquement dans ces horaires.</p><form id="availability-form" class="form-grid"><label>Jour<select name="weekday"><option value="1" ${Number(series.weekday)===1?'selected':''}>Lundi</option><option value="2" ${Number(series.weekday)===2?'selected':''}>Mardi</option><option value="3" ${Number(series.weekday)===3?'selected':''}>Mercredi</option><option value="4" ${Number(series.weekday)===4?'selected':''}>Jeudi</option><option value="5" ${Number(series.weekday)===5?'selected':''}>Vendredi</option><option value="6" ${Number(series.weekday)===6?'selected':''}>Samedi</option><option value="7">Dimanche</option></select></label><label>Terrain<select name="court_number"><option value="">Tous les terrains</option><option value="1">Terrain 1</option><option value="2">Terrain 2</option><option value="3">Terrain 3</option><option value="4">Terrain 4</option></select></label><label>Début<input type="time" name="start_time" required value="08:00"></label><label>Fin<input type="time" name="end_time" required value="16:00"></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Publier la disponibilité</button></div></form>`);
}
async function deleteAvailability(id){try{await dataService.deleteAvailability(id,state.user.id);toast('Disponibilité supprimée.');await refreshAndRender();}catch(e){toast(e.message||'Suppression impossible.','error');}}

function groupSeriesDialog(seriesId=''){
  const series=state.groupSeries.find(x=>x.id===seriesId)||{}; const editing=Boolean(seriesId);
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">PARAMÉTRAGE ANNUEL</p><h2>${editing?'Modifier le créneau annuel':'Ajouter un créneau collectif'}</h2></div><button class="btn icon-btn" data-close>✕</button></div><p class="muted">Crée un compteur indépendant pour chaque bloc orange. Renseigne les horaires et le court du créneau collectif.</p><form id="group-series-form" class="form-grid"><input type="hidden" name="id" value="${seriesId}"><label class="span-2">Nom du créneau<input name="title" required value="${escapeHtml(series.title||'')}" placeholder="Ex. Cours adultes débutants"></label><input type="hidden" name="audience" value="${series.audience||'adultes'}" ${editing?'':'disabled'}><label>Public<select name="audience_display" ${editing?'disabled':''}><option value="adultes" ${series.audience==='adultes'?'selected':''}>Adultes · objectif 28</option><option value="enfants" ${series.audience==='enfants'?'selected':''}>Enfants · objectif 30</option></select></label><input type="hidden" name="weekday" value="${series.weekday||1}" ${editing?'':'disabled'}><label>Jour<select name="weekday_display" ${editing?'disabled':''}><option value="1" ${Number(series.weekday)===1?'selected':''}>Lundi</option><option value="2" ${Number(series.weekday)===2?'selected':''}>Mardi</option><option value="3" ${Number(series.weekday)===3?'selected':''}>Mercredi</option><option value="4" ${Number(series.weekday)===4?'selected':''}>Jeudi</option><option value="5" ${Number(series.weekday)===5?'selected':''}>Vendredi</option><option value="6" ${Number(series.weekday)===6?'selected':''}>Samedi</option></select></label><label>Début<input name="start_time" type="time" required value="${series.start_time||''}"></label><label>Fin<input name="end_time" type="time" required value="${series.end_time||''}"></label><label>Court<select name="court_number"><option value="1" ${Number(series.court_number)===1?'selected':''}>Court 1</option><option value="2" ${Number(series.court_number)===2?'selected':''}>Court 2</option><option value="3" ${Number(series.court_number)===3?'selected':''}>Court 3</option><option value="4" ${Number(series.court_number)===4?'selected':''}>Court 4</option></select></label><label>Objectif annuel<input name="target_sessions" type="number" min="1" value="${series.target_sessions||28}" required></label><label class="span-2">Thème / précision<input name="theme" value="${escapeHtml(series.theme||'')}" placeholder="Facultatif"></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">${editing?'Enregistrer le créneau':'Créer le compteur'}</button></div></form>`);
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
$('#dialog-content').addEventListener('change',event=>{if(event.target.name==='audience' && event.target.form?.id==='group-series-form'){const target=event.target.form.elements.target_sessions;const weekday=event.target.form.elements.weekday;if(target)target.value=event.target.value==='adultes'?28:30;if(weekday)weekday.value=event.target.value==='adultes'?'1':'3';}if(event.target.name==='birth_date'){ const category=$('#player-form [name=age_category]');if(category)category.value=calculateAgeCategory(event.target.value, new Date().getFullYear());}if(event.target.matches('input[name=criterion]')){const row=event.target.closest('.criterion-measure-row');const measure=row?.querySelector('.criterion-measure');if(measure)measure.disabled=!event.target.checked;}});
$('#dialog-content').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;const values=Object.fromEntries(new FormData(form));
  try{
    if(form.id==='message-form'){
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
      const groupPayload={title:values.title.trim(),theme:values.theme||'',session_date:values.session_date,start_time:values.start_time,end_time:values.end_time,court_number:Number(values.court_number),audience:values.audience};
      if(values.id){await dataService.updateGroupSession(values.id,groupPayload,state.user.id);toast('Cours collectif modifié.');}
      else{await dataService.createGroupSession({coach_id:state.user.id,...groupPayload,status:'scheduled'});toast('Cours collectif ajouté au planning.');}
    } else if(form.id==='session-form'){
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
  }catch(error){toast(error.message||'Une erreur est survenue.','error');}
});

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
function filterLibrary(){const q=($('#library-search')?.value||'').toLowerCase();const category=$('#library-category')?.value||'all';const list=state.library.filter(x=>(category==='all'||x.category===category)&&`${x.title} ${x.theme} ${x.subtheme} ${x.level} ${x.objective} ${x.setup} ${x.instructions} ${(x.keywords||[]).join(' ')}`.toLowerCase().includes(q));$('#library-results').innerHTML=list.map(x=>`<article class="list-card"><div class="list-main"><strong>${escapeHtml(x.title)}</strong><span>${escapeHtml(x.theme)} · ${escapeHtml(x.category)}</span><small>${escapeHtml(x.objective||'')}</small></div></article>`).join('')||'<p class="muted">Aucun exercice correspondant.</p>';}
async function respondCoachInvitation(id, accept){
  try{await dataService.respondToCoachInvitation(id,accept);toast(accept?'Partage accepté : le dossier joueur est maintenant accessible.':'Invitation refusée.');await refreshAndRender();}catch(error){toast(error.message||'Impossible de traiter cette invitation.','error');}
}
async function refreshAndRender(){if(state.profile.role==='admin')await dataService.loadAdminWorkspace();else if(state.profile.role==='coach')await dataService.loadCoachWorkspace(state.user.id);else await dataService.loadPlayerWorkspace();render(state.currentPage);}

supabase.auth.onAuthStateChange((_event,session)=>{if(session?.user){window.setTimeout(()=>loadWorkspace().catch(error=>showAuth(`Erreur de chargement : ${error.message}`)),0);}else{resetState();showAuth();}});
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
