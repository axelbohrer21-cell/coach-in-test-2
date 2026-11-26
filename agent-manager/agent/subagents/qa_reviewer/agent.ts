import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq("openai/gpt-oss-20b"),
  description: "Review Coach In changes as an independent QA specialist. Produce risk-based test plans, edge cases, regression checks, and evidence requirements. Never claim tests were executed.",
  tool: false,
  defaultTools: false,
});
