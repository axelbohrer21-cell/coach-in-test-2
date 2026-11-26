import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq("openai/gpt-oss-20b"),
  description:
    "Review a proposed Coach In engineering task plan for missing acceptance criteria, dependencies, security risks, role separation, unsafe production actions, and unverified assumptions. Return concrete corrections before the Manager presents the plan.",
  tool: false,
  defaultTools: false,
});
