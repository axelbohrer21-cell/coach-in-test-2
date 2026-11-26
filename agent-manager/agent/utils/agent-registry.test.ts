import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { taskRoles } from "./mission-planner.ts";
import { reviewerIds } from "./reviewer-routing.ts";

const agentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../subagents");
const allAgentIds = [...new Set([...taskRoles, ...reviewerIds, "plan_auditor"])];

test("chaque rôle déléguable ou reviewer possède un agent et ses instructions", () => {
  for (const id of allAgentIds) {
    assert.ok(existsSync(resolve(agentRoot, id, "agent.ts")), `agent.ts absent pour ${id}`);
    assert.ok(existsSync(resolve(agentRoot, id, "instructions.md")), `instructions.md absent pour ${id}`);
  }
});

test("les développeurs ont un sandbox et les outils de lecture/écriture isolés", () => {
  for (const id of ["frontend_developer", "backend_developer"]) {
    assert.ok(existsSync(resolve(agentRoot, id, "sandbox.ts")));
    for (const tool of ["bash.ts", "read_file.ts", "write_file.ts", "edit_file.ts"]) {
      assert.ok(existsSync(resolve(agentRoot, id, "tools", tool)), `${tool} absent pour ${id}`);
    }
  }
});

test("QA possède uniquement les outils de contrôle en lecture seule", () => {
  const qaTools = resolve(agentRoot, "qa_engineer", "tools");
  assert.ok(existsSync(resolve(agentRoot, "qa_engineer", "sandbox.ts")));
  assert.ok(existsSync(resolve(qaTools, "bash.ts")));
  assert.ok(existsSync(resolve(qaTools, "read_file.ts")));
  assert.ok(!existsSync(resolve(qaTools, "write_file.ts")));
  assert.ok(!existsSync(resolve(qaTools, "edit_file.ts")));
});
