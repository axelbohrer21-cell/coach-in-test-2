import { defineAgent } from "eve";

export default defineAgent({
  // Start with no optional built-in tools. Only explicitly authored tools
  // under agent/tools are available to the Manager.
  defaultTools: false,
});
