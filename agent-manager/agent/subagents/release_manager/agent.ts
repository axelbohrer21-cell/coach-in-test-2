import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq("openai/gpt-oss-20b"),
  description: "Prepare safe Coach In releases: release notes, migration order, environment matrix, QA gates, preview verification checklist, rollback and human approval gates. Never deploy or merge.",
  tool: false,
  defaultTools: false,
});
