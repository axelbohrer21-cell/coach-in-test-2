import { defineTool } from "eve/tools";
import { writeFile } from "eve/tools/write_file";
import { isWorktreePathAllowed } from "../../../utils/subagent-tool-guards.js";

export default defineTool({
  ...writeFile,
  description: "Write project files only inside the assigned Coach In worktree.",
  execute(input, ctx) {
    if (!isWorktreePathAllowed(input.filePath)) throw new Error("Chemin refusé : le chemin doit rester dans /workspace/coach-in-worktrees/.");
    return writeFile.execute(input, ctx);
  },
});
