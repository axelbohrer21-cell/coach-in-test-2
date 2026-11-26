import { defineTool } from "eve/tools";
import { bash } from "eve/tools/bash";
import { isQaShellCommandAllowed } from "../../../utils/subagent-tool-guards.js";

export default defineTool({
  ...bash,
  description: "Read-only QA command runner. Allows only Git status/diff inspection and fixed test/typecheck scripts inside the integration worktree. No arbitrary shell, builds, edits, network or deployment commands.",
  async execute(input, ctx) {
    if (!isQaShellCommandAllowed(input.command)) {
      throw new Error("Commande QA refusée : seules les commandes Git de lecture et les scripts de test/typecheck autorisés sont disponibles dans le worktree d'intégration.");
    }
    return bash.execute(input, ctx);
  },
});
