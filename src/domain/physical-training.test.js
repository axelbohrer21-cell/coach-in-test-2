import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHYSICAL_CRITERIA,
  physicalTemplates,
  physicalExercise,
  buildPhysicalProgram,
  buildTemplateSession,
  recommendPhysicalCycles
} from './physical-training.js';

test('la bibliothèque propose des critères physiques tennis distincts', () => {
  assert.ok(PHYSICAL_CRITERIA.length >= 25);
  assert.equal(new Set(PHYSICAL_CRITERIA.map(item => item.id)).size, PHYSICAL_CRITERIA.length);
});

test('chaque exercice référencé par un cycle existe dans la banque', () => {
  for (const cycle of physicalTemplates()) {
    for (const session of cycle.sessions) {
      for (const id of session.exercises) {
        assert.equal(physicalExercise(id).id, id, `${cycle.id} référence un exercice absent : ${id}`);
      }
    }
  }
});

test('les exercices disposent de consignes, de doses et de repères de progression', () => {
  for (const cycle of physicalTemplates()) {
    for (const session of cycle.sessions) {
      for (const id of session.exercises) {
        const exercise = physicalExercise(id);
        for (const field of ['setup','how','dose','cue','objective','tennisTransfer','progression','regression','quality']) {
          assert.ok(String(exercise[field] || '').trim().length > 0, `${id} : champ ${field} manquant`);
        }
      }
    }
  }
});

test('un choix de critères propose les cycles qui partagent ces critères', () => {
  const results = recommendPhysicalCycles(['first_step','acceleration']);
  assert.ok(results.length > 0);
  assert.equal(results[0].id, 'first-step-acceleration');
  assert.ok(results[0].matchCount >= 2);
});

test('le générateur construit trois ateliers ciblés et un cycle reste à 60 minutes', () => {
  const plan = buildPhysicalProgram({criteria:['first_step','deceleration','hip_groin'],groupSize:6,ageGroup:'15-17',level:'competition'});
  assert.equal(plan.blocks.length, 3);
  assert.equal(plan.duration, 60);
  assert.ok(plan.blocks.every(block => block.objective && block.tennisTransfer && block.quality));
  const cycle = physicalTemplates()[0];
  const session = buildTemplateSession(cycle.id,0,{groupSize:6,ageGroup:'11-14',level:'intermediaire'});
  assert.equal(session.duration,60);
  assert.equal(session.blocks.length,3);
});
