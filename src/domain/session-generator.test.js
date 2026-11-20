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


test('le critère technique sélectionné pilote les trois situations de coup droit', () => {
  const criterion={id:'criterion-cd',main_theme:'Coup droit',subtheme:'Coup droit',criterion:'Prise de balle trop basse'};
  const session=generateOriginalSession({theme:'Coup droit',selectedCriterion:criterion,difficulty:'easy',duration:90});
  assert.equal(session.selected_criterion.criterion,criterion.criterion);
  assert.match(session.objective,/Prise de balle trop basse/);
  assert.match(session.phases[0].content,/repère de prise de balle/i);
  assert.match(session.phases[1].content,/déplacement/i);
  assert.match(session.phases[2].content,/échange/i);
  assert.match(session.coaching_notes,/Critère choisi par le coach/);
  assert.ok(session.phases.every(phase=>phase.success_criteria.includes('5 tentatives sur 10')));
});

test('un critère de service produit des ateliers centrés sur le lancer', () => {
  const session=generateOriginalSession({theme:'Service',selectedCriterion:{id:'srv',main_theme:'Service',subtheme:'Service',criterion:'Lancer latéral prononcé'},duration:60});
  assert.match(session.phases[0].content,/lancers sans frapper/i);
  assert.match(session.phases[1].content,/lancer puis frappe/i);
  assert.match(session.phases[2].content,/service avec cible/i);
  assert.equal(session.focus,'Service');
});

test('les critères de volée distinguent les volées de coup droit et de revers', () => {
  const session=generateOriginalSession({theme:'Volée',selectedCriterion:{id:'vol',main_theme:'Volée',subtheme:'Volée de revers',criterion:'Contrôle de la profondeur'},duration:60});
  assert.match(session.phases[0].content,/volée revers/i);
  assert.match(session.phases[2].content,/volée de finition/i);
});


test('le retour de première balle est distingué du service et du retour de deuxième balle', () => {
  const session=generateOriginalSession({theme:'Retour de service',selectedCriterion:{id:'retour1',main_theme:'Retour de service',subtheme:'Retour sur première balle',criterion:'Prise de balle tardive'},duration:90});
  assert.equal(session.focus,'Retour');
  assert.match(session.phases[0].content,/première balle/i);
  assert.match(session.phases[1].content,/retour orienté/i);
  assert.match(session.phases[2].content,/premier échange/i);
  assert.match(session.coaching_notes,/Prise de balle tardive/);
});


test('le smash sélectionné déclenche des situations de placement sous le lob et de finition', () => {
  const session=generateOriginalSession({theme:'Smash',selectedCriterion:{id:'smash',main_theme:'Smash',subtheme:'Smash',criterion:'Contrôle de la direction'},duration:60});
  assert.match(session.phases[0].content,/smash dans une grande zone/i);
  assert.match(session.phases[1].content,/choix de zone/i);
  assert.match(session.phases[2].content,/situation de point/i);
});

test('un critère tactique de construction par la longueur pilote les situations', () => {
  const session=generateOriginalSession({theme:'Tactique',selectedCriterion:{id:'tac',main_theme:'Tactique',subtheme:'Tactique',criterion:'Variation des longueurs'},duration:90});
  assert.match(session.phases[0].content,/construire par la profondeur/i);
  assert.match(session.phases[1].content,/profondeur puis changement/i);
  assert.match(session.phases[2].content,/points à contrat/i);
});


test('un sous-thème technique pilote le générateur même si le thème principal est Technique', () => {
  const session=generateOriginalSession({theme:'Technique',selectedCriterion:{id:'cd',main_theme:'Technique',subtheme:'Coup droit',criterion:'Régularité du coup droit'},duration:60});
  assert.match(session.phases[0].content,/régularité en diagonale/i);
  assert.match(session.phases[1].content,/cible alternée/i);
  assert.match(session.phases[2].content,/régularité transférée au point/i);
  assert.equal(session.selected_criterion.criterion,'Régularité du coup droit');
});

test('un sous-thème service déclenche le plan service avec thème principal Technique', () => {
  const session=generateOriginalSession({theme:'Technique',selectedCriterion:{id:'srv',main_theme:'Technique',subtheme:'Service',criterion:'Rythme de préparation et de frappe'},duration:90});
  assert.match(session.phases[0].content,/position de préparation/i);
  assert.match(session.phases[1].content,/rythme lancer-frappe/i);
  assert.match(session.phases[2].content,/service/i);
});

test('un sous-thème volée distingue le revers du coup droit', () => {
  const session=generateOriginalSession({theme:'Technique',selectedCriterion:{id:'vol',main_theme:'Technique',subtheme:'Volée de revers',criterion:'Contrôle de la profondeur'},duration:90});
  assert.match(session.phases[0].content,/volée revers sur cible/i);
  assert.match(session.phases[1].content,/volée revers/i);
});

test('un sous-thème retour conserve la distinction première et deuxième balle', () => {
  const session=generateOriginalSession({theme:'Technique',selectedCriterion:{id:'ret',main_theme:'Technique',subtheme:'Retour sur deuxième balle',criterion:'Prise de balle précoce'},duration:60});
  assert.match(session.phases[0].content,/deuxième balle/i);
  assert.match(session.phases[1].content,/retour compact/i);
});

test('chaque durée produit exactement trois phases dont la somme est exacte', () => {
  for (const duration of [60,90,120]) {
    const session=generateOriginalSession({theme:'Tactique',selectedCriterion:{id:'t',main_theme:'Tactique',subtheme:'Construction',criterion:'Variation des longueurs'},duration});
    assert.equal(session.phases.length,3);
    assert.equal(session.phases.reduce((sum,phase)=>sum+phase.minutes,0),duration);
    assert.ok(session.phases.every(phase=>phase.content&&phase.success_criteria));
  }
});

test('tous les niveaux de difficulté modifient le seuil de réussite sans casser la séance', () => {
  const expected={very_easy:4,easy:5,medium:6,hard:8,very_hard:9};
  for (const [difficulty,target] of Object.entries(expected)) {
    const session=generateOriginalSession({theme:'Coup droit',selectedCriterion:{id:'cd',main_theme:'Technique',subtheme:'Coup droit',criterion:'Régularité'},difficulty,duration:60});
    assert.match(session.phases[0].success_criteria,new RegExp('au moins '+target+' tentatives'));
    assert.equal(session.phases.length,3);
  }
});

test('un critère inconnu reste visible dans les notes et génère trois situations', () => {
  const session=generateOriginalSession({theme:'Technique',selectedCriterion:{id:'x',main_theme:'Technique',subtheme:'Critère spécialisé',criterion:'Synchronisation segmentaire spécifique'},duration:60});
  assert.equal(session.selected_criterion.criterion,'Synchronisation segmentaire spécifique');
  assert.match(session.coaching_notes,/Synchronisation segmentaire spécifique/);
  assert.ok(session.phases.every(phase=>phase.content));
});

test('une génération sans critère reste valide et ne fabrique pas de priorité', () => {
  const session=generateOriginalSession({theme:'Construction',duration:90});
  assert.equal(session.generated,true);
  assert.equal(session.selected_criterion,null);
  assert.equal(session.phases.length,3);
  assert.match(session.evidence_label,/Aucune priorité fiable/i);
});


test('les 19 sous-thèmes du catalogue Coach In génèrent une séance complète', () => {
  const taxonomy=[["Coup droit","Coup droit"],["Jeu de jambes/déplacements","Jeu de jambes et déplacements"],["Mental","Attitude en match"],["Mental","Combativité et engagement"],["Mental","Concentration"],["Mental","Confiance en soi"],["Mental","Gestion de la pression"],["Mental","Gestion des émotions"],["Physique","Physique"],["Retour de service","Retour sur deuxième balle"],["Retour de service","Retour sur première balle"],["Revers","Critères communs"],["Revers","Revers à deux mains"],["Revers","Revers à une main"],["Revers","Variations lift / balle à plat / slice"],["Service","Service"],["Tactique","Tactique"],["Volée","Volée de coup droit"],["Volée","Volée de revers"]];
  for (const [main_theme,subtheme] of taxonomy) {
    const criterion='Critère de contrôle spécifique';
    const session=generateOriginalSession({theme:main_theme,selectedCriterion:{id:main_theme+'-'+subtheme,main_theme,subtheme,criterion},duration:90});
    assert.equal(session.phases.length,3,main_theme+' / '+subtheme);
    assert.equal(session.selected_criterion.subtheme,subtheme);
    assert.ok(session.phases.every(phase=>phase.content&&phase.success_criteria));
    assert.match(session.evidence_label,new RegExp(subtheme.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
});
