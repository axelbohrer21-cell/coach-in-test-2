import assert from "node:assert/strict";
import test from "node:test";
import { aggregateReviewOutcomes, validateDependencyHandoff } from "./coordination.ts";

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
