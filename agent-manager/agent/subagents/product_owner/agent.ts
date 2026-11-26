import { createResilientModel } from "../../resilient-model.js";
import { defineAgent } from "eve";

export default defineAgent({
  model: createResilientModel(),
  description: "Translate Coach In requests into clear product requirements, user stories, scope boundaries, and measurable acceptance criteria. Preserve approved tennis-club workflows and coach/player role separation.",
  tool: false,
  defaultTools: false,
});
