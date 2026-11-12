import { state } from '../core/state.js';
import { escapeHtml, formatDate, formatTime } from '../core/dom.js';
import { emptyState, playerName, sessionCard, statCard } from './shared.js';
import { toLocalISO, countDistinctValidations } from '../domain/tennis.js';
import { recommendChallenge, radarPoints } from '../domain/progression.js';
import { buildDaySeriesOverview, getWeekProgram, GROUP_SEASON } from '../domain/group-calendar.js';
import { buildSeriesCounters } from '../domain/group-series.js';
import groupProgram from '../data/group-course-program.json' with { type: 'json' };

export const pageMeta = {
  dashboard: ['Vue d’ensemble', 'Tableau de bord', 'Le résumé de ton activité tennis.'],
  players: ['Effectif', 'Mes joueurs', 'Retrouve les profils et les informations de ton effectif.'],
  planning: ['Organisation', 'Planning', 'Visualise les séances et les créneaux à organiser.'],
  'group-calendar': ['Saison 2026–2027', 'Cours collectifs', 'Calendrier annuel, objectifs de séances et programme pédagogique.'],
  sessions: ['Terrain', 'Séances', 'Prépare et retrouve le contenu des entraînements.'],
  reports: ['Progression', 'Évaluations', 'Observe les compétences travaillées et les progrès.'],
  library: ['Bibliothèque', 'Mes séances', 'Retrouve tes exercices et tes contenus pédagogiques.'],
  bookings: ['Réservations', 'Demandes de cours', 'Consulte les demandes et les cours réservés.'],
  notifications: ['Actualités', 'Notifications', 'Retrouve les informations liées à ton activité.']
};

export function renderPage(page) {
  const isCoach = state.profile.role === 'coach';
  if (page === 'dashboard') return dashboard(isCoach);
  if (page === 'players') return playersPage();
  if (page === 'planning') return planningPage();
  if (page === 'group-calendar') return groupCalendarPage();
  if (page === 'sessions') return sessionsPage(isCoach);
  if (page === 'reports') return reportsPage(isCoach);
  if (page === 'library') return libraryPage();
  if (page === 'bookings') return bookingsPage(isCoach);
  if (page === 'notifications') return notificationsPage(isCoach);
  return emptyState('Page inconnue');
}

function dashboard(isCoach) {
  const nextSessions = [...state.sessions].filter(s => s.session_date >= new Date().toISOString().slice(0, 10)).sort((a,b) => `${a.session_date} ${a.session_time || ''}`.localeCompare(`${b.session_date} ${b.session_time || ''}`)).slice(0, 5);
  if (!isCoach) return `<div class="stats-grid">${statCard('Mes séances', state.sessions.length, 'blue')}${statCard('Mes bilans', state.evaluations.length, 'purple')}${statCard('Demandes', state.bookingRequests.filter(x=>x.status==='pending').length, 'orange')}</div><section class="panel"><div class="section-heading"><div><p class="eyebrow">MON PARCOURS TENNIS</p><h2>Mes dernières séances</h2></div></div>${state.sessions.slice(0,5).map(s=>sessionCard(s,false)).join('') || emptyState('Ton carnet commence ici','Tes séances apparaîtront dans cet espace.')}</section>`;
  const invitations = state.coachInvitations || [];
  const invitationPanel = invitations.length ? `<section class="panel"><div class="section-heading"><div><p class="eyebrow">COLLABORATION</p><h2>Invitations de partage</h2></div></div>${invitations.map(i=>`<article class="list-card"><div class="list-main"><strong>${escapeHtml(i.player_first_name)} ${escapeHtml(i.player_last_name)}</strong><span>Invité par ${escapeHtml(i.inviter_first_name)} ${escapeHtml(i.inviter_last_name)}</span></div><button class="btn primary" data-coach-invitation="${i.id}" data-accept="true">Accepter</button><button class="btn danger" data-coach-invitation="${i.id}" data-accept="false">Refuser</button></article>`).join('')}</section>` : '';
  return `<div class="welcome-panel"><div><p class="eyebrow">ESPACE ENTRAÎNEUR</p><h2>Construis la progression, séance après séance.</h2><p>Ton activité, ton effectif et tes priorités au même endroit.</p></div><div class="welcome-mark">CI<span>+</span></div></div>${invitationPanel}<div class="stats-grid">${statCard('Joueurs', state.players.length, 'blue', 'Dans ton effectif')}${statCard('Séances', state.sessions.length, 'purple', 'Historique chargé')}${statCard('Bilans', state.evaluations.length, 'green', 'Évaluations enregistrées')}${statCard('Demandes en attente', state.bookingRequests.filter(x=>x.status==='pending').length, 'orange', 'À traiter')}</div><section class="panel"><div class="section-heading"><div><p class="eyebrow">À VENIR</p><h2>Prochaines séances</h2></div><button class="btn subtle" data-go="planning">Voir le planning</button></div>${nextSessions.map(s=>sessionCard(s,true)).join('') || emptyState('Aucune séance à venir','Planifie une séance pour commencer.')}</section>`;
}

function playersPage() {
  const q = (state.filters.search || '').toLowerCase();
  const filtered = state.players.filter(p => `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(q) && (state.filters.playerType==='all' || (p.player_type || 'Loisir')===state.filters.playerType));
  return `<section class="panel"><div class="toolbar"><input id="player-search" class="search-input" placeholder="Rechercher un joueur…" value="${escapeHtml(state.filters.search)}"><select id="player-type-filter" class="select-input"><option value="all">Tous les profils</option><option value="Loisir" ${state.filters.playerType==='Loisir'?'selected':''}>Loisir</option><option value="Compétition" ${state.filters.playerType==='Compétition'?'selected':''}>Compétition</option></select></div><div class="player-grid">${filtered.map(p=>`<article class="player-card"><div class="player-avatar">${escapeHtml((p.first_name||'?').slice(0,1))}${escapeHtml((p.last_name||'').slice(0,1))}</div><div class="player-card-info"><h3>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</h3><p>${escapeHtml(p.fft_ranking || p.level || 'Classement à renseigner')}</p><span class="tag ${p.player_type==='Compétition'?'tag-purple':'tag-blue'}">${escapeHtml(p.player_type || 'Loisir')}</span></div><button class="btn icon-btn" data-edit-player="${p.id}" aria-label="Modifier la fiche">⋯</button><button class="btn subtle" data-share-player="${p.id}">Partager</button></article>`).join('') || emptyState('Aucun joueur trouvé','Modifie ta recherche ou associe un compte joueur.')}</div></section>`;
}

function planningPage() {
  const start = new Date(); start.setHours(12,0,0,0); start.setDate(start.getDate() - ((start.getDay()+6)%7) + (state.planningWeekOffset||0)*7);
  const days = Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);const iso=toLocalISO(d);const events=state.sessions.filter(s=>s.session_date===iso);const groups=state.groupSessions.filter(s=>s.session_date===iso);return `<div class="calendar-day"><div class="calendar-day-head"><strong>${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][i]}</strong><span>${d.getDate()}</span></div>${events.map(e=>`<div class="calendar-event"><b>${formatTime(e.session_time)}</b><br>${escapeHtml(playerName(e.player_id))}<small>${escapeHtml(e.theme)}</small></div>`).join('')}${groups.map(g=>`<div class="calendar-event group-event"><b>${formatTime(g.start_time)}</b><br>${escapeHtml(g.title)}<small>${g.status==='cancelled'?'ANNULÉ':'Cours collectif'}</small>${state.profile.role==='coach'&&g.status!=='cancelled'?`<button class="btn danger" data-cancel-group="${g.id}">Annuler</button>`:''}</div>`).join('')}</div>`}).join('');
  const label = `${formatDate(start,{day:'2-digit',month:'short'})} – ${formatDate(new Date(start.getTime()+6*86400000),{day:'2-digit',month:'short',year:'numeric'})}`;
  return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">PLANNING HEBDOMADAIRE</p><h2>${label}</h2></div><div class="toolbar"><button class="btn subtle" data-week="-1">←</button><button class="btn subtle" data-week="0">Aujourd’hui</button><button class="btn subtle" data-week="1">→</button><button class="btn primary" data-action="new-session">＋ Cours particulier</button><button class="btn subtle" data-action="new-group-session">＋ Cours collectif</button></div></div><div class="calendar-week">${days}</div><p class="tiny muted">Les cours collectifs annulés restent visibles et ne bloquent plus le court. Les conflits de réservation sont contrôlés côté base de données.</p></section>`;
}


function groupCalendarPage() {
  const overview = buildDaySeriesOverview({ groupSessions: state.groupSessions, now: new Date().toISOString().slice(0,10) });
  const totalTarget = overview.reduce((sum,row)=>sum+row.target,0);
  const totalCompleted = overview.reduce((sum,row)=>sum+row.completed,0);
  const totalPlanned = overview.reduce((sum,row)=>sum+row.planned,0);
  const seriesRows = buildSeriesCounters(state.groupSeries || [], state.groupSessions);
  const seriesCards = seriesRows.map(row => `<article class="group-series-card"><div class="group-series-head"><div><p class="eyebrow">${row.audience==='adultes'?'ADULTES':'ENFANTS'} · ${['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][row.weekday]}</p><h3>${escapeHtml(row.title)}</h3><small class="muted">${row.start_time.slice(0,5)}–${row.end_time.slice(0,5)} · Court ${row.court_number}</small></div><span class="tag ${row.reached?'tag-green':'tag-blue'}">${row.reached?'Objectif atteint':'En cours'}</span></div><div class="group-series-count"><strong>${row.completed}</strong><span>réalisées</span><i>/</i><strong>${row.target}</strong><span>objectif</span></div><div class="group-series-progress"><i style="width:${Math.min(100,Math.round(row.completed/row.target*100))}%"></i></div><div class="group-series-meta"><span>${row.planned} planifiées</span><span>${row.remaining} restantes</span><span>${row.toSchedule} à programmer</span><span>${row.cancelled} annulées</span></div><button class="btn subtle" data-generate-series="${row.id}">Générer les dates de la saison</button></article>`).join('');
  const formatShort = value => new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
  const counters = overview.map(row => `<article class="group-series-card">
    <div class="group-series-head"><div><p class="eyebrow">${row.audience==='adultes'?'COURS ADULTES':'COURS ENFANTS'}</p><h3>${row.label.split(' · ')[1]}</h3></div><span class="tag ${row.status==='availability_risk'?'tag-orange':row.status==='target_reached'?'tag-green':row.status==='to_schedule'?'tag-blue':'tag-green'}">${row.status==='target_reached'?'Objectif atteint':row.status==='availability_risk'?'Risque de rattrapage':row.status==='to_schedule'?'À programmer':'En suivi'}</span></div>
    <div class="group-series-count"><strong>${row.completed}</strong><span>réalisées</span><i>/</i><strong>${row.target}</strong><span>objectif</span></div>
    <div class="group-series-progress"><i style="width:${Math.min(100,Math.round(row.completed/row.target*100))}%"></i></div>
    <div class="group-series-meta"><span>${row.planned} planifiée(s)</span><span>${row.remaining} restante(s)</span><span>${row.catchUp} à programmer</span></div>
    <p class="tiny muted">${row.availableDateCount} dates possibles · ${row.availabilityGap?`${row.availabilityGap} séance(s) de rattrapage à trouver`:'capacité calendaire suffisante'} · ${row.eligibleDates.length?`${formatShort(row.eligibleDates[0])} au ${formatShort(row.eligibleDates.at(-1))}`:'Aucune date'}</p>
  </article>`).join('');
  const weeks = getWeekProgram(groupProgram).map(week => `<details class="curriculum-week"><summary><span><b>Semaine ${week.week}</b> · ${escapeHtml(week.theme.replace(/^SEMAINE\s+\d+\s*:\s*/i,''))}</span><small>${formatShort(week.startDate)} – ${formatShort(week.endDate)}</small></summary><div class="curriculum-courts">${week.courts.map((content,index)=>`<div class="curriculum-court"><b>Terrain ${index+1}</b><p>${content?escapeHtml(content):'<span class="muted">Aucun exercice indiqué dans le fichier source.</span>'}</p></div>`).join('')}</div></details>`).join('');
  return `<section class="welcome-panel group-season-banner"><div><p class="eyebrow">SAISON DU 14 SEPTEMBRE 2026 AU 20 JUIN 2027</p><h2>La saison collective, semaine après semaine.</h2><p>Zone B · Pas de cours pendant les vacances scolaires.</p></div><div class="welcome-mark">30<span>W</span></div></section>
  <div class="stats-grid">${statCard('Objectif annuel',totalTarget,'blue','28 adultes · 30 enfants par série')}${statCard('Séances réalisées',totalCompleted,'green','Cours collectifs terminés')}${statCard('Séances planifiées',totalPlanned,'purple','À venir et enregistrées')}${statCard('Séries suivies',overview.length,'orange','Lundi, mardi, mercredi, jeudi et samedi')}</div>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">PLAGES DE DISPONIBILITÉ ENREGISTRÉES</p><h2>Horaires de ton planning</h2></div></div><div class="group-series-meta"><span>Mercredi · 9 h 30–18 h · Enfants</span><span>Samedi · 9 h 30–14 h 30 · Enfants</span><span>Lundi · Adultes · horaires à paramétrer</span><span>Mardi · Adultes · horaires à paramétrer</span><span>Jeudi · Adultes · horaires à paramétrer</span><span>Vendredi · Adultes · horaires à paramétrer</span></div><p class="tiny muted">Les cours collectifs adultes ont lieu les lundis, mardis, jeudis et vendredis. Leurs horaires exacts sont à paramétrer bloc par bloc. Les cours enfants sont prévus le mercredi de 9 h 30 à 18 h et le samedi de 9 h 30 à 14 h 30.</p></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">COMPTEURS PAR CRÉNEAU</p><h2>Chaque cours suivi individuellement</h2></div><button class="btn primary" data-action="add-group-series">＋ Ajouter un créneau annuel</button></div>${seriesRows.length?`<div class="group-series-grid">${seriesCards}</div>`:emptyState("Aucun créneau annuel paramétré","Ajoute chaque bloc orange avec son horaire et son court pour créer un compteur indépendant.")}<p class="tiny muted">Les séances annulées restent dans l’historique mais ne comptent pas comme réalisées. La génération crée les dates hors vacances et selon les règles de jours fériés.</p></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">VUE GLOBALE INDICATIVE</p><h2>Capacité par jour de cours</h2></div></div><div class="group-series-grid">${counters}</div></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">PROGRAMME PÉDAGOGIQUE SOURCE</p><h2>Les 30 semaines d'entraînement</h2></div><span class="tag">Cours de l'année.xlsx</span></div><p class="tiny muted">Les consignes sont reprises du classeur d'origine. Les semaines MATCH sans exercice détaillé restent volontairement vides.</p><div class="curriculum-list">${weeks}</div></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">PARAMÉTRAGE RESTANT</p><h2>Règles des blocs collectifs</h2></div><span class="tag tag-green">Règles du club</span></div><p>Les blocs collectifs sont gérés directement dans Coach In : adultes les lundis, mardis et jeudis ; enfants les mercredis et samedis. Les compteurs annuels restent indépendants pour chaque créneau.</p><p class="tiny muted">Chaque créneau doit être rattaché à sa série annuelle, son horaire et son court avant la génération des dates, afin que le planning bloque le bon terrain et que les compteurs restent exacts.</p></section>`;
}

function sessionsPage(isCoach) {
  return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">CARNET DE TERRAIN</p><h2>${isCoach?'Toutes les séances':'Mon historique'}</h2></div>${isCoach?'<button class="btn primary" data-action="new-session">＋ Nouvelle séance</button>':''}</div>${state.sessions.map(s=>sessionCard(s,isCoach)).join('') || emptyState('Aucune séance enregistrée','Les séances apparaîtront ici après leur création.')}</section>`;
}

function radarChart(report){
  if(!report)return '<p class="tiny muted">Le radar apparaîtra après le premier bilan.</p>';
  const {axes,polygon,center,radius}=radarPoints(report);
  const rings=[.25,.5,.75,1].map(f=>{const pts=Array.from({length:4},(_,i)=>{const a=-Math.PI/2+i*Math.PI/2;return `${center+Math.cos(a)*radius*f},${center+Math.sin(a)*radius*f}`}).join(' ');return `<polygon class="radar-grid" points="${pts}"/>`}).join('');
  const labels=axes.map(([label],i)=>{const a=-Math.PI/2+i*Math.PI/2;return `<text class="radar-label" x="${center+Math.cos(a)*(radius+22)}" y="${center+Math.sin(a)*(radius+22)+3}">${label}</text>`}).join('');
  const val=axes.map(([label,value])=>`<span><b>${label}</b> ${value===null||value===undefined?'—':`${value}/20`}</span>`).join('');
  const complete=axes.every(([,value])=>value!==null&&value!==undefined&&value!=='');
  return `<div class="radar-wrap"><svg viewBox="0 0 220 220" role="img" aria-label="Radar des quatre secteurs">${rings}${complete?`<polygon class="radar-area" points="${polygon}"/>`:''}${labels}</svg><div class="radar-values">${val}</div></div>${complete?'':'<p class="tiny muted radar-note">Radar complet disponible lorsque les quatre secteurs sont notés.</p>'}`;
}

function reportsPage(isCoach) {
  if (!isCoach) return playerProgressPage();
  const cards = state.players.map(player => {
    const reports = state.evaluations.filter(row => row.player_id === player.id);
    const reportIds = new Set(reports.map(row => row.id));
    const criteria = state.evaluationCriteria.filter(row => reportIds.has(row.evaluation_id));
    const unlocked = state.achievements.filter(row => row.player_id === player.id).map(row => row.criterion);
    const active = state.challenges.find(row => row.player_id === player.id && row.status === 'active');
    const recommendation = active || reports.length < 3 ? null : recommendChallenge(criteria, state.achievements.filter(row=>row.player_id===player.id).map(row=>row.criterion_id));
    const earned = countDistinctValidations(criteria).filter(row => unlocked.includes(row.criterion));
    return `<article class="progress-player-card">
      <div class="progress-player-head"><div class="player-avatar">${escapeHtml((player.first_name||'?').slice(0,1))}${escapeHtml((player.last_name||'').slice(0,1))}</div><div class="list-main"><strong>${escapeHtml(player.first_name)} ${escapeHtml(player.last_name)}</strong><span>${reports.length} bilan(s) · ${state.sessions.filter(s=>s.player_id===player.id).length} séance(s)</span></div><span class="tag tag-purple">${unlocked.length} réussite(s)</span><button class="btn subtle" data-player-sheet="${player.id}">Ouvrir la fiche</button></div>
      ${active ? `<div class="challenge-strip"><b>Défi en cours</b><span>${escapeHtml(active.criterion)}</span><small>${escapeHtml(active.objective)}${active.target_value!==null?` · Objectif : ${escapeHtml(String(active.target_value))}`:''}</small></div>` : recommendation ? `<div class="challenge-strip suggested"><b>Priorité repérée</b><span>${escapeHtml(recommendation.criterion)}</span><small>Retrouvé ${recommendation.occurrences} fois dans les critères à améliorer.</small><button class="btn subtle" data-create-challenge="${player.id}" data-criterion="${escapeHtml(recommendation.criterion)}" data-criterion-id="${escapeHtml(recommendation.criterion_id||'')}">Créer un défi mesurable</button></div>` : `<p class="tiny muted">Aucun défi à proposer pour le moment. La suggestion apparaît après trois bilans détaillés.</p>`}
      <div class="progress-mini-stats"><span><strong>${reports.length}</strong> bilans</span><span><strong>${unlocked.length}</strong> réussites débloquées</span><span><strong>${criteria.filter(c=>c.criterion_type==='improvement').length}</strong> points à travailler recensés</span></div>
      <div class="report-radar-grid">${[...reports].sort((a,b)=>String(b.evaluated_at||b.created_at).localeCompare(String(a.evaluated_at||a.created_at))).slice(0,2).map(report=>`<div class="report-radar-item"><small>${formatDate(report.evaluated_at||report.created_at,{day:'2-digit',month:'short',year:'numeric'})}</small>${radarChart(report)}</div>`).join('')||'<p class="tiny muted">Les radars apparaîtront après les premiers bilans notés.</p>'}</div>
    </article>`;
  }).join('');
  return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">SUIVI INDIVIDUEL</p><h2>Progression de l’effectif</h2></div><button class="btn primary" data-action="new-evaluation">＋ Nouveau bilan</button></div><p class="tiny muted">Les priorités sont calculées à partir des critères « À améliorer » saisis dans les bilans. Un défi actif reste prioritaire jusqu’à sa clôture.</p><div class="progress-player-list">${cards || emptyState('Aucun joueur','Ajoute des joueurs à ton effectif pour suivre leur progression.')}</div></section>`;
}

function playerProgressPage() {
  const totalMinutes = state.sessions.reduce((sum, row) => sum + Number(row.duration_minutes || 0), 0);
  const criteria = state.evaluationCriteria || [];
  const positiveCount = criteria.filter(row => row.criterion_type === 'positive').length;
  const improvementCount = criteria.filter(row => row.criterion_type === 'improvement').length;
  const activeChallenge = state.challenges.find(row => row.status === 'active');
  const achievements = state.achievements;
  const themeCounts = new Map();
  for (const row of criteria) themeCounts.set(row.main_theme || row.subtheme || 'Autres', (themeCounts.get(row.main_theme || row.subtheme || 'Autres') || 0) + 1);
  const themeRows = [...themeCounts.entries()].sort((a,b)=>b[1]-a[1]);
  const timeline = [...state.sessions].sort((a,b)=>`${b.session_date} ${b.session_time||''}`.localeCompare(`${a.session_date} ${a.session_time||''}`));
  return `<div class="stats-grid">${statCard('Séances',state.sessions.length,'blue','Toutes activités confondues')}${statCard('Temps sur le court',`${Math.floor(totalMinutes/60)} h`,'purple',`${totalMinutes%60} min supplémentaires`)}${statCard('Critères positifs',positiveCount,'green','Repérés dans les bilans')}${statCard('Réussites',achievements.length,'orange','Compétences débloquées')}</div>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">MON OBJECTIF DU MOMENT</p><h2>Mon défi tennis</h2></div></div>${activeChallenge?`<div class="challenge-strip"><b>${escapeHtml(activeChallenge.criterion)}</b><span>${escapeHtml(activeChallenge.objective)}</span><small>${activeChallenge.current_value??'—'} / ${activeChallenge.target_value??'—'}</small></div>`:emptyState('Pas de défi actif','Ton prochain défi apparaîtra ici.')}</section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">COMPÉTENCES DÉBLOQUÉES</p><h2>Mes réussites</h2></div></div><div class="achievement-grid">${achievements.map(item=>`<div class="achievement-card"><span>✦</span><strong>${escapeHtml(item.criterion)}</strong><small>Compétence débloquée</small></div>`).join('')||emptyState('Les premières réussites arrivent bientôt','Un critère positif validé sur trois bilans distincts peut devenir une réussite.')}</div></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">MES THÈMES DE TRAVAIL</p><h2>Les thèmes abordés</h2></div></div>${themeRows.map(([name,count])=>`<div class="theme-progress-row"><span>${escapeHtml(name)}</span><div class="theme-progress-track"><i style="width:${Math.max(4,Math.round(count/Math.max(1,...themeRows.map(x=>x[1]))*100))}%"></i></div><b>${count}</b></div>`).join('')||'<p class="muted">Les thèmes apparaîtront après les premiers bilans détaillés.</p>'}<p class="tiny muted">${improvementCount} points à travailler recensés dans tes bilans.</p></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">MON PARCOURS TENNIS</p><h2>Mes bilans et séances</h2></div></div>${[...state.evaluations].sort((a,b)=>String(b.evaluated_at||b.created_at).localeCompare(String(a.evaluated_at||a.created_at))).map(report=>{const rows=criteria.filter(c=>c.evaluation_id===report.id);const themes=[...new Set(rows.map(c=>c.main_theme).filter(Boolean))];const earned=achievements.filter(a=>rows.some(c=>c.criterion_id===a.criterion_id));return `<article class="journal-card"><div class="journal-date">${formatDate(report.evaluated_at||report.created_at,{day:'2-digit',month:'long',year:'numeric'})}</div><h3>Bilan de progression</h3><p>${themes.length?`Thèmes travaillés : ${themes.map(escapeHtml).join(' · ')}`:'Bilan enregistré'}</p>${radarChart(report)}<div class="journal-criteria">${rows.map(c=>`<span class="journal-tag ${c.criterion_type==='positive'?'positive':'improvement'}">${c.criterion_type==='positive'?'✓':'↗'} ${escapeHtml(c.criterion)}</span>`).join('')||'<small class="muted">Aucun critère détaillé associé à ce bilan.</small>'}</div>${earned.length?`<div class="journal-criteria">${earned.map(a=>`<span class="journal-tag positive">✦ Réussite : ${escapeHtml(a.criterion)}</span>`).join('')}</div>`:''}</article>`}).join('')||emptyState('Aucun bilan pour le moment','Tes bilans apparaîtront ici au fil de ta progression.')}<h3 class="sheet-subtitle">Mes séances</h3>${timeline.map(row=>`<article class="list-card"><div class="list-date"><strong>${formatDate(row.session_date,{day:'2-digit',month:'short'})}</strong><small>${formatTime(row.session_time)}</small></div><div class="list-main"><strong>${escapeHtml(row.theme||'Séance de tennis')}</strong><span>${escapeHtml(row.player_visible_summary||'Séance enregistrée')}</span></div></article>`).join('')||'<p class="muted">Aucune séance enregistrée.</p>'}</section>`;
}

function libraryPage() {
  return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">RESSOURCES PÉDAGOGIQUES</p><h2>Bibliothèque de séances</h2></div></div><div class="toolbar"><input class="search-input" id="library-search" placeholder="Rechercher un exercice…"><select class="select-input" id="library-category"><option value="all">Tous les formats</option><option value="collectif">Cours collectifs</option><option value="particulier">Cours particuliers</option></select></div><div id="library-results">${state.library.map(item=>libraryCard(item)).join('') || emptyState('Bibliothèque à construire','Les séances enregistrées apparaîtront ici.')}</div></section>`;
}
function libraryCard(item){return `<article class="list-card"><div class="list-main"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.theme)} · ${escapeHtml(item.category)}</span><small>${escapeHtml(item.objective || '')}</small></div><span class="tag">${escapeHtml(item.level || 'Tous niveaux')}</span></article>`}

function bookingsPage(isCoach) {
  const rows = state.bookingRequests.map(b=>`<article class="list-card"><div class="list-date"><strong>${formatDate(b.session_date,{day:'2-digit',month:'short'})}</strong><small>${formatTime(b.start_time)}</small></div><div class="list-main"><strong>${escapeHtml(isCoach?playerName(b.player_id):'Cours particulier')}</strong><span>${b.duration_minutes} min · Court ${b.court_number || '—'}</span></div><span class="tag">${escapeHtml(b.status)}</span>${isCoach&&b.status==='pending'?`<button class="btn subtle" data-booking="${b.id}" data-status="accepted">Accepter</button><button class="btn danger" data-booking="${b.id}" data-status="rejected">Refuser</button>`:''}${!isCoach&&['pending','accepted'].includes(b.status)?`<button class="btn danger" data-cancel-booking="${b.id}">Annuler</button>`:''}</article>`).join('');
  return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">COURS PARTICULIERS</p><h2>${isCoach?'Demandes de réservation':'Mes réservations'}</h2></div>${!isCoach?'<button class="btn primary" data-action="request-booking">＋ Demander un cours</button>':''}</div>${rows || emptyState('Aucune réservation','Les demandes et cours particuliers apparaîtront ici.')}${!isCoach?'<p class="tiny muted">Une demande reste en attente jusqu’à la décision du coach. L’annulation par le joueur est possible jusqu’à 24 h avant le cours.</p>':''}</section>`;
}

function notificationsPage(isCoach) {
  return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">CENTRE DE NOTIFICATIONS</p><h2>Mes notifications</h2></div></div>${state.notifications.map(n=>`<article class="list-card"><div class="list-main"><strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.body||'')}</span><small>${formatDate(n.created_at,{day:'2-digit',month:'short',year:'numeric'})} ${formatTime(n.created_at?.slice(11,16))}</small></div>${!n.read_at?`<button class="btn subtle" data-read-notification="${n.id}">Marquer comme lu</button>`:'<span class="tag">Lu</span>'}</article>`).join('')||emptyState('Tout est calme','Tes notifications apparaîtront ici.')}</section>`;
}
