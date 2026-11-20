import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePlayerProgress,buildCoachIntelligence,buildAdaptiveTrainingProgram} from './intelligence.js';
const player={id:'p1',first_name:'Lucas',last_name:'Martin'};
const evaluations=[
{id:'e3',player_id:'p1',evaluated_at:'2026-11-10T12:00:00Z',technical_score:15,tactical_score:12},
{id:'e2',player_id:'p1',evaluated_at:'2026-11-03T12:00:00Z',technical_score:14,tactical_score:11},
{id:'e1',player_id:'p1',evaluated_at:'2026-10-27T12:00:00Z',technical_score:13,tactical_score:10},
{id:'e0',player_id:'p1',evaluated_at:'2026-10-20T12:00:00Z',technical_score:10,tactical_score:10}
];
test('confirme un axe répété sur deux journées parmi trois',()=>{
 const criteria=['e3','e2'].map(evaluation_id=>({evaluation_id,player_id:'p1',criterion_id:'c1',criterion:'Revers en défense',criterion_type:'improvement'}));
 const result=analyzePlayerProgress({player,evaluations,evaluationCriteria:criteria,now:Date.parse('2026-11-17T12:00:00Z')});
 assert.equal(result.priority.criterion,'Revers en défense');assert.equal(result.criteriaConfidence,'recurrent');
 assert.equal(result.observationDayCount,4);assert.equal(result.trends.find(row=>row.label==='Technique').delta,null);
});
test('ne compte pas trois bilans saisis le même jour comme trois observations',()=>{
 const sameDay=evaluations.slice(0,3).map((row,index)=>({...row,evaluated_at:'2026-11-20T12:0'+index+':00Z'}));
 const criteria=sameDay.map(row=>({evaluation_id:row.id,criterion_id:'c1',criterion:'Revers',criterion_type:'improvement'}));
 const result=analyzePlayerProgress({player,evaluations:sameDay,evaluationCriteria:criteria});
 assert.equal(result.reportCount,3);assert.equal(result.observationDayCount,1);assert.equal(result.priority,null);assert.equal(result.criteriaConfidence,'insufficient');
});
test('ne compare pas les tendances sans trois journées notées dans chaque période',()=>{
 const result=analyzePlayerProgress({player,evaluations:evaluations.slice(0,2)});
 assert.equal(result.trends.find(row=>row.label==='Technique').delta,null);
});
test('isole les joueurs archivés et agrège les priorités par joueur',()=>{
 const result=buildCoachIntelligence({players:[player,{id:'p2',archived_at:'2026-01-01'}],evaluations,evaluationCriteria:['e3','e2'].map(evaluation_id=>({evaluation_id,criterion_id:'c1',criterion:'Revers en défense',criterion_type:'improvement'}))});
 assert.equal(result.insights.length,1);assert.equal(result.playersWithPriority,1);assert.equal(result.recurringThemes[0].playerCount,1);
});
test('détecte une progression seulement avec un historique complet et construit un cycle',()=>{
 const six=[
 {id:'n3',player_id:'p1',evaluated_at:'2026-11-17',technical_score:12,tactical_score:15},
 {id:'n2',player_id:'p1',evaluated_at:'2026-11-10',technical_score:12,tactical_score:14},
 {id:'n1',player_id:'p1',evaluated_at:'2026-11-03',technical_score:12,tactical_score:13},
 {id:'o3',player_id:'p1',evaluated_at:'2026-10-27',technical_score:12,tactical_score:10},
 {id:'o2',player_id:'p1',evaluated_at:'2026-10-20',technical_score:12,tactical_score:10},
 {id:'o1',player_id:'p1',evaluated_at:'2026-10-13',technical_score:12,tactical_score:10}
 ];
 const result=analyzePlayerProgress({player,evaluations:six});
 assert.ok(result.stagnation.includes('Technique'));assert.equal(result.fastestProgress.label,'Tactique');assert.equal(result.fourWeekPlan.length,4);
 const program=buildAdaptiveTrainingProgram({player,evaluations:six});
 assert.equal(program.ready,true);assert.equal(program.sessions.length,10);
});
test('refuse un cycle si les bilans sont concentrés sur moins de trois journées',()=>{
 const same=evaluations.slice(0,3).map(row=>({...row,evaluated_at:'2026-11-20T15:00:00Z'}));
 const result=buildAdaptiveTrainingProgram({player,evaluations:same});
 assert.equal(result.ready,false);assert.equal(result.sessions.length,0);
});
