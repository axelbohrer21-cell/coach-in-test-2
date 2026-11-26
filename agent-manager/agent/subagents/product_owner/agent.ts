import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq("openai/gpt-oss-20b"),
  description: "Translate Coach In requests into clear product requirements, user stories, scope boundaries, and measurable acceptance criteria. Preserve approved tennis-club workflows and coach/player role separation.",
  tool: false,
  defaultTools: false,
});
