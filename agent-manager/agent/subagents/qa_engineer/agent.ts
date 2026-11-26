import { createResilientModel } from "../../resilient-model.js";
import { defineAgent } from "eve";

export default defineAgent({
  model: createResilientModel(),
  description: "Execute Coach In QA checks in an existing isolated worktree. Run automated tests and syntax checks, inspect diffs and report exact command evidence. Read-only: do not edit source files.",
  tool: false,
  defaultTools: false,
});
