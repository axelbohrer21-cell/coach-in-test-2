export const PLANNING_AGENT_DURATIONS = Object.freeze([60, 90, 120]);

function isValidISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

/**
 * Valide une recherche de créneaux avant l'appel RPC.
 * La même autorisation est revérifiée côté PostgreSQL.
 */
export function validatePlanningAgentSearch({
  date,
  durationMinutes,
  coachId,
  role,
  userId,
  linkedCoachIds = [],
  today
} = {}) {
  if (!isValidISODate(date)) throw new Error('Choisis une date valide.');
  if (today && date < today) throw new Error('Choisis une date future.');
  if (!PLANNING_AGENT_DURATIONS.includes(Number(durationMinutes))) {
    throw new Error('Durée autorisée : 1 h, 1 h 30 ou 2 h.');
  }
  if (!coachId) throw new Error('Choisis un coach.');
  if (role === 'coach' && coachId !== userId) {
    throw new Error('Un coach ne peut consulter que son propre planning.');
  }
  if (role === 'player' && !linkedCoachIds.includes(coachId)) {
    throw new Error('Ce coach ne fait pas partie de tes entraîneurs.');
  }
  if (!['coach', 'player'].includes(role)) {
    throw new Error('Cette recherche est réservée aux coachs et aux joueurs.');
  }
  return {
    date,
    durationMinutes: Number(durationMinutes),
    coachId
  };
}
