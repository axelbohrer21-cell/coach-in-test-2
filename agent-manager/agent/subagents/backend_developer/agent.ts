import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq("openai/gpt-oss-20b"),
  description: "Implement Coach In backend and data changes in an isolated worktree: Supabase SQL migrations, Edge Functions, domain services, Auth and RLS. Never access or write production; provide test evidence.",
  tool: false,
  defaultTools: true,
});
