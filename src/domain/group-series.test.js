import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeriesCounters, buildSeriesOccurrences } from './group-series.js';

const series = { id:'s1', coach_id:'c1', title:'Adultes lundi', audience:'adultes', weekday:1, start_time:'18:00', end_time:'19:30', court_number:2, target_sessions:28 };
test('un compteur est indépendant par créneau et exclut les annulations', () => {
 const rows=[{series_id:'s1',status:'completed'},{series_id:'s1',status:'scheduled',session_date:'2027-01-10'},{series_id:'s1',status:'cancelled'},{series_id:'other',status:'completed'}];
 const row=buildSeriesCounters([series],rows,'2026-11-11')[0];
 assert.equal(row.completed,1); assert.equal(row.planned,1); assert.equal(row.cancelled,1); assert.equal(row.toSchedule,26);
});
test('génération annuelle respecte les vacances et la cible',()=>{
 const rows=buildSeriesOccurrences(series);
 assert.equal(rows.length,26); assert.ok(rows.every(x=>x.series_id==='s1'&&x.start_time==='18:00'&&x.court_number===2));
});
test('un créneau sans horaires exacts ne génère rien et est refusé',()=>{
 assert.throws(()=>buildSeriesOccurrences({...series,start_time:''}),/Horaires/);
});

test('le quatrième court est accepté',()=>{
 const rows=buildSeriesOccurrences({...series,court_number:4});
 assert.ok(rows.length>0); assert.equal(rows[0].court_number,4);
});

test('le mercredi adulte est accepté et respecte le créneau du soir',()=>{
 const rows=buildSeriesOccurrences({...series,weekday:3,start_time:'18:00',end_time:'21:00'});
 assert.equal(rows.length,31);
 assert.ok(rows.every(x=>x.start_time==='18:00'&&x.end_time==='21:00'));
});
test('un jour incompatible avec le public est refusé plutôt que de créer une série vide',()=>{
 assert.throws(()=>buildSeriesOccurrences({...series,weekday:6}),/Jour incompatible/);
 assert.throws(()=>buildSeriesOccurrences({...series,audience:'enfants',weekday:1}),/Jour incompatible/);
});

test('les quatre samedis spéciaux de vacances comptent dans le potentiel annuel enfants',()=>{
 const childSaturday={...series,id:'child-sat',audience:'enfants',weekday:6,start_time:'09:30',end_time:'14:30',target_sessions:30};
 const row=buildSeriesCounters([childSaturday],[],'2026-09-14')[0];
 assert.equal(row.eligibleDates.length,32);
});
test('un public inconnu est refusé',()=>{
 assert.throws(()=>buildSeriesOccurrences({...series,audience:'ados'}),/Public/);
});

test('la génération de série respecte le lundi 2 novembre férié de vacances et le 9 novembre normal',()=>{
 const rows=buildSeriesOccurrences(series);
 assert.equal(rows.some(row=>row.session_date==='2026-11-09'),true);
 assert.equal(rows.filter(row=>row.session_date==='2026-11-02').length,0);
});
