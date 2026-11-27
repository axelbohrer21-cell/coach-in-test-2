export const COACH_B_GROUP_BLOCKS = Object.freeze([
  { key:'lundi-soir', audience:'adultes', weekday:1, start:'18:00', end:'21:00', courtCount:3 },
  { key:'mardi-midi', audience:'adultes', weekday:2, start:'12:15', end:'13:45', courtCount:2 },
  { key:'mardi-soir-1', audience:'adultes', weekday:2, start:'17:30', end:'19:00', courtCount:2 },
  { key:'mardi-soir-2', audience:'adultes', weekday:2, start:'19:00', end:'20:30', courtCount:3 },
  { key:'mercredi-enfants', audience:'enfants', weekday:3, start:'09:30', end:'18:00', courtCount:3 },
  { key:'mercredi-adultes', audience:'adultes', weekday:3, start:'18:00', end:'19:30', courtCount:3 },
  { key:'jeudi-soir', audience:'adultes', weekday:4, start:'18:00', end:'19:30', courtCount:1 },
  { key:'samedi-matin', audience:'enfants', weekday:6, start:'09:30', end:'13:30', courtCount:3 }
]);

export const GROUP_SEASON = Object.freeze({
  start: '2026-09-14',
  end: '2027-06-20',
  zone: 'B',
  adultTarget: 28,
  childTarget: 30,
  weekdays: Object.freeze({ adultes: [1, 2, 3, 4, 5], enfants: [3, 6] }),
  // Planning collectif hebdomadaire confirmé par le coach.
  weeklySchedule: Object.freeze([
    { key:'adultes-lundi', audience:'adultes', weekday:1, start:'17:00', end:'21:00', courtCount:2 },
    { key:'adultes-mardi', audience:'adultes', weekday:2, start:'17:30', end:'20:30', courtCount:3 },
    { key:'enfants-mercredi', audience:'enfants', weekday:3, start:'09:30', end:'18:00', courtCount:3 },
    { key:'adultes-mercredi', audience:'adultes', weekday:3, start:'18:00', end:'21:00', courtCount:3 },
    { key:'adultes-jeudi', audience:'adultes', weekday:4, start:'17:30', end:'19:00', courtCount:2 },
    { key:'adultes-vendredi', audience:'adultes', weekday:5, start:'17:30', end:'20:00', courtCount:2 },
    { key:'enfants-samedi', audience:'enfants', weekday:6, start:'09:30', end:'14:30', courtCount:3 }
  ]),
  holidayStage: Object.freeze({ start:'09:30', end:'16:30', courtCount:3, weekdays:[1,2,3,4,5] }),
  // Fenêtres historiques utilisées par le contrôle des demandes de cours particuliers.
  availabilityWindows: Object.freeze({3:[['09:30','18:00']],6:[['09:30','14:30']]})
});

// Vacances scolaires Zone B 2026-2027 : fin la veille de la reprise officielle.
export const ZONE_B_HOLIDAYS_2026_2027 = Object.freeze([
  { start: '2026-10-17', end: '2026-11-01', label: 'Toussaint' },
  { start: '2026-12-19', end: '2027-01-03', label: 'Noël' },
  { start: '2027-02-20', end: '2027-03-07', label: 'Hiver' },
  { start: '2027-04-17', end: '2027-05-02', label: 'Printemps' }
]);

// Samedis spéciaux de début de vacances demandés pour les cours enfants.
export const SPECIAL_VACATION_SATURDAYS = Object.freeze(['2026-10-17','2026-12-19','2027-02-20','2027-04-17']);

// Jours fériés nationaux rencontrés pendant la saison.
export const PUBLIC_HOLIDAYS_2026_2027 = Object.freeze([
  '2026-11-01', '2026-11-11', '2026-12-25', '2027-01-01',
  '2027-04-05', '2027-05-01', '2027-05-06', '2027-05-08', '2027-05-17'
]);

// Les jours de pluie sont désormais gérés manuellement dans le calendrier annuel.
export const CANCELLED_GROUP_DATES = Object.freeze({});

const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
function parseISO(value) { const [y,m,d] = value.split('-').map(Number); return new Date(Date.UTC(y,m-1,d,12)); }
function isoUTC(date) { return date.toISOString().slice(0,10); }
function addDays(date, amount) { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate()+amount); return copy; }
function firstSaturdayOfHoliday(period) {
  for (let date = parseISO(period.start); isoUTC(date) <= period.end; date = addDays(date, 1)) {
    if (date.getUTCDay() === 6) return isoUTC(date);
  }
  return null;
}

export function isSchoolHoliday(dateISO, holidays = ZONE_B_HOLIDAYS_2026_2027) {
  return holidays.some(period => dateISO >= period.start && dateISO <= period.end);
}
export function isPublicHoliday(dateISO, holidays = PUBLIC_HOLIDAYS_2026_2027) {
  return holidays.includes(dateISO);
}

export function isPrivateLessonDateAllowed(dateISO, options = {}) {
  const { holidays = ZONE_B_HOLIDAYS_2026_2027, publicHolidays = PUBLIC_HOLIDAYS_2026_2027 } = options;
  return parseISO(dateISO).getUTCDay() !== 0 && !isSchoolHoliday(dateISO, holidays) && (!isPublicHoliday(dateISO, publicHolidays) || dateISO === '2027-05-08');
}
export function isWithinTeachingWindow(dateISO, startTime, endTime, audience = 'enfants') {
  const day = parseISO(dateISO).getUTCDay();
  const windows = audience === 'adultes'
    ? GROUP_SEASON.weeklySchedule.filter(row => row.audience === 'adultes' && row.weekday === day).map(row => [row.start, row.end])
    : GROUP_SEASON.availabilityWindows[day];
  if (!windows?.length) return false;
  return windows.some(([start, end]) => startTime >= start && endTime <= end && endTime > startTime);
}

export function isTeachingDate(dateISO, audience, options = {}) {
  const { holidays = ZONE_B_HOLIDAYS_2026_2027, publicHolidays = PUBLIC_HOLIDAYS_2026_2027 } = options;
  const day = parseISO(dateISO).getUTCDay();
  const weekdays = GROUP_SEASON.weekdays[audience];
  if (!weekdays?.includes(day)) return false;
  // Le premier samedi de chaque période de vacances reste un cours collectif enfants.
  const firstHolidaySaturday = audience === 'enfants' && day === 6
    && holidays.some(period => firstSaturdayOfHoliday(period) === dateISO);
  if (isSchoolHoliday(dateISO, holidays) && !firstHolidaySaturday) return false;
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


/**
 * Construit les occurrences visuelles des stages enfants pendant les vacances Zone B.
 * Ces occurrences sont calculées à l'affichage et ne créent pas de lignes en base.
 */
export function buildHolidayStageOccurrences({ holidays = ZONE_B_HOLIDAYS_2026_2027, startDate, endDate } = {}) {
  const stage = GROUP_SEASON.holidayStage;
  const occurrences = [];
  for (const period of holidays) {
    const firstDay = startDate && startDate > period.start ? startDate : period.start;
    const lastDay = endDate && endDate < period.end ? endDate : period.end;
    if (firstDay > lastDay) continue;
    for (let date = parseISO(firstDay); isoUTC(date) <= lastDay; date = addDays(date, 1)) {
      const dateISO = isoUTC(date);
      const weekday = date.getUTCDay();
      if (!stage.weekdays.includes(weekday)) continue;
      occurrences.push({
        id: `holiday-stage-${dateISO}`,
        session_date: dateISO,
        weekday,
        audience: 'enfants',
        title: `Stage enfants · ${period.label}`,
        start_time: stage.start,
        end_time: stage.end,
        court_count: stage.courtCount,
        status: 'scheduled'
      });
    }
  }
  return occurrences;
}

export function buildDaySeriesOverview({ groupSessions = [], manualCancellations = [], now = '2026-09-14', coachId = null } = {}) {
  const sourceSessions = coachId
    ? groupSessions.filter(row => row.coach_id === coachId)
    : groupSessions;
  const legacyDefinitions = [
    { key:'adultes-lundi', audience:'adultes', weekday:1, target:GROUP_SEASON.adultTarget },
    { key:'adultes-mardi', audience:'adultes', weekday:2, target:GROUP_SEASON.adultTarget },
    { key:'adultes-mercredi', audience:'adultes', weekday:3, target:GROUP_SEASON.adultTarget },
    { key:'adultes-jeudi', audience:'adultes', weekday:4, target:GROUP_SEASON.adultTarget },
    { key:'adultes-vendredi', audience:'adultes', weekday:5, target:GROUP_SEASON.adultTarget },
    { key:'enfants-mercredi', audience:'enfants', weekday:3, target:GROUP_SEASON.childTarget },
    { key:'enfants-samedi', audience:'enfants', weekday:6, target:GROUP_SEASON.childTarget }
  ];
  const discovered = new Map();
  for (const session of sourceSessions) {
    // Les stages de vacances occupent le planning mais ne constituent pas une série hebdomadaire.
    if (String(session.title || '').toLowerCase().includes('stage')) continue;
    if (!['adultes','enfants'].includes(session.audience) || !session.session_date) continue;
    const weekday = parseISO(session.session_date).getUTCDay();
    if (!GROUP_SEASON.weekdays[session.audience]?.includes(weekday)) continue;
    const start = String(session.start_time || '00:00').slice(0,5);
    const end = String(session.end_time || '23:59').slice(0,5);
    if (end <= start) continue;
    const key = [session.audience, weekday, start, end].join('-');
    if (!discovered.has(key)) {
      discovered.set(key, {
        key,
        audience: session.audience,
        weekday,
        start_time: start,
        end_time: end,
        target: session.audience === 'adultes' ? GROUP_SEASON.adultTarget : GROUP_SEASON.childTarget
      });
    }
  }
  // Sans occurrences en base, conserver la vue générale historique (utile à l'initialisation).
  const definitions = discovered.size
    ? [...discovered.values()].sort((a,b) => a.weekday-b.weekday || a.start_time.localeCompare(b.start_time) || a.audience.localeCompare(b.audience))
    : legacyDefinitions;
  return definitions.map(def => {
    const matchingSessions = sourceSessions.filter(session =>
      !String(session.title || '').toLowerCase().includes('stage') &&
      session.audience === def.audience &&
      parseISO(session.session_date).getUTCDay() === def.weekday &&
      (!def.start_time || String(session.start_time || '00:00').slice(0,5) === def.start_time) &&
      (!def.end_time || String(session.end_time || '23:59').slice(0,5) === def.end_time)
    );
    const eligibleDates = generateTeachingDates({ audience:def.audience, weekday:def.weekday });
    const statusesByDate = new Map();
    for (const session of matchingSessions) {
      if (!statusesByDate.has(session.session_date)) statusesByDate.set(session.session_date, []);
      statusesByDate.get(session.session_date).push(String(session.status || '').toLowerCase());
    }
    const fullyCancelledDates = [...statusesByDate.entries()]
      .filter(([, statuses]) => statuses.length > 0 && statuses.every(status => status === 'cancelled'))
      .map(([date]) => date);
    const cancelledDates = new Set([
      ...fullyCancelledDates,
      ...manualCancellations.filter(row => row.audience === def.audience && Number(row.weekday) === def.weekday).map(row => row.session_date)
    ]);
    // Les dates passées comptent par défaut ; une date n'est comptée qu'une fois,
    // même lorsque plusieurs terrains sont enregistrés pour le même créneau.
    const pastDates = eligibleDates.filter(date => date < now);
    const completed = pastDates.filter(date => !cancelledDates.has(date)).length;
    const plannedDates = new Set(matchingSessions
      .filter(session => session.status === 'scheduled' && session.session_date >= now)
      .map(session => session.session_date));
    const planned = plannedDates.size;
    const pastUnrecorded = 0;
    const remaining = Math.max(0, def.target - completed);
    const catchUp = Math.max(0, def.target - completed - planned);
    const expectedByNow = Math.min(def.target, completed);
    const paceGap = Math.max(0, expectedByNow - completed);
    const timeLabel = def.start_time ? ` · ${def.start_time}–${def.end_time}` : '';
    return {
      ...def,
      label: `${def.audience === 'adultes' ? 'Adultes' : 'Enfants'} · ${DAY_LABELS[def.weekday]}${timeLabel}`,
      eligibleDates,
      availableDateCount: eligibleDates.length,
      availabilityGap: Math.max(0, def.target - eligibleDates.length),
      completed,
      planned,
      cancelled: cancelledDates.size,
      pastUnrecorded,
      expectedByNow,
      paceGap,
      remaining,
      catchUp,
      status: completed >= def.target ? 'target_reached' : eligibleDates.length < def.target ? 'availability_risk' : paceGap > 0 ? 'behind_schedule' : catchUp > 0 ? 'to_schedule' : 'on_track'
    };
  });
}
export function getWeekProgram(program, seasonStart = GROUP_SEASON.start, seasonEnd = GROUP_SEASON.end) {
  const teachingWeeks = [];
  const start = parseISO(seasonStart);
  for (let monday = start; isoUTC(monday) <= seasonEnd; monday = addDays(monday, 7)) {
    const hasCollectiveCourses = Array.from({length:6}, (_,index) => addDays(monday,index))
      .some(date => !isSchoolHoliday(isoUTC(date)) && date.getUTCDay() !== 0);
    if (hasCollectiveCourses) teachingWeeks.push(monday);
  }
  return (program?.weeks || []).map((week,index) => {
    const monday = teachingWeeks[index];
    if (!monday) return { ...week, startDate:null, endDate:null };
    const sunday = addDays(monday,6);
    return { ...week, startDate:isoUTC(monday), endDate:isoUTC(sunday) };
  });
}
