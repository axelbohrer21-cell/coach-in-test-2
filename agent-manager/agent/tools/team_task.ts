import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

const roles = [
  "product_owner",
  "solution_architect",
  "frontend_developer",
  "backend_developer",
  "release_manager",
  "documentation_specialist",
] as const;

const developmentRoles = new Set(["frontend_developer", "backend_developer"]);

const workSchema = z.object({
  status: z.enum(["completed", "blocked", "needs_input", "not_started"]),
  summary: z.string(),
  deliverables: z.array(z.string()),
  filesChanged: z.array(z.string()),
  commandsRun: z.array(z.object({
    command: z.string(),
    exitCode: z.number().int().nullable(),
    result: z.string(),
  })),
  tests: z.array(z.object({
    name: z.string(),
    status: z.enum(["passed", "failed", "not_run"]),
    evidence: z.string(),
  })),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
  approvalsRequired: z.array(z.string()),
  nextStep: z.string(),
});

export default defineWorkflowTool({
  description:
    "Delegate one bounded Coach In task to the product owner, solution architect, frontend developer, backend developer, release manager, or documentation specialist. Developer agents work only in the isolated shared sandbox and the exact worktree supplied; they cannot push, commit, deploy, or access production.",
  inputSchema: z.object({
    role: z.enum(roles),
    task: z.string().min(8).max(12000),
    context: z.string().max(16000).optional(),
    baseRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/).refine((value) => !value.includes("..") && !value.endsWith("/") && !value.endsWith("."), "Invalid git ref").optional(),
    workBranch: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/).refine((value) => !value.includes("..") && !value.endsWith("/") && !value.endsWith("."), "Invalid branch name").optional(),
    worktreePath: z.string().regex(/^\/workspace\/coach-in-worktrees\/[a-z0-9][a-z0-9._-]{1,60}$/).optional(),
  }),
  async execute({ role, task, context, baseRef, workBranch, worktreePath }, ctx) {
    "use workflow";

    if (developmentRoles.has(role) && (!baseRef || !workBranch || !worktreePath)) {
      return {
        role,
        status: "blocked",
        message: "Une mission de développement exige un baseRef vérifié, un nom de branche et un chemin de worktree dédié.",
        required: ["baseRef", "workBranch", "worktreePath"],
      };
    }

    if (!Object.keys(ctx.agents).includes(role)) {
      return {
        role,
        status: "blocked",
        message: "L'agent demandé n'est pas disponible dans cette version du Manager.",
      };
    }

    const developerContext = developmentRoles.has(role)
      ? [
          "REPOSITORY_URL=https://github.com/axelbohrer21-cell/coach-in-test-2.git",
          "REPOSITORY_PATH=/workspace/coach-in",
          `BASE_REF=${baseRef}`,
          `WORK_BRANCH=${workBranch}`,
          `WORKTREE_PATH=${worktreePath}`,
          "Crée le worktree dédié depuis BASE_REF dans WORKTREE_PATH. Ne modifie jamais le checkout principal ni un autre worktree.",
          "Si le dépôt n'existe pas, clone-le depuis REPOSITORY_URL. Vérifie qu'il s'agit bien du dépôt attendu.",
          "Avant toute écriture, vérifie git status dans le worktree. Si le worktree existe déjà ou contient des changements inattendus, arrête et signale-le.",
          "À la fin, fournis les chemins exacts, git diff --stat, git diff --check et les commandes/tests exécutés avec leurs codes de sortie.",
          "Ne commit jamais, ne push jamais, n'ouvre jamais de PR. Le Manager relira le diff.",
        ].join("\n")
      : "Aucun accès au dépôt ou aux environnements n'est fourni pour cette mission de conseil.";

    const prompt = [
      "Tu reçois une mission déléguée par Coach In Manager.",
      `RÔLE=${role}`,
      "MISSION :",
      task,
      "",
      "CONTEXTE TRANSMIS :",
      context?.trim() || "Aucun contexte complémentaire.",
      "",
      "CONSIGNES D'ENVIRONNEMENT :",
      developerContext,
      "",
      "RÈGLES COMMUNES :",
      "- Réponds en français.",
      "- N'invente aucune lecture, modification, commande, sortie ou preuve.",
      "- Distingue faits observés, hypothèses et recommandations.",
      "- Aucun accès ni écriture en production, aucune migration distante, aucun déploiement, merge, commit ou push.",
      "- Si un prérequis manque, renvoie status=blocked ou needs_input et explique précisément lequel.",
      "- Retourne le résultat structuré demandé par le schéma, avec des tableaux vides si rien ne s'applique.",
    ].join("\n");

    try {
      const response = await ctx.agent(role).send(prompt, {
        outputSchema: workSchema,
        signal: ctx.abortSignal,
      });
      const result = await response.result();

      if (result.status !== "completed") {
        return {
          role,
          status: result.status === "cancelled" ? "cancelled" : "failed",
          error: result.status === "failed"
            ? result.error.message
            : "La mission a été annulée avant la fin.",
        };
      }

      if (!result.data) {
        return {
          role,
          status: "failed",
          error: "L'agent n'a pas retourné le livrable structuré attendu.",
        };
      }

      return {
        role,
        ...result.data,
        verification: developmentRoles.has(role)
          ? "Compte rendu de l'agent, à vérifier indépendamment par le Manager."
          : "Avis spécialisé fondé uniquement sur le contexte transmis.",
      };
    } catch (error) {
      return {
        role,
        status: "failed",
        error: error instanceof Error ? error.message : "Erreur inconnue pendant la délégation.",
      };
    }
  },
});
