import { defineTool } from "eve/tools";
import { editFile } from "eve/tools/edit_file";

const allowedPath = (path: string) =>
  path.startsWith("/workspace/coach-in-worktrees/") &&
  !path.replace(/\\/g, "/").split("/").includes("..");

export default defineTool({
  ...editFile,
  description: "Edit project files only inside the assigned Coach In worktree. Never edit the shared checkout.",
  async execute(input, ctx) {
    if (!allowedPath(input.path)) throw new Error("Modification refusée : le chemin doit rester dans /workspace/coach-in-worktrees/.");
    return editFile.execute(input, ctx);
  },
});
