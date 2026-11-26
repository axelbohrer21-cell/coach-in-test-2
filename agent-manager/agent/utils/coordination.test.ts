import assert from "node:assert/strict";
import test from "node:test";
import { aggregateReviewOutcomes, validateDependencyHandoff, validateTaskCompletion } from "./coordination.ts";

const completed = (taskId: string) => ({
  taskId,
  status: "completed" as const,
  summary: "Livrable réalisé",
  deliverables: ["src/module.ts"],
  evidence: ["git diff --check : code 0"],
});

test("autorise une passation lorsque chaque dépendance est terminée, livrée et prouvée", () => {
  const result = validateDependencyHandoff(["task-1", "task-2"], [
    completed("task-1"),
    completed("task-2"),
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.missingOrUnverifiedDependencies, []);
});

test("bloque une dépendance sans livrable ou sans preuve", () => {
  const noDeliverable = { ...completed("task-1"), deliverables: [] };
  const noEvidence = { ...completed("task-2"), evidence: [] };
  const result = validateDependencyHandoff(["task-1", "task-2"], [noDeliverable, noEvidence]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.missingOrUnverifiedDependencies, ["task-1", "task-2"]);
});

test("bloque les identifiants de dépendance dupliqués", () => {
  const result = validateDependencyHandoff(["task-1", "task-1"], [
    completed("task-1"),
    completed("task-1"),
  ]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.duplicateRequiredIds, ["task-1"]);
  assert.deepEqual(result.duplicateDependencyIds, ["task-1"]);
});

test("rejette les preuves ou livrables constitués de chaînes vides", () => {
  const result = validateDependencyHandoff(["task-1"], [{
    ...completed("task-1"),
    evidence: ["   "],
  }]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.missingOrUnverifiedDependencies, ["task-1"]);
});

test("bloque une dépendance non terminée", () => {
  const result = validateDependencyHandoff(["task-1"], [{
    ...completed("task-1"),
    status: "blocked",
  }]);
  assert.equal(result.valid, false);
});

test("un blocage critique confirmé prime sur l'échec d'un autre reviewer", () => {
  const result = aggregateReviewOutcomes([
    { reviewer: "security", status: "completed", review: {
      verdict: "ready", findings: [{ severity: "critical" }],
    } },
    { reviewer: "qa", status: "failed" },
  ], 2);
  assert.equal(result.status, "blocked");
});

test("une revue incomplète sans blocage reste partielle", () => {
  const result = aggregateReviewOutcomes([
    { reviewer: "qa", status: "failed" },
  ], 2);
  assert.equal(result.status, "partial");
});

test("les demandes de correction sont conservées après revue complète", () => {
  const result = aggregateReviewOutcomes([
    { reviewer: "qa", status: "completed", review: {
      verdict: "changes_requested", findings: [{ severity: "medium" }],
    } },
  ], 1);
  assert.equal(result.status, "changes_requested");
});


const completedTask = {
  status: "completed" as const,
  summary: "Modification terminée",
  deliverables: ["src/module.ts"],
  filesChanged: ["src/module.ts"],
  commandsRun: [{ command: "npm test", exitCode: 0, result: "OK" }],
  tests: [{ name: "unit", status: "passed" as const, evidence: "1/1 passed" }],
  criteriaResults: [{
    criterion: "Le changement est implémenté",
    status: "met" as const,
    evidence: "src/module.ts modifié et diff relu",
  }],
};

test("ne valide pas un développeur si une commande ou un test échoue", () => {
  const result = validateTaskCompletion("frontend_developer", {
    ...completedTask,
    tests: [{ name: "unit", status: "failed", evidence: "Assertion failed" }],
  }, ["Le changement est implémenté"]);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.some((reason) => reason.includes("test(s)")));
});

test("exige un diff réel pour un développeur", () => {
  const result = validateTaskCompletion("backend_developer", {
    ...completedTask,
    filesChanged: [],
  }, ["Le changement est implémenté"]);
  assert.equal(result.valid, false);
});

test("refuse une validation QA si un fichier a été modifié", () => {
  const result = validateTaskCompletion("qa_engineer", completedTask, ["Le changement est implémenté"]);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.some((reason) => reason.includes("lecture seule")));
});

test("accepte un rapport QA en lecture seule avec preuves et tests réussis", () => {
  const result = validateTaskCompletion("qa_engineer", {
    ...completedTask,
    filesChanged: [],
  }, ["Le changement est implémenté"]);
  assert.equal(result.valid, true);
});


test("bloque une tâche dont le critère d'acceptation n'est pas démontré", () => {
  const result = validateTaskCompletion("product_owner", {
    ...completedTask,
    criteriaResults: [],
  }, ["Le changement est implémenté"]);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.some((reason) => reason.includes("Critère non démontré")));
});


test("bloque une commande sans code de sortie vérifiable", () => {
  const result = validateTaskCompletion("product_owner", {
    ...completedTask,
    commandsRun: [{ command: "npm test", exitCode: null, result: "Commande lancée" }],
  }, ["Le changement est implémenté"]);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.some((reason) => reason.includes("code de sortie vérifiable")));
});

test("bloque un test réussi sans preuve", () => {
  const result = validateTaskCompletion("product_owner", {
    ...completedTask,
    tests: [{ name: "unit", status: "passed", evidence: " " }],
  }, ["Le changement est implémenté"]);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.some((reason) => reason.includes("aucune preuve")));
});
