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
  const detail = `${escapeHtml(session.theme || 'Séance')} · ${Number(session.duration_minutes || 60)} min${!isCoach && coachName ? ` · Coach : ${escapeHtml(coachName)}` : ''}`;
  const reviewAction = isCoach ? `<button class="btn subtle" data-review-session="${escapeHtml(session.id)}">${session.progress_review ? 'Actualiser le bilan' : 'Bilan de séance'}</button>` : '';
  const reviewTag = isCoach && session.progress_review ? '<span class="tag tag-green">Résultat saisi</span>' : '';
  return `<article class="list-card"><div class="list-date"><strong>${formatDate(session.session_date, { day: '2-digit', month: 'short' })}</strong><small>${formatTime(session.session_time)}</small></div><div class="list-main"><strong>${escapeHtml(name)}</strong><span>${detail}</span></div><span class="tag">${escapeHtml(status)}</span>${reviewTag}${reviewAction}</article>`;
}
