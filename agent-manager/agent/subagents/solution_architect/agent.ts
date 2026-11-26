import { createResilientModel } from "../../resilient-model.js";
import { defineAgent } from "eve";

export default defineAgent({
  model: createResilientModel(),
  description: "Design safe technical architecture for Coach In changes across vanilla JavaScript modules, Supabase, RLS, Vercel, and migrations. Identify boundaries, dependencies, data flows, and rollback plans.",
  tool: false,
  defaultTools: false,
});
