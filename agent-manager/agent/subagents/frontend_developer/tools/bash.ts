import { defineTool } from "eve/tools";
import { bash } from "eve/tools/bash";
import { isDeveloperShellCommandAllowed } from "../../../utils/subagent-tool-guards.js";

export default defineTool({
  ...bash,
  description: "Run approved Git inspection and local project test/build scripts only against the assigned Coach In worktree. Commits, pushes, deployments, network tools and arbitrary shell commands are blocked.",
  execute(input, ctx) {
    if (!isDeveloperShellCommandAllowed(input.command)) {
      throw new Error("Commande refusée : seuls git status/diff/log/lecture et les scripts locaux autorisés sont disponibles dans le worktree attribué.");
    }
    return bash.execute(input, ctx);
  },
});
