import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq("openai/gpt-oss-20b"),
  description: "Design safe technical architecture for Coach In changes across vanilla JavaScript modules, Supabase, RLS, Vercel, and migrations. Identify boundaries, dependencies, data flows, and rollback plans.",
  tool: false,
  defaultTools: false,
});
