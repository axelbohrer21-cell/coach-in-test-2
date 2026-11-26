import { createResilientModel } from "../../resilient-model.js";
import { defineAgent } from "eve";

export default defineAgent({
  model: createResilientModel(),
  description: "Implement Coach In backend and data changes in an isolated worktree: Supabase SQL migrations, Edge Functions, domain services, Auth and RLS. Never access or write production; provide test evidence.",
  tool: false,
  defaultTools: false,
});
