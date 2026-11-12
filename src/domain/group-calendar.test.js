import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTeachingDates, isTeachingDate, buildDaySeriesOverview } from './group-calendar.js';

test('cours enfants : mercredi et samedi, hors vacances Zone B', () => {
  const wednesdays = generateTeachingDates({ audience:'enfants', weekday:3 });
  const saturdays = generateTeachingDates({ audience:'enfants', weekday:6 });
  assert.equal(wednesdays.length,32);
  assert.equal(saturdays.length,28);
  assert.equal(wednesdays.includes('2026-11-11'),true); // jour férié autorisé aux enfants
  assert.equal(saturdays.includes('2027-05-08'),true);
  assert.equal(saturdays.includes('2027-04-24'),false); // vacances de printemps
});

test('cours adultes : lundi, mardi, jeudi et vendredi, hors vacances et jours fériés', () => {
  assert.equal(generateTeachingDates({ audience:'adultes', weekday:1 }).length,26);
  assert.equal(generateTeachingDates({ audience:'adultes', weekday:2 }).length,32);
  assert.equal(generateTeachingDates({ audience:'adultes', weekday:4 }).length,31);
  assert.equal(generateTeachingDates({ audience:'adultes', weekday:5 }).length,32);
  assert.equal(isTeachingDate('2027-05-06','adultes'),false); // Ascension
});

test('compteurs : annulés exclus, réalisés et prévus comptés séparément', () => {
  const rows = [
    { audience:'adultes', session_date:'2026-09-14', status:'completed' },
    { audience:'adultes', session_date:'2026-09-21', status:'scheduled' },
    { audience:'adultes', session_date:'2026-09-28', status:'cancelled' }
  ];
  const monday = buildDaySeriesOverview({ groupSessions:rows, now:'2026-09-22' })[0];
  assert.equal(monday.completed,1);
  assert.equal(monday.planned,0);
  assert.equal(monday.remaining,27);
  assert.equal(monday.catchUp,27);
});
