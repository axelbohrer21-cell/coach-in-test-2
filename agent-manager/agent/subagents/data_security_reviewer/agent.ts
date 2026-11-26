import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-6-luna-fast",
  description: "Review Coach In data architecture, Supabase access control, RLS, authentication boundaries, privacy, migrations, and environment safety. Advisory only; never execute changes.",
  tool: false,
  defaultTools: false,
});
