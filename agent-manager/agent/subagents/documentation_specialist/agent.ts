import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq("openai/gpt-oss-20b"),
  description: "Maintain clear French technical and user documentation for Coach In: requirements, changelog, onboarding, release notes, and operational procedures. Never claim undocumented behavior is implemented.",
  tool: false,
  defaultTools: false,
});
