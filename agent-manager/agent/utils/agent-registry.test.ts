import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { taskRoles } from "./mission-planner.ts";
import { reviewerIds } from "./reviewer-routing.ts";
import { expectedAgentIds, inspectAgentRoster } from "./agent-roster.ts";
import { isDeveloperShellCommandAllowed, isQaShellCommandAllowed, isWorktreePathAllowed } from "./subagent-tool-guards.ts";

const agentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../subagents");
const allAgentIds = [...new Set([...taskRoles, ...reviewerIds, "plan_auditor"])];

test("chaque rôle déléguable ou reviewer possède un agent et ses instructions", () => {
  for (const id of allAgentIds) {
    assert.ok(existsSync(resolve(agentRoot, id, "agent.ts")), `agent.ts absent pour ${id}`);
    assert.ok(existsSync(resolve(agentRoot, id, "instructions.md")), `instructions.md absent pour ${id}`);
  }
});

test("les développeurs disposent des outils isolés et limités à leur worktree", () => {
  for (const id of ["frontend_developer", "backend_developer"]) {
    assert.ok(existsSync(resolve(agentRoot, id, "sandbox.ts")));
    for (const tool of ["bash.ts", "read_file.ts", "write_file.ts", "edit_file.ts"]) {
      const path = resolve(agentRoot, id, "tools", tool);
      assert.ok(existsSync(path), `${tool} absent pour ${id}`);
      const source = readFileSync(path, "utf8");
      if (tool === "bash.ts") assert.match(source, /isDeveloperShellCommandAllowed/);
      else assert.match(source, /isWorktreePathAllowed/);
    }
  }
});

test("QA ne possède pas d'outil de modification et son shell est en liste blanche", () => {
  const qaTools = resolve(agentRoot, "qa_engineer", "tools");
  assert.ok(existsSync(resolve(agentRoot, "qa_engineer", "sandbox.ts")));
  assert.ok(existsSync(resolve(qaTools, "bash.ts")));
  assert.ok(existsSync(resolve(qaTools, "read_file.ts")));
  assert.ok(!existsSync(resolve(qaTools, "write_file.ts")));
  assert.ok(!existsSync(resolve(qaTools, "edit_file.ts")));
  assert.match(readFileSync(resolve(qaTools, "bash.ts"), "utf8"), /isQaShellCommandAllowed/);
  assert.match(readFileSync(resolve(qaTools, "read_file.ts"), "utf8"), /isWorktreePathAllowed/);
});

test("le roster runtime couvre exactement les agents déléguables et reviewers", () => {
  assert.deepEqual(expectedAgentIds, [...new Set([...taskRoles, ...reviewerIds, "plan_auditor"])].sort());
  assert.ok(existsSync(resolve(dirname(fileURLToPath(import.meta.url)), "../tools/agent_roster.ts")));
});

test("le contrôle runtime bloque si un spécialiste attendu manque", () => {
  const roster = inspectAgentRoster(expectedAgentIds.filter((id) => id !== "backend_developer"));
  assert.equal(roster.status, "blocked");
  assert.deepEqual(roster.missingAgentIds, ["backend_developer"]);
});

test("le contrôle runtime est prêt si tous les agents sont disponibles", () => {
  const roster = inspectAgentRoster(expectedAgentIds);
  assert.equal(roster.status, "ready");
  assert.equal(roster.missingAgentIds.length, 0);
  assert.equal(roster.expectedCount, 14);
});

test("les chemins de fichiers sont strictement bornés au dossier des worktrees", () => {
  assert.equal(isWorktreePathAllowed("/workspace/coach-in-worktrees/task-a/src/app.js"), true);
  assert.equal(isWorktreePathAllowed("/workspace/coach-in/src/app.js"), false);
  assert.equal(isWorktreePathAllowed("/workspace/coach-in-worktrees/task-a/../../coach-in/src/app.js"), false);
  assert.equal(isWorktreePathAllowed("/workspace/coach-in-worktrees/task-a/./src/app.js"), false);
});

test("le shell développeur autorise les tests locaux mais bloque les actions mutatives", () => {
  const root = "/workspace/coach-in-worktrees/task-a";
  assert.equal(isDeveloperShellCommandAllowed("git -C " + root + " status --short"), true);
  assert.equal(isDeveloperShellCommandAllowed("npm --prefix " + root + "/agent-manager run typecheck"), true);
  assert.equal(isDeveloperShellCommandAllowed("git -C " + root + " commit -m test"), false);
  assert.equal(isDeveloperShellCommandAllowed("git -C " + root + " status --short; rm -rf /"), false);
  assert.equal(isDeveloperShellCommandAllowed("npm --prefix " + root + "/agent-manager run deploy"), false);
});

test("le shell QA autorise seulement les contrôles et tests en lecture seule", () => {
  const root = "/workspace/coach-in-worktrees/integration";
  assert.equal(isQaShellCommandAllowed("git -C " + root + " diff --check"), true);
  assert.equal(isQaShellCommandAllowed("npm --prefix " + root + "/agent-manager run test:planning"), true);
  assert.equal(isQaShellCommandAllowed("npm --prefix " + root + "/agent-manager run build"), false);
  assert.equal(isQaShellCommandAllowed("git -C " + root + " push"), false);
  assert.equal(isQaShellCommandAllowed("git -C " + root + " status --short && touch hack.ts"), false);
});
