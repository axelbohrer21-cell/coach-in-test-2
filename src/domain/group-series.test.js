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

test('un jour incompatible avec le public est refusé plutôt que de créer une série vide',()=>{
 assert.throws(()=>buildSeriesOccurrences({...series,weekday:3}),/Jour incompatible/);
 assert.throws(()=>buildSeriesOccurrences({...series,audience:'enfants',weekday:1}),/Jour incompatible/);
});

test('un public inconnu est refusé',()=>{
 assert.throws(()=>buildSeriesOccurrences({...series,audience:'ados'}),/Public/);
});
