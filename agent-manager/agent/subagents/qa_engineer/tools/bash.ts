import { defineTool } from "eve/tools";
import { bash } from "eve/tools/bash";

const path = "/workspace/coach-in-worktrees/[a-z0-9][a-z0-9._-]{1,60}";
const allowed = new RegExp(
  \`^(?:git -C \${path} (?:status --short|diff --check|diff --stat|diff --name-only|rev-parse --abbrev-ref HEAD)|npm --prefix \${path}/agent-manager run (?:test:routing|test:coordination|test:planning|test:agents|test:memory-privacy|test:security|typecheck|typecheck:web))$\`,
);

export default defineTool({
  ...bash,
  description: "Read-only QA command runner. Allows only git status/diff inspection and the project's fixed test/typecheck scripts inside the assigned integration worktree. No arbitrary shell, builds, edits, network or deployment commands.",
  async execute(input, ctx) {
    const command = input.command.trim();
    if (!allowed.test(command)) {
      throw new Error("Commande QA refusée : seules les commandes git de lecture et les scripts de test/typecheck autorisés sont disponibles dans le worktree d'intégration.");
    }
    return bash.execute(input, ctx);
  },
});
