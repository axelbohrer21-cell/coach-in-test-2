import { createResilientModel } from "./resilient-model.js";
import { defineAgent } from "eve";

const model = createResilientModel();

export default defineAgent({
  description: "Coordinate the full Coach In product and engineering team, route work to specialists, inspect evidence, and prepare changes for human approval.",
  model,
  modelContextWindowTokens: 6500,
  // Keep the rolling conversation below the free-tier TPM ceiling.
  compaction: { threshold: 0.65, model, modelContextWindowTokens: 6500 },
  defaultTools: false,
});
