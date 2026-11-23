import test from 'node:test';
import assert from 'node:assert/strict';
import { CANCELLED_GROUP_DATES, generateTeachingDates, isTeachingDate, buildDaySeriesOverview, buildHolidayStageOccurrences, GROUP_SEASON, getWeekProgram } from './group-calendar.js';

test('cours enfants : mercredi et samedi, hors vacances Zone B', () => {
  const wednesdays = generateTeachingDates({ audience:'enfants', weekday:3 });
  const saturdays = generateTeachingDates({ audience:'enfants', weekday:6 });
  assert.equal(wednesdays.length,32);
  assert.equal(saturdays.length,32);
  assert.equal(wednesdays.includes('2026-11-11'),true); // jour férié autorisé aux enfants
  assert.equal(saturdays.includes('2027-05-08'),true);
  assert.equal(saturdays.includes('2027-04-17'),true); // premier samedi des vacances de printemps
  assert.equal(saturdays.includes('2027-04-24'),false); // autres samedis des vacances exclus
  assert.equal(saturdays.includes('2026-10-17'),true); // premier samedi de la Toussaint
  assert.equal(saturdays.includes('2026-10-24'),false); // autres samedis des vacances exclus
});

test('cours adultes : lundi à vendredi selon le planning confirmé', () => {
  assert.equal(generateTeachingDates({ audience:'adultes', weekday:1 }).length,30);
  assert.equal(generateTeachingDates({ audience:'adultes', weekday:2 }).length,32);
  assert.equal(generateTeachingDates({ audience:'adultes', weekday:3 }).length,31);
  assert.equal(generateTeachingDates({ audience:'adultes', weekday:4 }).length,31);
  assert.equal(generateTeachingDates({ audience:'adultes', weekday:5 }).length,32);
  assert.equal(isTeachingDate('2027-05-06','adultes'),false); // Ascension
  assert.equal(isTeachingDate('2026-11-02','adultes'),true); // date affichée, pluie cochable manuellement
  assert.equal(isTeachingDate('2027-01-04','adultes'),true); // reprise après Noël
  assert.deepEqual(GROUP_SEASON.weeklySchedule.find(row=>row.key==='adultes-mercredi'), { key:'adultes-mercredi', audience:'adultes', weekday:3, start:'18:00', end:'21:00', courts:[1,2,3] });
  assert.deepEqual(GROUP_SEASON.weeklySchedule.find(row=>row.key==='enfants-mercredi').courts,[1,2,3]);
  assert.deepEqual(GROUP_SEASON.weeklySchedule.find(row=>row.key==='enfants-samedi').courts,[1,2,3]);
});

test('compteurs : les dates passées sont réalisées par défaut et les annulations sont exclues', () => {
  const rows = [
    { audience:'adultes', session_date:'2026-09-14', status:'completed' },
    { audience:'adultes', session_date:'2026-09-21', status:'scheduled' },
    { audience:'adultes', session_date:'2026-09-28', status:'cancelled' }
  ];
  const monday = buildDaySeriesOverview({ groupSessions:rows, now:'2026-09-22' })[0];
  assert.equal(monday.completed,2);
  assert.equal(monday.planned,0);
  assert.equal(monday.remaining,26);
  assert.equal(monday.pastUnrecorded,0);
});

test('compteurs à jour au 19 novembre : dates écoulées comptées par défaut, vacances exclues', () => {
  const rows = buildDaySeriesOverview({ now:'2026-11-19' });
  const counts = Object.fromEntries(rows.map(row=>[row.key,row.completed]));
  assert.deepEqual(counts,{
    'adultes-lundi':8,'adultes-mardi':8,'adultes-mercredi':7,'adultes-jeudi':7,'adultes-vendredi':7,
    'enfants-mercredi':8,'enfants-samedi':7
  });
});

test('toutes les dates ouvrées restent visibles et les jours de pluie sont cochables', () => {
  const mondays = generateTeachingDates({ audience:'adultes', weekday:1 });
  const thursdays = generateTeachingDates({ audience:'adultes', weekday:4 });
  assert.deepEqual(Object.keys(CANCELLED_GROUP_DATES), []);
  assert.equal(isTeachingDate('2026-11-02','adultes'), true);
  assert.equal(isTeachingDate('2026-11-09','adultes'), true);
  assert.equal(isTeachingDate('2026-11-12','adultes'), true);
  assert.equal(mondays.includes('2026-11-02'), true);
  assert.equal(mondays.includes('2026-11-09'), true);
  assert.equal(thursdays.includes('2026-11-12'), true);
});

test('les compteurs retirent uniquement les jours cochés manuellement comme pluie', () => {
  const overview = buildDaySeriesOverview({ now:'2026-11-17', manualCancellations:[{audience:'adultes',weekday:1,session_date:'2026-11-02'},{audience:'adultes',weekday:4,session_date:'2026-11-12'}] });
  const monday = overview.find(row => row.key === 'adultes-lundi');
  const thursday = overview.find(row => row.key === 'adultes-jeudi');
  assert.equal(monday.eligibleDates.includes('2026-11-02'), true);
  assert.equal(monday.eligibleDates.includes('2026-11-09'), true);
  assert.equal(thursday.eligibleDates.includes('2026-11-12'), true);
  assert.equal(monday.expectedByNow, monday.completed);
  assert.equal(thursday.expectedByNow, thursday.completed);
});

test('stages vacances : du lundi au vendredi, 9 h 30–16 h 30 sur les terrains 1, 2 et 3', () => {
  const stages = buildHolidayStageOccurrences({ startDate:'2026-10-19', endDate:'2026-10-24' });
  assert.equal(stages.length,5);
  assert.deepEqual(stages.map(row=>row.session_date),[
    '2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'
  ]);
  for (const row of stages) {
    assert.equal(row.start_time,'09:30');
    assert.equal(row.end_time,'16:30');
    assert.deepEqual(row.courts,[1,2,3]);
    assert.equal(row.audience,'enfants');
  }
});

test('stages vacances : aucune occurrence le week-end ni hors vacances', () => {
  assert.equal(buildHolidayStageOccurrences({startDate:'2026-10-24',endDate:'2026-10-25'}).length,0);
  assert.equal(buildHolidayStageOccurrences({startDate:'2026-11-03',endDate:'2026-11-06'}).length,0);
});


test('programme pédagogique : les semaines de vacances sont sautées après les semaines MATCH', () => {
  const program = { weeks:Array.from({length:30},(_,index)=>({week:index+1,theme:index===4?'MATCH':`Semaine ${index+1}`,courts:[]})) };
  const weeks = getWeekProgram(program);
  assert.equal(weeks[4].startDate,'2026-10-12');
  assert.equal(weeks[5].startDate,'2026-11-02');
  assert.equal(weeks[11].startDate,'2026-12-14');
  assert.equal(weeks[12].startDate,'2027-01-04');
  assert.equal(weeks[18].startDate,'2027-02-15');
  assert.equal(weeks[19].startDate,'2027-03-08');
  assert.equal(weeks[24].startDate,'2027-04-12');
  assert.equal(weeks[25].startDate,'2027-05-03');
  assert.equal(weeks[29].startDate,'2027-05-31');
});
