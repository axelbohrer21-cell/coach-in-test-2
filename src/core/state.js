export const state = {
  user: null,
  profile: null,
  players: [],
  sessions: [],
  evaluations: [],
  groupSessions: [],
  groupSeries: [],
  bookingRequests: [],
  library: [],
  notifications: [],
  criteria: [],
  evaluationCriteria: [],
  challenges: [],
  achievements: [],
  playerCoaches: [],
  coachInvitations: [],
  currentPage: 'dashboard',
  planningWeekOffset: 0,
  filters: { playerType: 'all', search: '', libraryCategory: 'all', librarySearch: '' }
};

export function resetState() {
  Object.assign(state, {
    user: null, profile: null, players: [], sessions: [], evaluations: [], groupSessions: [], groupSeries: [],
    bookingRequests: [], library: [], notifications: [], criteria: [], evaluationCriteria: [],
    challenges: [], achievements: [], playerCoaches: [], coachInvitations: [], currentPage: 'dashboard', planningWeekOffset: 0,
    filters: { playerType: 'all', search: '', libraryCategory: 'all', librarySearch: '' }
  });
}
