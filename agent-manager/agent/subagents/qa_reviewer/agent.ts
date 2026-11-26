import { createResilientModel } from "../../resilient-model.js";
import { defineAgent } from "eve";

export default defineAgent({
  model: createResilientModel(),
  description: "Review Coach In changes as an independent QA specialist. Produce risk-based test plans, edge cases, regression checks, and evidence requirements. Never claim tests were executed.",
  tool: false,
  defaultTools: false,
});
