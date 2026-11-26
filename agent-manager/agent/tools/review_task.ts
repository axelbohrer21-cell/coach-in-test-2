import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

const reviewerIds = [
  "qa_reviewer",
  "tennis_expert",
  "ux_reviewer",
  "data_security_reviewer",
] as const;

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
    "Run a controlled, parallel review of a non-trivial Coach In task. Always invokes plan_auditor, then the selected QA, tennis, UX, and/or data-security specialists. Returns structured findings only after the selected reviewers finish. Reviewers are advisory and cannot modify code, data, or environments.",
  inputSchema: z.object({
    task: z.string().min(8).max(12000),
    context: z.string().max(12000).optional(),
    reviewers: z.array(z.enum(reviewerIds)).max(4).optional(),
  }),
  async execute({ task, context, reviewers }, ctx) {
    "use workflow";

    const selected = [...new Set(["plan_auditor", ...(reviewers ?? ["qa_reviewer"])])];
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
        const review = await ctx.agent(reviewer, {
          message: prompt,
          outputSchema: reviewSchema,
        });
        return { reviewer, status: "completed" as const, review };
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

    const status = failedCount > 0
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
      evidenceMode: "context_only",
      completedCount: completed.length,
      failedCount,
      results,
      nextAction: status === "reviewed"
        ? "Le Manager peut consolider les retours et préparer la suite."
        : "Le Manager doit traiter les blocages ou les revues incomplètes avant de présenter le plan comme prêt.",
    };
  },
});
