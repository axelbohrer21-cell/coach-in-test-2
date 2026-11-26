import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq("openai/gpt-oss-20b"),
  description: "Review Coach In user experience and interface proposals for clarity, accessibility, mobile usability, consistency, and adherence to approved product design.",
  tool: false,
  defaultTools: false,
});
