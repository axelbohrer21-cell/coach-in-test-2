import { defineTool } from "eve/tools";
import { editFile } from "eve/tools/edit_file";
import { isWorktreePathAllowed } from "../../../utils/subagent-tool-guards.js";

export default defineTool({
  ...editFile,
  description: "Edit project files only inside the assigned Coach In worktree.",
  execute(input, ctx) {
    if (!isWorktreePathAllowed(input.filePath)) throw new Error("Chemin refusé : le chemin doit rester dans /workspace/coach-in-worktrees/.");
    return editFile.execute(input, ctx);
  },
});
