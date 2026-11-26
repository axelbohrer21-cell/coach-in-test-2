export interface DependencyHandoff {
  taskId: string;
  status: "completed" | "blocked" | "failed" | "needs_input";
  summary: string;
  deliverables: string[];
  evidence: string[];
}

export function validateDependencyHandoff(requiredIds: string[], supplied: DependencyHandoff[]) {
  const duplicateRequiredIds = requiredIds.filter((id, index, all) => all.indexOf(id) !== index);
  const duplicateDependencyIds = supplied
    .map((item) => item.taskId)
    .filter((id, index, all) => all.indexOf(id) !== index);
  const missingOrUnverifiedDependencies = [...new Set(requiredIds)].filter((id) => {
    const matches = supplied.filter((item) => item.taskId === id);
    const match = matches[0];
    return matches.length !== 1 ||
      !match ||
      match.status !== "completed" ||
      match.summary.trim().length === 0 ||
      match.deliverables.length === 0 ||
      match.deliverables.some((item) => item.trim().length === 0) ||
      match.evidence.length === 0 ||
      match.evidence.some((item) => item.trim().length === 0);
  });

  return {
    valid: duplicateRequiredIds.length === 0 &&
      duplicateDependencyIds.length === 0 &&
      missingOrUnverifiedDependencies.length === 0,
    duplicateRequiredIds: [...new Set(duplicateRequiredIds)],
    duplicateDependencyIds: [...new Set(duplicateDependencyIds)],
    missingOrUnverifiedDependencies,
  };
}

export interface ReviewOutcome {
  reviewer: string;
  status: "completed" | "failed";
  review?: {
    verdict: "ready" | "changes_requested" | "blocked" | "insufficient_evidence";
    findings: Array<{ severity: "critical" | "high" | "medium" | "low" }>;
  };
}

export function aggregateReviewOutcomes(results: ReviewOutcome[], expectedCount: number) {
  const completed = results.filter((item) => item.status === "completed" && item.review);
  const failedCount = results.length - completed.length;
  const hasBlocker = completed.some((item) =>
    item.review!.verdict === "blocked" ||
    item.review!.findings.some((finding) => finding.severity === "critical" || finding.severity === "high")
  );
  const requestsChanges = completed.some((item) => item.review!.verdict === "changes_requested");
  const insufficientEvidence = completed.some((item) => item.review!.verdict === "insufficient_evidence");
  const incomplete = failedCount > 0 || insufficientEvidence || results.length !== expectedCount;

  // A confirmed critical/high finding must never be hidden by an unrelated reviewer failure.
  const status = hasBlocker
    ? "blocked"
    : incomplete
      ? "partial"
      : requestsChanges
        ? "changes_requested"
        : "reviewed";

  return {
    status,
    completedCount: completed.length,
    failedCount,
    hasBlocker,
    requestsChanges,
    insufficientEvidence,
  } as const;
}
