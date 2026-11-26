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


export interface TaskCompletionCandidate {
  status: "completed" | "blocked" | "failed" | "needs_input" | "not_started";
  summary: string;
  deliverables: string[];
  filesChanged: string[];
  commandsRun: Array<{ command: string; exitCode: number | null; result: string }>;
  tests: Array<{ name: string; status: "passed" | "failed" | "not_run"; evidence: string }>;
  criteriaResults: Array<{ criterion: string; status: "met" | "not_met" | "not_verified"; evidence: string }>;
}

export function validateTaskCompletion(
  role: string,
  result: TaskCompletionCandidate,
  expectedCriteria: string[],
) {
  const reasons: string[] = [];
  if (result.status !== "completed") {
    return { valid: false, reasons: [`L'agent a retourné le statut ${result.status}.`] };
  }
  if (!result.summary.trim()) reasons.push("Le résumé du livrable est vide.");
  const criteria = result.criteriaResults ?? [];
  for (const expected of expectedCriteria) {
    const matches = criteria.filter((item) => item.criterion.trim() === expected.trim());
    if (matches.length !== 1 || matches[0].status !== "met" || !matches[0].evidence.trim()) {
      reasons.push(`Critère non démontré ou ambigu : ${expected}`);
    }
  }
  if (criteria.some((item) => item.status !== "met" || !item.evidence.trim())) {
    reasons.push("Au moins un critère est non atteint ou sans preuve.");
  }
  if (result.deliverables.length === 0 || result.deliverables.some((item) => !item.trim())) {
    reasons.push("Aucun livrable identifiable n'a été fourni.");
  }
  const failedCommands = result.commandsRun.filter((item) => item.exitCode !== null && item.exitCode !== 0);
  if (failedCommands.length > 0) {
    reasons.push(`${failedCommands.length} commande(s) ont retourné un code de sortie non nul.`);
  }
  const failedTests = result.tests.filter((item) => item.status === "failed");
  if (failedTests.length > 0) {
    reasons.push(`${failedTests.length} test(s) ont échoué.`);
  }
  if (role === "qa_engineer") {
    if (result.tests.length === 0) reasons.push("Le QA n'a exécuté ou documenté aucun test.");
    if (result.tests.some((item) => item.status !== "passed" || !item.evidence.trim())) {
      reasons.push("Le QA ne peut terminer avec un test échoué, non exécuté ou sans preuve.");
    }
    if (result.filesChanged.length > 0) reasons.push("Le worktree QA n'est pas resté en lecture seule.");
  }
  if (role === "frontend_developer" || role === "backend_developer") {
    if (result.filesChanged.length === 0) reasons.push("Le développeur n'a fourni aucun fichier modifié à contrôler.");
  }
  return { valid: reasons.length === 0, reasons };
}
