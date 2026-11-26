import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq("openai/gpt-oss-20b"),
  description: "Execute Coach In QA checks in an existing isolated worktree. Run automated tests and syntax checks, inspect diffs and report exact command evidence. Read-only: do not edit source files.",
  tool: false,
  defaultTools: false,
});
