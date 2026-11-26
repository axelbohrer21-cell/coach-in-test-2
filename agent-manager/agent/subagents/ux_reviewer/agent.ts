import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-6-luna-fast",
  description: "Review Coach In user experience and interface proposals for clarity, accessibility, mobile usability, consistency, and adherence to approved product design.",
  tool: false,
  defaultTools: false,
});
