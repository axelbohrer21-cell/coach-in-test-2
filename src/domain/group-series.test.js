import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeriesCounters, buildSeriesOccurrences } from './group-series.js';

const series = { id:'s1', coach_id:'c1', title:'Adultes lundi', audience:'adultes', weekday:1, start_time:'18:00', end_time:'19:30', court_number:2, target_sessions:28 };
test('un compteur est indépendant par créneau et exclut les annulations', () => {
 const rows=[{series_id:'s1',status:'scheduled',session_date:'2027-01-10'},{series_id:'s1',status:'cancelled',session_date:'2026-09-21'},{series_id:'other',status:'completed',session_date:'2026-09-14'}];
 const row=buildSeriesCounters([series],rows,'2026-09-22')[0];
 assert.equal(row.completed,1); assert.equal(row.planned,1); assert.equal(row.cancelled,1); assert.equal(row.toSchedule,26);
});
test('génération annuelle respecte les vacances et la cible',()=>{
 const rows=buildSeriesOccurrences(series);
 assert.equal(rows.length,30); assert.ok(rows.every(x=>x.series_id==='s1'&&x.start_time==='18:00'&&x.court_number===2));
});
test('un créneau sans horaires exacts ne génère rien et est refusé',()=>{
 assert.throws(()=>buildSeriesOccurrences({...series,start_time:''}),/Horaires/);
});

test('le quatrième court est accepté',()=>{
 const rows=buildSeriesOccurrences({...series,court_number:4});
 assert.ok(rows.length>0); assert.equal(rows[0].court_number,4);
});

test('le mercredi adulte est accepté et un jour incompatible enfant est refusé',()=>{
 const wednesday=buildSeriesOccurrences({...series,title:'Adultes mercredi',weekday:3,start_time:'18:00',end_time:'19:30'});
 assert.ok(wednesday.length>0);
 assert.ok(wednesday.every(row=>row.audience==='adultes'&&row.start_time==='18:00'));
 assert.throws(()=>buildSeriesOccurrences({...series,audience:'enfants',weekday:1}),/Jour incompatible/);
});

test('un public inconnu est refusé',()=>{
 assert.throws(()=>buildSeriesOccurrences({...series,audience:'ados'}),/Public/);
});

test('la génération de série inclut toutes les dates de cours, y compris celles de pluie à confirmer',()=>{
 const rows=buildSeriesOccurrences(series);
 assert.equal(rows.some(row=>row.session_date==='2026-11-09'),true);
 assert.equal(rows.filter(row=>row.session_date==='2026-11-02').length,1);
});


test('compteur de série : les séances passées sont acquises automatiquement sauf annulation',()=>{
 const row=buildSeriesCounters([series],[],'2026-11-19',[{audience:'adultes',weekday:1,session_date:'2026-11-02'}])[0];
 assert.equal(row.completed,7);
 assert.equal(row.cancelled,1);
 assert.equal(row.pastUnrecorded,0);
});

test('série enfants du samedi : ajoute le premier samedi de chaque vacances Zone B',()=>{
 const childSeries={...series,id:'kids-sat',title:'Enfants samedi',audience:'enfants',weekday:6,start_time:'09:30',end_time:'14:30',target_sessions:30};
 const rows=buildSeriesOccurrences(childSeries);
 assert.ok(rows.some(row=>row.session_date==='2026-10-17'));
 assert.ok(rows.some(row=>row.session_date==='2026-12-19'));
 assert.ok(rows.some(row=>row.session_date==='2027-02-20'));
 assert.ok(rows.some(row=>row.session_date==='2027-04-17'));
 assert.equal(rows.some(row=>row.session_date==='2026-10-24'),false);
});
