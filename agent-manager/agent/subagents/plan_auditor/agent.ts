import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-6-luna-fast",
  description:
    "Review a proposed Coach In engineering task plan for missing acceptance criteria, dependencies, security risks, role separation, unsafe production actions, and unverified assumptions. Return concrete corrections before the Manager presents the plan.",
  tool: "deferred",
  defaultTools: false,
});
