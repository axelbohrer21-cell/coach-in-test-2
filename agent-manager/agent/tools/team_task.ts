import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { validateDependencyHandoff, validateTaskCompletion } from "../utils/coordination.js";
import { buildMissionExecutionPlan, taskRoles } from "../utils/mission-planner.js";

const codeRoles = new Set(["frontend_developer", "backend_developer"]);
const sandboxRoles = new Set(["frontend_developer", "backend_developer", "qa_engineer"]);

const dependencyResultSchema = z.object({
  taskId: z.string().min(3).max(80),
  status: z.enum(["completed", "blocked", "failed", "needs_input"]),
  summary: z.string().min(1),
  deliverables: z.array(z.string().min(1)).min(1),
  evidence: z.array(z.string()),
});

const workSchema = z.object({
  status: z.enum(["completed", "blocked", "failed", "needs_input", "not_started"]),
  summary: z.string().min(1),
  deliverables: z.array(z.string().min(1)).min(1),
  filesChanged: z.array(z.string().min(1)),
  commandsRun: z.array(z.object({
    command: z.string().min(1),
    exitCode: z.number().int().nullable(),
    result: z.string().min(1),
  })),
  tests: z.array(z.object({
    name: z.string().min(1),
    status: z.enum(["passed", "failed", "not_run"]),
    evidence: z.string().min(1),
  })),
  criteriaResults: z.array(z.object({
    criterion: z.string().min(1),
    status: z.enum(["met", "not_met", "not_verified"]),
    evidence: z.string().min(1),
  })),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
  approvalsRequired: z.array(z.string()),
  nextStep: z.string(),
});

export default defineWorkflowTool({
  description:
    "Delegate one bounded Coach In task from a validated mission plan to the product owner, solution architect, frontend developer, backend developer, QA engineer, release manager, or documentation specialist. Code agents work only in the isolated shared sandbox and exact worktree supplied; QA is configured for test-only execution and its worktree status must be checked by the Manager. None can push, commit, deploy, or access production.",
  inputSchema: z.object({
    missionId: z.string().min(3).max(80),
    taskId: z.string().min(3).max(80),
    missionPlan: z.object({
      missionId: z.string().min(3).max(80),
      title: z.string().min(3).max(240),
      tasks: z.array(z.object({
        taskId: z.string().min(3).max(80),
        objective: z.string().min(8).max(12000),
        role: z.enum(taskRoles),
        dependsOn: z.array(z.string().min(3).max(80)).max(12),
        writeScope: z.array(z.string().min(1).max(240)).max(40),
        acceptanceCriteria: z.array(z.string().min(3).max(500)).min(1).max(12),
      })).min(1).max(20),
    }),
    dependencyResults: z.array(dependencyResultSchema).max(12).optional(),
    context: z.string().max(16000).optional(),
    baseRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/)
      .refine((value) => !value.includes("..") && !value.endsWith("/") && !value.endsWith("."), "Invalid git ref").optional(),
    workBranch: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/)
      .refine((value) => !value.includes("..") && !value.endsWith("/") && !value.endsWith("."), "Invalid branch name").optional(),
    worktreePath: z.string().regex(/^\/workspace\/coach-in-worktrees\/[a-z0-9][a-z0-9._-]{1,60}$/).optional(),
  }),
  async execute({ missionId, taskId, missionPlan, dependencyResults, context, baseRef, workBranch, worktreePath }, ctx) {
    "use workflow";

    if (missionPlan.missionId !== missionId) {
      return { missionId, taskId, status: "blocked", message: "Le missionId ne correspond pas au plan validé." };
    }

    const executionPlan = buildMissionExecutionPlan(missionPlan.tasks.map(({ taskId: id, role: taskRole, dependsOn, writeScope }) => ({
      taskId: id,
      role: taskRole,
      dependsOn,
      writeScope,
    })));
    if (!executionPlan.valid) {
      return { missionId, taskId, status: "blocked", planErrors: executionPlan.errors };
    }

    const plannedTask = executionPlan.tasks.find((item) => item.taskId === taskId);
    const sourceTask = missionPlan.tasks.find((item) => item.taskId === taskId);
    if (!plannedTask || !sourceTask || plannedTask.role !== sourceTask.role) {
      return { missionId, taskId, status: "blocked", message: "La tâche ou son rôle ne correspond pas au plan de mission." };
    }

    const role = sourceTask.role;
    const task = sourceTask.objective;
    const acceptanceCriteria = sourceTask.acceptanceCriteria;
    const requiredDependencies = plannedTask.executionDependsOn;
    const handoff = validateDependencyHandoff(requiredDependencies, dependencyResults ?? []);

    if (!handoff.valid) {
      return {
        missionId,
        taskId,
        dependsOn: requiredDependencies,
        role,
        status: "blocked",
        message: "Les dépendances doivent être transmises une seule fois, terminées, avec un livrable identifiable et une preuve avant le démarrage de cette tâche.",
        missingOrUnverifiedDependencies: handoff.missingOrUnverifiedDependencies,
        duplicateDependencyIds: handoff.duplicateDependencyIds,
        unexpectedDependencyIds: handoff.unexpectedDependencyIds,
        duplicateRequiredIds: handoff.duplicateRequiredIds,
      };
    }

    if (sandboxRoles.has(role) && (!baseRef || !workBranch || !worktreePath)) {
      return {
        missionId,
        taskId,
        dependsOn: requiredDependencies,
        role,
        status: "blocked",
        message: "Une mission dans le sandbox exige un baseRef vérifié, un nom de branche et un chemin de worktree dédié.",
        required: ["baseRef", "workBranch", "worktreePath"],
      };
    }

    if (!Object.keys(ctx.agents).includes(role)) {
      return {
        missionId,
        taskId,
        dependsOn: requiredDependencies,
        role,
        status: "blocked",
        message: "L'agent demandé n'est pas disponible dans cette version du Manager.",
      };
    }

    let sandboxInstructions = "Aucun accès au dépôt ou aux environnements n'est fourni pour cette mission de conseil.";

    if (codeRoles.has(role)) {
      sandboxInstructions = [
        "REPOSITORY_URL=https://github.com/axelbohrer21-cell/coach-in-test-2.git",
        "REPOSITORY_PATH=/workspace/coach-in",
        `BASE_REF=${baseRef}`,
        `WORK_BRANCH=${workBranch}`,
        `WORKTREE_PATH=${worktreePath}`,
        "Si le dépôt n'existe pas, clone-le depuis REPOSITORY_URL.",
        "Crée le worktree dédié depuis BASE_REF dans WORKTREE_PATH. Ne modifie jamais le checkout principal ni un autre worktree.",
        "Avant toute écriture, vérifie le dépôt, la branche et git status. Si le worktree existe déjà ou contient des changements inattendus, arrête et signale-le.",
        "À la fin, fournis les chemins exacts, git diff --stat, git diff --check et les commandes/tests exécutés avec leurs codes de sortie.",
        "Ne commit jamais, ne push jamais, n'ouvre jamais de PR. Le Manager relira le diff.",
      ].join("\n");
    } else if (role === "qa_engineer") {
      sandboxInstructions = [
        "REPOSITORY_PATH=/workspace/coach-in",
        `BASE_REF=${baseRef}`,
        `WORK_BRANCH=${workBranch}`,
        `WORKTREE_PATH=${worktreePath}`,
        "Le worktree doit déjà exister et contenir les changements à tester. Ne crée pas un nouveau worktree et ne change pas de branche.",
        "Vérifie le dépôt, le chemin et la branche. Si le worktree n'existe pas ou ne correspond pas, renvoie status=blocked.",
        "Exécute les tests et contrôles locaux demandés. Tu es strictement en lecture seule : aucun fichier source ou de test ne doit être modifié.",
        "Après les tests, vérifie git status et confirme que filesChanged est vide.",
      ].join("\n");
    }

    const prompt = [
      "Tu reçois une mission déléguée par Coach In Manager.",
      `MISSION_ID=${missionId ?? "non renseigné"}`,
      `TASK_ID=${taskId ?? "non renseigné"}`,
      `DÉPENDANCES=${requiredDependencies.join(", ") || "aucune déclarée"}`,
      "LIVRABLES ET PREUVES DES DÉPENDANCES :",
      ...(dependencyResults?.length ? dependencyResults.flatMap((item) => [
        `- ${item.taskId} [${item.status}] : ${item.summary}`,
        ...item.deliverables.map((value) => `  Livrable : ${value}`),
        ...item.evidence.map((value) => `  Preuve : ${value}`),
      ]) : ["Aucune dépendance."]),
      "Si un livrable requis manque ou si une preuve est insuffisante, renvoie status=blocked.",
      `RÔLE=${role}`,
      "MISSION :",
      task,
      "",
      "CONTEXTE TRANSMIS :",
      context?.trim() || "Aucun contexte complémentaire.",
      "",
      "CONSIGNES D'ENVIRONNEMENT :",
      sandboxInstructions,
      "",
      "CRITÈRES D’ACCEPTATION :",
      ...(acceptanceCriteria?.length ? acceptanceCriteria.map((criterion, index) => `${index + 1}. ${criterion}`) : ["À préciser par le Manager dans le contexte si nécessaire."]),
      "",
      "RÈGLES COMMUNES :",
      "- Réponds en français.",
      "- N'invente aucune lecture, modification, commande, sortie ou preuve.",
      "- Distingue faits observés, hypothèses et recommandations.",
      "- Aucun accès ni écriture en production, aucune migration distante, aucun déploiement, merge, commit ou push.",
      "- Si un prérequis manque, renvoie status=blocked ou needs_input et explique précisément lequel.",
      "- Pour chaque critère d’acceptation, retourne exactement une entrée dans criteriaResults avec le texte exact, le statut met/not_met/not_verified et une preuve observée. Ne déclare pas completed si un critère n’est pas démontré.",
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

      const completion = validateTaskCompletion(role, result.data, acceptanceCriteria);
      return {
        missionId,
        taskId,
        dependsOn: requiredDependencies,
        role,
        ...result.data,
        status: completion.valid ? result.data.status : "blocked",
        completionGate: completion,
        verification: codeRoles.has(role)
          ? "Compte rendu de développement dans le sandbox, à vérifier indépendamment par le Manager."
          : role === "qa_engineer"
            ? "Tests exécutés dans le sandbox ; le Manager doit confirmer les preuves et le diff."
            : "Avis spécialisé fondé uniquement sur le contexte transmis.",
      };
    } catch (error) {
      return {
        missionId,
        taskId,
        dependsOn: requiredDependencies,
        role,
        status: "failed",
        error: error instanceof Error ? error.message : "Erreur inconnue pendant la délégation.",
      };
    }
  },
});
