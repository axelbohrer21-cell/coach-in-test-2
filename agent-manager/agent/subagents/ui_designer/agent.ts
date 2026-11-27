import { createResilientModel } from "../../resilient-model.js";
import { defineAgent } from "eve";

export default defineAgent({
  model: createResilientModel(),
  description: "Design clear, accessible and mobile-first Coach In user journeys, screen structures, interaction states and implementation-ready UI specifications. Advisory only; do not edit application code.",
  tool: false,
  defaultTools: false,
});
