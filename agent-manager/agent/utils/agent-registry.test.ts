import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { taskRoles } from "./mission-planner.ts";
import { reviewerIds } from "./reviewer-routing.ts";
import { expectedAgentIds, inspectAgentRoster } from "./agent-roster.ts";

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
      if (tool === "bash.ts") {
        assert.match(source, /const allowed =/);
        assert.ok(source.includes("git\\s+(?:commit|push"));
        assert.match(source, /worktreePrefix/);
      } else {
        assert.match(source, /workspace\/coach-in-worktrees/);
        assert.match(source, /allowedPath/);
      }
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
  const bashSource = readFileSync(resolve(qaTools, "bash.ts"), "utf8");
  assert.match(bashSource, /const allowed =/);
  assert.match(bashSource, /test:planning/);
  assert.match(bashSource, /Commande QA refusée/);
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

test("les outils développeurs bloquent les chemins hors worktree et les commandes mutatives", () => {
  for (const id of ["frontend_developer", "backend_developer"]) {
    const tools = resolve(agentRoot, id, "tools");
    for (const file of ["read_file.ts", "write_file.ts", "edit_file.ts"]) {
      const source = readFileSync(resolve(tools, file), "utf8");
      assert.match(source, /allowedPath/);
      assert.ok(source.includes("workspace/coach-in-worktrees"));
      assert.ok(source.includes('split("/").includes("..")'));
    }
    const shell = readFileSync(resolve(tools, "bash.ts"), "utf8");
    assert.match(shell, /shellControl/);
    assert.ok(shell.includes("git\\s+(?:commit|push"));
    assert.match(shell, /vercel/);
  }
});
