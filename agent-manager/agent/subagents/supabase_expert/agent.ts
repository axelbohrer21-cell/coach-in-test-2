import { createResilientModel } from "../../resilient-model.js";
import { defineAgent } from "eve";

export default defineAgent({
  model: createResilientModel(),
  description: "Provide independent PostgreSQL and Supabase architecture reviews for Coach In: schema design, migrations, RPC, Edge Functions, Auth, Storage, indexing, query performance, and compatibility. Advisory only; never access live databases or execute changes.",
  tool: false,
  defaultTools: false,
});
