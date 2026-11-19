export const state = {
  user: null,
  profile: null,
  players: [],
  sessions: [],
  evaluations: [],
  groupSessions: [],
  groupSeries: [],
  groupCourseCancellations: [],
  bookingRequests: [],
  library: [],
  customSessionExercises: [],
  notifications: [],
  notificationPreferences: null,
  criteria: [],
  evaluationCriteria: [],
  challenges: [],
  achievements: [],
  playerCoaches: [],
  playerCoachHistory: [],
  coachInvitations: [],
  coachPlayerShares: [],
  adminCoaches: [],
  weeklyAvailability: [],
  weather: null,
  messages: [],
  videoAnalyses: [],
  videoCorrectionFollowups: [],
  playerProfileDetails: null,
  playerProfileDetailsById: {},
  matchJournal: [],
  clubEvents: [],
  messagePartnerId: '',
  currentPage: 'dashboard',
  planningWeekOffset: 0,
  filters: { playerType: 'all', search: '', libraryCategory: 'all', librarySearch: '' }
};

export function resetState() {
  Object.assign(state, {
    user: null, profile: null, players: [], sessions: [], evaluations: [], groupSessions: [], groupSeries: [], groupCourseCancellations: [],
    bookingRequests: [], library: [], customSessionExercises: [], notifications: [], notificationPreferences: null, criteria: [], evaluationCriteria: [],
    challenges: [], achievements: [], playerCoaches: [], playerCoachHistory: [], coachInvitations: [], coachPlayerShares: [], adminCoaches: [], weeklyAvailability: [], weather: null, messages: [], videoAnalyses: [], videoCorrectionFollowups: [], playerProfileDetails: null, playerProfileDetailsById: {}, matchJournal: [], clubEvents: [], messagePartnerId: '', currentPage: 'dashboard', planningWeekOffset: 0,
    filters: { playerType: 'all', search: '', libraryCategory: 'all', librarySearch: '' }
  });
}
