import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

import { reviewerIds, selectReviewers } from "../utils/reviewer-routing.js";
import { aggregateReviewOutcomes } from "../utils/coordination.js";
import { capPrompt, compactPromptText } from "../utils/context-budget.js";

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
    "Run an independent review for a non-trivial Coach In task. Calls plan_auditor first, then one QA or domain/security/UX/Supabase reviewer sequentially to keep token use bounded. Passes the plan audit to the reviewer and reports partial or blocked reviews honestly.",
  inputSchema: z.object({
    task: z.string().min(8).max(6000),
    context: z.string().max(8000).optional(),
    reviewers: z.array(z.enum(reviewerIds)).max(1).optional(),
  }),
  async execute({ task, context, reviewers }, ctx) {
    "use workflow";

    const automatic = reviewers === undefined ? selectReviewers(task, context) : null;
    const specialistIds = reviewers ?? automatic!.reviewers;
    const selected = [...new Set(["plan_auditor", ...specialistIds])];
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

    const runReviewer = async (reviewer: string, additionalContext?: string) => {
      const prompt = capPrompt([
        "Mission de revue indépendante pour Coach In.",
        "Tu es un agent de conseil : ne modifie aucun code, aucune donnée et aucun environnement.",
        "N'invente aucune inspection, source ou exécution de test. Signale explicitement les informations manquantes.",
        "Évalue uniquement la mission et le contexte transmis. Respecte les règles métier et de sécurité du projet.",
        "Tu n'as aucun accès direct au dépôt, à Supabase ou à une Preview dans cette revue, sauf si leur contenu est explicitement transmis dans le contexte.",
        "",
        "MISSION :",
        compactPromptText(task, 3600, "mission"),
        "",
        "CONTEXTE INITIAL :",
        compactPromptText(context, 3000, "contexte de revue") || "Aucun contexte supplémentaire fourni.",
        "",
        "TRANSMISSION DE L'AUDITEUR DU PLAN :",
        compactPromptText(additionalContext, 1400, "audit du plan") || "Aucun résultat d’audit disponible ; indique les limites liées à cette absence.",
        "",
        "Fournis un verdict, des constats fondés, des recommandations concrètes, des critères d'acceptation et les tests nécessaires.",
      ].join("\n"), 10500);

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
    };

    // The plan auditor establishes scope, dependencies and safety gates before
    // downstream reviewers receive the task. Specialist reviews then run in parallel.
    const planAudit = await runReviewer("plan_auditor");
    const auditContext = planAudit.status === "completed"
      ? JSON.stringify(planAudit.review)
      : `L'audit du plan n'a pas abouti : ${planAudit.error}. Les spécialistes doivent signaler les limites de leur revue.`;

    const specialistResults = [];
    for (const reviewer of selected.filter((name) => name !== "plan_auditor")) {
      specialistResults.push(await runReviewer(reviewer, auditContext));
    }
    const results = [planAudit, ...specialistResults];
    const aggregate = aggregateReviewOutcomes(results, selected.length);

    return {
      task,
      status: aggregate.status,
      reviewers: selected,
      sequence: ["plan_auditor", "un reviewer spécialisé en séquentiel"],
      selectionMode: reviewers === undefined ? "automatic" : "explicit",
      selectionReasons: automatic?.reasons ?? ["La liste des spécialistes a été explicitement fournie par le Manager."],
      evidenceMode: "context_only",
      completedCount: aggregate.completedCount,
      failedCount: aggregate.failedCount,
      results,
      nextAction: aggregate.status === "reviewed"
        ? "Le Manager peut consolider les retours et préparer la suite."
        : aggregate.status === "partial"
          ? "Compléter les éléments de preuve ou relancer les agents en échec avant de présenter le plan comme prêt."
          : "Le Manager doit traiter les blocages ou les demandes de correction avant de présenter le plan comme prêt.",
    };
  },
});
