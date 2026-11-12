export const GROUP_SEASON = Object.freeze({
  start: '2026-09-14',
  end: '2027-06-20',
  zone: 'B',
  adultTarget: 28,
  childTarget: 30,
  weekdays: Object.freeze({ adultes: [1, 2, 4, 5], enfants: [3, 6] }),
  // Les horaires adultes sont à renseigner bloc par bloc depuis le planning source.
  // Les plages enfants sont celles confirmées : mercredi 9 h 30–18 h, samedi 9 h 30–14 h 30.
  availabilityWindows: Object.freeze({3:[['09:30','18:00']],6:[['09:30','14:30']]})
});

// Vacances scolaires Zone B 2026-2027 (dates inclusives).
export const ZONE_B_HOLIDAYS_2026_2027 = Object.freeze([
  { start: '2026-10-17', end: '2026-11-02', label: 'Toussaint' },
  { start: '2026-12-19', end: '2027-01-04', label: 'Noël' },
  { start: '2027-02-20', end: '2027-03-08', label: 'Hiver' },
  { start: '2027-04-17', end: '2027-05-03', label: 'Printemps' }
]);

// Jours fériés nationaux rencontrés pendant la saison.
export const PUBLIC_HOLIDAYS_2026_2027 = Object.freeze([
  '2026-11-01', '2026-11-11', '2026-12-25', '2027-01-01',
  '2027-04-05', '2027-05-01', '2027-05-06', '2027-05-08', '2027-05-17'
]);

const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
function parseISO(value) { const [y,m,d] = value.split('-').map(Number); return new Date(Date.UTC(y,m-1,d,12)); }
function isoUTC(date) { return date.toISOString().slice(0,10); }
function addDays(date, amount) { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate()+amount); return copy; }

export function isSchoolHoliday(dateISO, holidays = ZONE_B_HOLIDAYS_2026_2027) {
  return holidays.some(period => dateISO >= period.start && dateISO <= period.end);
}
export function isPublicHoliday(dateISO, holidays = PUBLIC_HOLIDAYS_2026_2027) {
  return holidays.includes(dateISO);
}
export function isTeachingDate(dateISO, audience, options = {}) {
  const { holidays = ZONE_B_HOLIDAYS_2026_2027, publicHolidays = PUBLIC_HOLIDAYS_2026_2027 } = options;
  const day = parseISO(dateISO).getUTCDay();
  const weekdays = GROUP_SEASON.weekdays[audience];
  if (!weekdays?.includes(day)) return false;
  if (isSchoolHoliday(dateISO, holidays)) return false;
  if (audience === 'adultes' && isPublicHoliday(dateISO, publicHolidays) && dateISO !== '2027-05-08') return false;
  return true;
}

export function generateTeachingDates({ start = GROUP_SEASON.start, end = GROUP_SEASON.end, audience, weekday, holidays, publicHolidays } = {}) {
  if (!['adultes','enfants'].includes(audience)) throw new TypeError('Audience invalide.');
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new RangeError('Jour de semaine invalide.');
  const allowed = GROUP_SEASON.weekdays[audience];
  if (!allowed.includes(weekday)) return [];
  const dates = [];
  for (let date = parseISO(start); isoUTC(date) <= end; date = addDays(date,1)) {
    const iso = isoUTC(date);
    if (parseISO(iso).getUTCDay() === weekday && isTeachingDate(iso,audience,{holidays,publicHolidays})) dates.push(iso);
  }
  return dates;
}

export function buildDaySeriesOverview({ groupSessions = [], now = '2026-09-14' } = {}) {
  const definitions = [
    { key:'adultes-lundi', audience:'adultes', weekday:1, target:GROUP_SEASON.adultTarget },
    { key:'adultes-mardi', audience:'adultes', weekday:2, target:GROUP_SEASON.adultTarget },
    { key:'adultes-jeudi', audience:'adultes', weekday:4, target:GROUP_SEASON.adultTarget },
    { key:'adultes-vendredi', audience:'adultes', weekday:5, target:GROUP_SEASON.adultTarget },
    { key:'enfants-mercredi', audience:'enfants', weekday:3, target:GROUP_SEASON.childTarget },
    { key:'enfants-samedi', audience:'enfants', weekday:6, target:GROUP_SEASON.childTarget }
  ];
  return definitions.map(def => {
    const eligibleDates = generateTeachingDates({ audience:def.audience, weekday:def.weekday });
    const sessions = groupSessions.filter(s => s.audience === def.audience && parseISO(s.session_date).getUTCDay() === def.weekday && s.status !== 'cancelled');
    const completed = sessions.filter(s => s.status === 'completed').length;
    const planned = sessions.filter(s => s.status === 'scheduled' && s.session_date >= now).length;
    const pastUnrecorded = sessions.filter(s => s.status === 'scheduled' && s.session_date < now).length;
    const remaining = Math.max(0, def.target - completed);
    const catchUp = Math.max(0, def.target - completed - planned);
    return {
      ...def,
      label: `${def.audience === 'adultes' ? 'Adultes' : 'Enfants'} · ${DAY_LABELS[def.weekday]}`,
      eligibleDates,
      availableDateCount: eligibleDates.length,
      availabilityGap: Math.max(0, def.target - eligibleDates.length),
      completed,
      planned,
      pastUnrecorded,
      remaining,
      catchUp,
      status: completed >= def.target ? 'target_reached' : eligibleDates.length < def.target ? 'availability_risk' : catchUp > 0 ? 'to_schedule' : 'on_track'
    };
  });
}

export function getWeekProgram(program, seasonStart = GROUP_SEASON.start) {
  const start = parseISO(seasonStart);
  return (program?.weeks || []).map((week,index) => {
    const monday = addDays(start,index*7);
    const sunday = addDays(monday,6);
    return { ...week, startDate:isoUTC(monday), endDate:isoUTC(sunday) };
  });
}
