import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendSessionExercises, buildMatchTransfer, buildSessionCoachingPlan } from './session-recommendations.js';

const library = [
  { id:'a', category:'particulier', title:'Régularité revers', theme:'Technique', subtheme:'Revers', objective:'Stabiliser le revers croisé', instructions:'Tenir la diagonale' },
  { id:'b', category:'particulier', title:'Défense revers en déplacement', theme:'Défense', subtheme:'Revers', objective:'Jouer haut et long', instructions:'Se replacer après la frappe' },
  { id:'c', category:'collectif', title:'Revers collectif', theme:'Revers', instructions:'Atelier collectif' },
  { id:'d', category:'particulier', title:'Service ciblé', theme:'Service', instructions:'Zones de service' }
];
const evaluations = [{id:'e2',player_id:'p1',evaluated_at:'2026-11-10'},{id:'e1',player_id:'p1',evaluated_at:'2026-11-03'}];
const evaluationCriteria = ['e2','e1'].map(evaluation_id => ({evaluation_id,player_id:'p1',criterion_id:'c1',criterion:'Régularité revers',main_theme:'Technique',subtheme:'Revers',criterion_type:'improvement'}));

test('recommande deux exercices particuliers reliés au critère récurrent', () => {
  const result = recommendSessionExercises({playerId:'p1',evaluations,evaluationCriteria,library});
  assert.equal(result.priority.criterion,'Régularité revers');
  assert.equal(result.exerciseOne.id,'a');
  assert.equal(result.exerciseTwo.id,'b');
});
test('ne propose pas de contenu collectif dans un cours particulier', () => {
  const result = recommendSessionExercises({playerId:'p1',evaluations,evaluationCriteria,library});
  assert.notEqual(result.exerciseOne?.category,'collectif');
});
test('évite de répéter les deux derniers exercices lorsqu’une alternative pertinente existe', () => {
  const sessions = [{player_id:'p1',session_date:'2026-11-12',exercise_1:'Régularité revers',exercise_2:''}];
  const result = recommendSessionExercises({playerId:'p1',evaluations,evaluationCriteria,library,sessions});
  assert.equal(result.exerciseOne.id,'b');
  assert.equal(result.varietyApplied,true);
});
test('intègre un défi actif et une observation vidéo concordante sans les rendre obligatoires', () => {
  const challenges=[{player_id:'p1',status:'active',objective:'Réussir le revers en défense'}];
  const videoAnalyses=[{player_id:'p1',created_at:'2026-11-14',coach_summary:'revers défense'}];
  const result=recommendSessionExercises({playerId:'p1',evaluations,evaluationCriteria,library,challenges,videoAnalyses});
  assert.equal(result.activeChallenge.objective,challenges[0].objective);
  assert.equal(typeof result.videoSignalUsed,'boolean');
});
test('produit un objectif, une consigne, une contrainte et un indicateur mesurable', () => {
  const recommendation=recommendSessionExercises({playerId:'p1',evaluations,evaluationCriteria,library});
  const plan=buildSessionCoachingPlan(recommendation,90);
  assert.match(plan.objective,/Régularité revers/);
  assert.match(plan.success,/6 réalisations/);
  assert.ok(plan.cue && plan.constraint);
});
test('retour match reprend le critère observé', () => {
  assert.match(buildMatchTransfer({criterion:'Prise de balle tôt'}),/Prise de balle tôt/);
});
