const worktreePattern = String.raw`\/workspace\/coach-in-worktrees\/[a-z0-9][a-z0-9._-]{1,60}`;

const shellControl = /[;&|<>\x60$\n\r]/;
const forbidden = /(?:^|\s)(?:git\s+(?:commit|push|merge|rebase|reset|clean|cherry-pick|tag)|gh\s+pr\s+(?:merge|create)|vercel(?:\s|$)|supabase(?:\s|$)|curl(?:\s|$)|wget(?:\s|$)|ssh(?:\s|$)|scp(?:\s|$)|sudo(?:\s|$)|rm(?:\s|$)|chmod(?:\s|$)|chown(?:\s|$)|python(?:\s|$)|perl(?:\s|$)|ruby(?:\s|$)|node\s+-e)/i;

const developerGit = new RegExp("^git -C " + worktreePattern + " (?:status(?: --short)?|diff(?: --check| --stat| --name-only)?|log --oneline|rev-parse --abbrev-ref HEAD|ls-files)$");
const developerNpm = new RegExp("^(?:npm --prefix " + worktreePattern + " test|npm --prefix " + worktreePattern + "/agent-manager (?:run (?:typecheck|build|test:routing|test:coordination|test:planning|test:agents|test:memory-privacy|test:security)|test))$");
const developerNodeCheck = new RegExp("^node --check " + worktreePattern + "/src/[a-zA-Z0-9_./-]+\\\\.js$");

const qaGit = new RegExp("^git -C " + worktreePattern + " (?:status --short|diff --check|diff --stat|diff --name-only|rev-parse --abbrev-ref HEAD)$");
const qaNpm = new RegExp("^(?:npm --prefix " + worktreePattern + " test|npm --prefix " + worktreePattern + "/agent-manager run (?:test:routing|test:coordination|test:planning|test:agents|test:memory-privacy|test:security|typecheck|typecheck:web))$");

export function isWorktreePathAllowed(path: string): boolean {
  if (!path.startsWith("/workspace/coach-in-worktrees/") || path.includes("\0")) return false;
  const normalized = path.replace(/\\/g, "/");
  return !normalized.split("/").some((segment) => segment === ".." || segment === ".");
}

export function isDeveloperShellCommandAllowed(command: string): boolean {
  const value = command.trim();
  return value.length > 0 && !shellControl.test(value) && !forbidden.test(value) &&
    (developerGit.test(value) || developerNpm.test(value) || developerNodeCheck.test(value));
}

export function isQaShellCommandAllowed(command: string): boolean {
  const value = command.trim();
  return value.length > 0 && !shellControl.test(value) && !forbidden.test(value) &&
    (qaGit.test(value) || qaNpm.test(value));
}
