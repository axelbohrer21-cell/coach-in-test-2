import { defineWorkflowTool } from "eve/tools";
import { missionMemoryInputSchema } from "../utils/mission-memory-schema.js";
import { executeMissionMemoryStep } from "./mission-memory-store.js";

export default defineWorkflowTool({
  description:
    "Read and write durable Coach In Manager project mission records in a private Vercel Blob store. Use list at the start of non-trivial missions, read relevant records, and save a structured record at completion. Store project facts only: never secrets, credentials, player personal data, or private coaching notes. The store is private and the tool is available only to authenticated Manager sessions.",
  inputSchema: missionMemoryInputSchema,
  async execute(input) {
    "use workflow";
    return await executeMissionMemoryStep(input);
  },
});
