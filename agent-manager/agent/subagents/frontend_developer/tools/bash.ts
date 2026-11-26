import { defineTool } from "eve/tools";
import { bash } from "eve/tools/bash";

const worktreePrefix = "/workspace/coach-in-worktrees/";
const shellControl = /[;&|<>\x60$\n\r]/;
const forbidden = /(?:^|\s)(?:git\s+(?:commit|push|merge|rebase|reset|clean|cherry-pick|tag)|gh\s+pr\s+(?:merge|create)|vercel(?:\s|$)|supabase(?:\s|$)|curl(?:\s|$)|wget(?:\s|$)|ssh(?:\s|$)|scp(?:\s|$)|sudo(?:\s|$)|rm(?:\s|$)|chmod(?:\s|$)|chown(?:\s|$)|python(?:\s|$)|perl(?:\s|$)|ruby(?:\s|$)|node\s+-e)/i;
const allowed = /^(?:git -C \/workspace\/coach-in-worktrees\/[a-z0-9][a-z0-9._-]{1,60} (?:status|diff|log|rev-parse|ls-files)(?:\s|$)|npm --prefix \/workspace\/coach-in-worktrees\/[a-z0-9][a-z0-9._-]{1,60}\/agent-manager (?:run (?:typecheck|build|test:[a-z0-9:_-]+)|test)(?:\s|$)|node --experimental-strip-types --test \/workspace\/coach-in-worktrees\/[a-z0-9][a-z0-9._-]{1,60}\/[^\s]+\.test\.ts$)/;

export default defineTool({
  ...bash,
  description: "Run non-destructive project inspection and test commands only against the assigned Coach In worktree. Git history rewriting, commits, pushes, deployments, network tools and shell-based file editing are blocked.",
  async execute(input, ctx) {
    const command = input.command.trim();
    if (shellControl.test(command) || forbidden.test(command) || !allowed.test(command) || !command.includes(worktreePrefix)) {
      throw new Error("Commande refusée : utilise uniquement git status/diff/log/lecture, les tests autorisés ou le typecheck/build dans le worktree attribué. Les modifications passent par write_file/edit_file dans ce worktree.");
    }
    return bash.execute(input, ctx);
  },
});
