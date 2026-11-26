import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

import { reviewerIds, selectReviewers } from "./reviewer-routing";

const reviewSchema = z.object({
  verdict: z.enum(["ready", "changes_requested", "blocked", "insufficient_evidence"]),
  summary: z.string(),
  findings: z.array(z.object({
    severity: z.enum(["critical", "high", "medium", "low"]),
    title: z.string(),
    evidence: z.string(),
    recommendation: z.string(),
  })),
  acceptanceCriteria: z.array(z.string()),
  tests: z.array(z.string()),
  assumptions: z.array(z.string()),
});


export default defineWorkflowTool({
  description:
    "Run an independent review for a non-trivial Coach In task. Always invokes plan_auditor and QA; automatically adds tennis, UX, and data-security specialists based on task/context unless the caller explicitly selects reviewers. Waits for structured results and reports partial or blocked reviews honestly.",
  inputSchema: z.object({
    task: z.string().min(8).max(12000),
    context: z.string().max(12000).optional(),
    reviewers: z.array(z.enum(reviewerIds)).max(4).optional(),
  }),
  async execute({ task, context, reviewers }, ctx) {
    "use workflow";

    const automatic = reviewers === undefined ? selectReviewers(task, context) : null;
    const specialistIds = reviewers ?? automatic!.reviewers;
    const selected = [...new Set(["plan_auditor", "qa_reviewer", ...specialistIds])];
    const available = new Set(Object.keys(ctx.agents));
    const missing = selected.filter((name) => !available.has(name));

    if (missing.length > 0) {
      return {
        status: "blocked",
        task,
        missingReviewers: missing,
        message: "Un ou plusieurs agents spécialisés ne sont pas disponibles dans cette version.",
      };
    }

    const results = await Promise.all(selected.map(async (reviewer) => {
      const prompt = [
        "Mission de revue indépendante pour Coach In.",
        "Tu es un agent de conseil : ne modifie aucun code, aucune donnée et aucun environnement.",
        "N'invente aucune inspection, source ou exécution de test. Signale explicitement les informations manquantes.",
        "Évalue uniquement la mission et le contexte transmis. Respecte les règles métier et de sécurité du projet.",
        "Tu n'as aucun accès direct au dépôt, à Supabase ou à une Preview dans cette revue, sauf si leur contenu est explicitement transmis dans le contexte.",
        "",
        "MISSION :",
        task,
        "",
        "CONTEXTE :",
        context?.trim() || "Aucun contexte supplémentaire fourni.",
        "",
        "Fournis un verdict, des constats fondés, des recommandations concrètes, des critères d'acceptation et les tests nécessaires.",
      ].join("\n");

      try {
        const response = await ctx.agent(reviewer).send(prompt, {
          outputSchema: reviewSchema,
          signal: ctx.abortSignal,
        });
        const result = await response.result();

        if (result.status !== "completed") {
          return {
            reviewer,
            status: "failed" as const,
            error: result.status === "failed"
              ? result.error.message
              : "La revue a été annulée avant de produire un résultat.",
          };
        }
        if (!result.data) {
          return {
            reviewer,
            status: "failed" as const,
            error: "L'agent n'a pas retourné le résultat structuré attendu.",
          };
        }
        return { reviewer, status: "completed" as const, review: result.data };
      } catch (error) {
        return {
          reviewer,
          status: "failed" as const,
          error: error instanceof Error ? error.message : "Erreur inconnue pendant la revue.",
        };
      }
    }));

    const failedCount = results.filter((item) => item.status === "failed").length;
    const completed = results.filter((item) => item.status === "completed");
    const hasBlocker = completed.some((item) =>
      item.review.verdict === "blocked" ||
      item.review.findings.some((finding) => finding.severity === "critical" || finding.severity === "high")
    );
    const requestsChanges = completed.some((item) => item.review.verdict === "changes_requested");
    const insufficientEvidence = completed.some((item) => item.review.verdict === "insufficient_evidence");

    const status = failedCount > 0 || insufficientEvidence || completed.length !== selected.length
      ? "partial"
      : hasBlocker
        ? "blocked"
        : requestsChanges
          ? "changes_requested"
          : "reviewed";

    return {
      task,
      status,
      reviewers: selected,
      selectionMode: reviewers === undefined ? "automatic" : "explicit",
      selectionReasons: automatic?.reasons ?? ["La liste des spécialistes a été explicitement fournie par le Manager."],
      evidenceMode: "context_only",
      completedCount: completed.length,
      failedCount,
      results,
      nextAction: status === "reviewed"
        ? "Le Manager peut consolider les retours et préparer la suite."
        : status === "partial"
          ? "Compléter les éléments de preuve ou relancer les agents en échec avant de présenter le plan comme prêt."
          : "Le Manager doit traiter les blocages ou les demandes de correction avant de présenter le plan comme prêt.",
    };
  },
});
