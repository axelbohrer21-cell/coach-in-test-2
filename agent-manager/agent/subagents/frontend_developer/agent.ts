import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq("openai/gpt-oss-20b"),
  description: "Implement Coach In frontend changes in the isolated project sandbox: vanilla JavaScript ES modules, HTML/CSS, responsive coach/player/admin screens, calendar and player cards. Run relevant local checks and report exact evidence.",
  tool: false,
  defaultTools: false,
});
