import assert from "node:assert/strict";
import test from "node:test";
import { buildMissionExecutionPlan, fingerprintMissionPlan, missingTaskAgents } from "./mission-planner.ts";

const sandbox = (taskId: string) => ({
  baseRef: "main",
  workBranch: `work/${taskId}`,
  worktreePath: `/workspace/coach-in-worktrees/${taskId}`,
});

const developer = (taskId: string, writeScope: string[], dependsOn: string[] = []) => ({
  taskId,
  role: "frontend_developer" as const,
  dependsOn,
  writeScope,
  ...sandbox(taskId),
});

const qa = (taskId: string, dependsOn: string[]) => ({
  taskId,
  role: "qa_engineer" as const,
  dependsOn,
  writeScope: [],
  ...sandbox(taskId),
});

test("planifie en parallèle les tâches indépendantes aux périmètres disjoints", () => {
  const result = buildMissionExecutionPlan([
    developer("front-a", ["src/views/calendar.js"]),
    { taskId: "product", role: "product_owner" as const, dependsOn: [], writeScope: [] },
    qa("qa", ["front-a"]),
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.waves, [["front-a", "product"], ["qa"]]);
});

test("sérialise les tâches indépendantes dont les périmètres se chevauchent", () => {
  const result = buildMissionExecutionPlan([
    { taskId: "architect", role: "solution_architect" as const, dependsOn: [], writeScope: [] },
    developer("front-a", ["src/views"], ["architect"]),
    developer("front-b", ["src/views/calendar.js"], ["architect"]),
    qa("qa", ["front-a", "front-b"]),
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.waves, [["architect"], ["front-a"], ["front-b"], ["qa"]]);
  assert.deepEqual(result.tasks[2].executionDependsOn, ["architect", "front-a"]);
});

test("bloque une dépendance inconnue", () => {
  const result = buildMissionExecutionPlan([developer("front-a", ["src/a.js"], ["missing"])]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("inconnues")));
});

test("bloque un cycle de dépendances", () => {
  const result = buildMissionExecutionPlan([
    { taskId: "architect", role: "solution_architect" as const, dependsOn: [], writeScope: [] },
    developer("front-a", ["src/a.js"], ["architect", "front-b"]),
    developer("front-b", ["src/b.js"], ["architect", "front-a"]),
    qa("qa", ["front-a", "front-b"]),
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
    { taskId: "architect", role: "solution_architect" as const, dependsOn: [], writeScope: [] },
    developer("front-a", ["src/a.js"], ["architect"]),
    developer("back-a", ["supabase/functions"], ["architect"]),
    qa("qa", ["front-a"]),
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("toutes les tâches développeur")));
});


test("exige un Architecte avant plusieurs développeurs", () => {
  const result = buildMissionExecutionPlan([
    developer("front-a", ["src/a.js"]),
    developer("back-a", ["supabase/functions"]),
    qa("qa", ["front-a", "back-a"]),
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Architecte")));
});

test("chaque développeur doit dépendre de l'Architecte", () => {
  const result = buildMissionExecutionPlan([
    { taskId: "architect", role: "solution_architect" as const, dependsOn: [], writeScope: [] },
    developer("front-a", ["src/a.js"], ["architect"]),
    developer("back-a", ["supabase/functions"]),
    { taskId: "qa", role: "qa_engineer" as const, dependsOn: ["front-a", "back-a"], writeScope: [] },
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("dépendre de l'Architecte")));
});


test("exige un worktree et une branche distincts pour chaque tâche sandbox", () => {
  const result = buildMissionExecutionPlan([
    developer("front-a", ["src/a.js"]),
    { ...qa("qa", ["front-a"]), worktreePath: "/workspace/coach-in-worktrees/front-a" },
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("chemin de worktree unique")));
});

test("bloque les chemins de worktree hors du sandbox autorisé", () => {
  const result = buildMissionExecutionPlan([
    { ...developer("front-a", ["src/a.js"]), worktreePath: "/tmp/other" },
    qa("qa", ["front-a"]),
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("chemin de worktree dédié")));
});

test("bloque les branches de travail dupliquées", () => {
  const result = buildMissionExecutionPlan([
    developer("front-a", ["src/a.js"]),
    { ...qa("qa", ["front-a"]), workBranch: "work/front-a" },
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("branche Git unique")));
});


test("impose le même baseRef pour le développement et la QA intégrée", () => {
  const result = buildMissionExecutionPlan([
    developer("front-a", ["src/a.js"]),
    { ...qa("qa", ["front-a"]), baseRef: "release" },
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("même baseRef")));
});

test("chaque tâche QA attend tous les développeurs", () => {
  const result = buildMissionExecutionPlan([
    { taskId: "architect", role: "solution_architect" as const, dependsOn: [], writeScope: [] },
    developer("front-a", ["src/a.js"], ["architect"]),
    developer("back-a", ["api"], ["architect"]),
    qa("qa-a", ["front-a", "back-a"]),
    qa("qa-b", ["front-a"]),
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("toutes les tâches développeur")));
});


test("refuse une branche de base ou protégée comme branche de travail", () => {
  const result = buildMissionExecutionPlan([
    { ...developer("front-a", ["src/a.js"]), workBranch: "main" },
    qa("qa", ["front-a"]),
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("branche de base ou une branche protégée")));
});


test("le checksum du plan est déterministe", () => {
  const tasks = [{ ...developer("front-a", ["src/a.js"]), objective: "Modifier le calendrier", acceptanceCriteria: ["Le calendrier est affiché"] }];
  assert.equal(fingerprintMissionPlan("mission-1", "Calendrier", tasks), fingerprintMissionPlan("mission-1", "Calendrier", tasks));
});

test("le checksum change si une tâche ou un critère est modifié après planification", () => {
  const tasks = [{ ...developer("front-a", ["src/a.js"]), objective: "Modifier le calendrier", acceptanceCriteria: ["Le calendrier est affiché"] }];
  const original = fingerprintMissionPlan("mission-1", "Calendrier", tasks);
  const changed = fingerprintMissionPlan("mission-1", "Calendrier", [{ ...tasks[0], objective: "Modifier le planning" }]);
  const changedCriteria = fingerprintMissionPlan("mission-1", "Calendrier", [{ ...tasks[0], acceptanceCriteria: ["Le calendrier est accessible"] }]);
  assert.notEqual(original, changed);
  assert.notEqual(original, changedCriteria);
});


test("accepte les rôles consultatifs UI et Supabase sans worktree", () => {
  const result = buildMissionExecutionPlan([
    { taskId: "design-ui", role: "ui_designer", dependsOn: [], writeScope: [] },
    { taskId: "db-review", role: "supabase_expert", dependsOn: [], writeScope: [] },
  ]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.waves, [["design-ui", "db-review"]]);
});

test("détecte les rôles du plan absents du runtime", () => {
  const missing = missingTaskAgents(
    [{ role: "frontend_developer" }, { role: "backend_developer" }, { role: "frontend_developer" }],
    ["frontend_developer"],
  );
  assert.deepEqual(missing, ["backend_developer"]);
});

test("ne signale aucun rôle manquant lorsque tous les agents du plan sont disponibles", () => {
  const missing = missingTaskAgents(
    [{ role: "frontend_developer" }, { role: "qa_engineer" }],
    ["frontend_developer", "qa_engineer"],
  );
  assert.deepEqual(missing, []);
});
