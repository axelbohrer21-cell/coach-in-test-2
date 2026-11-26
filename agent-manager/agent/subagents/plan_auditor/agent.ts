import { createResilientModel } from "../../resilient-model.js";
import { defineAgent } from "eve";

export default defineAgent({
  model: createResilientModel(),
  description:
    "Review a proposed Coach In engineering task plan for missing acceptance criteria, dependencies, security risks, role separation, unsafe production actions, and unverified assumptions. Return concrete corrections before the Manager presents the plan.",
  tool: false,
  defaultTools: false,
});
