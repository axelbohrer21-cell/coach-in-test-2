import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAverage, calculateAge, calculateAgeCategory, canPlayerCancel, countDistinctValidations, nextChallenge, validateBooking } from './tennis.js';

test('moyenne : ignore les secteurs non évalués', () => {
  assert.equal(calculateAverage({ technical_score: 16, tactical_score: 12, physical_score: null, mental_score: '' }), 14);
  assert.equal(calculateAverage({}), null);
});
test('moyenne : refuse les notes hors barème', () => {
  assert.throws(() => calculateAverage({ technical_score: 21 }), RangeError);
});
test('âge calculé sans erreur de décalage de date', () => {
  assert.equal(calculateAge('2010-11-12', new Date('2026-11-11T12:00:00')), 15);
});
test('catégorie indicative calculée sur la saison', () => {
  assert.equal(calculateAgeCategory('2014-05-01', 2026), '12 ans');
});
test('annulation joueur autorisée à 24 h, bloquée après', () => {
  const now = new Date('2026-11-10T10:00:00');
  assert.equal(canPlayerCancel('2026-11-11T10:00:00', now), true);
  assert.equal(canPlayerCancel('2026-11-11T09:59:00', now), false);
});
test('succès : trois bilans distincts sont requis', () => {
  const rows = ['a', 'a', 'b', 'c'].map((evaluation_id, i) => ({ evaluation_id, criterion: 'Centrage', criterion_type: 'positive' }));
  assert.deepEqual(countDistinctValidations(rows), [{ criterion: 'Centrage', validationCount: 3 }]);
});
test('défi : critère à améliorer le plus fréquent', () => {
  const rows = ['a', 'b', 'c', 'd'].map(evaluation_id => ({ evaluation_id, criterion: 'Déplacement', criterion_type: 'improvement' }));
  assert.equal(nextChallenge(rows, []).criterion, 'Déplacement');
});
test('réservation : contrôle durée et court', () => {
  assert.throws(() => validateBooking({ date: '2027-01-01', time: '10:00', duration: 45, court: 1 }), /Durée autorisée/);
});

test('défi : un critère répété dans un même bilan ne compte qu’une fois', () => {
  const rows = [
    { evaluation_id: 'a', criterion: 'Déplacement', criterion_type: 'improvement' },
    { evaluation_id: 'a', criterion: 'Déplacement', criterion_type: 'improvement' },
    { evaluation_id: 'b', criterion: 'Déplacement', criterion_type: 'improvement' },
    { evaluation_id: 'a', criterion: 'Service', criterion_type: 'improvement' }
  ];
  assert.deepEqual(nextChallenge(rows, []), { criterion: 'Déplacement', occurrences: 2 });
});

import { groupCriteria, validateEvaluationCriteria, newlyUnlockedAchievements, recommendChallenge, challengeEvaluationResult, radarPoints } from './progression.js';

test('catalogue : groupes thèmes et sous-thèmes sans fusion des critères', () => {
  const rows = [
    {id:'1',main_theme:'Mental',subtheme:'Combativité',criterion:'Baisse d’engagement',criterion_type:'improvement'},
    {id:'2',main_theme:'Mental',subtheme:'Attitude en match',criterion:'Baisse d’engagement',criterion_type:'improvement'}
  ];
  const grouped = groupCriteria(rows);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].subthemes.length, 2);
  assert.equal(grouped[0].subthemes[0].improvement.length + grouped[0].subthemes[1].improvement.length, 2);
});
test('validation détaillée : empêche doublon du même identifiant et mesure non numérique', () => {
  assert.throws(() => validateEvaluationCriteria([{criterion_id:'x',criterion_type:'positive'},{criterion_id:'x',criterion_type:'positive'}]), /deux fois/);
  assert.throws(() => validateEvaluationCriteria([{criterion_id:'x',criterion_type:'positive',measured_value:'abc'}]), /numérique/);
});
test('réussite : trois évaluations distinctes et identifiant de critère distinct', () => {
  const rows = ['e1','e1','e2','e3'].map(evaluation_id => ({evaluation_id,criterion_id:'c1',criterion_type:'positive'}));
  assert.deepEqual(newlyUnlockedAchievements(rows), [{criterion_id:'c1',validation_count:3}]);
});
test('défi : fréquence par identifiant, sans confondre critères homonymes', () => {
  const rows = [
    {evaluation_id:'e1',criterion_id:'c1',criterion:'Déplacement',criterion_type:'improvement'},
    {evaluation_id:'e2',criterion_id:'c1',criterion:'Déplacement',criterion_type:'improvement'},
    {evaluation_id:'e1',criterion_id:'c2',criterion:'Déplacement',criterion_type:'improvement'}
  ];
  assert.deepEqual(recommendChallenge(rows), {criterion_id:'c1',criterion:'Déplacement',occurrences:2});
});
test('défi : mesure comparée à la cible', () => {
  assert.equal(challengeEvaluationResult({measuredValue:8,targetValue:8,operator:'gte'}), true);
  assert.equal(challengeEvaluationResult({measuredValue:7,targetValue:8,operator:'gte'}), false);
  assert.equal(challengeEvaluationResult({measuredValue:7,targetValue:8,operator:'lte'}), true);
});
test('radar : quatre axes, valeur maximale normalisée', () => {
  const radar = radarPoints({technical_score:20,tactical_score:10,physical_score:null,mental_score:0});
  assert.equal(radar.axes.length,4);
  assert.equal(radar.polygon.split(' ').length,4);
});

test('réservation : refuse une date calendaire impossible', () => {
  assert.throws(() => validateBooking({ date: '2027-02-31', time: '10:00', duration: 60, court: 1 }), /date valide/);
});
