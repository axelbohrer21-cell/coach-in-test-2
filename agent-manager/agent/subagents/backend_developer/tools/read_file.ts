import { defineTool } from "eve/tools";
import { readFile } from "eve/tools/read_file";
import { isWorktreePathAllowed } from "../../../utils/subagent-tool-guards.js";

export default defineTool({
  ...readFile,
  description: "Read project files only inside the assigned Coach In worktree.",
  execute(input, ctx) {
    if (!isWorktreePathAllowed(input.filePath)) throw new Error("Chemin refusé : le chemin doit rester dans /workspace/coach-in-worktrees/.");
    return readFile.execute(input, ctx);
  },
});
