import assert from "node:assert/strict";
import test from "node:test";
import { buildMissionExecutionPlan } from "./mission-planner.ts";

const developer = (taskId: string, writeScope: string[], dependsOn: string[] = []) => ({
  taskId,
  role: "frontend_developer" as const,
  dependsOn,
  writeScope,
});

test("planifie en parallèle les tâches indépendantes aux périmètres disjoints", () => {
  const result = buildMissionExecutionPlan([
    developer("front-a", ["src/views/calendar.js"]),
    { taskId: "product", role: "product_owner" as const, dependsOn: [], writeScope: [] },
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.waves, [["front-a", "product"]]);
});

test("sérialise les tâches indépendantes dont les périmètres se chevauchent", () => {
  const result = buildMissionExecutionPlan([
    developer("front-a", ["src/views"]),
    developer("front-b", ["src/views/calendar.js"]),
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.waves, [["front-a"], ["front-b"]]);
  assert.deepEqual(result.tasks[1].executionDependsOn, ["front-a"]);
});

test("bloque une dépendance inconnue", () => {
  const result = buildMissionExecutionPlan([developer("front-a", ["src/a.js"], ["missing"])]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("inconnues")));
});

test("bloque un cycle de dépendances", () => {
  const result = buildMissionExecutionPlan([
    developer("front-a", ["src/a.js"], ["front-b"]),
    developer("front-b", ["src/b.js"], ["front-a"]),
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Cycle")));
});

test("impose une dépendance développeur avant QA", () => {
  const result = buildMissionExecutionPlan([{
    taskId: "qa",
    role: "qa_engineer" as const,
    dependsOn: [],
    writeScope: [],
  }]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("doit dépendre")));
});

test("bloque un développeur sans périmètre de fichiers explicite", () => {
  const result = buildMissionExecutionPlan([developer("front-a", [])]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("périmètre")));
});
