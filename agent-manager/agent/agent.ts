import { createResilientModel } from "./resilient-model.js";
import { defineAgent } from "eve";

const model = createResilientModel();

export default defineAgent({
  description: "Coordinate the full Coach In product and engineering team, route work to specialists, inspect evidence, and prepare changes for human approval.",
  model,
  modelContextWindowTokens: 131072,
  // Compact at 75% of context rather than 5%, which caused premature summaries.
  compaction: { threshold: 0.75, model, modelContextWindowTokens: 131072 },
  defaultTools: false,
});
