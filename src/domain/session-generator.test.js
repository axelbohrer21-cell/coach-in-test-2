import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOriginalSession } from './session-generator.js';

test('construit une séance deuxième balle de service avec des contenus spécifiques', () => {
  for (const duration of [60, 90, 120]) {
    const session = generateOriginalSession({ theme: 'service', customObjective: '2eme balle de service', duration });
    assert.equal(session.focus, 'Deuxième balle de service');
    assert.equal(session.phases.reduce((sum, phase) => sum + phase.minutes, 0), duration);
    assert.match(session.exercise_1, /ENVOI DU COACH/i);
    assert.match(session.exercise_1 + session.exercise_2, /rotation/i);
    assert.match(session.exercise_1 + session.exercise_2, /deuxième balle/i);
    assert.match(session.exercise_1 + session.exercise_2, /Points · commencer chaque échange sur une deuxième balle/i);
  }
});

test('respecte exactement la structure demandée selon la durée', () => {
  const oneHour = generateOriginalSession({ theme: 'service', customObjective: '2e balle', duration: 60 });
  const ninety = generateOriginalSession({ theme: 'service', customObjective: '2e balle', duration: 90 });
  const twoHours = generateOriginalSession({ theme: 'service', customObjective: '2e balle', duration: 120 });
  assert.equal(oneHour.phases.length, 3);
  assert.equal(ninety.phases.length, 4);
  assert.equal(twoHours.phases.length, 5);
  assert.equal(ninety.phases.filter(x => x.name.startsWith('Gamme')).length, 2);
  assert.equal(twoHours.phases.filter(x => x.name.startsWith('Gamme')).length, 3);
  assert.equal(twoHours.coach_feed_count, 1);
});

test('propose des jeux réellement utilisables pour les points', () => {
  const session = generateOriginalSession({ theme: 'service', customObjective: '2eme balle de service', duration: 90 });
  const points = session.phases.at(-1).content;
  assert.match(points, /manches de 7 points/i);
  assert.match(points, /30-30/i);
  assert.match(points, /rotation des rôles/i);
});

test('adapte la difficulté et conserve les notes de progression', () => {
  const easy = generateOriginalSession({ customObjective: 'Varier les effets au service', difficulty: 'easy' });
  const hard = generateOriginalSession({ customObjective: 'Varier les effets au service', difficulty: 'hard' });
  assert.equal(easy.difficulty, 'Accessible');
  assert.equal(hard.difficulty, 'Exigeant');
  assert.match(hard.coaching_notes, /pression/i);
  const session = generateOriginalSession({ customObjective: 'Prise de balle tôt en revers', difficulty: 'auto', priorAdjustment: { hasHistory: true, difficulty: 'hard', label: 'Augmenter le défi', guidance: 'Réduire les zones et ajouter une décision.', successCriterion: 'Réussir 8 balles sur 10.' } });
  assert.equal(session.difficulty, 'Exigeant');
  assert.match(session.coaching_notes, /Augmenter le défi/);
  assert.match(session.coaching_notes, /Réussir 8 balles sur 10/);
});

test('chaque grande thématique propose envoi coach, gammes et points pour chaque durée', () => {
  for (const theme of ['service','return','volley','defense','construction','attaque','footwork','mental']) {
    for (const duration of [60,90,120]) {
      const session = generateOriginalSession({ theme, duration });
      assert.equal(session.phases.reduce((sum, phase) => sum + phase.minutes, 0), duration);
      assert.match(session.exercise_1 + session.exercise_2, /Envoi du coach/i);
      assert.match(session.exercise_1 + session.exercise_2, /Gamme 1/i);
      assert.match(session.exercise_1 + session.exercise_2, /Points ·/i);
    }
  }
});
