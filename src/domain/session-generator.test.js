import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOriginalSession } from './session-generator.js';
import groupProgram from '../data/group-course-program.json' with { type: 'json' };

test('crée trois situations distinctes et structurées à partir du critère observé', () => {
  const session = generateOriginalSession({ theme:'Technique', priority:{criterion:'Prise de balle tôt en revers',subtheme:'Revers',main_theme:'Technique',occurrences:2}, duration:90 });
  assert.equal(session.phases.length,3);
  assert.equal(session.focus,'Revers');
  assert.match(session.phases[0].content,/repère de rebond/i);
  assert.match(session.phases[1].content,/replacement/i);
  assert.match(session.phases[2].content,/point/i);
  assert.ok(session.phases.every(phase=>phase.success_criteria));
  assert.equal(session.phases.reduce((sum,phase)=>sum+phase.minutes,0),90);
  assert.equal(session.generated_exercises,true);
});

test('adapte les situations au thème de service', () => {
  const session=generateOriginalSession({theme:'Service',duration:60});
  assert.equal(session.focus,'Service');
  assert.match(session.exercise_1,/zone annoncée/i);
  assert.match(session.exercise_2,/sous pression/i);
  assert.equal(session.phases.reduce((sum,phase)=>sum+phase.minutes,0),60);
});

test('conserve une inspiration du programme collectif sans recopier les ateliers', () => {
  const session=generateOriginalSession({theme:'Attaque',duration:120});
  assert.ok(session.source_week);
  const source=groupProgram.weeks.find(week=>week.week===session.source_week);
  assert.ok(source.courts.some(Boolean));
  assert.match(session.source_label,/Cours de l’année.xlsx/);
  assert.ok(!session.phases.some(phase=>source.courts.includes(phase.content)));
});

test('ne présente pas une priorité comme confirmée en absence de critère récurrent', () => {
  const session=generateOriginalSession({theme:'Construction',duration:90});
  assert.match(session.evidence_label,/Aucune priorité fiable confirmée/);
  assert.match(session.coaching_notes,/diagnostic|observation/i);
});

test('garde les durées demandées et les trois étapes', () => {
  for(const duration of [60,90,120]){
    const session=generateOriginalSession({theme:'Volée',duration});
    assert.equal(session.phases.length,3);
    assert.equal(session.phases.reduce((sum,phase)=>sum+phase.minutes,0),duration);
  }
});
