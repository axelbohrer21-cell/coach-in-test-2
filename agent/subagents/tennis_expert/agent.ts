import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-6-luna-fast",
  description:
    "Act as the Coach In tennis-domain specialist. Validate tennis teaching, session, player evaluation, scheduling, club operations, and competition rules against the project's approved requirements.",
  defaultTools: false,
});
