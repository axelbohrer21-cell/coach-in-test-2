import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-6-luna-fast",
  description: "Validate Coach In tennis teaching, session, player evaluation, scheduling, club operations, and competition rules against approved project requirements.",
  tool: "deferred",
  defaultTools: false,
});
