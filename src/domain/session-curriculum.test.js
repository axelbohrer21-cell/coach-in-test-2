import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECTIVES, buildCurriculumActivities } from './session-curriculum.js';

test('les nouveaux objectifs smash, déplacement et match sont disponibles',()=>{
  for(const id of ['smash-control','move-direction','match-pattern']) assert.ok(OBJECTIVES.some(goal=>goal.id===id));
});

test('les séances tactiques respectent les durées de 60, 90 et 120 minutes',()=>{
  const goal=OBJECTIVES.find(item=>item.id==='match-pattern');
  for(const duration of [60,90,120]){
    const activities=buildCurriculumActivities(goal,duration);
    assert.equal(activities.reduce((sum,item)=>sum+item.minutes,0),duration);
    assert.ok(activities.every(item=>item.name&&item.setup&&item.procedure&&item.scoring));
  }
});

test('un exercice personnel lié à un objectif est injecté avec ses champs distincts',()=>{
  const goal=OBJECTIVES.find(item=>item.id==='match-pattern');
  const custom=[{id:'x',objective_id:goal.id,theme:goal.theme,title:'Mon scénario personnalisé',setup:'Deux joueurs, score 30-30.',instructions:'Jouer croisé long puis attaquer seulement sur balle courte.',success_criteria:'8 décisions adaptées sur 10.',coaching_cue:'La décision prime sur le résultat.',active:true}];
  const activities=buildCurriculumActivities(goal,90,custom);
  assert.equal(activities[1].name,'Mon scénario personnalisé');
  assert.equal(activities[1].setup,'Deux joueurs, score 30-30.');
  assert.equal(activities[1].procedure,'Jouer croisé long puis attaquer seulement sur balle courte.');
  assert.equal(activities[1].scoring,'8 décisions adaptées sur 10.');
  assert.equal(activities[1].coachCue,'La décision prime sur le résultat.');
});

test('le smash possède des situations spécifiques de lecture, placement et replacement',()=>{
  const goal=OBJECTIVES.find(item=>item.id==='smash-control');
  const text=buildCurriculumActivities(goal,120).map(item=>[item.name,item.setup,item.procedure,item.scoring].join(' ')).join(' ').toLocaleLowerCase('fr');
  assert.match(text,/lob/);
  assert.match(text,/pas croisés/);
  assert.match(text,/zone libre/);
});
