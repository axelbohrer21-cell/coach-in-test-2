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

import { generateOriginalSession } from './session-generator.js';
test('crée une séance originale sans bibliothèque',()=>{const p=generateOriginalSession({theme:'service',playerName:'Alex',level:'Intermédiaire',duration:90});assert.equal(p.generation_mode,'original');assert.equal(p.theme,'Service');assert.match(p.exercise_1,/lancer/i);assert.match(p.exercise_2,/première frappe/i);assert.equal(p.phases.reduce((n,x)=>n+x.minutes,0),90);});
test('intègre priorité, défi et historique',()=>{const p=generateOriginalSession({theme:'defense',priority:{criterion:'Défense revers'},challenge:{objective:'Jouer haut et long'},recentSessions:[{theme:'Défense'}],duration:60});assert.match(p.coaching_notes,/Défense revers/);assert.match(p.coaching_notes,/Jouer haut et long/);assert.match(p.coaching_notes,/séances récentes/);assert.equal(p.phases.reduce((n,x)=>n+x.minutes,0),60);});
test('adapte la charge aux jeunes débutants',()=>{const p=generateOriginalSession({theme:'construction',age:10,level:'Débutant'});assert.equal(p.adaptation,'Progression accessible');assert.match(p.coaching_notes,/Séries de 4 à 6 balles/);});
