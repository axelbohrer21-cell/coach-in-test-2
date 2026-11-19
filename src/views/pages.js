import { state } from '../core/state.js';
import { escapeHtml, formatDate, formatTime } from '../core/dom.js';
import { emptyState, playerName, sessionCard, statCard } from './shared.js';
import { toLocalISO, countDistinctValidations } from '../domain/tennis.js';
import { recommendChallenge, radarPoints } from '../domain/progression.js';
import { buildCoachIntelligence } from '../domain/intelligence.js';
import { recommendSessionExercises } from '../domain/session-recommendations.js';
import { generateOriginalSession } from '../domain/session-generator.js';
import { buildDaySeriesOverview, buildHolidayStageOccurrences, getWeekProgram, GROUP_SEASON, isPublicHoliday, isPrivateLessonDateAllowed, ZONE_B_HOLIDAYS_2026_2027, CANCELLED_GROUP_DATES } from '../domain/group-calendar.js';
import { buildSeriesCounters } from '../domain/group-series.js';
import groupProgram from '../data/group-course-program.json' with { type: 'json' };
import { playerTennisPage, playerMatchesPage, clubLifePage } from './player-experience.js';

const PLAYER_ACCENTS = ['#42c7f5','#a78bfa','#54d6a0','#ffad66','#fb7185','#facc15','#2dd4bf','#c084fc'];
function playerAccent(playerId) {
  let hash = 0;
  for (const char of String(playerId || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PLAYER_ACCENTS[hash % PLAYER_ACCENTS.length];
}

export const pageMeta = {
  dashboard: ['Vue d’ensemble', 'Tableau de bord', 'Le résumé de ton activité tennis.'],
  intelligence: ['Coach In Intelligence', 'Intelligence', 'Des observations fondées sur tes bilans, tes séances et les données de ton effectif.'],
  players: ['Effectif', 'Mes joueurs', 'Retrouve les profils et les informations de ton effectif.'],
  planning: ['Organisation', 'Planning', 'Visualise les séances et les créneaux à organiser.'],
  'group-calendar': ['Saison 2026–2027', 'Cours collectifs', 'Calendrier annuel, objectifs de séances et programme pédagogique.'],
  sessions: ['Terrain', 'Séances', 'Prépare et retrouve le contenu des entraînements.'],
  videos: ['Analyse technique', 'Analyse vidéo', 'Importe une séquence et obtiens des observations IA à valider sur le terrain.'],
  reports: ['Progression', 'Évaluations', 'Observe les compétences travaillées et les progrès.'],
  library: ['Bibliothèque', 'Mes séances', 'Retrouve tes exercices et tes contenus pédagogiques.'],
  bookings: ['Réservations', 'Demandes de cours', 'Consulte les demandes et les cours réservés.'],
  notifications: ['Actualités', 'Notifications', 'Retrouve les informations liées à ton activité.'],
  coaches: ['Administration', 'Gestion des coachs', 'Consulte les comptes coachs et leur statut.'],
  availability: ['Organisation', 'Mes disponibilités', 'Définis les plages pendant lesquelles les joueurs peuvent demander un cours.'],
  messages: ['Communication', 'Messages', 'Échange des messages, photos, vidéos et documents avec tes coachs ou tes joueurs.'],
  passport: ['Mon tennis', 'Passeport tennis', 'Ton identité de joueur, tes acquis et ton bilan mensuel.'],
  matches: ['Mon tennis', 'Journal de match', 'Garde une trace de tes matchs, de tes sensations et de tes axes de travail.'],
  club: ['Vie du club', 'Mon club', 'Retrouve les tournois, stages et animations du club.']
};

export function renderPage(page) {
  const isCoach = state.profile.role === 'coach';
  const isAdmin = state.profile.is_admin === true || state.profile.role === 'admin';
  if (isAdmin && page === 'coaches') return adminCoachesPage();
  if (page === 'dashboard') return dashboard(isCoach);
  if (page === 'passport' && !isCoach) return playerTennisPage();
  if (page === 'matches' && !isCoach) return playerMatchesPage();
  if (page === 'club') return clubLifePage(isCoach);
  if (page === 'intelligence' && isCoach) return intelligencePage();
  if (page === 'players') return playersPage();
  if (page === 'planning') return planningPage();
  if (page === 'availability') return availabilityPage();
  if (page === 'messages') return messagesPage(isCoach);
  if (page === 'group-calendar') return groupCalendarPage();
  if (page === 'sessions') return sessionsPage(isCoach);
  if (page === 'videos') return videoAnalysisPage(isCoach);
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
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const dateDaysAgo = days => { const d = new Date(now); d.setDate(d.getDate() - days); return d.toISOString().slice(0,10); };
  const playerById = new Map((state.players || []).map(player => [player.id, player]));
  const nextPrivate = (state.sessions || [])
    .filter(row => row.session_date >= today)
    .map(row => ({ ...row, kind: 'private', sortTime: row.session_time || '08:00' }));
  const nextGroup = (state.groupSessions || [])
    .filter(row => row.session_date >= today && row.status === 'scheduled')
    .map(row => ({ ...row, kind: 'group', sortTime: row.start_time || '08:00' }));
  const nextEvents = [...nextPrivate, ...nextGroup]
    .sort((a,b) => `${a.session_date} ${a.sortTime}`.localeCompare(`${b.session_date} ${b.sortTime}`))
    .slice(0,5);
  if (!isCoach) {
    const sessions = [...(state.sessions || [])].sort((a,b) => `${b.session_date || ''} ${b.session_time || ''}`.localeCompare(`${a.session_date || ''} ${a.session_time || ''}`));
    const upcoming = sessions.filter(row => row.session_date >= today).sort((a,b) => `${a.session_date} ${a.session_time || '08:00'}`.localeCompare(`${b.session_date} ${b.session_time || '08:00'}`))[0] || null;
    const acceptedRequest = [...(state.bookingRequests || [])].filter(row => row.status === 'accepted' && row.session_date >= today).sort((a,b) => `${a.session_date} ${a.start_time || '08:00'}`.localeCompare(`${b.session_date} ${b.start_time || '08:00'}`))[0] || null;
    const next = upcoming || acceptedRequest;
    const activeChallenge = (state.challenges || []).find(row => row.status === 'active') || null;
    const latestReport = [...(state.evaluations || [])].sort((a,b) => String(b.evaluated_at || b.created_at || '').localeCompare(String(a.evaluated_at || a.created_at || '')))[0] || null;
    const firstName = state.profile?.first_name || 'champion';
    const nextCard = next
      ? `<article class="player-next-session"><div class="player-next-date"><strong>${new Date(next.session_date+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit'})}</strong><span>${new Date(next.session_date+'T12:00:00').toLocaleDateString('fr-FR',{month:'short'})}</span></div><div class="player-next-main"><span class="eyebrow">TON PROCHAIN RENDEZ-VOUS</span><h3>${escapeHtml(next.theme || (upcoming ? 'Séance de tennis' : 'Cours particulier'))}</h3><p>${formatDate(next.session_date,{weekday:'long',day:'numeric',month:'long'})} · ${formatTime(next.session_time || next.start_time || '08:00')}</p><small>${Number(next.duration_minutes || 60)} min · ${upcoming ? 'Séance confirmée' : 'Réservation acceptée'}</small></div></article>`
      : `<section class="player-home-card player-booking-prompt"><div class="player-home-icon">🎾</div><div><span class="eyebrow">À TOI DE JOUER</span><h3>Prêt pour ton prochain cours ?</h3><p>Consulte les disponibilités de tes coachs et réserve un créneau.</p></div><button class="btn primary" data-action="request-booking">Réserver un cours</button></section>`;
    const challengeCard = activeChallenge
      ? `<section class="player-home-card player-goal-panel"><div class="player-home-card-head"><div><span class="eyebrow">TON DÉFI DU MOMENT</span><h3>${escapeHtml(activeChallenge.criterion)}</h3></div><span class="tag tag-green">En cours</span></div><p>${escapeHtml(activeChallenge.objective || 'Un objectif personnalisé défini avec ton coach.')}</p>${activeChallenge.target_value !== null && activeChallenge.target_value !== undefined && Number(activeChallenge.target_value) > 0 ? `<div class="player-goal-progress"><div><strong>${escapeHtml(String(activeChallenge.current_value ?? 0))} / ${escapeHtml(String(activeChallenge.target_value))}</strong><span>Ta progression</span></div><div class="player-goal-track"><i style="width:${Math.max(0,Math.min(100,Number(activeChallenge.current_value || 0)/Number(activeChallenge.target_value)*100))}%"></i></div></div>` : ''}<button class="btn subtle" data-go="reports">Voir mon défi</button></section>`
      : `<section class="player-home-card player-goal-panel"><div class="player-home-card-head"><div><span class="eyebrow">TA PROGRESSION</span><h3>Un objectif à construire</h3></div></div><p>Ton coach pourra définir avec toi un prochain défi personnalisé.</p><button class="btn subtle" data-go="reports">Découvrir ma progression</button></section>`;
    const latestComment = latestReport?.player_visible_comment
      ? `<section class="player-coach-message"><span class="eyebrow">UN MOT DE TON COACH</span><p>${escapeHtml(latestReport.player_visible_comment)}</p></section>`
      : '';
    return `<section class="player-welcome"><div><p class="eyebrow">TON ESPACE TENNIS</p><h2>Salut ${escapeHtml(firstName)} 👋</h2><p>Ton tennis avance, un entraînement après l’autre.</p></div><button class="btn subtle" data-go="passport">Mon passeport <span aria-hidden="true">↗</span></button></section>
      ${nextCard}
      ${challengeCard}
      ${latestComment}
      <section class="player-shortcuts" aria-label="Accès rapides">
        <button class="player-shortcut" data-go="matches"><span>✎</span><strong>Journal de match</strong><small>Garde une trace de tes matchs</small></button>
        <button class="player-shortcut" data-go="videos"><span>▶</span><strong>Mes vidéos</strong><small>Retrouve tes analyses</small></button>
        <button class="player-shortcut" data-go="club"><span>♧</span><strong>La vie du club</strong><small>Tournois et événements</small></button>
      </section>`;
  }
  const invitations = state.coachInvitations || [];
  const invitationPanel = invitations.length ? `<section class="panel"><div class="section-heading"><div><p class="eyebrow">COLLABORATION</p><h2>Invitations de partage</h2></div><span class="tag tag-orange">${invitations.length} en attente</span></div>${invitations.map(i=>`<article class="list-card"><div class="list-main"><strong>${escapeHtml(i.player_first_name)} ${escapeHtml(i.player_last_name)}</strong><span>Invité par ${escapeHtml(i.inviter_first_name)} ${escapeHtml(i.inviter_last_name)}</span></div><button class="btn primary" data-coach-invitation="${i.id}" data-accept="true">Accepter</button><button class="btn danger" data-coach-invitation="${i.id}" data-accept="false">Refuser</button></article>`).join('')}</section>` : '';
  const activePlayers = (state.players || []).filter(player => !player.archived_at);
  const pendingBookings = (state.bookingRequests || []).filter(row => row.status === 'pending');
  const activeChallenges = (state.challenges || []).filter(row => row.status === 'active');
  const playerActivity = activePlayers.map(player => {
    const reports = (state.evaluations || []).filter(row => row.player_id === player.id).sort((a,b) => String(b.evaluated_at || b.created_at || '').localeCompare(String(a.evaluated_at || a.created_at || '')));
    const sessions = (state.sessions || []).filter(row => row.player_id === player.id).sort((a,b) => String(b.session_date || '').localeCompare(String(a.session_date || '')));
    const lastReport = reports[0] || null;
    const lastSession = sessions[0] || null;
    const reportDate = lastReport ? String(lastReport.evaluated_at || lastReport.created_at || '').slice(0,10) : '';
    const sessionDate = lastSession?.session_date || '';
    const reasons = [];
    if (!lastReport) reasons.push('Premier bilan à réaliser');
    else if (reportDate && reportDate <= dateDaysAgo(30)) reasons.push('Bilan à actualiser');
    const challenge = activeChallenges.find(row => row.player_id === player.id);
    if (challenge) reasons.push('Défi en cours');
    const lastTouch = [reportDate,sessionDate].filter(Boolean).sort().at(-1) || '';
    if (!lastTouch) reasons.push('Aucune activité enregistrée');
    else if (lastTouch <= dateDaysAgo(45) && !reasons.includes('Bilan à actualiser')) reasons.push('Activité à relancer');
    return { player, lastReport, lastSession, reportDate, sessionDate, challenge, reasons, lastTouch };
  });
  const attention = playerActivity.filter(row => row.reasons.length).sort((a,b) => {
    const score = row => (row.reasons.includes('Premier bilan à réaliser') ? 3 : 0) + (row.reasons.includes('Bilan à actualiser') ? 2 : 0) + (row.reasons.includes('Activité à relancer') ? 1 : 0) + (row.challenge ? 1 : 0);
    return score(b)-score(a) || String(a.lastTouch).localeCompare(String(b.lastTouch));
  }).slice(0,6);
  const attentionHtml = attention.length ? attention.map(row => `<article class="coach-attention-row"><div class="coach-player-avatar">${escapeHtml((row.player.first_name || '?').slice(0,1))}${escapeHtml((row.player.last_name || '').slice(0,1))}</div><div class="coach-attention-main"><strong>${escapeHtml(row.player.first_name)} ${escapeHtml(row.player.last_name)}</strong><span>${row.reasons.map(escapeHtml).join(' · ')}</span><small>${row.lastReport ? 'Dernier bilan : '+formatDate(row.reportDate) : 'Aucun bilan enregistré'}${row.lastSession ? ' · Dernière séance : '+formatDate(row.sessionDate) : ''}</small></div><button class="btn subtle" data-player-sheet="${row.player.id}">Ouvrir</button></article>`).join('') : '<div class="coach-empty-state"><strong>Tout est à jour.</strong><span>Aucun joueur ne nécessite de suivi prioritaire selon les données disponibles.</span></div>';
  const seriesRows = buildSeriesCounters(state.groupSeries || [], state.groupSessions || []);
  const seriesHtml = seriesRows.length ? seriesRows.map(row => {
    const pct = row.target ? Math.min(100, Math.round(row.completed / row.target * 100)) : 0;
    return `<article class="coach-goal-row"><div class="coach-goal-head"><div><strong>${escapeHtml(row.title)}</strong><span>${row.audience === 'adultes' ? 'Adultes' : 'Enfants'} · ${['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][row.weekday]}</span></div><b>${row.completed}<small> / ${row.target}</small></b></div><div class="coach-goal-track"><i style="width:${pct}%"></i></div><small>${row.toSchedule} à programmer · ${row.planned} à venir · ${row.paceGap} en retard · ${row.pastUnrecorded} à régulariser · ${row.cancelled} annulée(s)</small></article>`;
  }).join('') : '<div class="coach-empty-state"><strong>Aucune série annuelle configurée.</strong><span>Ajoute tes créneaux récurrents pour suivre les objectifs de 28 séances adultes et 30 séances enfants.</span><button class="btn subtle" data-go="group-calendar">Configurer la saison</button></div>';
  const upcomingHtml = nextEvents.length ? nextEvents.map(row => {
    const isGroup = row.kind === 'group';
    const player = !isGroup ? playerById.get(row.player_id) : null;
    const title = isGroup ? row.title : (player ? `${player.first_name} ${player.last_name}` : 'Cours particulier');
    const time = row.sortTime || '08:00';
    const recommendation = !isGroup ? recommendSessionExercises({ playerId: row.player_id, evaluations: state.evaluations, evaluationCriteria: state.evaluationCriteria, library: state.library, sessions: state.sessions, challenges: state.challenges, videoAnalyses: state.videoAnalyses }) : null;
    const focus = recommendation?.priority?.criterion || recommendation?.activeChallenge?.criterion || '';
    const prepare = !isGroup && player ? `<button class="btn subtle" data-personalized-session="${escapeHtml(row.player_id)}" data-session-date="${escapeHtml(row.session_date)}" data-session-time="${escapeHtml(time)}" data-session-duration="${Number(row.duration_minutes || 90)}">✦ Préparer</button>` : '';
    return `<article class="coach-agenda-row"><div class="coach-agenda-date"><strong>${new Date(row.session_date+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit'})}</strong><span>${new Date(row.session_date+'T12:00:00').toLocaleDateString('fr-FR',{month:'short'})}</span></div><div class="coach-agenda-main"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(row.theme || (isGroup ? 'Cours collectif' : 'Cours particulier'))} · ${isGroup ? 'Collectif' : 'Individuel'}</span>${focus ? `<small class="muted">Piste de travail : ${escapeHtml(focus)}</small>` : ''}</div><time>${escapeHtml(formatTime(time))}</time>${prepare}</article>`;
  }).join('') : '<div class="coach-empty-state"><strong>Aucun cours à venir.</strong><span>Ajoute un cours particulier ou programme une séance collective.</span></div>';
  const recentReports = [...(state.evaluations || [])].sort((a,b) => String(b.evaluated_at || b.created_at || '').localeCompare(String(a.evaluated_at || a.created_at || ''))).slice(0,4);
  const reportsHtml = recentReports.length ? recentReports.map(row => {
    const player = playerById.get(row.player_id);
    const values = ['technical_score','tactical_score','physical_score','mental_score'].map(key => row[key]).filter(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))).map(Number);
    const average = values.length ? (values.reduce((sum,value)=>sum+value,0)/values.length).toFixed(1).replace('.',',')+'/20' : 'Notes non renseignées';
    const date = String(row.evaluated_at || row.created_at || '').slice(0,10);
    return `<article class="coach-report-row"><div class="coach-report-mark">↗</div><div class="coach-report-main"><strong>${escapeHtml(player ? player.first_name+' '+player.last_name : 'Joueur')}</strong><span>${date ? formatDate(date) : 'Date non renseignée'} · ${average}</span></div><button class="btn subtle" data-player-sheet="${row.player_id}">Fiche</button></article>`;
  }).join('') : '<div class="coach-empty-state"><strong>Pas encore de bilan.</strong><span>Les évaluations récentes apparaîtront ici.</span><button class="btn subtle" data-go="reports">Voir les évaluations</button></div>';
  return `<div class="welcome-panel coach-dashboard-hero"><div><p class="eyebrow">ESPACE ENTRAÎNEUR · ${escapeHtml(state.profile.first_name || '')}</p><h2>Bonjour ${escapeHtml(state.profile.first_name || 'coach')}, prêt pour ta prochaine séance ?</h2><p>Retrouve tes priorités, ton effectif et ton activité au même endroit.</p><div class="coach-quick-actions"><button class="btn primary" data-action="generate-session">✦ Préparer une séance</button><button class="btn subtle" data-action="new-evaluation">＋ Nouveau bilan</button><button class="btn subtle" data-go="intelligence">✦ Coach In Intelligence</button><button class="btn ghost" data-action="add-player">＋ Ajouter un joueur</button></div></div><div class="welcome-mark">CI<span>+</span></div></div>
  ${invitationPanel}
  <div class="stats-grid coach-dashboard-stats">${statCard('Joueurs actifs', activePlayers.length, 'blue', 'Dans ton effectif')}${statCard('Séances individuelles', state.sessions.length, 'purple', 'Suivies par toi')}${statCard('Bilans réalisés', state.evaluations.length, 'green', 'Ton suivi uniquement')}${statCard('Demandes à traiter', pendingBookings.length, 'orange', 'Réservations en attente')}</div>
  <section class="coach-dashboard-grid"><div class="panel coach-dashboard-panel"><div class="section-heading"><div><p class="eyebrow">PRIORITÉS DE SUIVI</p><h2>Joueurs à accompagner</h2></div><button class="btn subtle" data-go="players">Tout l’effectif</button></div><div class="coach-attention-list">${attentionHtml}</div></div><div class="panel coach-dashboard-panel"><div class="section-heading"><div><p class="eyebrow">OBJECTIFS DE SAISON</p><h2>Avancement des cours collectifs</h2></div><button class="btn subtle" data-go="group-calendar">Voir la saison</button></div><div class="coach-goals-list">${seriesHtml}</div></div></section>
  <section class="coach-dashboard-grid coach-dashboard-grid-bottom"><div class="panel coach-dashboard-panel"><div class="section-heading"><div><p class="eyebrow">AGENDA</p><h2>Les prochains rendez-vous</h2></div><button class="btn subtle" data-go="planning">Planning complet</button></div><div class="coach-agenda-list">${upcomingHtml}</div></div><div class="panel coach-dashboard-panel"><div class="section-heading"><div><p class="eyebrow">PROGRESSION</p><h2>Derniers bilans enregistrés</h2></div><button class="btn subtle" data-go="reports">Tous les bilans</button></div><div class="coach-reports-list">${reportsHtml}</div></div></section>
  ${dashboardCharts(state.evaluations, state.evaluationCriteria)}
  <p class="tiny muted coach-dashboard-footnote">Les données de suivi, les bilans, les défis et les notes affichés ici correspondent uniquement à ton espace coach. Les objectifs collectifs sont calculés à partir des séries et séances réellement enregistrées.</p>`;
}


function intelligencePage() {
  const report = buildCoachIntelligence({ players: state.players || [], evaluations: state.evaluations || [], evaluationCriteria: state.evaluationCriteria || [], sessions: state.sessions || [], videoAnalyses: state.videoAnalyses || [], challenges: state.challenges || [] });
  const cards = report.insights.map(item => {
    const strengths = item.strengths.map(row => '<span class="tag tag-green">' + escapeHtml(row.criterion) + ' · ' + row.occurrences + '/3</span>').join('');
    const difficulties = item.difficulties.map(row => '<span class="tag tag-orange">' + escapeHtml(row.criterion) + ' · ' + row.occurrences + '/3</span>').join('');
    const trends = item.trends.filter(row => row.current !== null).map(row => {
      const delta = row.delta === null ? 'Historique insuffisant' : (row.delta > 0 ? '+' : '') + row.delta.toFixed(1).replace('.', ',') + ' pts';
      const trendClass = row.delta === null ? '' : row.delta > 0 ? 'positive' : row.delta < 0 ? 'negative' : '';
      return '<span class="intelligence-trend ' + trendClass + '">' + escapeHtml(row.label) + ' <b>' + row.current.toFixed(1).replace('.', ',') + '/20</b><small>' + escapeHtml(delta) + '</small></span>';
    }).join('');
    const plan = item.fourWeekPlan.map(week => '<div class="intelligence-common-row"><strong>S'+week.week+' · '+escapeHtml(week.title)+'</strong><span>'+escapeHtml(week.objective)+'</span></div><p class="tiny muted">Validation : '+escapeHtml(week.success)+'</p>').join('');
    const stagnation = item.stagnation.length ? '<div class="intelligence-block"><strong>Stagnation à surveiller</strong><div class="intelligence-tags">'+item.stagnation.map(label=>'<span class="tag tag-orange">'+escapeHtml(label)+'</span>').join('')+'</div></div>' : '';
    const progress = item.fastestProgress ? '<div class="intelligence-block"><strong>Progression la plus rapide</strong><span class="tag tag-green">'+escapeHtml(item.fastestProgress.label)+' · +'+item.fastestProgress.delta.toFixed(1).replace('.',',')+' pts</span></div>' : '';
    return '<article class="intelligence-player-card"><div class="intelligence-player-head"><div><p class="eyebrow">' + escapeHtml(item.status) + '</p><h3>' + escapeHtml(item.playerName) + '</h3><p class="tiny muted">' + escapeHtml(item.statusReason) + '</p></div><button class="btn subtle" data-player-sheet="' + escapeHtml(item.playerId) + '">Fiche joueur</button></div><div class="intelligence-metrics"><span>' + item.reportCount + ' bilan(s)</span><span>' + item.sessionCount + ' séance(s)</span><span>' + item.videoCount + ' vidéo(s)</span></div><div class="intelligence-block"><strong>Réussites confirmées</strong><div class="intelligence-tags">' + (strengths || '<span class="tiny muted">Pas encore de récurrence confirmée sur plusieurs bilans récents.</span>') + '</div></div><div class="intelligence-block"><strong>Points à travailler</strong><div class="intelligence-tags">' + (difficulties || '<span class="tiny muted">Aucune difficulté récurrente détectée dans les bilans récents.</span>') + '</div></div>'+stagnation+progress+'<div class="intelligence-block"><strong>Scores récents</strong><div class="intelligence-trends">' + (trends || '<span class="tiny muted">Pas de score exploitable pour le moment.</span>') + '</div></div><div class="intelligence-recommendation"><span class="eyebrow">PISTE POUR LE COACH</span><strong>' + escapeHtml(item.suggestedFocus) + '</strong>' + (item.activeChallenge ? '<small>Défi en cours : ' + escapeHtml(item.activeChallenge.objective || item.activeChallenge.criterion || 'Suivi actif') + '</small>' : '') + '</div>'+(plan?'<div class="intelligence-block"><strong>Programmation proposée · 4 semaines</strong>'+plan+'</div>':'<p class="tiny muted">La programmation sur 4 semaines sera disponible après au moins deux bilans.</p>')+'</article>';
  }).join('');
  const common = report.recurringThemes.slice(0, 5).map(row => '<div class="intelligence-common-row"><strong>' + escapeHtml(row.criterion) + '</strong><span>' + row.playerCount + ' joueur(s)</span></div>').join('');
  return '<section class="panel intelligence-intro"><div><p class="eyebrow">ASSISTANT PÉDAGOGIQUE · VERSION 1</p><h2>Comprendre avant de conseiller.</h2><p>Coach In repère les tendances présentes dans tes bilans et tes séances. Les recommandations sont des pistes de travail à valider par toi, jamais des décisions automatiques.</p></div><div class="intelligence-intro-mark">CI<span>✦</span></div></section>' +
    '<div class="stats-grid intelligence-stats">' + statCard('Joueurs analysés', report.insights.length, 'blue', 'Effectif actif') + statCard('Premiers bilans à faire', report.playersWithoutReport, 'orange', 'Aucune évaluation') + statCard('Bilans à actualiser', report.reportsToRefresh, 'purple', 'Plus de 30 jours') + statCard('Priorités identifiées', report.playersWithPriority, 'green', 'Points récurrents') + '</div>' +
    '<section class="panel"><div class="section-heading"><div><p class="eyebrow">LECTURE COLLECTIVE</p><h2>Difficultés récurrentes de l’effectif</h2></div><span class="tag">Données observées</span></div>' + (common || '<p class="muted">Les tendances collectives apparaîtront lorsque plusieurs joueurs auront des critères récurrents dans leurs bilans récents.</p>') + '</section>' +
    '<section class="panel"><div class="section-heading"><div><p class="eyebrow">SUIVI INDIVIDUEL</p><h2>Analyse par joueur</h2></div><span class="tag">' + report.insights.length + ' profil(s)</span></div><div class="intelligence-player-grid">' + (cards || '<div class="empty-state"><h3>Aucun joueur actif</h3><p>Ajoute ou associe des joueurs pour commencer le suivi intelligent.</p></div>') + '</div></section>' +
    '<p class="tiny muted">Méthode : les critères sont considérés comme récurrents s’ils apparaissent dans au moins deux des trois derniers bilans disponibles. Les comparaisons de scores nécessitent un historique précédent suffisant. Aucune donnée manquante n’est estimée. Les données sont limitées à ton espace coach.</p>';
}
function playersPage() {
  const q = (state.filters.search || '').toLowerCase();

  const filtered = state.players.filter(p =>
    `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(q) &&
    (state.filters.playerType === 'all' ||
    (p.player_type || 'Loisir') === state.filters.playerType)
  );


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
        const color = playerAccent(p.id);
        const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();

        return `<article class="player-card"
          data-player-search="${escapeHtml(`${p.first_name || ''} ${p.last_name || ''} ${p.email || ''}`.toLocaleLowerCase('fr'))}"
          data-player-type="${escapeHtml(p.player_type || 'Loisir')}"
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
    const childCollectiveDay=[3,6].includes(d.getDay());
    const publicHolidayBlocks=publicHoliday&&!childCollectiveDay;
    const hasHolidayStage=Boolean(schoolBreak&&GROUP_SEASON.holidayStage.weekdays.includes(d.getDay()));
    const disabled=d.getDay()===0||(Boolean(schoolBreak)&&!hasHolidayStage)||publicHolidayBlocks;
    const reason=d.getDay()===0?'Dimanche':schoolBreak?('Vacances de '+schoolBreak.label):publicHoliday?(childCollectiveDay?'Jour férié · cours enfants maintenus':'Jour férié'):'';
    const events=[
      ...state.sessions.filter(s=>s.session_date===iso).map(s=>({time:s.session_time||'08:00',kind:'session',id:s.id,playerId:s.player_id,title:playerName(s.player_id),detail:s.theme||'Cours particulier',duration:Number(s.duration_minutes||60),court:s.court_number})),
      ...state.groupSessions.filter(s=>s.session_date===iso).map(s=>({time:s.start_time||'08:00',date:s.session_date,kind:'group',id:s.id,title:s.title,detail:s.status==='cancelled'?'ANNULÉ':s.status==='completed'?'Cours collectif · effectué':'Cours collectif',duration:Math.max(0,(Number(String(s.end_time||'00:00').slice(0,2))*60+Number(String(s.end_time||'00:00').slice(3,5)))-(Number(String(s.start_time||'00:00').slice(0,2))*60+Number(String(s.start_time||'00:00').slice(3,5)))),court:s.court_number,status:s.status})),
      ...buildHolidayStageOccurrences({startDate:iso,endDate:iso}).flatMap(stage=>stage.courts.map(court=>({time:stage.start_time,date:iso,kind:'stage',id:stage.id+'-court-'+court,title:stage.title,detail:'Stage enfants · vacances scolaires',duration:420,court,status:'scheduled'})))
    ];
    const slots=Array.from({length:14},(_,hourIndex)=>{
      const hour=hourIndex+8;const time=String(hour).padStart(2,'0')+':00';
      const inSlot=events.filter(event=>Number(String(event.time).slice(0,2))===hour);
      const cards=inSlot.map(event=>{
        const accent=event.kind==='session'?playerAccent(event.playerId):(event.status==='cancelled'?'#64748b':'#a78bfa');
        const durationLabel=event.duration?`${Math.floor(event.duration/60)} h${event.duration%60?` ${event.duration%60}`:''}`:'';
        return '<div class="calendar-event '+(event.kind==='session'?'player-event':'group-event')+(event.status==='cancelled'?' event-cancelled':event.status==='completed'?' event-completed':'')+'" data-calendar-event data-event-id="'+escapeHtml(event.id||'')+'" tabindex="0" role="button" aria-pressed="false" aria-label="Sélectionner '+escapeHtml(event.title)+' à '+formatTime(event.time)+'" style="--event-accent:'+accent+'"><div class="calendar-event-main"><b>'+formatTime(event.time)+'</b><strong>'+escapeHtml(event.title)+'</strong><small>'+escapeHtml(event.detail)+(durationLabel?' · '+durationLabel:'')+(event.court?' · Court '+event.court:'')+'</small></div>'+(event.kind==='group'&&event.status==='scheduled'?'<div class="calendar-event-actions"><button class="btn subtle" data-edit-group="'+event.id+'">Modifier</button>'+(event.date<=toLocalISO(new Date())?'<button class="btn primary" data-complete-group="'+event.id+'">Effectué</button>':'')+'<button class="btn danger" data-cancel-group="'+event.id+'">Annuler</button></div>':event.kind==='group'&&event.status==='completed'?'<span class="tag tag-green">EFFECTUÉ</span>':event.kind==='group'&&event.status==='cancelled'?'<span class="tag">ANNULÉ</span>':'')+'</div>';
      }).join('');
      const slotStart=hour*60,slotEnd=slotStart+60;
      const blockedByGroup=events.find(event=>(event.kind==='group'||event.kind==='stage')&&event.status!=='cancelled'&&timeToMinutes(event.time)<slotEnd&&timeToMinutes(event.time)+event.duration>slotStart);
      const groupBlock=blockedByGroup&&!inSlot.some(event=>event.id===blockedByGroup.id)?'<div class="calendar-blocked-slot" aria-label="Indisponible : cours collectif ou stage">🔒 '+(blockedByGroup.kind==='stage'?'STAGE ENFANTS':'COURS COLLECTIF')+' · INDISPONIBLE</div>':'';
      const activeInSlot=inSlot.filter(event=>(event.kind!=='group'&&event.kind!=='stage')||event.status!=='cancelled');
      const addButton=!disabled&&!blockedByGroup&&!activeInSlot.length&&isPrivateLessonDateAllowed(iso)?'<button class="calendar-hour-slot" data-plan-slot data-slot-date="'+iso+'" data-slot-time="'+time+'">＋ Cours particulier</button>':'';
      return '<div class="calendar-hour-row"><span class="calendar-hour-label">'+time+'</span><div class="calendar-hour-content">'+cards+groupBlock+addButton+'</div></div>';
    }).join('');
    return '<div class="calendar-day '+(disabled?'calendar-day-disabled':'')+'"><div class="calendar-day-head"><strong>'+['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][d.getDay()]+'</strong><span>'+d.getDate()+'</span></div>'+(reason?'<p class="calendar-day-reason">'+escapeHtml(reason)+'</p>':'')+'<div class="calendar-hours">'+slots+'</div></div>';
  }).join('');
  const label = formatDate(start,{day:'2-digit',month:'short'})+' – '+formatDate(new Date(start.getTime()+6*86400000),{day:'2-digit',month:'short',year:'numeric'});
  return '<section class="panel" id="weather-panel"><div class="section-heading"><div><p class="eyebrow">MÉTÉO · LA PENNE-SUR-HUVEAUNE</p><h2 id="weather-title">Prévisions météo</h2></div></div><p id="weather-summary" class="muted">Chargement des prévisions de pluie…</p><p class="tiny muted">Source : Open-Meteo · Prévision indicative, à confirmer sur place.</p></section><section class="panel"><div class="section-heading"><div><p class="eyebrow">PLANNING HEBDOMADAIRE · 8 H–22 H</p><h2>'+label+'</h2></div><div class="toolbar"><button class="btn subtle" data-week="-1">←</button><button class="btn subtle" data-week="0">Aujourd’hui</button><button class="btn subtle" data-week="1">→</button><button class="btn primary" data-action="new-session">＋ Cours particulier</button><button class="btn subtle" data-action="new-group-session">＋ Cours collectif</button></div></div><div class="calendar-week">'+days+'</div><p class="tiny muted">Les cours particuliers sont indisponibles pendant les vacances scolaires et les jours fériés (sauf le 8 mai). Les cours collectifs enfants du mercredi et du samedi sont maintenus les jours fériés hors vacances. Les cours collectifs adultes ont lieu du lundi au vendredi, avec le mercredi de 18 h à 21 h. Pendant les vacances Zone B, les stages enfants occupent les terrains 1, 2 et 3 de 9 h 30 à 16 h 30. Clique sur une séance pour la mettre en évidence : sa couleur correspond à celle du joueur.</p></section>';
}

function groupCalendarPage() {
  const overview = buildDaySeriesOverview({ groupSessions: state.groupSessions, now: new Date().toISOString().slice(0,10) });
  const totalTarget = overview.reduce((sum,row)=>sum+row.target,0);
  const totalCompleted = overview.reduce((sum,row)=>sum+row.completed,0);
  const totalPlanned = overview.reduce((sum,row)=>sum+row.planned,0);
  const totalCancelled = (state.groupSessions||[]).filter(row=>row.status==='cancelled').length;
  const seriesRows = buildSeriesCounters(state.groupSeries || [], state.groupSessions);
  const seriesCards = seriesRows.map(row => `<article class="group-series-card"><div class="group-series-head"><div><p class="eyebrow">${row.audience==='adultes'?'ADULTES':'ENFANTS'} · ${['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][row.weekday]}</p><h3>${escapeHtml(row.title)}</h3><small class="muted">${row.start_time.slice(0,5)}–${row.end_time.slice(0,5)} · Court ${row.court_number}</small></div><span class="tag ${row.reached?'tag-green':row.paceGap?'tag-orange':'tag-blue'}">${row.reached?'Objectif atteint':row.paceGap?'En retard':'En cours'}</span></div><div class="group-series-count"><strong>${row.completed}</strong><span>réalisées</span><i>/</i><strong>${row.target}</strong><span>objectif</span></div><div class="group-series-progress"><i style="width:${Math.min(100,Math.round(row.completed/row.target*100))}%"></i></div><div class="group-series-meta"><span>${row.planned} planifiées</span><span>${row.completed}/${row.expectedByNow} attendues réalisées</span><span>${row.paceGap} de retard</span><span>${row.pastUnrecorded} à régulariser</span><span>${row.remaining} restantes</span><span>${row.toSchedule} à programmer</span><span>${row.cancelled} annulées</span></div><button class="btn subtle" data-edit-series="${row.id}">Modifier la série et les cours futurs</button><button class="btn subtle" data-generate-series="${row.id}">Générer les dates de la saison</button></article>`).join('');
  const formatShort = value => new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
  const counters = overview.map(row => `<article class="group-series-card">
    <div class="group-series-head"><div><p class="eyebrow">${row.audience==='adultes'?'COURS ADULTES':'COURS ENFANTS'}</p><h3>${row.label.split(' · ')[1]}</h3></div><span class="tag ${row.status==='availability_risk'||row.status==='behind_schedule'?'tag-orange':row.status==='target_reached'?'tag-green':row.status==='to_schedule'?'tag-blue':'tag-green'}">${row.status==='target_reached'?'Objectif atteint':row.status==='availability_risk'?'Capacité insuffisante':row.status==='behind_schedule'?'En retard':row.status==='to_schedule'?'À programmer':'Dans le rythme'}</span></div>
    <div class="group-series-count"><strong>${row.completed}</strong><span>réalisées</span><i>/</i><strong>${row.target}</strong><span>objectif</span></div>
    <div class="group-series-progress"><i style="width:${Math.min(100,Math.round(row.completed/row.target*100))}%"></i></div>
    <div class="group-series-meta"><span>${row.planned} planifiée(s)</span><span>${row.completed}/${row.expectedByNow} attendues réalisées</span><span>${row.paceGap} de retard</span><span>${row.pastUnrecorded} à régulariser</span><span>${row.remaining} restante(s)</span><span>${row.catchUp} à programmer</span></div>
    <p class="tiny muted">${row.availableDateCount} dates possibles · ${row.availabilityGap?`${row.availabilityGap} séance(s) de rattrapage à trouver`:'capacité calendaire suffisante'} · ${row.eligibleDates.length?`${formatShort(row.eligibleDates[0])} au ${formatShort(row.eligibleDates.at(-1))}`:'Aucune date'}</p>
  </article>`).join('');
  const cancellationNotice = Object.entries(CANCELLED_GROUP_DATES).map(([date,reason]) => `<span>${formatShort(date)} · ${escapeHtml(reason)}</span>`).join('');
  const weeks = getWeekProgram(groupProgram).map(week => `<details class="curriculum-week"><summary><span><b>Semaine ${week.week}</b> · ${escapeHtml(week.theme.replace(/^SEMAINE\s+\d+\s*:\s*/i,''))}</span><small>${formatShort(week.startDate)} – ${formatShort(week.endDate)}</small></summary><div class="curriculum-courts">${week.courts.map((content,index)=>`<div class="curriculum-court"><b>Terrain ${index+1}</b><p>${content?escapeHtml(content):'<span class="muted">Aucun exercice indiqué dans le fichier source.</span>'}</p></div>`).join('')}</div></details>`).join('');
  return `<section class="welcome-panel group-season-banner"><div><p class="eyebrow">SAISON DU 14 SEPTEMBRE 2026 AU 20 JUIN 2027</p><h2>La saison collective, semaine après semaine.</h2><p>Zone B · Cours collectifs habituels suspendus pendant les vacances ; stages enfants de 9 h 30 à 16 h 30.</p></div><div class="welcome-mark">30<span>W</span></div></section>
  <div class="stats-grid">${statCard('Objectif annuel',totalTarget,'blue','28 adultes · 30 enfants par série')}${statCard('Séances réalisées',totalCompleted,'green','Cours collectifs terminés')}${statCard('Séances planifiées',totalPlanned,'purple',`${totalCancelled} annulées · À venir et enregistrées`)}${statCard('Créneaux suivis',overview.length,'orange','Adultes : lun., mar., mer., jeu., ven. · Enfants : mer., sam.')}</div>
  <section class="panel group-cancellation-notice"><div class="section-heading"><div><p class="eyebrow">EXCEPTIONS DE SAISON</p><h2>Journées sans cours collectif</h2></div><span class="tag">2 dates</span></div><div class="group-series-meta">${cancellationNotice}</div><p class="tiny muted">Ces dates sont exclues des séances attendues et ne seront pas comptées comme des cours réalisés ou à rattraper.</p></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">PLAGES DE DISPONIBILITÉ ENREGISTRÉES</p><h2>Horaires de ton planning</h2></div></div><div class="group-series-meta"><span>Lundi · Adultes · 17 h–21 h · Terrains 1 et 2</span><span>Mardi · Adultes · 17 h 30–20 h 30 · Terrains 1, 2 et 3</span><span>Mercredi · Enfants · 9 h 30–18 h · Terrains 1, 2 et 3</span><span>Mercredi · Adultes · 18 h–21 h · Terrains 1, 2 et 3</span><span>Jeudi · Adultes · 17 h 30–19 h · Terrains 1 et 2</span><span>Vendredi · Adultes · 17 h 30–20 h · Terrains 1 et 2</span><span>Samedi · Enfants · 9 h 30–14 h 30 · Terrains 1, 2 et 3</span></div><p class="tiny muted">Pendant chaque période de vacances scolaires Zone B : stage enfants du lundi au vendredi, de 9 h 30 à 16 h 30, sur les terrains 1, 2 et 3. Les cours collectifs habituels enfants et adultes sont suspendus pendant ces périodes.</p></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">COMPTEURS PAR CRÉNEAU</p><h2>Chaque cours suivi individuellement</h2></div><button class="btn primary" data-action="add-group-series">＋ Ajouter un créneau annuel</button></div>${seriesRows.length?`<div class="group-series-grid">${seriesCards}</div>`:emptyState("Aucun créneau annuel paramétré","Ajoute chaque bloc orange avec son horaire et son court pour créer un compteur indépendant.")}<p class="tiny muted">Les séances annulées restent dans l’historique mais ne comptent pas comme réalisées. La génération crée les dates hors vacances et selon les règles de jours fériés.</p></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">VUE GLOBALE INDICATIVE</p><h2>Capacité par jour de cours</h2></div></div><div class="group-series-grid">${counters}</div></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">PROGRAMME PÉDAGOGIQUE SOURCE</p><h2>Les 30 semaines d'entraînement</h2></div><span class="tag">Cours de l'année.xlsx</span></div><p class="tiny muted">Les consignes sont reprises du classeur d'origine. Les semaines MATCH sans exercice détaillé restent volontairement vides.</p><div class="curriculum-list">${weeks}</div></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">PARAMÉTRAGE RESTANT</p><h2>Règles des blocs collectifs</h2></div><span class="tag tag-green">Règles du club</span></div><p>Les blocs collectifs sont gérés directement dans Coach In : adultes les lundis, mardis, jeudis et vendredis ; enfants les mercredis et samedis. Les compteurs annuels restent indépendants pour chaque créneau.</p><p class="tiny muted">Chaque créneau doit être rattaché à sa série annuelle, son horaire et son court avant la génération des dates, afin que le planning bloque le bon terrain et que les compteurs restent exacts.</p></section>`;
}

function sessionsPage(isCoach) {
  return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">CARNET DE TERRAIN</p><h2>${isCoach?'Toutes les séances':'Mon historique'}</h2></div>${isCoach?'<div class="toolbar"><button class="btn primary" data-action="generate-session">✦ Composer une séance</button><button class="btn subtle" data-action="new-session">＋ Saisie libre</button></div>':''}</div>${state.sessions.map(s=>sessionCard(s,isCoach)).join('') || emptyState('Aucune séance enregistrée','Les séances apparaîtront ici après leur création.')}</section>`;
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
      <div class="progress-player-head"><div class="player-avatar">${escapeHtml((player.first_name||'?').slice(0,1))}${escapeHtml((player.last_name||'').slice(0,1))}</div><div class="list-main"><strong>${escapeHtml(player.first_name)} ${escapeHtml(player.last_name)}</strong><span>${reports.length} bilan(s) · ${state.sessions.filter(s=>s.player_id===player.id).length} séance(s)</span></div><span class="tag tag-purple">${unlocked.length} réussite(s)</span><span class="tag">${(state.videoCorrectionFollowups||[]).filter(f=>f.player_id===player.id&&f.status==='verified').length} correction(s) vérifiée(s)</span><button class="btn subtle" data-player-sheet="${player.id}">Ouvrir la fiche</button></div>
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
    const coach = [...(state.playerCoaches||[]),...(state.playerCoachHistory||[])].find(row => row.id === id);
    return coach ? ([coach.first_name, coach.last_name].filter(Boolean).join(' ') || coach.email || 'Coach') : 'Coach';
  };
  const themeCounts = new Map();
  for (const row of criteria) themeCounts.set(row.main_theme || row.subtheme || 'Autres', (themeCounts.get(row.main_theme || row.subtheme || 'Autres') || 0) + 1);
  const themeRows = [...themeCounts.entries()].sort((a,b)=>b[1]-a[1]);
  const reports = [...state.evaluations].sort((a,b)=>String(a.evaluated_at||a.created_at).localeCompare(String(b.evaluated_at||b.created_at)));
  const sectorDefinitions = [
    { label: 'Technique', key: 'technical_score', color: '#43d4f2' },
    { label: 'Tactique', key: 'tactical_score', color: '#a78bfa' },
    { label: 'Physique', key: 'physical_score', color: '#66e0ad' },
    { label: 'Mental', key: 'mental_score', color: '#ffb36e' }
  ];
  const reportsByCoach = new Map();
  reports.forEach(report => {
    const coachId = report.coach_id || report.created_by || report.coach_user_id || 'coach-inconnu';
    if (!reportsByCoach.has(coachId)) reportsByCoach.set(coachId, []);
    reportsByCoach.get(coachId).push(report);
  });
  const sectorCards = [...reportsByCoach.entries()].map(([coachId, coachReports]) => {
    const cards = sectorDefinitions.map(sector => {
      const values = coachReports.map(report => ({
        report,
        value: report[sector.key] === null || report[sector.key] === undefined || report[sector.key] === '' ? null : Number(report[sector.key])
      })).filter(point => Number.isFinite(point.value) && point.value >= 0 && point.value <= 20);
      const first = values[0]?.value;
      const latest = values.at(-1)?.value;
      const delta = values.length > 1 ? latest - first : null;
      const points = values.map((point,index) => {
        const x = values.length === 1 ? 120 : 9 + index * 222 / (values.length - 1);
        const y = 65 - point.value * 2.8;
        return { x, y, point };
      });
      const line = points.length > 1 ? `<polyline points="${points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${sector.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : '';
      const dots = points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="${sector.color}" stroke="#eaf8ff" stroke-width="1.5"><title>${p.point.value.toFixed(1).replace('.',',')}/20 · ${formatDate(p.point.report.evaluated_at||p.point.report.created_at)}</title></circle>`).join('');
      const deltaMarkup = delta === null ? '<span class="sector-delta neutral">Un seul bilan</span>' : `<span class="sector-delta ${delta>0?'up':delta<0?'down':'neutral'}">${delta>0?'↗':delta<0?'↘':'→'} ${delta>0?'+':''}${delta.toFixed(1).replace('.',',')} pts</span>`;
      return `<article class="sector-evolution-card">
        <div class="sector-evolution-top"><div><span class="sector-color-dot" style="--sector-color:${sector.color}"></span><strong>${sector.label}</strong></div>${deltaMarkup}</div>
        ${values.length ? `<svg viewBox="0 0 240 76" role="img" aria-label="Évolution ${sector.label.toLowerCase()} : ${values.length} bilan(s)"><line x1="8" y1="9" x2="232" y2="9" class="sector-evolution-grid"/><line x1="8" y1="37" x2="232" y2="37" class="sector-evolution-grid"/><line x1="8" y1="65" x2="232" y2="65" class="sector-evolution-grid"/>${line}${dots}</svg><div class="sector-evolution-values"><span>Départ <b>${first.toFixed(1).replace('.',',')}/20</b></span><span>Dernier <b>${latest.toFixed(1).replace('.',',')}/20</b></span></div><small>${values.length} bilan(s) noté(s)</small>` : '<p class="sector-evolution-empty">Pas encore de note</p>'}
      </article>`;
    }).join('');
    return `<section class="coach-evolution-block"><div class="coach-evolution-heading"><div><p class="eyebrow">SUIVI INDIVIDUEL</p><h3>${escapeHtml(coachName(coachId))}</h3></div><span class="tag">${coachReports.length} bilan(s)</span></div><div class="sector-evolution-grid">${cards}</div></section>`;
  }).join('');
  const scoreChart = sectorCards ? `<div class="player-sector-evolution"><p class="evolution-intro">Chaque courbe suit un secteur, bilan après bilan. Les résultats restent séparés par coach pour conserver une lecture fidèle de chaque accompagnement.</p>${sectorCards}</div>` : '<p class="chart-empty">Les courbes apparaîtront dès que tes bilans contiendront des notes sur 20.</p>';
  const historyEvents = [
    ...reports.map(report=>({type:'evaluation',date:report.evaluated_at||report.created_at,report})),
    ...state.sessions.map(session=>({type:'session',date:session.session_date,session})),
    ...achievements.map(item=>({type:'achievement',date:item.unlocked_at,item})),
    ...state.challenges.filter(item=>item.status==='completed').map(item=>({type:'challenge',date:item.completed_at||item.updated_at||item.created_at,item})),
    ...(state.videoAnalyses||[]).filter(item=>item.player_id===state.user?.id&&item.shared_with_player===true).map(item=>({type:'video',date:item.analyzed_at||item.created_at,item}))
  ].filter(event=>event.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const historyMarkup = historyEvents.map(event=>{
    if(event.type==='evaluation'){ const report=event.report; const rows=criteria.filter(c=>c.evaluation_id===report.id); const themes=[...new Set(rows.map(c=>c.main_theme).filter(Boolean))]; const author=[report.coach_first_name,report.coach_last_name].filter(Boolean).join(' ')||coachName(report.created_by); return `<article class="journey-event journey-evaluation"><span class="journey-marker">↗</span><div class="journey-event-body"><div class="journal-date">${formatDate(event.date,{day:'2-digit',month:'long',year:'numeric'})} · ${escapeHtml(author)}</div><h3>Bilan de progression</h3><p>${themes.length?`Thèmes : ${themes.map(escapeHtml).join(' · ')}`:'Bilan enregistré'}</p>${radarChart(report)}<div class="journal-criteria">${rows.map(c=>`<span class="journal-tag ${c.criterion_type==='positive'?'positive':'improvement'}">${c.criterion_type==='positive'?'✓':'↗'} ${escapeHtml(c.criterion)}</span>`).join('')}</div></div></article>`; }
    if(event.type==='session'){ const row=event.session; const author=[row.coach_first_name,row.coach_last_name].filter(Boolean).join(' ')||'Coach'; return `<article class="journey-event journey-session"><span class="journey-marker">●</span><div class="journey-event-body"><div class="journal-date">${formatDate(row.session_date,{day:'2-digit',month:'long',year:'numeric'})} · ${formatTime(row.session_time)}</div><h3>${escapeHtml(row.theme||'Séance de tennis')}</h3><p>${escapeHtml(row.player_visible_summary||'Séance enregistrée')} · Coach : ${escapeHtml(author)}</p></div></article>`; }
    if(event.type==='video'){ const item=event.item; const result=item.analysis_result||{}; const coach=[...(state.playerCoaches||[]),...(state.playerCoachHistory||[])].find(row=>row.id===item.coach_id); const author=coach?([coach.first_name,coach.last_name].filter(Boolean).join(' ')||'Coach'):'Coach'; return `<article class="journey-event journey-video"><span class="journey-marker">▶</span><div class="journey-event-body"><div class="journal-date">${formatDate(event.date,{day:'2-digit',month:'long',year:'numeric'})} · ${escapeHtml(author)}</div><h3>${escapeHtml(item.title||'Analyse vidéo')}</h3><p>${escapeHtml(result.summary||'Analyse technique partagée')}</p><small>Analyse vidéo partagée</small></div></article>`; }
    const item=event.item; const isAchievement=event.type==='achievement'; return `<article class="journey-event ${isAchievement?'journey-achievement':'journey-challenge'}"><span class="journey-marker">${isAchievement?'✦':'★'}</span><div class="journey-event-body"><div class="journal-date">${formatDate(event.date,{day:'2-digit',month:'long',year:'numeric'})} · Coach : ${escapeHtml(coachName(item.coach_id))}</div><h3>${isAchievement?'Réussite débloquée':'Défi relevé'}</h3><p>${escapeHtml(item.criterion)}</p>${isAchievement?`<small>${Number(item.validation_count||3)} validations positives</small>`:`<small>${escapeHtml(item.objective||'Objectif atteint')}</small>`}</div></article>`;
  }).join('');
  return `<div class="stats-grid">${statCard('Séances',state.sessions.length,'blue','Tous tes coachs')}${statCard('Temps sur le court',`${Math.floor(totalMinutes/60)} h`,'purple',`${totalMinutes%60} min supplémentaires`)}${statCard('Critères positifs',positiveCount,'green','Repérés dans tes bilans')}${statCard('Réussites',achievements.length,'orange','Compétences débloquées')}</div>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">MES OBJECTIFS DU MOMENT</p><h2>Mes défis tennis</h2></div></div>${state.challenges.length?state.challenges.map(challenge=>`<div class="challenge-strip"><b>${escapeHtml(challenge.criterion)}</b><span>${escapeHtml(challenge.objective)}</span><small>${challenge.status==='completed'?'Défi validé':'En cours'} · Coach : ${escapeHtml(coachName(challenge.coach_id))} · ${challenge.current_value??'—'} / ${challenge.target_value??'—'} · ${challenge.consecutive_successes||0}/2 validations</small></div>`).join('') : emptyState('Pas de défi actif','Tes coachs pourront te proposer des objectifs individualisés.')}</section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">COMPÉTENCES DÉBLOQUÉES</p><h2>Mes réussites</h2></div></div><div class="achievement-grid">${achievements.map(item=>`<div class="achievement-card"><span class="achievement-symbol">✦</span><strong>${escapeHtml(item.criterion)}</strong><small>Coach : ${escapeHtml(coachName(item.coach_id))}</small><small class="achievement-meta">Débloquée le ${formatDate(item.unlocked_at,{day:'2-digit',month:'long',year:'numeric'})} · ${Number(item.validation_count||3)} validations</small></div>`).join('')||emptyState('Les premières réussites arrivent bientôt','Un critère positif validé sur trois bilans distincts peut devenir une réussite pour le coach qui te suit.')}</div></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">MES THÈMES DE TRAVAIL</p><h2>Les thèmes abordés</h2></div></div>${themeRows.map(([name,count])=>`<div class="theme-progress-row"><span>${escapeHtml(name)}</span><div class="theme-progress-track"><i style="width:${Math.max(4,Math.round(count/Math.max(1,...themeRows.map(x=>x[1]))*100))}%"></i></div><b>${count}</b></div>`).join('')||'<p class="muted">Les thèmes apparaîtront après les premiers bilans détaillés.</p>'}<p class="tiny muted">${improvementCount} points à travailler recensés dans tes bilans.</p></section>
  <section class="panel"><div class="section-heading"><div><p class="eyebrow">ÉVOLUTION DANS LE TEMPS</p><h2>Ma progression par secteur</h2></div></div>${scoreChart}<div class="journey-timeline">${historyMarkup||emptyState('Ton parcours commence ici','Tes bilans, séances et réussites apparaîtront dans cette chronologie.')}</div></section>`;
}

export function libraryCard(item) {
  const isTemplate = item.is_program_template === true;
  const category = item.category === 'collectif' ? 'Collectif' : 'Particulier';
  const sections = [['Objectif',item.objective],['Matériel',item.equipment],['Mise en place',item.setup],['Consignes',item.instructions],['Rotations',item.rotations],['Variantes',item.variations]].filter(([,value])=>String(value||'').trim());
  return '<article class="library-item-card '+(isTemplate?'library-program-template':'')+'"><div class="library-item-main"><div class="library-item-title-row"><strong>'+escapeHtml(item.title||'Exercice sans titre')+'</strong><span class="library-category-pill '+(item.category==='collectif'?'is-group':'is-private')+'">'+category+'</span></div><div class="library-item-meta"><span>'+escapeHtml(item.theme||'Sans thème')+'</span>'+(item.subtheme?'<span>· '+escapeHtml(item.subtheme)+'</span>':'')+'<span>· '+escapeHtml(item.level||'Tous niveaux')+'</span>'+(item.duration_minutes?'<span>· '+Number(item.duration_minutes)+' min</span>':'')+(item.source_week?'<span>· Semaine '+Number(item.source_week)+'</span>':'')+'</div>'+(item.objective?'<p class="library-item-objective">'+escapeHtml(item.objective)+'</p>':'')+'</div>'+(sections.length?'<details class="library-item-details"><summary>Voir le contenu pédagogique <span>'+sections.length+' rubrique(s)</span></summary><div>'+sections.map(([label,value])=>'<section><b>'+label+'</b><p>'+escapeHtml(value)+'</p></section>').join('')+'</div></details>':'')+'<div class="library-item-actions">'+(isTemplate?'<button class="btn primary" data-add-program-item="'+item.id+'">＋ Ajouter à ma bibliothèque</button>':'<button class="btn subtle" data-edit-library="'+item.id+'">Modifier</button>'+(item.category==='particulier'?'<button class="btn primary" data-use-library="'+item.id+'">Préparer une séance</button>':''))+'</div></article>';
}
export function libraryItemsForCoach() {
  const privateThemes=[
    ['attaque','Séance type — Attaque'],
    ['construction','Séance type — Construction du point'],
    ['defense','Séance type — Défense'],
    ['footwork','Séance type — Déplacements et appuis'],
    ['mental','Séance type — Mental et routine'],
    ['return','Séance type — Retour de service'],
    ['service','Séance type — Service'],
    ['volley','Séance type — Volée']
  ];
  const privateTemplates=privateThemes.map(([key,title])=>{
    const generated=generateOriginalSession({theme:key,level:'Intermédiaire',difficulty:'progressive',duration:90});
    return {
      id:'private-template-'+key,is_program_template:true,category:'particulier',title,
      theme:generated.theme,subtheme:'Séance complète',level:'Tous niveaux',
      objective:generated.objective,
      equipment:'Raquettes, balles et plots ou cibles selon les ateliers.',
      setup:'Installer les zones et positions décrites dans les ateliers. Adapter l’alimentation au niveau du joueur.',
      instructions:generated.exercise_1+'\n\n'+generated.exercise_2,
      rotations:'Alterner les rôles de joueur et de partenaire après chaque série.',
      variations:generated.difficulty_rule+'\n\nCritère de réussite : '+generated.success_criteria,
      keywords:[key,generated.theme,'cours particulier','séance type'],
      source_week:null,duration_minutes:90
    };
  });
  const programItems=(groupProgram.weeks||[]).flatMap(week=>(week.courts||[]).map((instructions,index)=>{
    const text=String(instructions||'').trim(); if(!text)return null;
    const theme=String(week.theme||'').replace(/^SEMAINE\s+\d+\s*:\s*/i,'').trim();
    return {id:'program-'+week.week+'-'+(index+1),is_program_template:true,category:'collectif',title:'S'+String(week.week).padStart(2,'0')+' · Atelier '+(index+1)+' — '+theme,theme:theme||'Programme collectif',subtheme:'Atelier terrain '+(index+1),level:'Tous niveaux',objective:'',equipment:'',setup:'',instructions:text,rotations:'',variations:'',keywords:[theme,'programme annuel','collectif'].filter(Boolean),source_week:Number(week.week),duration_minutes:null};
  }).filter(Boolean));
  const savedKeys=new Set((state.library||[]).map(item=>String(item.source_week||'')+'|'+String(item.title||'')));
  const savedPrivateTitles=new Set((state.library||[]).filter(item=>item.category==='particulier').map(item=>String(item.title||'')));
  return [
    ...(state.library||[]),
    ...privateTemplates.filter(item=>!savedPrivateTitles.has(item.title)),
    ...programItems.filter(item=>!savedKeys.has(String(item.source_week)+'|'+String(item.title)))
  ];
}
function libraryPage() {
  const items=libraryItemsForCoach().sort((a,b)=>String(a.title).localeCompare(String(b.title),'fr'));
  const themes=[...new Set(items.map(x=>x.theme).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const levels=[...new Set(items.map(x=>x.level).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const cards=items.map((item,index)=>{const letter=(String(item.title||'#').trim()[0]||'#').toLocaleUpperCase('fr');const previous=index?String(items[index-1].title||'#').trim()[0].toLocaleUpperCase('fr'):'';return (letter!==previous?'<h3 class="library-letter-heading">'+escapeHtml(letter)+'</h3>':'')+libraryCard(item);}).join('');
  return '<section class="panel library-page"><div class="section-heading"><div><p class="eyebrow">RESSOURCES PÉDAGOGIQUES</p><h2>Bibliothèque de séances</h2><p class="tiny muted">Tes contenus personnels et les ateliers issus du programme collectif des 30 semaines.</p></div><button class="btn primary" data-action="new-library-item">＋ Ajouter un contenu</button></div><div class="toolbar library-toolbar"><input class="search-input" id="library-search" placeholder="Rechercher un exercice, un thème, un objectif…"><select class="select-input" id="library-category"><option value="all">Tous les formats</option><option value="collectif">Cours collectifs</option><option value="particulier">Cours particuliers</option></select><select class="select-input" id="library-theme"><option value="all">Tous les thèmes</option>'+themes.map(x=>'<option value="'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>').join('')+'</select><select class="select-input" id="library-level"><option value="all">Tous les niveaux</option>'+levels.map(x=>'<option value="'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>').join('')+'</select></div><div class="library-count-line"><span>'+items.length+' contenus disponibles</span><span>Classement alphabétique</span></div><div id="library-results" class="library-results">'+(cards||emptyState('Bibliothèque à construire','Ajoute tes contenus collectifs et particuliers pour les retrouver rapidement.'))+'</div></section>';
}
function bookingsPage(isCoach) {
  const rows = state.bookingRequests.map(b=>`<article class="list-card"><div class="list-date"><strong>${formatDate(b.session_date,{day:'2-digit',month:'short'})}</strong><small>${formatTime(b.start_time)}</small></div><div class="list-main"><strong>${escapeHtml(isCoach?playerName(b.player_id):'Cours particulier')}</strong><span>${b.duration_minutes} min · Court ${b.court_number || '—'}</span></div><span class="tag">${escapeHtml(b.status)}</span>${isCoach&&b.status==='pending'?`<button class="btn subtle" data-booking="${b.id}" data-status="accepted">Accepter</button><button class="btn danger" data-booking="${b.id}" data-status="rejected">Refuser</button>`:''}${!isCoach&&['pending','accepted'].includes(b.status)?`<button class="btn danger" data-cancel-booking="${b.id}">Annuler</button>`:''}</article>`).join('');
  return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">COURS PARTICULIERS</p><h2>${isCoach?'Demandes de réservation':'Mes réservations'}</h2></div>${!isCoach?'<button class="btn primary" data-action="request-booking">＋ Demander un cours</button>':''}</div>${rows || emptyState('Aucune réservation','Les demandes et cours particuliers apparaîtront ici.')}${!isCoach?'<p class="tiny muted">Une demande reste en attente jusqu’à la décision du coach. L’annulation par le joueur est possible jusqu’à 24 h avant le cours.</p>':''}</section>`;
}

function notificationsPage(isCoach) {
 const prefs=state.notificationPreferences||{};
 const settings=[['booking_requests','Nouvelles demandes de réservation'],['booking_decisions','Réponses aux demandes de réservation'],['booking_changes','Annulations de réservation'],['reminders_24h','Rappels 24 heures avant un cours'],['messages','Nouveaux messages'],['progress','Défis et réussites'],['session_changes','Création, modification ou annulation de séances']];
 const rows=(state.notifications||[]).map(n=>'<article class="list-card notification-row '+(!n.read_at?'notification-unread':'')+'"><div class="list-main"><strong>'+escapeHtml(n.title)+'</strong><span>'+escapeHtml(n.body||'')+'</span><small>'+formatDate(n.created_at,{day:'2-digit',month:'short',year:'numeric'})+' '+formatTime(n.created_at?.slice(11,16))+'</small></div>'+(n.target_path?'<button class="btn primary" data-open-notification="'+n.id+'" data-target-path="'+escapeHtml(n.target_path)+'" data-partner-id="'+escapeHtml(isCoach?n.player_id:n.coach_id||'')+'">Ouvrir</button>':'')+(!n.read_at?'<button class="btn subtle" data-read-notification="'+n.id+'">Marquer comme lu</button>':'<span class="tag">Lu</span>')+'</article>').join('');
 return '<section class="panel"><div class="section-heading"><div><p class="eyebrow">CENTRE DE NOTIFICATIONS</p><h2>Mes notifications</h2></div></div>'+(rows||emptyState('Tout est calme','Tes notifications apparaîtront ici.'))+'</section><section class="panel notification-settings"><div class="section-heading"><div><p class="eyebrow">PRÉFÉRENCES</p><h2>Gérer mes notifications</h2><p class="tiny muted">Choisis les événements pour lesquels tu souhaites recevoir une notification dans Coach In.</p></div></div><form id="notification-preferences-form" class="notification-preferences-grid">'+settings.map(([key,label])=>'<label class="notification-preference"><span>'+label+'</span><input type="checkbox" name="'+key+'" '+(prefs[key]!==false?'checked':'')+'></label>').join('')+'<div class="dialog-actions span-2"><button class="btn primary">Enregistrer mes préférences</button></div></form></section>';
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


function videoAnalysisPage(isCoach){
  const rows=(state.videoAnalyses||[]).slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const playerOptions=(state.players||[]).filter(player=>!player.archived_at).map(player=>'<option value="'+player.id+'">'+escapeHtml(player.first_name+' '+player.last_name)+'</option>').join('');
  const upload=isCoach?'<section class="panel video-upload-panel"><div class="section-heading"><div><p class="eyebrow">NOUVELLE ANALYSE</p><h2>Importer une vidéo de tennis</h2><p class="tiny muted">L’IA étudie huit images réparties sur la séquence ; seules ces images extraites sont envoyées au service OpenAI pour analyse. La vidéo originale reste dans ton espace privé.</p></div><span class="video-ai-mark">IA</span></div>'+(playerOptions?'<form id="video-analysis-form" class="form-grid"><label class="span-2">Joueur<select name="player_id" required>'+playerOptions+'</select></label><label class="span-2">Titre de la séquence<input name="title" required maxlength="120" placeholder="Ex. Service côté avantage"></label><label>Geste observé<select name="stroke_type"><option value="general">Geste global</option><option value="service">Service</option><option value="forehand">Coup droit</option><option value="backhand">Revers</option><option value="volley">Volée</option><option value="return">Retour de service</option><option value="footwork">Déplacements</option></select></label><label class="span-2 video-file-label">Vidéo MP4, MOV ou WEBM<input type="file" name="video" accept="video/mp4,video/quicktime,video/webm" required><small>250 Mo maximum · 10 minutes maximum</small></label><label class="video-consent span-2"><input type="checkbox" name="consent" required><span>J’ai l’autorisation du joueur ou de son représentant légal et je l’informe que huit images seront transmises à OpenAI pour analyse.</span></label><div class="span-2 video-privacy-note">Les vidéos sont privées. Seul le coach associé y accède ; le joueur ne voit l’analyse que si tu actives le partage.</div><div class="dialog-actions span-2"><button class="btn primary" type="submit">Lancer l’analyse IA</button></div></form>':'<div class="empty-state"><h3>Aucun joueur associé</h3><p>Associe un joueur à ton espace pour pouvoir analyser ses vidéos.</p></div>')+'</section>':'';
  const cards=rows.map(row=>{
    const result=row.analysis_result||{},phases=Array.isArray(result.phases)?result.phases:[],strengths=Array.isArray(result.strengths)?result.strengths:[],corrections=Array.isArray(result.corrections)?result.corrections:[],drills=Array.isArray(result.drills)?result.drills:[];
    const player=(state.players||[]).find(x=>x.id===row.player_id);
    const resultHtml=row.status==='completed'?'<div class="video-result"><div class="video-summary"><b>Synthèse IA</b><p>'+escapeHtml(result.summary||'Aucune synthèse fournie.')+'</p><span class="tag">Confiance : '+escapeHtml(result.confidence||row.confidence||'non précisée')+'</span></div>'+(phases.length?'<div class="video-result-section"><b>Phases observées</b>'+phases.map(x=>'<article><strong>'+escapeHtml(x.phase||'Séquence')+' · '+escapeHtml(x.timestamp||'')+'</strong><p>'+escapeHtml(x.observation||'')+'</p></article>').join('')+'</div>':'')+(strengths.length?'<div class="video-result-section"><b>Points positifs</b><ul>'+strengths.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')+'</ul></div>':'')+(result.next_session_focus?'<div class="video-next-focus"><span>OBJECTIF DE LA PROCHAINE SÉANCE</span><strong>'+escapeHtml(result.next_session_focus)+'</strong></div>':'')+(corrections.length?'<div class="video-result-section"><b>Fiches pédagogiques de correction</b>'+corrections.map((x,index)=>'<article class="video-pedagogy-card"><div class="video-pedagogy-heading"><strong>'+escapeHtml(x.priority||'Priorité '+(index+1))+'</strong><span>À travailler</span></div><div class="video-pedagogy-field"><small>1 · Défaut ou point à améliorer observé</small><p>'+escapeHtml(x.observation||'Observation non précisée.')+'</p></div><div class="video-pedagogy-field"><small>2 · Consigne à donner au joueur</small><p class="video-correction">'+escapeHtml(x.correction||'À préciser par le coach.')+'</p></div>'+(x.exercise_name||x.exercise_setup?'<div class="video-pedagogy-field"><small>3 · Exercice correctif</small><strong>'+escapeHtml(x.exercise_name||'Exercice à définir')+'</strong><p>'+escapeHtml(x.exercise_setup||'')+'</p></div>':'')+(x.verification_goal?'<div class="video-pedagogy-field"><small>4 · À vérifier à la prochaine séance</small><p>'+escapeHtml(x.verification_goal)+'</p></div>':'')+(x.success_criteria?'<div class="video-pedagogy-check"><b>Critère de réussite</b><p>'+escapeHtml(x.success_criteria)+'</p></div>':'')+(isCoach?'<form class="video-followup-form"><input type="hidden" name="analysis_id" value="'+row.id+'"><input type="hidden" name="correction_index" value="'+index+'"><label>Relier à un bilan<select name="evaluation_id"><option value="">Sans bilan pour le moment</option>'+(state.evaluations||[]).filter(e=>e.player_id===row.player_id).map(e=>'<option value="'+e.id+'" '+((state.videoCorrectionFollowups||[]).find(f=>f.analysis_id===row.id&&f.correction_index===index)?.evaluation_id===e.id?'selected':'')+'>'+formatDate(e.evaluated_at||e.created_at,{day:'2-digit',month:'short',year:'numeric'})+(e.score!==null&&e.score!==undefined?' · '+escapeHtml(String(e.score))+'/20':'')+'</option>').join('')+'</select></label><label>État du travail<select name="status">'+[['pending','À travailler'],['in_progress','En cours'],['verified','Acquis / vérifié'],['not_achieved','Non acquis']].map(([v,l])=>'<option value="'+v+'" '+(((state.videoCorrectionFollowups||[]).find(f=>f.analysis_id===row.id&&f.correction_index===index)?.status||'pending')===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label>Observation au prochain bilan<textarea name="coach_observation" rows="2" placeholder="Résultat observé, nombre de réussites, ajustement…">'+escapeHtml((state.videoCorrectionFollowups||[]).find(f=>f.analysis_id===row.id&&f.correction_index===index)?.coach_observation||'')+'</textarea></label><button class="btn subtle" type="submit">Enregistrer le suivi</button></form>':'')+'</article>').join('')+'</div>':'')+(drills.length?'<div class="video-result-section"><b>Exercices suggérés</b>'+drills.map(x=>'<article><strong>'+escapeHtml(x.name||'Exercice')+'</strong><p>'+escapeHtml(x.objective||'')+'</p><small>'+escapeHtml(x.setup||'')+'</small></article>').join('')+'</div>':'')+(Array.isArray(result.limitations)&&result.limitations.length?'<div class="video-limitations"><b>Limites de l’observation</b><ul>'+result.limitations.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')+'</ul></div>':'')+'</div>':'';
    const video=row.video_url?'<video class="video-analysis-player" controls playsinline preload="metadata" src="'+escapeHtml(row.video_url)+'"></video>':'<p class="tiny muted">Aperçu vidéo indisponible.</p>';
    const status=row.status==='completed'?'Analyse terminée':row.status==='processing'?'Analyse en cours…':row.status==='failed'?'Analyse à relancer':'Vidéo importée';
    return '<article class="panel video-analysis-card"><div class="video-card-heading"><div><p class="eyebrow">'+escapeHtml(player?player.first_name+' '+player.last_name:'Joueur')+' · '+escapeHtml(row.stroke_type)+'</p><h3>'+escapeHtml(row.title)+'</h3><small>'+formatDate(row.created_at,{day:'2-digit',month:'short',year:'numeric'})+' · '+status+'</small></div><span class="tag '+(row.status==='completed'?'tag-green':'')+'">'+escapeHtml(status)+'</span></div>'+video+resultHtml+(!isCoach&&row.coach_review?'<div class="video-result-section"><b>Commentaire du coach</b><p>'+escapeHtml(row.coach_review)+'</p></div>':'')+(row.analysis_error?'<p class="video-error">'+escapeHtml(row.analysis_error)+'</p>':'')+(isCoach?'<form id="video-review-form" class="video-review-form"><input type="hidden" name="analysis_id" value="'+row.id+'"><label>Ton commentaire de coach<textarea name="coach_review" rows="2" placeholder="Valide, nuance ou complète les observations…">'+escapeHtml(row.coach_review||'')+'</textarea></label><button class="btn subtle" type="submit">Enregistrer mon commentaire</button></form><button class="btn '+(row.shared_with_player?'subtle':'primary')+'" data-share-video="'+row.id+'" data-shared="'+(row.shared_with_player?'true':'false')+'">'+(row.shared_with_player?'Retirer le partage joueur':'Partager au joueur')+'</button><button class="btn subtle" data-delete-video="'+row.id+'">Supprimer la vidéo</button>':'')+'</article>';
  }).join('');
  return (upload||'')+'<section class="panel"><div class="section-heading"><div><p class="eyebrow">HISTORIQUE VIDÉO</p><h2>'+(isCoach?'Mes analyses':'Les analyses partagées avec moi')+'</h2></div><span class="tag">'+rows.length+' vidéo(s)</span></div>'+(cards||'<div class="empty-state"><h3>Aucune vidéo analysée</h3><p>'+(isCoach?'Importe une première séquence pour obtenir des observations techniques.':'Les analyses que ton coach partagera apparaîtront ici.')+'</p></div>')+'</section>';
}

function messagesPage(isCoach) {
 const partners=isCoach?(state.players||[]):(state.playerCoaches||[]);
 const partnerId=state.messagePartnerId&&partners.some(p=>p.id===state.messagePartnerId)?state.messagePartnerId:(partners[0]?.id||'');
 if(partnerId)state.messagePartnerId=partnerId;
 const rows=(state.messages||[]).filter(m=>isCoach?m.player_id===partnerId:m.coach_id===partnerId).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
 const unreadFor=partner=>(state.messages||[]).filter(m=>(isCoach?m.player_id===partner.id:m.coach_id===partner.id)&&m.sender_id!==state.user.id&&!m.read_at).length;
 const options=partners.map(p=>{const unread=unreadFor(p);return '<option value="'+p.id+'" '+(p.id===partnerId?'selected':'')+'>'+escapeHtml([p.first_name,p.last_name].filter(Boolean).join(' ')||p.email||'Contact')+(unread?' · '+unread+' non lu(s)':'')+'</option>';}).join('');
 const thread=rows.map(m=>{const mine=m.sender_id===state.user.id;const mime=String(m.attachment_mime||'');const url=escapeHtml(m.attachment_url||'');const attachment=!m.attachment_url?'':mime.startsWith('image/')?'<a href="'+url+'" target="_blank" rel="noopener"><img class="message-image-preview" src="'+url+'" alt="'+escapeHtml(m.attachment_name||'Photo jointe')+'"></a>':mime.startsWith('video/')?'<video class="message-video-preview" controls preload="metadata" src="'+url+'"></video>':'<a class="message-attachment" href="'+url+'" target="_blank" rel="noopener" download="'+escapeHtml(m.attachment_name||'document')+'">↗ '+escapeHtml(m.attachment_name||'Pièce jointe')+'</a>';return '<article class="message-bubble '+(mine?'message-own':'message-other')+'"><p>'+escapeHtml(m.body||'')+'</p>'+attachment+'<small>'+new Date(m.created_at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})+(mine&&m.read_at?' · Lu':'')+'</small></article>';}).join('');
 const coachField=isCoach?'':'<input type="hidden" name="coach_id" value="'+partnerId+'">';
 const playerField=isCoach?'<input type="hidden" name="player_id" value="'+partnerId+'">':'';
 return '<section class="panel"><div class="section-heading"><div><p class="eyebrow">MESSAGERIE PRIVÉE</p><h2>Conversation</h2></div></div>'+(partners.length?'<label class="message-partner-label">Contact<select id="message-partner" class="select-input">'+options+'</select></label><div class="message-thread">'+(thread||'<p class="muted">Aucun message dans cette conversation. Envoie le premier message.</p>')+'</div><form id="message-form" class="message-compose">'+coachField+playerField+'<textarea name="body" rows="3" placeholder="Écrire un message…"></textarea><label class="message-file-label">Joindre une photo, vidéo ou document<input type="file" name="attachment" accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"></label><small class="tiny muted">Photos, vidéos et documents · 50 Mo maximum. Les pièces jointes restent privées.</small><button class="btn primary">Envoyer</button></form>':'<p class="muted">'+(isCoach?'Associe un joueur à ton effectif pour démarrer une conversation.':'Aucun coach associé à ton compte pour le moment.')+'</p>')+'</section>';
}