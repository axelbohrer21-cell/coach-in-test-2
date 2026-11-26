import { defineParentSandbox } from "eve/sandbox";

// Developer agents work in the Manager's isolated sandbox, but only in the
// separate worktree passed with each task.
export default defineParentSandbox();
