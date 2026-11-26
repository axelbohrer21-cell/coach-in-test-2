import { defineTool } from "eve/tools";
import { readFile } from "eve/tools/read_file";

const allowedPath = (path: string) =>
  path.startsWith("/workspace/coach-in-worktrees/") &&
  !path.replace(/\\\\/g, "/").split("/").includes("..");

export default defineTool({
  ...readFile,
  description: "Read project files only inside the assigned Coach In worktree.",
  async execute(input, ctx) {
    if (!allowedPath(input.path)) throw new Error("Lecture refusée : le chemin doit rester dans /workspace/coach-in-worktrees/.");
    return readFile.execute(input, ctx);
  },
});
