import { taskRoles } from "./mission-planner.js";
import { reviewerIds } from "./reviewer-routing.js";

export const expectedAgentIds = [...new Set([...taskRoles, ...reviewerIds, "plan_auditor"])].sort();

export function inspectAgentRoster(availableIds: string[]) {
  const availableAgentIds = [...new Set(availableIds)].sort();
  const available = new Set(availableAgentIds);
  const expected = new Set(expectedAgentIds);
  const missingAgentIds = expectedAgentIds.filter((id) => !available.has(id));
  const unexpectedAgentIds = availableAgentIds.filter((id) => !expected.has(id));

  return {
    status: missingAgentIds.length === 0 ? "ready" as const : "blocked" as const,
    expectedCount: expectedAgentIds.length,
    availableCount: availableAgentIds.length,
    expectedAgentIds,
    availableAgentIds,
    missingAgentIds,
    unexpectedAgentIds,
  };
}
