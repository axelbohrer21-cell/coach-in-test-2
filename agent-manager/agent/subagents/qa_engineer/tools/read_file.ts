import { defineTool } from "eve/tools";
import { readFile } from "eve/tools/read_file";
import { isWorktreePathAllowed } from "../../../utils/subagent-tool-guards.js";

export default defineTool({
  ...readFile,
  description: "Read project files only inside the QA integration worktree.",
  async execute(input, ctx) {
    if (!isWorktreePathAllowed(input.path)) throw new Error("Lecture QA refusée hors du worktree d'intégration.");
    return readFile.execute(input, ctx);
  },
});
