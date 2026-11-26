import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { buildMissionExecutionPlan, fingerprintMissionPlan, taskRoles } from "../utils/mission-planner.js";

export default defineWorkflowTool({
  description:
    "Validate and schedule a multi-agent Coach In mission before any delegation. Detects missing dependencies, cycles, duplicate IDs, unsafe QA order and overlapping file scopes; returns safe parallel waves and explicit serialization dependencies. Planning only: it does not call agents or modify files.",
  inputSchema: z.object({
    missionId: z.string().min(3).max(80),
    title: z.string().min(3).max(240),
    tasks: z.array(z.object({
      taskId: z.string().min(3).max(80),
      objective: z.string().min(8).max(12000),
      role: z.enum(taskRoles),
      dependsOn: z.array(z.string().min(3).max(80)).max(12).default([]),
      writeScope: z.array(z.string().min(1).max(240)).max(40).default([]),
      baseRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/).refine((value) => !value.includes("..") && !value.endsWith("/") && !value.endsWith(".")).optional(),
      workBranch: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/).refine((value) => !value.includes("..") && !value.endsWith("/") && !value.endsWith(".")).optional(),
      worktreePath: z.string().regex(/^\/workspace\/coach-in-worktrees\/[a-z0-9][a-z0-9._-]{1,60}$/).optional(),
      acceptanceCriteria: z.array(z.string().min(3).max(500)).min(1).max(12)
        .refine((criteria) => new Set(criteria.map((item) => item.trim())).size === criteria.length, "Les critères d’acceptation doivent être uniques."),
    })).min(1).max(20),
  }),
  async execute({ missionId, title, tasks }) {
    "use workflow";

    const plan = buildMissionExecutionPlan(tasks.map(({ taskId, role, dependsOn, writeScope, baseRef, workBranch, worktreePath }) => ({
      taskId,
      role,
      dependsOn,
      writeScope,
      baseRef,
      workBranch,
      worktreePath,
    })));

    if (!plan.valid) {
      return {
        missionId,
        title,
        status: "blocked",
        errors: plan.errors,
        message: "Aucune tâche ne doit être déléguée avant correction du graphe de dépendances et des périmètres.",
      };
    }

    const taskDetailsById = new Map(tasks.map((task) => [task.taskId, task]));
    return {
      missionId,
      title,
      status: "planned",
      planChecksum: fingerprintMissionPlan(missionId, title, tasks),
      waves: plan.waves,
      tasks: plan.tasks.map((task) => ({
        ...task,
        objective: taskDetailsById.get(task.taskId)!.objective,
        acceptanceCriteria: taskDetailsById.get(task.taskId)!.acceptanceCriteria,
      })),
      instructions: [
        "Pour chaque tâche développeur et QA, renseigner dans le plan un baseRef vérifié commun, une branche unique et un worktreePath unique sous /workspace/coach-in-worktrees/ ; la QA utilise son worktree d’intégration dédié.",
        "Transmettre à team_task le plan complet et son planChecksum exactement tels que retournés ; ne pas modifier les objectifs, critères, branches, baseRef ou chemins après validation.",
        "Déléguer uniquement les tâches de la vague courante.",
        "Attendre les résultats réels et les preuves avant la vague suivante.",
        "Pour chaque tâche, transmettre le plan complet et le taskId à team_task, avec les dependencyResults correspondant aux executionDependsOn recalculés depuis le plan.",
        "Les tâches sérialisées à cause d'un chevauchement de fichiers reçoivent la sortie du prédécesseur avant de commencer ; le Manager intègre et vérifie le diff dans le nouveau worktree avant la délégation suivante.",
        "Après tous les développeurs, le Manager consolide les diffs vérifiés dans un worktree d’intégration dédié ; QA teste ce worktree en lecture seule, puis review_task reçoit le diff consolidé et les preuves collectées.",
      ],
    };
  },
});
