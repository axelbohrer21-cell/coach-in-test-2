import { state } from '../core/state.js';
import { escapeHtml, formatDate, formatTime } from '../core/dom.js';
import { emptyState, playerName, sessionCard, statCard } from './shared.js';
import { toLocalISO, countDistinctValidations } from '../domain/tennis.js';
import { recommendChallenge, radarPoints } from '../domain/progression.js';
import { buildDaySeriesOverview, getWeekProgram, GROUP_SEASON, isPublicHoliday, ZONE_B_HOLIDAYS_2026_2027 } from '../domain/group-calendar.js';
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
  notifications: ['Actualités', 'Notifications', 'Retrouve les informations liées à ton activité.'],
  coaches: ['Administration', 'Gestion des coachs', 'Consulte les comptes coachs et leur statut.'],
  availability: ['Organisation', 'Mes disponibilités', 'Définis les plages pendant lesquelles les joueurs peuvent demander un cours.'],
  messages: ['Communication', 'Messages', 'Échange des messages, photos, vidéos et documents avec tes coachs ou tes joueurs.']
};

export function renderPage(page) {
  const isCoach = state.profile.role === 'coach';
  const isAdmin = state.profile.is_admin === true || state.profile.role === 'admin';
  if (isAdmin && page === 'coaches') return adminCoachesPage();
  if (page === 'dashboard') return dashboard(isCoach);
  if (page === 'players') return playersPage();
  if (page === 'planning') return planningPage();
  if (page === 'availability') return availabilityPage();
  if (page === 'messages') return messagesPage(isCoach);
  if (page === 'group-calendar') return groupCalendarPage();
  if (page === 'sessions') return sessionsPage(isCoach);
  if (page === 'reports') return reportsPage(isCoach);
  if (page === 'library') return libraryPage();
  if (page === 'bookings') return bookingsPage(isCoach);
  if (page === 'notifications') return notificationsPage(isCoach);
  return emptyState('Page inconnue');
}

function dashboardCharts(evaluations, evaluationCriteria) {
  const criteria = evaluationCriteria || [];
  const positive = criteria.filter(row => row.criterion_type === 'positive').length;
  const improvement = criteria.filter(row => row.criterion_type === 'improvement').length;
  const total = positive + improvement;
  const sectors = [
    ['Technique', 'technical_score'],
    ['Tactique', 'tactical_score'],
    ['Physique', 'physical_score'],
    ['Mental', 'mental_score']
  ].map(([label, key]) => {
    const values = (evaluations || []).map(row => Number(row[key])).filter(value => Number.isFinite(value) && value >= 0 && value <= 20);
    return { label, average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, count: values.length };
  });
  const hasScores = sectors.some(row => row.average !== null);
  const positiveAngle = total ? positive / total * 360 : 0;
  return `<section class="panel dashboard-visuals">
    <div class="section-heading"><div><p class="eyebrow">LECTURE VISUELLE</p><h2>Les indicateurs de progression</h2></div><span class="tag">Données enregistrées</span></div>
    <div class="dashboard-chart-grid">
      <article class="dashboard-chart-card">
        <div><p class="eyebrow">CRITÈRES OBSERVÉS</p><h3>Réussites & axes de travail</h3></div>
        ${total ? `<div class="donut-layout"><div class="donut-chart" role="img" aria-label="${positive} réussites et ${improvement} points à améliorer" style="background:conic-gradient(#66e0ad 0deg ${positiveAngle}deg,#ffb36e ${positiveAngle}deg 360deg)"><div><strong>${total}</strong><small>critères</small></div></div><div class="chart-legend"><span><i class="legend-dot positive"></i><b>${positive}</b> réussites</span><span><i class="legend-dot improvement"></i><b>${improvement}</b> à améliorer</span></div></div>` : '<p class="chart-empty">Les graphiques apparaîtront après les premiers critères renseignés dans les bilans.</p>'}
      </article>
      <article class="dashboard-chart-card">
        <div><p class="eyebrow">SCORES MOYENS</p><h3>Équilibre des quatre secteurs</h3></div>
        ${hasScores ? `<div class="sector-bars">${sectors.map(row => `<div class="sector-bar-row"><div><span>${row.label}</span><b>${row.average === null ? '—' : `${row.average.toFixed(1).replace('.', ',')}/20`}</b></div><div class="sector-track"><i style="width:${row.average === null ? 0 : row.average / 20 * 100}%"></i></div><small>${row.count ? `Basé sur ${row.count} note(s)` : 'Pas encore noté'}</small></div>`).join('')}</div>` : '<p class="chart-empty">Les moyennes seront calculées à partir des notes réellement saisies dans les bilans.</p>'}
      </article>
    </div>
    <p class="tiny muted">Ces indicateurs décrivent uniquement les bilans et critères accessibles dans cet espace. Aucune donnée manquante n’est estimée.</p>
  </section>`;
}

function dashboard(isCoach) {
  const nextSessions = [...state.sessions].filter(s => s.session_date >= new Date().toISOString().slice(0, 10)).sort((a,b) => `${a.session_date} ${a.session_time || ''}`.localeCompare(`${b.session_date} ${b.session_time || ''}`)).slice(0, 5);
  if (!isCoach) return `<div class="stats-grid">${statCard('Mes séances', state.sessions.length, 'blue')}${statCard('Mes bilans', state.evaluations.length, 'purple')}${statCard('Demandes', state.bookingRequests.filter(x=>x.status==='pending').length, 'orange')}</div>${dashboardCharts(state.evaluations, state.evaluationCriteria)}<section class="panel"><div class="section-heading"><div><p class="eyebrow">MON PARCOURS TENNIS</p><h2>Mes dernières séances</h2></div></div>${state.sessions.slice(0,5).map(s=>sessionCard(s,false)).join('') || emptyState('Ton carnet commence ici','Tes séances apparaîtront dans cet espace.')}</section>`;
  const invitations = state.coachInvitations || [];
  const invitationPanel = invitations.length ? `<section class="panel"><div class="section-heading"><div><p class="eyebrow">COLLABORATION</p><h2>Invitations de partage</h2></div></div>${invitations.map(i=>`<article class="list-card"><div class="list-main"><strong>${escapeHtml(i.player_first_name)} ${escapeHtml(i.player_last_name)}</strong><span>Invité par ${escapeHtml(i.inviter_first_name)} ${escapeHtml(i.inviter_last_name)}</span></div><button class="btn primary" data-coach-invitation="${i.id}" data-accept="true">Accepter</button><button class="btn danger" data-coach-invitation="${i.id}" data-accept="false">Refuser</button></article>`).join('')}</section>` : '';
  return `<div class="welcome-panel"><div><p class="eyebrow">ESPACE ENTRAÎNEUR</p><h2>Construis la progression, séance après séance.</h2><p>Ton activité, ton effectif et tes priorités au même endroit.</p></div><div class="welcome-mark">CI<span>+</span></div></div>${invitationPanel}<div class="stats-grid">${statCard('Joueurs', state.players.length, 'blue', 'Dans ton effectif')}${statCard('Séances', state.sessions.length, 'purple', 'Historique chargé')}${statCard('Bilans', state.evaluations.length, 'green', 'Évaluations enregistrées')}${statCard('Demandes en attente', state.bookingRequests.filter(x=>x.status==='pending').length, 'orange', 'À traiter')}</div>${dashboardCharts(state.evaluations, state.evaluationCriteria)}<section class="panel"><div class="section-heading"><div><p class="eyebrow">À VENIR</p><h2>Prochaines séances</h2></div><button class="btn subtle" data-go="planning">Voir le planning</button></div>${nextSessions.map(s=>sessionCard(s,true)).join('') || emptyState('Aucune séance à venir','Planifie une séance pour commencer.')}</section>`;
}


function playersPage() {
  const q = (state.filters.search || '').toLowerCase();

  const filtered = state.players.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(q) &&
    (state.filters.playerType === 'all' ||
    (p.player_type || 'Loisir') === state.filters.playerType)
  );

  const colors = [
    '#42c7f5', '#a78bfa', '#54d6a0', '#ffad66',
    '#fb7185', '#facc15', '#2dd4bf', '#c084fc'
  ];

  const colorForPlayer = id => {
    let hash = 0;
    for (const char of String(id || '')) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return colors[hash % colors.length];
  };

  return `<section class="panel">
    <div class="toolbar">
      <input id="player-search" class="search-input"
        placeholder="Rechercher un joueur…"
        value="${escapeHtml(state.filters.search)}">

      <select id="player-type-filter" class="select-input">
        <option value="all">Tous les profils</option>
        <option value="Loisir">Loisir</option>
        <option value="Compétition">Compétition</option>
      </select>
    </div>

    <div class="player-grid">
      ${filtered.map(p => {
        const color = colorForPlayer(p.id);
        const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();

        return `<article class="player-card"
          style="--player-accent:${color}">

          <div class="player-avatar">
            ${escapeHtml((p.first_name || '?').slice(0,1))}
            ${escapeHtml((p.last_name || '').slice(0,1))}
          </div>

          <div class="player-card-info">
            <h3>${escapeHtml(name || 'Joueur')}</h3>
            <p>${escapeHtml(p.fft_ranking || 'Classement à renseigner')}
            · ${escapeHtml(p.age_category || 'Catégorie à renseigner')}</p>

            <p>${escapeHtml(p.birth_date ? formatDate(p.birth_date) : 'Date de naissance à renseigner')}
            · ${escapeHtml(p.email || 'E-mail non renseigné')}</p>

            <span class="tag ${p.player_type === 'Compétition' ? 'tag-purple' : 'tag-blue'}">
              ${escapeHtml(p.player_type || 'Loisir')}
            </span>
          </div>
<button class="btn primary"
  data-player-sheet="${p.id}">
  Voir la fiche
</button>
          <button class="btn icon-btn"
            data-edit-player="${p.id}">⋯</button>

          <button class="btn subtle"
            data-share-player="${p.id}">Partager</button>

        </article>`;
      }).join('') ||
      emptyState('Aucun joueur trouvé',
      'Modifie ta recherche ou associe un compte joueur.')}
    </div>
  </section>`;
}


function planningPage() {
  const start = new Date(); start.setHours(12,0,0,0); start.setDate(start.getDate() - ((start.getDay()+6)%7) + (state.planningWeekOffset||0)*7);
  const days = Array.from({length:7},(_,i)=>{
    const d=new Date(start);d.setDate(start.getDate()+i);const iso=toLocalISO(d);
    const schoolBreak=ZONE_B_HOLIDAYS_2026_2027.find(period=>iso>=period.start&&iso<=period.end);
    const publicHoliday=isPublicHoliday(iso)&&iso!=='2027-05-08';
    const disabled=d.getDay()===0||Boolean(schoolBreak)||publicHoliday;
    const reason=d.getDay()===0?'Dimanche':schoolBreak?('Vacances de '+schoolBreak.label):publicHoliday?'Jour férié':'';
    const events=[
      ...state.sessions.filter(s=>s.session_date===iso).map(s=>({time:s.session_time||'08:00',kind:'session',title:playerName(s.player_id),detail:s.theme||'Cours particulier'})),
      ...state.groupSessions.filter(s=>s.session_date===iso).map(s=>({time:s.start_time||'08:00',kind:'group',title:s.title,detail:s.status==='cancelled'?'ANNULÉ':'Cours collectif',id:s.id,status:s.status}))
    ];
    const slots=Array.from({length:14},(_,hourIndex)=>{
      const hour=hourIndex+8;const time=String(hour).padStart(2,'0')+':00';
      const inSlot=events.filter(event=>Number(String(event.time).slice(0,2))===hour);
      const cards=inSlot.map(event=>'<div class="calendar-event '+(event.kind==='group'?'group-event':'')+'"><b>'+formatTime(event.time)+'</b> · '+escapeHtml(event.title)+'<small>'+escapeHtml(event.detail)+'</small>'+(event.kind==='group'&&event.status!=='cancelled'?'<button class="btn subtle" data-edit-group="'+event.id+'">Modifier</button><button class="btn danger" data-cancel-group="'+event.id+'">Annuler</button>':'')+'</div>').join('');
      const addButton=!disabled&&!inSlot.length?'<button class="calendar-hour-slot" data-plan-slot data-slot-date="'+iso+'" data-slot-time="'+time+'">＋ Ajouter</button>':'';
      return '<div class="calendar-hour-row"><span class="calendar-hour-label">'+time+'</span><div class="calendar-hour-content">'+cards+addButton+'</div></div>';
    }).join('');
    return '<div class="calendar-day '+(disabled?'calendar-day-disabled':'')+'"><div class="calendar-day-head"><strong>'+['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][d.getDay()]+'</strong><span>'+d.getDate()+'</span></div>'+(reason?'<p class="calendar-day-reason">'+escapeHtml(reason)+'</p>':'')+'<div class="calendar-hours">'+slots+'</div></div>';
  }).join('');
  const label = formatDate(start,{day:'2-digit',month:'short'})+' – '+formatDate(new Date(start.getTime()+6*86400000),{day:'2-digit',month:'short',year:'numeric'});
  return '<section class="panel" id="weather-panel"><div class="section-heading"><div><p class="eyebrow">MÉTÉO · LA PENNE-SUR-HUVEAUNE</p><h2 id="weather-title">Prévisions météo</h2></div></div><p id="weather-summary" class="muted">Chargement des prévisions de pluie…</p><p class="tiny muted">Source : Open-Meteo · Prévision indicative, à confirmer sur place.</p></section><section class="panel"><div class="section-heading"><div><p class="eyebrow">PLANNING HEBDOMADAIRE · 8 H–22 H</p><h2>'+label+'</h2></div><div class="toolbar"><button class="btn subtle" data-week="-1">←</button><button class="btn subtle" data-week="0">Aujourd’hui</button><button class="btn subtle" data-week="1">→</button><button class="btn primary" data-action="new-session">＋ Cours particulier</button><button class="btn subtle" data-action="new-group-session">＋ Cours collectif</button></div></div><div class="calendar-week">'+days+'</div><p class="tiny muted">Les dimanches, vacances scolaires Zone B et jours fériés sont grisés. Le 8 mai reste disponible. Clique sur « Ajouter » pour créer un cours particulier à l’heure choisie.</p></section>';
}

function groupCalendarPage() {
  const overview = buildDaySeriesOverview({ groupSessions: state.groupSessions, now: new Date().toISOString().slice(0,10) });
  const totalTarget = overview.reduce((sum,row)=>sum+row.target,0);
  const totalCompleted = overview.reduce((sum,row)=>sum+row.completed,0);
  const totalPlanned = overview.reduce((sum,row)=>sum+row.planned,0);
  const seriesRows = buildSeriesCounters(state.groupSeries || [], state.groupSessions);
  const seriesCards = seriesRows.map(row => `<article class="group-series-card"><div class="group-series-head"><div><p class="eyebrow">${row.audience==='adultes'?'ADULTES':'ENFANTS'} · ${['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][row.weekday]}</p><h3>${escapeHtml(row.title)}</h3><small class="muted">${row.start_time.slice(0,5)}–${row.end_time.slice(0,5)} · Court ${row.court_number}</small></div><span class="tag ${row.reached?'tag-green':'tag-blue'}">${row.reached?'Objectif atteint':'En cours'}</span></div><div class="group-series-count"><strong>${row.completed}</strong><span>réalisées</span><i>/</i><strong>${row.target}</strong><span>objectif</span></div><div class="group-series-progress"><i style="width:${Math.min(100,Math.round(row.completed/row.target*100))}%"></i></div><div class="group-series-meta"><span>${row.planned} planifiées</span><span>${row.remaining} restantes</span><span>${row.toSchedule} à programmer</span><span>${row.cancelled} annulées</span></div><button class="btn subtle" data-edit-series="${row.id}">Modifier la série et les cours futurs</button><button class="btn subtle" data-generate-series="${row.id}">Générer les dates de la saison</button></article>`).join('');
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
  const achievements = state.achievements;
  const coachName = id => {
    const coach = state.playerCoaches.find(row => row.id === id);
    return coach ? ([coach.first_name, coach.last_name].filter(Boolean).join(' ') || coach.email || 'Coach') : 'Coach';
  };
  const themeCounts = new Map();
  for (const row of criteria) themeCounts.set(row.main_theme || row.subtheme || 'Autres', (themeCounts.get(row.main_theme || row.subtheme || 'Autres') || 0) + 1);
  const themeRows = [...themeCounts.entries()].sort((a,b)=>b[1]-a[1]);
  const reports = [...state.evaluations].sort((a,b)=>String(a.evaluated_at||a.created_at).localeCompare(String(b.evaluated_at||b.created_at)));
  const scorePoints = reports.map(report => { const values = radarPoints(report).axes.map(([,value]) => Number(value)).filter(value => Number.isFinite(value) && value >= 0 && value <= 20); return { report, score: values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null }; }).filter(point => point.score !== null);
  const chartPoints = scorePoints.map((point,index) => ({...point,x:scorePoints.length===1?320:38+index*564/(scorePoints.length-1),y:142-point.score*5.8}));
  const scoreChart = scorePoints.length ? `<div class="player-evolution-chart"><div class="evolution-chart-heading"><strong>Score moyen des secteurs</strong><span>${scorePoints.length} bilan(s) noté(s)</span></div><svg viewBox="0 0 640 178" role="img" aria-label="Évolution du score moyen sur 20"><line x1="38" y1="26" x2="602" y2="26" class="evolution-gridline"/><line x1="38" y1="84" x2="602" y2="84" class="evolution-gridline"/><line x1="38" y1="142" x2="602" y2="142" class="evolution-gridline"/><text x="7" y="30">20</text><text x="13" y="88">10</text><text x="20" y="146">0</text>${chartPoints.length>1?`<polyline class="evolution-line" points="${chartPoints.map(point=>`${point.x},${point.y}`).join(' ')}"/>`:''}${chartPoints.map(point=>`<circle class="evolution-point" cx="${point.x}" cy="${point.y}" r="5"><title>${point.score.toFixed(1).replace('.',',')}/20 · ${formatDate(point.report.evaluated_at||point.report.created_at)}</title></circle>`).join('')}</svg><div class="evolution-chart-foot"><span>${formatDate(scorePoints[0].report.evaluated_at||scorePoints[0].report.created_at,{day:'2-digit',month:'short',year:'numeric'})}</span><strong>Moyenne : ${(scorePoints.reduce((sum,point)=>sum+point.score,0)/scorePoints.length).toFixed(1).replace('.',',')}/20</strong><span>${formatDate(scorePoints.at(-1).report.evaluated_at||scorePoints.at(-1).report.created_at,{day:'2-digit',month:'short',year:'numeric'})}</span></div></div>` : '<p class="chart-empty">La courbe apparaîtra dès qu’un bilan contiendra au moins une note sur 20.</p>';
  const historyEvents = [
    ...reports.map(report=>({type:'evaluation',date:report.evaluated_at||report.created_at,report})),
    ...state.sessions.map(session=>({type:'session',date:session.session_date,session})),
    ...achievements.map(item=>({type:'achievement',date:item.unlocked_at,item})),
    ...state.challenges.filter(item=>item.status==='completed').map(item=>({type:'challenge',date:item.completed_at||item.updated_at||item.created_at,item}))
  ].filter(event=>event.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const historyMarkup = historyEvents.map(event=>{
    if(event.type==='evaluation'){ const report=event.report; const rows=criteria.filter(c=>c.evaluation_id===report.id); const themes=[...new Set(rows.map(c=>c.main_theme).filter(Boolean))]; const author=[report.coach_first_name,report.coach_last_name].filter(Boolean).join(' ')||coachName(report.created_by); return `<article class="journey-event journey-evaluation"><span class="journey-marker">↗</span><div class="journey-event-body"><div class="journal-date">${formatDate(event.date,{day:'2-digit',month:'long',year:'numeric'})} · ${escapeHtml(author)}</div><h3>Bilan de progression</h3><p>${themes.length?`Thèmes : ${themes.map(escapeHtml).join(' · ')}`:'Bilan enregistré'}</p>${radarChart(report)}<div class="journal-criteria">${rows.map(c=>`<span class="journal-tag ${c.criterion_type==='positive'?'positive':'improvement'}">${c.criterion_type==='positive'?'✓':'↗'} ${escapeHtml(c.criterion)}</span>`).join('')}</div></div></article>`; }
    if(event.type==='session'){ const row=event.session; const author=[row.coach_first_name,row.coach_last_name].filter(Boolean).join(' ')||'Coach'; return `<article class="journey-event journey-session"><span class="journey-marker">●</span><div class="journey-event-body"><div class="journal-date">${formatDate(row.session_date,{day:'2-digit',month:'long',year:'numeric'})} · ${formatTime(row.session_time)}</div><h3>${escapeHtml(row.theme||'Séance de tennis')}</h3><p>${escapeHtml(row.player_visible_summary||'Séance enregistrée')} · Coach : ${escapeHtml(author)}</p></div></article>`; }
    const item=event.item; const isAchievement=event.type==='achievement'; return `<article class="journey-event ${isAchievement?'journey-achievement':'journey-challenge'}"><span class="journey-marker">${isAchievement?'✦':'★'}</span><div class="journey-event-body"><div class="journal-date">${formatDate(event.date,{day:'2-digit',month:'long',year:'numeric'})} · Coach : ${escapeHtml(coachName(item.coach_id))}</div><h3>${isAchievement?'Réussite débloquée':'Défi relevé'}</h3><p>${escapeHtml(item.criterion)}</p>${isAchievement?`<small>${Number(item.validation_count||3)} validations positives</small>`:`<small>${escapeHtml(item.objective||'Objectif atteint')}</small>`}</div></article>`;
  }).join('');
  return `<div class="stats-grid">${statCard('Séances',state.sessions.length,'blue','Tous tes coachs')}${statCard('Temps sur le court',`${Math.floor(totalMinutes/60)} h`,'purple',`${totalMinutes%60} min supplémentaires`)}${statCard('Critères positifs',positiveCount,'green','Repérés dans tes bilans')}${statCard('Réussites',achievements.length,'orange','Compétences débloquées')}</div>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">MES OBJECTIFS DU MOMENT</p><h2>Mes défis tennis</h2></div></div>${state.challenges.length?state.challenges.map(challenge=>`<div class="challenge-strip"><b>${escapeHtml(challenge.criterion)}</b><span>${escapeHtml(challenge.objective)}</span><small>${challenge.status==='completed'?'Défi validé':'En cours'} · Coach : ${escapeHtml(coachName(challenge.coach_id))} · ${challenge.current_value??'—'} / ${challenge.target_value??'—'} · ${challenge.consecutive_successes||0}/2 validations</small></div>`).join('') : emptyState('Pas de défi actif','Tes coachs pourront te proposer des objectifs individualisés.')}</section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">COMPÉTENCES DÉBLOQUÉES</p><h2>Mes réussites</h2></div></div><div class="achievement-grid">${achievements.map(item=>`<div class="achievement-card"><span class="achievement-symbol">✦</span><strong>${escapeHtml(item.criterion)}</strong><small>Coach : ${escapeHtml(coachName(item.coach_id))}</small><small class="achievement-meta">Débloquée le ${formatDate(item.unlocked_at,{day:'2-digit',month:'long',year:'numeric'})} · ${Number(item.validation_count||3)} validations</small></div>`).join('')||emptyState('Les premières réussites arrivent bientôt','Un critère positif validé sur trois bilans distincts peut devenir une réussite pour le coach qui te suit.')}</div></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">MES THÈMES DE TRAVAIL</p><h2>Les thèmes abordés</h2></div></div>${themeRows.map(([name,count])=>`<div class="theme-progress-row"><span>${escapeHtml(name)}</span><div class="theme-progress-track"><i style="width:${Math.max(4,Math.round(count/Math.max(1,...themeRows.map(x=>x[1]))*100))}%"></i></div><b>${count}</b></div>`).join('')||'<p class="muted">Les thèmes apparaîtront après les premiers bilans détaillés.</p>'}<p class="tiny muted">${improvementCount} points à travailler recensés dans tes bilans.</p></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">ÉVOLUTION DANS LE TEMPS</p><h2>Ma progression</h2></div></div>${scoreChart}<div class="journey-timeline">${historyMarkup||emptyState('Ton parcours commence ici','Tes bilans, séances et réussites apparaîtront dans cette chronologie.')}</div></section>`;
}

function libraryPage() {
  const items = [...state.library].sort((a,b)=>String(a.title).localeCompare(String(b.title),'fr'));
  return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">RESSOURCES PÉDAGOGIQUES</p><h2>Bibliothèque de séances</h2></div><button class="btn primary" data-action="new-library-item">＋ Ajouter une séance</button></div><div class="toolbar"><input class="search-input" id="library-search" placeholder="Rechercher un exercice, un thème…"><select class="select-input" id="library-category"><option value="all">Tous les formats</option><option value="collectif">Cours collectifs</option><option value="particulier">Cours particuliers</option></select></div><div id="library-results">${items.map(item=>libraryCard(item)).join('') || emptyState('Bibliothèque à construire','Ajoute tes contenus collectifs et particuliers pour les retrouver rapidement.')}</div></section>`;
}
function libraryCard(item){return `<article class="list-card"><div class="list-main"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.theme)} · ${escapeHtml(item.subtheme||'')} · ${escapeHtml(item.category)}</span><small>${escapeHtml(item.objective || '')}</small><small>${escapeHtml(item.level || 'Tous niveaux')}${item.duration_minutes? ` · ${item.duration_minutes} min`:''}${item.source_week? ` · Semaine ${item.source_week}`:''}</small></div><button class="btn subtle" data-edit-library="${item.id}">Modifier</button></article>`}

function bookingsPage(isCoach) {
  const rows = state.bookingRequests.map(b=>`<article class="list-card"><div class="list-date"><strong>${formatDate(b.session_date,{day:'2-digit',month:'short'})}</strong><small>${formatTime(b.start_time)}</small></div><div class="list-main"><strong>${escapeHtml(isCoach?playerName(b.player_id):'Cours particulier')}</strong><span>${b.duration_minutes} min · Court ${b.court_number || '—'}</span></div><span class="tag">${escapeHtml(b.status)}</span>${isCoach&&b.status==='pending'?`<button class="btn subtle" data-booking="${b.id}" data-status="accepted">Accepter</button><button class="btn danger" data-booking="${b.id}" data-status="rejected">Refuser</button>`:''}${!isCoach&&['pending','accepted'].includes(b.status)?`<button class="btn danger" data-cancel-booking="${b.id}">Annuler</button>`:''}</article>`).join('');
  return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">COURS PARTICULIERS</p><h2>${isCoach?'Demandes de réservation':'Mes réservations'}</h2></div>${!isCoach?'<button class="btn primary" data-action="request-booking">＋ Demander un cours</button>':''}</div>${rows || emptyState('Aucune réservation','Les demandes et cours particuliers apparaîtront ici.')}${!isCoach?'<p class="tiny muted">Une demande reste en attente jusqu’à la décision du coach. L’annulation par le joueur est possible jusqu’à 24 h avant le cours.</p>':''}</section>`;
}

function notificationsPage(isCoach) {
  return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">CENTRE DE NOTIFICATIONS</p><h2>Mes notifications</h2></div></div>${state.notifications.map(n=>`<article class="list-card"><div class="list-main"><strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.body||'')}</span><small>${formatDate(n.created_at,{day:'2-digit',month:'short',year:'numeric'})} ${formatTime(n.created_at?.slice(11,16))}</small></div>${n.target_path==='reports'&&!isCoach?`<button class="btn primary" data-open-notification="${n.id}" data-target-path="reports">Voir mon bilan</button>`:''}${!n.read_at?`<button class="btn subtle" data-read-notification="${n.id}">Marquer comme lu</button>`:'<span class="tag">Lu</span>'}</article>`).join('')||emptyState('Tout est calme','Tes notifications apparaîtront ici.')}</section>`;
}


function adminDashboard() {
  const active = (state.adminCoaches || []).filter(c => !c.archived_at).length;
  const archived = (state.adminCoaches || []).length - active;
  return `<div class="welcome-panel"><div><p class="eyebrow">ESPACE ADMINISTRATEUR</p><h2>Pilotage de Coach In</h2><p>Vue d’ensemble des comptes coachs de la plateforme.</p></div><div class="welcome-mark">CI<span>+</span></div></div><div class="stats-grid">${statCard('Comptes coachs', (state.adminCoaches||[]).length, 'blue')}${statCard('Actifs', active, 'green')}${statCard('Archivés', archived, 'orange')}</div><section class="panel"><div class="section-heading"><div><p class="eyebrow">GESTION</p><h2>Comptes coachs</h2></div><button class="btn primary" data-go="coaches">Voir les comptes</button></div><p class="muted">Les comptes et les suivis pédagogiques restent cloisonnés par coach.</p></section>`;
}

function adminCoachesPage() {
  const rows = state.adminCoaches || [];
  return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">ADMINISTRATION</p><h2>Comptes coachs</h2></div><button class="btn primary" data-action="invite-coach">＋ Inviter un coach</button></div><div class="list-stack">${rows.map(c=>`<article class="list-card"><div class="list-main"><strong>${escapeHtml((c.first_name+' '+c.last_name).trim() || 'Coach sans nom')}</strong><span>${escapeHtml(c.email || '')}</span><small>${c.archived_at ? 'Compte suspendu' : 'Compte actif'}</small></div>${c.is_admin?'<span class="tag tag-purple">Administrateur principal</span>':c.archived_at?`<button class="btn subtle" data-coach-state="restore" data-coach-id="${c.id}">Réactiver</button>`:`<button class="btn danger" data-coach-state="archive" data-coach-id="${c.id}">Suspendre</button>`}</article>`).join('') || emptyState('Aucun compte coach','Les comptes coachs apparaîtront ici après leur création.')}</div><p class="tiny muted">La suspension bloque la connexion du coach sans supprimer son historique pédagogique. La réactivation restaure son accès.</p></section>`;
}


function availabilityPage() {
 const names=['','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
 const rows=[...(state.weeklyAvailability||[])].sort((a,b)=>a.weekday-b.weekday||a.start_time.localeCompare(b.start_time));
 const cards=rows.map(row=>'<article class="list-card"><div class="list-date"><strong>'+names[row.weekday]+'</strong><small>'+(row.active?'Active':'Inactive')+'</small></div><div class="list-main"><strong>'+row.start_time.slice(0,5)+' – '+row.end_time.slice(0,5)+'</strong><span>'+(row.court_number?'Terrain '+row.court_number:'Tous les terrains')+'</span></div><button class="btn danger" data-delete-availability="'+row.id+'">Supprimer</button></article>').join('');
 return '<section class="panel"><div class="section-heading"><div><p class="eyebrow">CRÉNEAUX RÉSERVABLES</p><h2>Mes disponibilités hebdomadaires</h2></div><button class="btn primary" data-action="add-availability">＋ Ajouter une plage</button></div><p class="muted">Les joueurs associés peuvent demander un cours uniquement si la durée complète tient dans une plage active.</p>'+(cards||emptyState('Aucune disponibilité publiée','Ajoute les jours et horaires pendant lesquels les joueurs pourront te demander un cours particulier.'))+'</section><section class="panel"><p class="eyebrow">RÈGLES DE RÉSERVATION</p><h2>Contrôles automatiques</h2><ul><li>Durées proposées : 1 h, 1 h 30 ou 2 h.</li><li>Le créneau doit être entièrement compris dans une disponibilité.</li><li>Les séances, cours collectifs et demandes en attente bloquent les conflits.</li><li>Le coach conserve la validation finale.</li></ul></section>';
}


function messagesPage(isCoach) {
 const partners=isCoach?(state.players||[]):(state.playerCoaches||[]);
 const partnerId=state.messagePartnerId&&partners.some(p=>p.id===state.messagePartnerId)?state.messagePartnerId:(partners[0]?.id||'');
 const rows=(state.messages||[]).filter(m=>isCoach?m.player_id===partnerId:m.coach_id===partnerId).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
 const options=partners.map(p=>'<option value="'+p.id+'" '+(p.id===partnerId?'selected':'')+'>'+escapeHtml([p.first_name,p.last_name].filter(Boolean).join(' ')||p.email||'Contact')+'</option>').join('');
 const thread=rows.map(m=>'<article class="message-bubble '+(m.sender_id===state.user.id?'message-own':'message-other')+'"><p>'+escapeHtml(m.body||'')+'</p>'+(m.attachment_url?'<a class="message-attachment" href="'+escapeHtml(m.attachment_url)+'" target="_blank" rel="noopener">'+escapeHtml(m.attachment_name||'Pièce jointe')+'</a>':'')+'<small>'+new Date(m.created_at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})+'</small></article>').join('');
 const coachField=isCoach?'':'<input type="hidden" name="coach_id" value="'+partnerId+'">';
 const playerField=isCoach?'<input type="hidden" name="player_id" value="'+partnerId+'">':'';
 return '<section class="panel"><div class="section-heading"><div><p class="eyebrow">MESSAGERIE PRIVÉE</p><h2>Conversation</h2></div></div>'+(partners.length?'<label class="message-partner-label">Contact<select id="message-partner" class="select-input">'+options+'</select></label><div class="message-thread">'+(thread||'<p class="muted">Aucun message dans cette conversation. Envoie le premier message.</p>')+'</div><form id="message-form" class="message-compose">'+coachField+playerField+'<textarea name="body" rows="3" placeholder="Écrire un message…"></textarea><label class="message-file-label">Joindre une photo, vidéo ou document<input type="file" name="attachment" accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"></label><small class="tiny muted">Fichiers privés · 50 Mo maximum.</small><button class="btn primary">Envoyer</button></form>':'<p class="muted">'+(isCoach?'Associe un joueur à ton effectif pour démarrer une conversation.':'Aucun coach associé à ton compte pour le moment.')+'</p>')+'</section>';
}
