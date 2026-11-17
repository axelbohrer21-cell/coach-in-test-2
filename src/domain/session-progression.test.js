import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionProgression } from './session-progression.js';

const session = review => ({ id: 's1', player_id: 'p1', session_date: '2026-11-10', theme: 'Revers', progress_review: { reviewed_at: '2026-11-10T18:00:00Z', objective: 'Prise de balle tôt en revers', ...review } });

test('augmente la difficulté après une réussite élevée', () => {
  const result = buildSessionProgression([session({ attempts: 10, successes: 8, coach_rating: 7 })], 'p1');
  assert.equal(result.direction, 'increase');
  assert.equal(result.difficulty, 'hard');
  assert.equal(result.successCriterion, '8 sur 10');
});

test('simplifie la contrainte après une réussite faible', () => {
  const result = buildSessionProgression([session({ attempts: 10, successes: 3, coach_rating: 5 })], 'p1');
  assert.equal(result.direction, 'decrease');
  assert.equal(result.difficulty, 'easy');
});

test('conserve la difficulté si les résultats sont intermédiaires', () => {
  const result = buildSessionProgression([session({ attempts: 10, successes: 6, coach_rating: 6 })], 'p1');
  assert.equal(result.direction, 'maintain');
  assert.equal(result.difficulty, 'progressive');
});

test('n’utilise pas les données d’un autre joueur et demande un repère initial', () => {
  const result = buildSessionProgression([session({ attempts: 10, successes: 10 })], 'p2');
  assert.equal(result.hasHistory, false);
  assert.equal(result.direction, 'baseline');
});
