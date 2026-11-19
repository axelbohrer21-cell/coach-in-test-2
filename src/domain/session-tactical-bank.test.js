import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECTIVES, buildCurriculumActivities } from './session-curriculum.js';
import { TACTICAL_ACTIVITY_VARIANTS } from './session-tactical-bank.js';

test('chaque variante tactique est rattachée à un objectif existant',()=>{
  for(const [objectiveId,activities] of Object.entries(TACTICAL_ACTIVITY_VARIANTS)){
    assert.ok(OBJECTIVES.some(item=>item.id===objectiveId),`objectif absent: ${objectiveId}`);
    assert.ok(activities.length>=1);
    for(const activity of activities){
      assert.ok(activity.length===4||activity.length===5);
      for(const field of activity) assert.equal(typeof field,'string');
      assert.ok(activity.every(field=>field.trim().length>0));
    }
  }
});

test('les séances de 60, 90 et 120 minutes utilisent les variantes tactiques',()=>{
  const goal=OBJECTIVES.find(item=>item.id==='vol-approach');
  for(const duration of [60,90,120]){
    const activities=buildCurriculumActivities(goal,duration);
    assert.equal(activities.reduce((sum,item)=>sum+item.minutes,0),duration);
    assert.ok(activities.some(item=>item.name.includes('volée')));
    assert.ok(activities.every(item=>item.procedure&&item.setup&&item.scoring));
  }
});

test('les contenus reprennent les intentions tactiques du coach',()=>{
  const checks=[
    ['tac-dno','haut et long'],
    ['vol-approach','court croisé'],
    ['srv-second','slice'],
    ['rev-slice','cisailler'],
    ['cd-line','à plat']
  ];
  for(const [id,phrase] of checks){
    const goal=OBJECTIVES.find(item=>item.id===id);
    const text=buildCurriculumActivities(goal,120).map(item=>item.name+' '+item.procedure).join(' ').toLocaleLowerCase('fr');
    assert.ok(text.includes(phrase),`${id} doit contenir « ${phrase} »`);
  }
});
