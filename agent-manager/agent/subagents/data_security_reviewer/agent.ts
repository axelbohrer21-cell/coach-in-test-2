import { createResilientModel } from "../../resilient-model.js";
import { defineAgent } from "eve";

export default defineAgent({
  model: createResilientModel(),
  description: "Review Coach In data architecture, Supabase access control, RLS, authentication boundaries, privacy, migrations, and environment safety. Advisory only; never execute changes.",
  tool: false,
  defaultTools: false,
});
