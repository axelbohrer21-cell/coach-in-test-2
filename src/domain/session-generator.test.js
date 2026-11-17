import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOriginalSession } from './session-generator.js';

test('comprend un objectif libre précis sur le revers', () => {
  const session = generateOriginalSession({
    customObjective: 'Prise de balle tôt en revers',
    theme: 'Construction du point',
    difficulty: 'progressive',
    duration: 90
  });
  assert.equal(session.focus, 'Prise de balle tôt en revers');
  assert.match(session.exercise_1, /prendre le contact devant le corps/i);
  assert.match(session.success_criteria, /au moins 6 fois/i);
});

test('adapte la difficulté sans dépendre de la bibliothèque personnelle', () => {
  const easy = generateOriginalSession({ customObjective: 'Varier les effets au service', difficulty: 'easy' });
  const hard = generateOriginalSession({ customObjective: 'Varier les effets au service', difficulty: 'hard' });
  assert.equal(easy.difficulty, 'Accessible');
  assert.equal(hard.difficulty, 'Exigeant');
  assert.match(hard.exercise_2, /pression/i);
  assert.match(easy.coaching_notes, /élargir les cibles/i);
});

test('génère une séance complète dont les phases respectent la durée', () => {
  for (const duration of [60, 90, 120]) {
    const session = generateOriginalSession({ theme: 'service', duration });
    assert.equal(session.phases.reduce((sum, phase) => sum + phase.minutes, 0), duration);
    assert.ok(session.exercise_1.length > 100);
    assert.ok(session.exercise_2.includes('TRANSFERT MATCH'));
  }
});
