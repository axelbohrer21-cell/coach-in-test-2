import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  // Use Groq's free API tier directly; bypass Vercel AI Gateway billing.
  // Provider-side free quotas apply and requests stop when those limits are reached.
  model: groq("openai/gpt-oss-20b"),
  modelContextWindowTokens: 131072,
  defaultTools: false,
});
