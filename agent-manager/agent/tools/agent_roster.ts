import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { inspectAgentRoster } from "../utils/agent-roster.js";

export default defineWorkflowTool({
  description: "Check which Coach In specialist agents are actually registered and callable in this Eve runtime. Run before planning or delegating a non-trivial mission. This verifies discoverability only, not model quota or successful task execution.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    "use workflow";

    const roster = inspectAgentRoster(Object.keys(ctx.agents));
    return {
      ...roster,
      verification: "Runtime registry only. This does not prove model availability, sandbox setup, tool execution or successful mission completion.",
      nextStep: roster.status === "ready"
        ? "All expected specialists are registered. Continue with mission_plan and bounded team_task delegation."
        : "Do not delegate yet. Report the missing agent IDs and repair the Eve subagent registration first.",
    };
  },
});
