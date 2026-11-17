import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendSessionExercises, buildMatchTransfer } from './session-recommendations.js';

const library = [
  { id:'a', category:'particulier', title:'Régularité revers', theme:'Technique', subtheme:'Revers', objective:'Stabiliser le revers croisé', instructions:'Tenir la diagonale' },
  { id:'b', category:'particulier', title:'Défense revers en déplacement', theme:'Défense', subtheme:'Revers', objective:'Jouer haut et long', instructions:'Se replacer après la frappe' },
  { id:'c', category:'collectif', title:'Revers collectif', theme:'Revers', instructions:'Atelier collectif' },
  { id:'d', category:'particulier', title:'Service ciblé', theme:'Service', instructions:'Zones de service' }
];

test('recommande deux exercices particuliers reliés au critère récurrent', () => {
  const evaluations = [{id:'e2',player_id:'p1',evaluated_at:'2026-11-10'},{id:'e1',player_id:'p1',evaluated_at:'2026-11-03'}];
  const evaluationCriteria = ['e2','e1'].map(evaluation_id => ({evaluation_id,criterion_id:'c1',criterion:'Régularité revers',main_theme:'Technique',subtheme:'Revers',criterion_type:'improvement'}));
  const result = recommendSessionExercises({playerId:'p1',evaluations,evaluationCriteria,library});
  assert.equal(result.priority.criterion,'Régularité revers');
  assert.equal(result.exerciseOne.id,'a');
  assert.equal(result.exerciseTwo.id,'b');
});

test('ne propose pas de contenu collectif dans un cours particulier', () => {
  const evaluations = [{id:'e2',player_id:'p1'},{id:'e1',player_id:'p1'}];
  const evaluationCriteria = ['e2','e1'].map(evaluation_id => ({evaluation_id,criterion:'Revers',criterion_type:'improvement'}));
  const result = recommendSessionExercises({playerId:'p1',evaluations,evaluationCriteria,library});
  assert.notEqual(result.exerciseOne?.category,'collectif');
});

test('retour match reprend le critère observé', () => {
  assert.match(buildMatchTransfer({criterion:'Prise de balle tôt'}),/Prise de balle tôt/);
});
