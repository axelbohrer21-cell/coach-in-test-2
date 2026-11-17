import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePlayerProgress, buildCoachIntelligence, buildAdaptiveTrainingProgram } from './intelligence.js';

const player = { id: 'p1', first_name: 'Lucas', last_name: 'Martin' };
const evaluations = [
  { id: 'e3', player_id: 'p1', evaluated_at: '2026-11-10', technical_score: 15, tactical_score: 12 },
  { id: 'e2', player_id: 'p1', evaluated_at: '2026-11-03', technical_score: 14, tactical_score: 11 },
  { id: 'e1', player_id: 'p1', evaluated_at: '2026-10-27', technical_score: 13, tactical_score: 10 },
  { id: 'e0', player_id: 'p1', evaluated_at: '2026-10-20', technical_score: 10, tactical_score: 10 }
];

test('détecte un point à travailler répété sur plusieurs bilans récents', () => {
  const criteria = ['e3', 'e2'].map(evaluation_id => ({ evaluation_id, player_id: 'p1', criterion_id: 'c1', criterion: 'Revers en défense', criterion_type: 'improvement' }));
  const result = analyzePlayerProgress({ player, evaluations, evaluationCriteria: criteria, now: Date.parse('2026-11-17T12:00:00') });
  assert.equal(result.priority.criterion, 'Revers en défense');
  assert.equal(result.status, 'Axe de progression identifié');
  assert.equal(result.trends.find(row => row.label === 'Technique').delta, null);
});

test('ne compare pas les tendances sans historique précédent suffisant', () => {
  const result = analyzePlayerProgress({ player, evaluations: evaluations.slice(0, 2), now: Date.parse('2026-11-17T12:00:00') });
  assert.equal(result.trends.find(row => row.label === 'Technique').delta, null);
});

test('isole les joueurs archivés et agrège les priorités par joueur', () => {
  const result = buildCoachIntelligence({
    players: [player, { id: 'p2', archived_at: '2026-01-01' }],
    evaluations,
    evaluationCriteria: ['e3', 'e2'].map(evaluation_id => ({ evaluation_id, criterion_id: 'c1', criterion: 'Revers en défense', criterion_type: 'improvement' })),
    now: Date.parse('2026-11-17T12:00:00')
  });
  assert.equal(result.insights.length, 1);
  assert.equal(result.playersWithPriority, 1);
  assert.equal(result.recurringThemes[0].playerCount, 1);
});

test('repère une stagnation, une progression rapide et construit un cycle de quatre semaines', () => {
  const six = [
    { id:'n3',player_id:'p1',evaluated_at:'2026-11-17',technical_score:12,tactical_score:15 },
    { id:'n2',player_id:'p1',evaluated_at:'2026-11-10',technical_score:12,tactical_score:14 },
    { id:'n1',player_id:'p1',evaluated_at:'2026-11-03',technical_score:12,tactical_score:13 },
    { id:'o3',player_id:'p1',evaluated_at:'2026-10-27',technical_score:12,tactical_score:10 },
    { id:'o2',player_id:'p1',evaluated_at:'2026-10-20',technical_score:12,tactical_score:10 },
    { id:'o1',player_id:'p1',evaluated_at:'2026-10-13',technical_score:12,tactical_score:10 }
  ];
  const result = analyzePlayerProgress({ player, evaluations:six, now:Date.parse('2026-11-17T12:00:00') });
  assert.ok(result.stagnation.includes('Technique'));
  assert.equal(result.fastestProgress.label,'Tactique');
  assert.equal(result.fourWeekPlan.length,4);
  assert.match(result.fourWeekPlan[3].objective,/Tactique|Consolider/);
});


test('programme un cycle adaptatif de dix séances avec des exercices de la bibliothèque', () => {
  const six = [
    { id:'n3',player_id:'p1',evaluated_at:'2026-11-17',technical_score:12,tactical_score:15 },
    { id:'n2',player_id:'p1',evaluated_at:'2026-11-10',technical_score:12,tactical_score:14 },
    { id:'n1',player_id:'p1',evaluated_at:'2026-11-03',technical_score:12,tactical_score:13 },
    { id:'o3',player_id:'p1',evaluated_at:'2026-10-27',technical_score:12,tactical_score:10 },
    { id:'o2',player_id:'p1',evaluated_at:'2026-10-20',technical_score:12,tactical_score:10 },
    { id:'o1',player_id:'p1',evaluated_at:'2026-10-13',technical_score:12,tactical_score:10 }
  ];
  const criteria = ['n3','n2'].map(evaluation_id => ({ evaluation_id, player_id:'p1', criterion_id:'c1', criterion:'Régularité revers', main_theme:'Technique', subtheme:'Revers', criterion_type:'improvement' }));
  const library = [
    { id:'x1', category:'particulier', title:'Régularité revers', theme:'Technique', subtheme:'Revers', objective:'Stabiliser le revers' },
    { id:'x2', category:'particulier', title:'Défense revers', theme:'Défense', subtheme:'Revers', objective:'Jouer haut et long' }
  ];
  const result = buildAdaptiveTrainingProgram({ player, evaluations:six, evaluationCriteria:criteria, library, now:Date.parse('2026-11-17T12:00:00') });
  assert.equal(result.ready, true);
  assert.equal(result.sessions.length, 10);
  assert.equal(result.sessions[0].exercise.id, 'x1');
  assert.equal(result.sessions[1].exercise.id, 'x2');
  assert.equal(result.sessions[9].stage, 'Bilan de cycle');
  assert.match(result.sessions[8].objective, /Réinvestir|transfert/i);
});

test('ne programme pas un cycle présenté comme fiable avec moins de deux bilans', () => {
  const result = buildAdaptiveTrainingProgram({ player, evaluations:evaluations.slice(0,1) });
  assert.equal(result.ready, false);
  assert.equal(result.sessions.length, 0);
});
