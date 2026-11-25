import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-6-luna-fast",
  // Start with no optional built-in tools. Only explicitly authored tools
  // under agent/tools are available to the Manager.
  defaultTools: false,
});
