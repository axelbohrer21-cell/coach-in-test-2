import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlanningAgentSearch } from './planning-agent.js';

const base = {
  date: '2026-11-26',
  durationMinutes: 60,
  coachId: 'coach-a',
  role: 'player',
  userId: 'player-a',
  linkedCoachIds: ['coach-a', 'coach-b'],
  today: '2026-11-25'
};

test('accepts a player search for a coach linked to the player', () => {
  assert.deepEqual(validatePlanningAgentSearch(base), {
    date: '2026-11-26',
    durationMinutes: 60,
    coachId: 'coach-a'
  });
});

test('accepts a coach search only for the connected coach', () => {
  assert.equal(validatePlanningAgentSearch({
    ...base,
    role: 'coach',
    userId: 'coach-a',
    linkedCoachIds: []
  }).coachId, 'coach-a');
});

test('rejects an unlinked coach for a player', () => {
  assert.throws(() => validatePlanningAgentSearch({
    ...base,
    coachId: 'coach-c'
  }), /ne fait pas partie/);
});

test('rejects a coach trying to inspect another coach', () => {
  assert.throws(() => validatePlanningAgentSearch({
    ...base,
    role: 'coach',
    userId: 'coach-a',
    coachId: 'coach-b'
  }), /son propre planning/);
});

test('rejects invalid calendar dates and past dates', () => {
  assert.throws(() => validatePlanningAgentSearch({ ...base, date: '2026-02-30' }), /date valide/);
  assert.throws(() => validatePlanningAgentSearch({ ...base, date: '2026-11-24' }), /date future/);
});

test('accepts only the existing private lesson durations', () => {
  for (const durationMinutes of [60, 90, 120]) {
    assert.equal(validatePlanningAgentSearch({ ...base, durationMinutes }).durationMinutes, durationMinutes);
  }
  assert.throws(() => validatePlanningAgentSearch({ ...base, durationMinutes: 45 }), /Durée autorisée/);
});

test('rejects unsupported roles and missing coaches', () => {
  assert.throws(() => validatePlanningAgentSearch({ ...base, role: 'admin' }), /réservée/);
  assert.throws(() => validatePlanningAgentSearch({ ...base, coachId: '' }), /Choisis un coach/);
});
