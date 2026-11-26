import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq("openai/gpt-oss-20b"),
  description: "Review Coach In data architecture, Supabase access control, RLS, authentication boundaries, privacy, migrations, and environment safety. Advisory only; never execute changes.",
  tool: false,
  defaultTools: false,
});
