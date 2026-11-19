import { GROUP_SEASON, generateTeachingDates, isWithinTeachingWindow } from './group-calendar.js';

export function buildSeriesCounters(series, sessions, today = new Date().toISOString().slice(0,10), manualCancellations = []) {
  return series.map(item => {
    const rows = sessions.filter(row => row.series_id === item.id);
    const target = Number(item.target_sessions || (item.audience === 'adultes' ? GROUP_SEASON.adultTarget : GROUP_SEASON.childTarget));
    const eligibleDates = generateTeachingDates({ start: item.season_start || GROUP_SEASON.start, end: item.season_end || GROUP_SEASON.end, audience: item.audience, weekday: Number(item.weekday) });
    const cancelledDates = new Set([
      ...rows.filter(row => row.status === 'cancelled' && row.session_date).map(row => row.session_date),
      ...manualCancellations.filter(row => row.audience === item.audience && Number(row.weekday) === Number(item.weekday)).map(row => row.session_date)
    ]);
    // Une date passée compte comme effectuée par défaut ; seules les annulations enregistrées sont déduites.
    const completed = eligibleDates.filter(date => date < today && !cancelledDates.has(date)).length;
    const planned = rows.filter(row => row.status === 'scheduled' && row.session_date >= today).length;
    const cancelled = cancelledDates.size;
    const pastUnrecorded = 0;
    const expectedByNow = Math.min(target, completed);
    const paceGap = Math.max(0, expectedByNow - completed);
    return { ...item, completed, planned, pastUnrecorded, cancelled, target, eligibleDates, expectedByNow, paceGap, remaining: Math.max(0,target-completed), toSchedule: Math.max(0,target-completed-planned), reached: completed >= target };
  });
}

export function buildSeriesOccurrences(series, { start = GROUP_SEASON.start, end = GROUP_SEASON.end } = {}) {
  if (!series?.id || !series?.audience || !Number.isInteger(Number(series.weekday))) throw new TypeError('Créneau annuel incomplet.');
  if (!['adultes', 'enfants'].includes(series.audience)) throw new TypeError('Public du créneau invalide.');
  if (!GROUP_SEASON.weekdays[series.audience].includes(Number(series.weekday))) throw new TypeError('Jour incompatible avec le public du créneau.');
  if (!series.start_time || !series.end_time || series.end_time <= series.start_time) throw new TypeError('Horaires du créneau invalides.');
  if (!Number.isInteger(Number(series.court_number)) || Number(series.court_number) < 1 || Number(series.court_number) > 4) throw new TypeError('Court invalide.');
  const dates = generateTeachingDates({ start: series.season_start || start, end: series.season_end || end, audience: series.audience, weekday: Number(series.weekday) });
  if (dates.some(date => !isWithinTeachingWindow(date, series.start_time, series.end_time, series.audience))) throw new RangeError(series.audience === 'adultes' ? 'Les cours adultes doivent respecter les horaires du planning collectif confirmé.' : 'Les cours enfants doivent respecter les horaires du mercredi (9 h 30–18 h) ou du samedi (9 h 30–14 h 30).');
  return dates.map(session_date => ({
    coach_id: series.coach_id, series_id: series.id, title: series.title,
    theme: series.theme || '', session_date, start_time: series.start_time,
    end_time: series.end_time, court_number: Number(series.court_number),
    audience: series.audience, status: 'scheduled'
  }));
}
