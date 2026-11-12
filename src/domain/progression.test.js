import test from 'node:test';
import assert from 'node:assert/strict';
import { hasEvaluationContent, validateEvaluationCriteria, newlyUnlockedAchievements, recommendChallenge, challengeEvaluationResult, radarPoints } from './progression.js';

test('un bilan doit contenir au moins une note ou un critère', () => {
  assert.equal(hasEvaluationContent({}, []), false);
  assert.equal(hasEvaluationContent({ technical_score: 12 }, []), true);
  assert.equal(hasEvaluationContent({}, [{ criterion_id: 'a' }]), true);
});

test('un critère sélectionné conserve une mesure numérique valide', () => {
  assert.equal(validateEvaluationCriteria([{criterion_id:'a',criterion_type:'improvement',measured_value:'7.5'}]), true);
  assert.throws(() => validateEvaluationCriteria([{criterion_id:'a',criterion_type:'improvement',measured_value:'abc'}]), /numérique/);
});

test('une réussite est débloquée après trois évaluations distinctes du même identifiant', () => {
  const rows = ['e1','e2','e3'].map(evaluation_id => ({criterion_id:'c1',criterion_type:'positive',evaluation_id}));
  assert.deepEqual(newlyUnlockedAchievements(rows), [{criterion_id:'c1',validation_count:3}]);
});

test('un critère répété dans un même bilan ne gonfle pas sa fréquence', () => {
  const rows = [
    {criterion_id:'c1',criterion:'Régularité',criterion_type:'improvement',evaluation_id:'e1'},
    {criterion_id:'c1',criterion:'Régularité',criterion_type:'improvement',evaluation_id:'e1'},
    {criterion_id:'c1',criterion:'Régularité',criterion_type:'improvement',evaluation_id:'e2'}
  ];
  assert.deepEqual(recommendChallenge(rows), {criterion_id:'c1',criterion:'Régularité',occurrences:2});
});

test('un défi compare la mesure à la cible selon son opérateur', () => {
  assert.equal(challengeEvaluationResult({measuredValue:8,targetValue:8,operator:'gte'}), true);
  assert.equal(challengeEvaluationResult({measuredValue:7,targetValue:8,operator:'gte'}), false);
  assert.equal(challengeEvaluationResult({measuredValue:7,targetValue:8,operator:'lte'}), true);
});

test('le radar conserve les quatre secteurs et leurs valeurs', () => {
  const result = radarPoints({technical_score:10,tactical_score:12,physical_score:null,mental_score:15});
  assert.equal(result.axes.length,4);
  assert.match(result.polygon, /,/);
});
