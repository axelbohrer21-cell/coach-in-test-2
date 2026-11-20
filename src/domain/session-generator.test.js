import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOriginalSession } from './session-generator.js';
import groupProgram from '../data/group-course-program.json' with { type: 'json' };

test('utilise uniquement les consignes présentes dans le programme collectif', () => {
  for (const duration of [60, 90, 120]) {
    const session = generateOriginalSession({ theme: 'service', duration });
    assert.ok(session.source_week);
    assert.equal(session.phases.length, 3);
    assert.equal(session.phases.reduce((sum, phase) => sum + phase.minutes, 0), duration);
    const sourceWeek = groupProgram.weeks.find(week => week.week === session.source_week);
    assert.deepEqual(session.phases.map(phase => phase.content), sourceWeek.courts.filter(Boolean));
    assert.equal(session.source_file, "Cours de l’année.xlsx");
  }
});

test('garde les trois ateliers distincts et leur texte source', () => {
  const session = generateOriginalSession({ theme: 'volée', duration: 90 });
  assert.equal(session.phases.length, 3);
  assert.deepEqual(session.phases.map(phase => phase.name), ['Terrain 1', 'Terrain 2', 'Terrain 3']);
  for (const phase of session.phases) {
    assert.ok(phase.content.length > 0);
    assert.match(phase.content, /./);
  }
});

test('ne fabrique pas de contenu lorsqu’aucun atelier ne correspond au thème', () => {
  const session = generateOriginalSession({ theme: 'mental', duration: 60 });
  assert.equal(session.phases.length, 0);
  assert.equal(session.exercise_1, '');
  assert.equal(session.exercise_2, '');
  assert.match(session.player_visible_summary, /Aucun atelier correspondant/);
});

test('les semaines MATCH sans exercices ne sont jamais utilisées comme source', () => {
  const matchWeeks = groupProgram.weeks.filter(week => /MATCH/i.test(week.theme));
  assert.equal(matchWeeks.length, 6);
  assert.ok(matchWeeks.every(week => week.courts.every(content => !String(content).trim())));
  const session = generateOriginalSession({ theme: 'construction', duration: 90 });
  assert.ok(!matchWeeks.some(week => week.week === session.source_week));
});

test('conserve la durée demandée sans modifier le contenu pédagogique', () => {
  const short = generateOriginalSession({ theme: 'attaque', duration: 60 });
  const long = generateOriginalSession({ theme: 'attaque', duration: 120 });
  assert.equal(short.phases.reduce((sum, phase) => sum + phase.minutes, 0), 60);
  assert.equal(long.phases.reduce((sum, phase) => sum + phase.minutes, 0), 120);
  assert.deepEqual(short.phases.map(phase => phase.content), long.phases.map(phase => phase.content));
});
