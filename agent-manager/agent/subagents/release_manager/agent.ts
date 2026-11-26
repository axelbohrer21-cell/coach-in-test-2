import { createResilientModel } from "../../resilient-model.js";
import { defineAgent } from "eve";

export default defineAgent({
  model: createResilientModel(),
  description: "Prepare safe Coach In releases: release notes, migration order, environment matrix, QA gates, preview verification checklist, rollback and human approval gates. Never deploy or merge.",
  tool: false,
  defaultTools: false,
});
