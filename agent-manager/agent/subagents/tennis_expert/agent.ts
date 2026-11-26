import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq("openai/gpt-oss-20b"),
  description: "Validate Coach In tennis teaching, session, player evaluation, scheduling, club operations, and competition rules against approved project requirements.",
  tool: false,
  defaultTools: false,
});
