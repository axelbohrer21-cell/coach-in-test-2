import { createResilientModel } from "../../resilient-model.js";
import { defineAgent } from "eve";

export default defineAgent({
  model: createResilientModel(),
  description: "Implement Coach In frontend changes in the isolated project sandbox: vanilla JavaScript ES modules, HTML/CSS, responsive coach/player/admin screens, calendar and player cards. Run relevant local checks and report exact evidence.",
  tool: false,
  defaultTools: false,
});
