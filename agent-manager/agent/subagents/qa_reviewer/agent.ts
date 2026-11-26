import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-6-luna-fast",
  description: "Review Coach In changes as an independent QA specialist. Produce risk-based test plans, edge cases, regression checks, and evidence requirements. Never claim tests were executed.",
  tool: false,
  defaultTools: false,
});
