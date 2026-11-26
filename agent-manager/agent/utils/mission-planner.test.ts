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
    { taskId: "qa", role: "qa_engineer" as const, dependsOn: ["front-a"], writeScope: [] },
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.waves, [["front-a", "product"], ["qa"]]);
});

test("sérialise les tâches indépendantes dont les périmètres se chevauchent", () => {
  const result = buildMissionExecutionPlan([
    developer("front-a", ["src/views"]),
    developer("front-b", ["src/views/calendar.js"]),
    { taskId: "qa", role: "qa_engineer" as const, dependsOn: ["front-a", "front-b"], writeScope: [] },
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.waves, [["front-a"], ["front-b"], ["qa"]]);
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
    { taskId: "qa", role: "qa_engineer" as const, dependsOn: ["front-a", "front-b"], writeScope: [] },
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


test("bloque les identifiants de tâche dupliqués", () => {
  const result = buildMissionExecutionPlan([
    developer("front-a", ["src/a.js"]),
    developer("front-a", ["src/b.js"]),
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("dupliqués")));
});

test("bloque les chemins absolus, traversants ou avec jokers", () => {
  for (const scope of ["/etc/passwd", "../src/app.js", "src/**/*.js"]) {
    const result = buildMissionExecutionPlan([developer("front-a", [scope])]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("chemin de modification invalide")));
  }
});


test("exige une tâche QA pour toute mission avec développement", () => {
  const result = buildMissionExecutionPlan([developer("front-a", ["src/a.js"])]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("inclure une tâche QA")));
});

test("exige que QA dépende de tous les développeurs", () => {
  const result = buildMissionExecutionPlan([
    developer("front-a", ["src/a.js"]),
    developer("back-a", ["supabase/functions"]),
    { taskId: "qa", role: "qa_engineer" as const, dependsOn: ["front-a"], writeScope: [] },
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("toutes les tâches développeur")));
});
