import { escapeHtml, formatDate, formatTime } from '../core/dom.js';
import { state } from '../core/state.js';

export function playerName(id) {
  const player = state.players.find(item => item.id === id);
  return player ? `${player.first_name || ''} ${player.last_name || ''}`.trim() : 'Joueur';
}

export function emptyState(title, description = '') {
  return `<div class="empty-state"><div class="empty-icon">◎</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>`;
}

export function statCard(label, value, color, detail = '') {
  return `<article class="stat-card ${color}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

export function sessionCard(session, isCoach) {
  const name = isCoach ? playerName(session.player_id) : 'Entraînement';
  const status = session.status || 'Prévue';
  const linkedCoach = state.playerCoaches.find(row => row.id === session.created_by);
  const coachName = [session.coach_first_name, session.coach_last_name].filter(Boolean).join(' ') || linkedCoach?.email || '';
  const duration = Number(session.duration_minutes || 60);
  const theme = session.theme || 'Séance individuelle';
  const linkedEvaluations = isCoach ? (state.evaluations || []).filter(row => row.session_id === session.id) : [];
  const searchText = [name, theme, status, session.exercise_1, session.exercise_2].filter(Boolean).join(' ');
  const canReview = isCoach && String(session.session_date || '') <= new Date().toISOString().slice(0, 10);
  const reviewAction = canReview ? `<button class="btn subtle session-review-button" data-review-session="${escapeHtml(session.id)}">${session.progress_review ? 'Ajuster le suivi' : 'Ajustement manuel'}</button>` : '';
  const reviewTag = canReview && session.progress_review ? '<span class="tag tag-green">Suivi renseigné</span>' : '';
  const details = [linkedEvaluations.length ? `<div class="session-detail-block session-linked-evaluations"><b>Bilans associés · ${linkedEvaluations.length}</b>${linkedEvaluations.map(row=>`<p>${formatDate(row.evaluated_at || row.created_at,{day:'2-digit',month:'short',year:'numeric'})} · ${row.score===null||row.score===undefined?'Note non renseignée':Number(row.score).toLocaleString('fr-FR',{maximumFractionDigits:1})+'/20'}${row.player_visible_comment?' · '+escapeHtml(row.player_visible_comment):''}</p>`).join('')}</div>` : '', session.player_visible_summary ? `<div class="session-detail-block"><b>Résumé</b><p>${escapeHtml(session.player_visible_summary)}</p></div>` : '', session.exercise_1 ? `<div class="session-detail-block"><b>Exercice 1</b><p>${escapeHtml(session.exercise_1)}</p></div>` : '', session.exercise_2 ? `<div class="session-detail-block"><b>Exercice 2 / retour au match</b><p>${escapeHtml(session.exercise_2)}</p></div>` : '', isCoach && session.coach_private_notes ? `<div class="session-detail-block session-private-note"><b>Notes privées du coach</b><p>${escapeHtml(session.coach_private_notes)}</p></div>` : ''].filter(Boolean).join('');
  return `<article class="session-card" data-session-card data-session-search="${escapeHtml(searchText)}">
    <div class="session-card-top">
      <div class="session-date-badge"><strong>${formatDate(session.session_date, { day: '2-digit', month: 'short' })}</strong><small>${formatTime(session.session_time)}</small></div>
      <div class="session-card-main">
        <strong class="session-player-name">${escapeHtml(name)}</strong>
        <span class="session-theme">${escapeHtml(theme)}</span>
        <div class="session-card-meta"><span>${duration} min</span><span class="session-meta-dot">·</span><span>${escapeHtml(status)}</span>${!isCoach && coachName ? `<span class="session-meta-dot">·</span><span>Coach : ${escapeHtml(coachName)}</span>` : ''}</div>
      </div>
      <div class="session-card-tags">${reviewTag}</div>
    </div>
    ${details ? `<details class="session-card-details"><summary>Voir le contenu de la séance <span>⌄</span></summary><div class="session-card-detail-content">${details}</div></details>` : ''}
    <div class="session-card-actions">${isCoach ? `<button class="btn subtle session-favorite-button ${state.favoriteSessionIds?.includes(session.id)?'is-favorite':''}" data-favorite-session="${escapeHtml(session.id)}" aria-label="${state.favoriteSessionIds?.includes(session.id)?'Retirer des favoris':'Ajouter aux favoris'}">${state.favoriteSessionIds?.includes(session.id)?'★ Favori':'☆ Favoris'}</button><button class="btn subtle" data-duplicate-session="${escapeHtml(session.id)}">Dupliquer</button>` : ''}${reviewAction}</div>
  </article>`;
}
