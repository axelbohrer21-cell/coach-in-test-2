import { createResilientModel } from "../../resilient-model.js";
import { defineAgent } from "eve";

export default defineAgent({
  model: createResilientModel(),
  description: "Maintain clear French technical and user documentation for Coach In: requirements, changelog, onboarding, release notes, and operational procedures. Never claim undocumented behavior is implemented.",
  tool: false,
  defaultTools: false,
});
