import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { buildMissionExecutionPlan, taskRoles } from "../utils/mission-planner.js";

export default defineWorkflowTool({
  description:
    "Validate and schedule a multi-agent Coach In mission before any delegation. Detects missing dependencies, cycles, duplicate IDs, unsafe QA order and overlapping file scopes; returns safe parallel waves and explicit serialization dependencies. Planning only: it does not call agents or modify files.",
  inputSchema: z.object({
    missionId: z.string().min(3).max(80),
    title: z.string().min(3).max(240),
    tasks: z.array(z.object({
      taskId: z.string().min(3).max(80),
      role: z.enum(taskRoles),
      dependsOn: z.array(z.string().min(3).max(80)).max(12).default([]),
      writeScope: z.array(z.string().min(1).max(240)).max(40).default([]),
      acceptanceCriteria: z.array(z.string().min(3).max(500)).min(1).max(12)
        .refine((criteria) => new Set(criteria.map((item) => item.trim())).size === criteria.length, "Les critères d’acceptation doivent être uniques."),
    })).min(1).max(20),
  }),
  async execute({ missionId, title, tasks }) {
    "use workflow";

    const plan = buildMissionExecutionPlan(tasks.map(({ taskId, role, dependsOn, writeScope }) => ({
      taskId,
      role,
      dependsOn,
      writeScope,
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

    const criteriaByTask = new Map(tasks.map((task) => [task.taskId, task.acceptanceCriteria]));
    return {
      missionId,
      title,
      status: "planned",
      waves: plan.waves,
      tasks: plan.tasks.map((task) => ({
        ...task,
        acceptanceCriteria: criteriaByTask.get(task.taskId) ?? [],
      })),
      instructions: [
        "Déléguer uniquement les tâches de la vague courante.",
        "Attendre les résultats réels et les preuves avant la vague suivante.",
        "Pour chaque tâche, transmettre executionDependsOn et les dependencyResults correspondants à team_task.",
        "Les tâches sérialisées à cause d'un chevauchement de fichiers reçoivent la sortie du prédécesseur avant de commencer.",
        "Après les développeurs, lancer QA dans le worktree exact du développeur ; puis lancer review_task avec le diff et les preuves collectées.",
      ],
    };
  },
});
