import { defineTool } from "eve/tools";
import { writeFile } from "eve/tools/write_file";

const allowedPath = (path: string) =>
  path.startsWith("/workspace/coach-in-worktrees/") &&
  !path.replace(/\\\\/g, "/").split("/").includes("..");

export default defineTool({
  ...writeFile,
  description: "Write project files only inside the assigned Coach In worktree. Never write to the shared checkout.",
  async execute(input, ctx) {
    if (!allowedPath(input.path)) throw new Error("Écriture refusée : le chemin doit rester dans /workspace/coach-in-worktrees/.");
    return writeFile.execute(input, ctx);
  },
});
