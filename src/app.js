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
const coachNav = [ ['dashboard','Vue d’ensemble','⌂'], ['players','Joueurs','♙'], ['planning','Planning','▦'], ['group-calendar','Cours collectifs','◷'], ['sessions','Séances','◎'], ['reports','Évaluations','✦'], ['library','Bibliothèque','▤'], ['bookings','Réservations','◷'], ['notifications','Notifications','♧'] ];
const playerNav = [ ['dashboard','Mon espace','⌂'], ['sessions','Mes séances','◎'], ['reports','Mon parcours','✦'], ['bookings','Réservations','◷'], ['notifications','Notifications','♧'] ];

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
  if (state.profile.role === 'coach') await dataService.loadCoachWorkspace(user.id);
  else await dataService.loadPlayerWorkspace();
  showApp();
  $('#account-label').textContent = `${state.profile.first_name || ''} ${state.profile.last_name || ''} · ${state.profile.role === 'coach' ? 'Coach' : 'Joueur'}`;
  render('dashboard');
}

function render(page) {
  const isCoach = state.profile?.role === 'coach';
  const navItems = isCoach ? coachNav : playerNav;
  if (!navItems.some(item => item[0] === page)) page = 'dashboard';
  state.currentPage = page;
  $('#navigation').innerHTML = navItems.map(([key,label,icon]) => `<button class="nav-item ${key===page?'active':''}" data-page="${key}"><span>${icon}</span>${label}</button>`).join('');
  const [kicker,title,description] = pageMeta[page];
  $('#page-kicker').textContent=kicker; $('#page-title').textContent=title; $('#page-description').textContent=description;
  $('#page-actions').innerHTML = page==='players' && isCoach ? '<button class="btn primary" data-action="add-player">＋ Ajouter un joueur</button>' : '';
  $('#page-content').innerHTML=renderPage(page);
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
$('#page-content').addEventListener('click', async event=>{
  const go=event.target.closest('[data-go]'); if(go){render(go.dataset.go);return;}
  const share=event.target.closest('[data-share-player]'); if(share) return sharePlayerDialog(share.dataset.sharePlayer);
  const invitation=event.target.closest('[data-coach-invitation]'); if(invitation) return respondCoachInvitation(invitation.dataset.coachInvitation, invitation.dataset.accept==='true');
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='new-session') return sessionDialog();
  if(action==='new-group-session') return groupSessionDialog();
  if(action==='add-group-series') return groupSeriesDialog();
  if(action==='request-booking') return bookingDialog();
  if(action==='new-evaluation') return evaluationDialog();
  if(action==='add-player') return addPlayerDialog();
  const challenge=event.target.closest('[data-create-challenge]'); if(challenge) return challengeDialog(challenge.dataset.createChallenge, challenge.dataset.criterion, challenge.dataset.criterionId);
  const sheet=event.target.closest('[data-player-sheet]'); if(sheet) return playerSheetDialog(sheet.dataset.playerSheet);
  const edit=event.target.closest('[data-edit-player]'); if(edit) return editPlayerDialog(edit.dataset.editPlayer);
  const booking=event.target.closest('[data-booking]'); if(booking) return updateBooking(booking.dataset.booking,booking.dataset.status);
  const cancel=event.target.closest('[data-cancel-booking]'); if(cancel) return cancelBooking(cancel.dataset.cancelBooking);
  const cancelGroup=event.target.closest('[data-cancel-group]'); if(cancelGroup) return cancelGroupSession(cancelGroup.dataset.cancelGroup);
  const generateSeries=event.target.closest('[data-generate-series]'); if(generateSeries) return generateGroupSeries(generateSeries.dataset.generateSeries);
  const read=event.target.closest('[data-read-notification]'); if(read) return markNotificationRead(read.dataset.readNotification);
  const week=event.target.closest('[data-week]'); if(week){state.planningWeekOffset=Number(week.dataset.week)===0?0:(state.planningWeekOffset||0)+Number(week.dataset.week);render('planning');}
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
  if(event.target.id==='player-type-filter'){state.filters.playerType=event.target.value;render('players');}
  if(event.target.id==='library-category')filterLibrary();
});

function sessionDialog(){
  if(!state.players.length){toast('Associe d’abord un compte joueur à ton effectif.','error');return;}
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">TERRAIN</p><h2>Planifier une séance</h2></div><button class="btn icon-btn" data-close>✕</button></div><form id="session-form" class="form-grid"><label class="span-2">Joueur<select name="player_id" required>${state.players.map(p=>`<option value="${p.id}">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</option>`).join('')}</select></label><label>Date<input name="session_date" type="date" required value="${toLocalISO(new Date())}"></label><label>Heure<input name="session_time" type="time" required value="17:00"></label><label>Durée<select name="duration_minutes"><option value="60">1 heure</option><option value="90">1 h 30</option><option value="120">2 heures</option></select></label><label>Court<select name="court_number"><option value="1">Court 1</option><option value="2">Court 2</option><option value="3">Court 3</option><option value="4">Court 4</option></select></label><label>Thème<input name="theme" required placeholder="Ex. Construction du point"></label><label class="span-2">Exercice 1<textarea name="exercise_1" rows="2"></textarea></label><label class="span-2">Exercice 2<textarea name="exercise_2" rows="2"></textarea></label><label class="span-2">Synthèse visible joueur<textarea name="player_visible_summary" rows="2"></textarea></label><label class="span-2">Notes privées coach<textarea name="coach_private_notes" rows="2"></textarea></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Enregistrer la séance</button></div></form>`);
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
  const achievements=state.achievements.filter(x=>x.player_id===playerId);const challenge=state.challenges.find(x=>x.player_id===playerId&&x.status==='active');
  const grouped=new Map();for(const c of criteria){const k=c.main_theme||'Autres';grouped.set(k,[...(grouped.get(k)||[]),c]);}
  const themeSummary=[...grouped].map(([theme,rows])=>`<div class="theme-progress-row"><span>${escapeHtml(theme)}</span><div class="theme-progress-track"><i style="width:${Math.min(100,rows.length*8)}%"></i></div><b>${rows.length}</b></div>`).join('');
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">FICHE DE PROGRESSION</p><h2>${escapeHtml(player.first_name)} ${escapeHtml(player.last_name)}</h2><p class="muted">${escapeHtml(player.fft_ranking||'Classement non renseigné')} · ${escapeHtml(player.player_type||'Loisir')}</p></div><button class="btn icon-btn" data-close>✕</button></div>
  <div class="stats-grid"><div class="stat-card blue"><span>SÉANCES</span><strong>${sessions.length}</strong></div><div class="stat-card purple"><span>BILANS</span><strong>${reports.length}</strong></div><div class="stat-card green"><span>RÉUSSITES</span><strong>${achievements.length}</strong></div><div class="stat-card orange"><span>À TRAVAILLER</span><strong>${criteria.filter(x=>x.criterion_type==='improvement').length}</strong></div></div>
  <section class="sheet-section"><h3>Défi prioritaire</h3>${challenge?`<div class="challenge-strip"><b>${escapeHtml(challenge.criterion)}</b><span>${escapeHtml(challenge.objective)}</span><small>${challenge.current_value??'—'} / ${challenge.target_value??'—'} · ${challenge.consecutive_successes||0}/2 validations consécutives</small></div>`:'<p class="muted">Aucun défi actif.</p>'}</section>
  <section class="sheet-section"><h3>Réussites débloquées</h3><div class="achievement-grid">${achievements.map(a=>`<div class="achievement-card"><span>✦</span><strong>${escapeHtml(a.criterion)}</strong></div>`).join('')||'<p class="muted">Aucune réussite débloquée pour le moment.</p>'}</div></section>
  <section class="sheet-section"><h3>Thèmes travaillés</h3>${themeSummary||'<p class="muted">Aucun critère détaillé enregistré.</p>'}</section>
  <section class="sheet-section"><h3>Historique des bilans</h3>${reports.map(r=>{const rows=criteria.filter(c=>c.evaluation_id===r.id);return `<article class="journal-card"><div class="journal-date">${formatDate(r.evaluated_at||r.created_at,{day:'2-digit',month:'long',year:'numeric'})}</div><div class="radar-mini">${[['Technique',r.technical_score],['Tactique',r.tactical_score],['Physique',r.physical_score],['Mental',r.mental_score]].filter(x=>x[1]!==null&&x[1]!==undefined).map(x=>`<span>${x[0]} : ${x[1]}/20</span>`).join(' · ')}</div><div class="journal-criteria">${rows.map(c=>`<span class="journal-tag ${c.criterion_type==='positive'?'positive':'improvement'}">${c.criterion_type==='positive'?'✓':'↗'} ${escapeHtml(c.criterion)}</span>`).join('')||'<small class="muted">Aucun critère associé à ce bilan.</small>'}</div></article>`}).join('')||'<p class="muted">Aucun bilan enregistré.</p>'}</section>
  <section class="sheet-section"><h3>Historique des séances</h3>${sessions.map(s=>`<article class="list-card"><div class="list-date"><strong>${formatDate(s.session_date,{day:'2-digit',month:'short'})}</strong><small>${s.duration_minutes||60} min</small></div><div class="list-main"><strong>${escapeHtml(s.theme||'Séance de tennis')}</strong><span>${escapeHtml(s.player_visible_summary||'Séance enregistrée')}</span></div></article>`).join('')||'<p class="muted">Aucune séance.</p>'}</section>`);
}

function challengeDialog(playerId, criterion, criterionId){
  const player=state.players.find(row=>row.id===playerId); if(!player)return;
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">DÉFI PERSONNALISÉ</p><h2>${escapeHtml(player.first_name)} ${escapeHtml(player.last_name)}</h2></div><button class="btn icon-btn" data-close>✕</button></div><form id="challenge-form" class="form-grid"><input type="hidden" name="player_id" value="${playerId}"><input type="hidden" name="criterion" value="${escapeHtml(criterion)}"><input type="hidden" name="criterion_id" value="${escapeHtml(criterionId||'')}"><label class="span-2">Critère prioritaire<input value="${escapeHtml(criterion)}" disabled></label><label class="span-2">Objectif concret et mesurable<textarea name="objective" rows="3" required placeholder="Ex. Réussir 8 retours sur 10 dans la zone ciblée"></textarea></label><label>Opérateur<select name="comparison_operator"><option value="gte">Atteindre ou dépasser</option><option value="lte">Être inférieur ou égal</option><option value="eq">Atteindre exactement</option></select></label><label>Valeur cible numérique<input type="number" name="target_value" step="0.1" required placeholder="Ex. 8"></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Créer le défi</button></div></form>`);
}
function groupSeriesDialog(){
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">PARAMÉTRAGE ANNUEL</p><h2>Ajouter un créneau collectif</h2></div><button class="btn icon-btn" data-close>✕</button></div><p class="muted">Crée un compteur indépendant pour chaque bloc orange. Renseigne les horaires et le court du créneau collectif.</p><form id="group-series-form" class="form-grid"><label class="span-2">Nom du créneau<input name="title" required placeholder="Ex. Cours adultes débutants"></label><label>Public<select name="audience"><option value="adultes">Adultes · objectif 28</option><option value="enfants">Enfants · objectif 30</option></select></label><label>Jour<select name="weekday"><option value="1">Lundi</option><option value="2">Mardi</option><option value="3">Mercredi</option><option value="4">Jeudi</option><option value="5">Vendredi</option><option value="6">Samedi</option></select></label><label>Début<input name="start_time" type="time" required></label><label>Fin<input name="end_time" type="time" required></label><label>Court<select name="court_number"><option value="1">Court 1</option><option value="2">Court 2</option><option value="3">Court 3</option><option value="4">Court 4</option></select></label><label>Objectif annuel<input name="target_sessions" type="number" min="1" value="28" required></label><label class="span-2">Thème / précision<input name="theme" placeholder="Facultatif"></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Créer le compteur</button></div></form>`);
}

function groupSessionDialog(){
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">COURS COLLECTIF</p><h2>Ajouter un cours collectif</h2></div><button class="btn icon-btn" data-close>✕</button></div><form id="group-session-form" class="form-grid"><label class="span-2">Intitulé<input name="title" required placeholder="Ex. Entraînement adultes"></label><label>Date<input name="session_date" type="date" required value="${toLocalISO(new Date())}"></label><label>Public<select name="audience"><option value="adultes">Adultes</option><option value="enfants">Enfants</option></select></label><label>Début<input name="start_time" type="time" required value="18:00"></label><label>Fin<input name="end_time" type="time" required value="19:30"></label><label>Court<select name="court_number"><option value="1">Court 1</option><option value="2">Court 2</option><option value="3">Court 3</option><option value="4">Court 4</option></select></label><label>Thème<input name="theme"></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Enregistrer</button></div></form>`);
}
function bookingDialog(){
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">COURS PARTICULIER</p><h2>Demander un créneau</h2></div><button class="btn icon-btn" data-close>✕</button></div><p class="muted">Choisis une date, une heure, une durée et un court. Le créneau sera soumis au contrôle des conflits puis restera en attente de validation.</p><form id="booking-form" class="form-grid"><label class="span-2">Coach<select name="coach_id" required>${(state.playerCoaches||[]).map(c=>`<option value="${c.id}">${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</option>`).join('')}</select></label><label>Date<input name="date" type="date" required min="${toLocalISO(new Date())}"></label><label>Heure<input name="time" type="time" required></label><label>Durée<select name="duration"><option value="60">1 heure</option><option value="90">1 h 30</option><option value="120">2 heures</option></select></label><label>Court<select name="court"><option value="1">Court 1</option><option value="2">Court 2</option><option value="3">Court 3</option><option value="4">Court 4</option></select></label><div class="dialog-actions span-2"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Envoyer la demande</button></div></form>`);
}
function sharePlayerDialog(playerId){
  const player=state.players.find(item=>item.id===playerId); if(!player)return;
  showDialog(`<div class="dialog-head"><div><p class="eyebrow">DOSSIER PARTAGÉ</p><h2>Partager ${escapeHtml(player.first_name)} ${escapeHtml(player.last_name)}</h2></div><button class="btn icon-btn" data-close>✕</button></div><p class="muted">Le coach invité devra accepter. Après acceptation, il pourra consulter et enrichir tout l’historique du joueur.</p><form id="share-player-form" class="stack"><input type="hidden" name="player_id" value="${player.id}"><label>E-mail du coach<input type="email" name="coach_email" required placeholder="coach@email.fr"></label><div class="dialog-actions"><button type="button" class="btn subtle" data-close>Annuler</button><button class="btn primary">Envoyer l’invitation</button></div></form>`);
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
    if(form.id==='booking-form'){
      await bookingService.request({coachId:values.coach_id,date:values.date,time:values.time,duration:values.duration,court:values.court});toast('Demande envoyée. Elle est en attente de validation.');
    } else if(form.id==='share-player-form'){
      await dataService.inviteCoachToPlayer(values.player_id,values.coach_email.trim().toLowerCase());toast('Invitation envoyée au coach. Le partage sera actif après son acceptation.');
    } else if(form.id==='group-series-form'){
      const weekday=Number(values.weekday), audience=values.audience;
      const allowed=audience==='adultes'?[1,2,4,5]:[3,6]; if(!allowed.includes(weekday)) throw new Error('Ce jour ne correspond pas au public choisi.');
      if(values.end_time<=values.start_time) throw new Error('L’heure de fin doit être après l’heure de début.');
      await dataService.createGroupSeries({coach_id:state.user.id,title:values.title.trim(),audience,weekday,start_time:values.start_time,end_time:values.end_time,court_number:Number(values.court_number),target_sessions:Number(values.target_sessions),theme:values.theme||''});
      toast('Créneau annuel créé. Tu peux maintenant générer ses dates.');
    } else if(form.id==='group-session-form'){
      if(values.end_time<=values.start_time) throw new Error('L’heure de fin doit être après l’heure de début.');
      await dataService.createGroupSession({coach_id:state.user.id,title:values.title.trim(),theme:values.theme||'',session_date:values.session_date,start_time:values.start_time,end_time:values.end_time,court_number:Number(values.court_number),audience:values.audience,status:'scheduled'});toast('Cours collectif ajouté au planning.');
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
      const email=String(values.email).trim().toLowerCase();const {data:player,error}=await supabase.from('profiles').select('id,first_name,last_name,email,role').eq('email',email).eq('role','player').maybeSingle();if(error)throw error;if(!player)throw new Error('Aucun compte joueur confirmé trouvé avec cette adresse.');
      const {data:existing,error:checkError}=await supabase.from('coach_players').select('player_id').eq('coach_id',state.user.id).eq('player_id',player.id).maybeSingle();if(checkError)throw checkError;if(existing)throw new Error('Ce joueur est déjà dans ton effectif.');
      const {error:insertError}=await supabase.from('coach_players').insert({coach_id:state.user.id,player_id:player.id});if(insertError)throw insertError;toast(`${player.first_name} ${player.last_name} ajouté à l’effectif.`);
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
function filterLibrary(){const q=($('#library-search')?.value||'').toLowerCase();const category=$('#library-category')?.value||'all';const list=state.library.filter(x=>(category==='all'||x.category===category)&&`${x.title} ${x.theme} ${x.objective} ${(x.keywords||[]).join(' ')}`.toLowerCase().includes(q));$('#library-results').innerHTML=list.map(x=>`<article class="list-card"><div class="list-main"><strong>${escapeHtml(x.title)}</strong><span>${escapeHtml(x.theme)} · ${escapeHtml(x.category)}</span><small>${escapeHtml(x.objective||'')}</small></div></article>`).join('')||'<p class="muted">Aucun exercice correspondant.</p>';}
async function respondCoachInvitation(id, accept){
  try{await dataService.respondToCoachInvitation(id,accept);toast(accept?'Partage accepté : le dossier joueur est maintenant accessible.':'Invitation refusée.');await refreshAndRender();}catch(error){toast(error.message||'Impossible de traiter cette invitation.','error');}
}
async function refreshAndRender(){if(state.profile.role==='coach')await dataService.loadCoachWorkspace(state.user.id);else await dataService.loadPlayerWorkspace();render(state.currentPage);}

supabase.auth.onAuthStateChange((_event,session)=>{if(session?.user){window.setTimeout(()=>loadWorkspace().catch(error=>showAuth(`Erreur de chargement : ${error.message}`)),0);}else{resetState();showAuth();}});
supabase.auth.getSession().then(({data,error})=>{if(error)return showAuth(error.message);if(data.session)loadWorkspace().catch(e=>showAuth(`Erreur de chargement : ${e.message}`));else showAuth();});
