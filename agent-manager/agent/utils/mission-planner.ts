export const taskRoles = [
  "product_owner",
  "solution_architect",
  "frontend_developer",
  "backend_developer",
  "qa_engineer",
  "release_manager",
  "documentation_specialist",
] as const;

export type MissionTask = {
  taskId: string;
  role: typeof taskRoles[number];
  dependsOn: string[];
  writeScope: string[];
  baseRef?: string;
  workBranch?: string;
  worktreePath?: string;
};

const sandboxRoles = new Set(["frontend_developer", "backend_developer", "qa_engineer"]);
const worktreePathPattern = /^\/workspace\/coach-in-worktrees\/[a-z0-9][a-z0-9._-]{1,60}$/;
const gitRefPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/;

function validGitRef(value: string | undefined): boolean {
  return Boolean(value && gitRefPattern.test(value) && !value.includes("..") && !value.endsWith("/") && !value.endsWith("."));
}

function normalizeScope(scope: string): string | null {
  const value = scope.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
  if (!value || value.startsWith("/") || /[*?]/.test(value) || value === "." || value.split("/").some((part) => part === ".." || part === ".")) {
    return null;
  }
  return value;
}

function scopesOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export function buildMissionExecutionPlan(tasks: MissionTask[]) {
  const errors: string[] = [];
  const ids = tasks.map((task) => task.taskId);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) errors.push(`Identifiants de tâche dupliqués : ${duplicates.join(", ")}.`);

  const byId = new Map(tasks.map((task) => [task.taskId, task]));
  for (const task of tasks) {
    const duplicateDependencies = [...new Set(task.dependsOn.filter((id, index, all) => all.indexOf(id) !== index))];
    if (duplicateDependencies.length) errors.push(`${task.taskId} déclare des dépendances dupliquées : ${duplicateDependencies.join(", ")}.`);
    const missing = task.dependsOn.filter((id) => !byId.has(id));
    if (missing.length) errors.push(`${task.taskId} dépend de tâches inconnues : ${missing.join(", ")}.`);
    if (task.dependsOn.includes(task.taskId)) errors.push(`${task.taskId} dépend d'elle-même.`);

    const normalized = task.writeScope.map(normalizeScope);
    if (normalized.some((item) => item === null)) errors.push(`${task.taskId} contient un chemin de modification invalide.`);
    if (new Set(normalized).size !== normalized.length) errors.push(`${task.taskId} répète un chemin dans son périmètre.`);

    if (task.role === "frontend_developer" || task.role === "backend_developer") {
      if (task.writeScope.length === 0) errors.push(`${task.taskId} doit déclarer son périmètre de fichiers.`);
    } else if (task.writeScope.length > 0) {
      errors.push(`${task.taskId} (${task.role}) ne peut pas déclarer un périmètre d'écriture dans ce plan.`);
    }

    if (sandboxRoles.has(task.role)) {
      if (!validGitRef(task.baseRef)) errors.push(`${task.taskId} doit déclarer un baseRef Git valide.`);
      if (!validGitRef(task.workBranch)) errors.push(`${task.taskId} doit déclarer une branche de travail valide.`);
      else if (task.workBranch && (task.workBranch === task.baseRef || ["main", "master", "production", "prod"].includes(task.workBranch.toLowerCase()))) errors.push(`${task.taskId} ne peut pas utiliser la branche de base ou une branche protégée comme branche de travail.`);
      if (!task.worktreePath || !worktreePathPattern.test(task.worktreePath)) errors.push(`${task.taskId} doit déclarer un chemin de worktree dédié et autorisé.`);
    } else if (task.baseRef || task.workBranch || task.worktreePath) {
      errors.push(`${task.taskId} ne peut pas réserver de worktree pour ce rôle.`);
    }

    if (task.role === "qa_engineer") {
      const hasDeveloperDependency = task.dependsOn.some((id) => {
        const dependency = byId.get(id);
        return dependency?.role === "frontend_developer" || dependency?.role === "backend_developer";
      });
      if (!hasDeveloperDependency) errors.push(`${task.taskId} (QA) doit dépendre d'au moins une tâche développeur.`);
    }
  }

  const sandboxTasks = tasks.filter((task) => sandboxRoles.has(task.role));
  const worktreePaths = sandboxTasks.map((task) => task.worktreePath).filter((value): value is string => Boolean(value));
  const workBranches = sandboxTasks.map((task) => task.workBranch).filter((value): value is string => Boolean(value));
  if (new Set(worktreePaths).size !== worktreePaths.length) errors.push("Chaque tâche développeur et QA doit avoir un chemin de worktree unique.");
  if (new Set(workBranches).size !== workBranches.length) errors.push("Chaque tâche développeur et QA doit avoir une branche Git unique.");
  const baseRefs = [...new Set(sandboxTasks.map((task) => task.baseRef).filter((value): value is string => Boolean(value)))];
  if (baseRefs.length > 1) errors.push("Toutes les tâches sandbox doivent partir du même baseRef vérifié.");

  const developers = tasks.filter((task) => task.role === "frontend_developer" || task.role === "backend_developer");
  const architects = tasks.filter((task) => task.role === "solution_architect");
  if (developers.length > 1 && architects.length === 0) {
    errors.push("Une mission avec plusieurs développeurs doit inclure une tâche Architecte.");
  } else if (developers.length > 1 && !developers.every((developer) => architects.some((architect) => developer.dependsOn.includes(architect.taskId)))) {
    errors.push("Chaque développeur d'une mission multi-développeurs doit dépendre de l'Architecte.");
  }

  const qaTasks = tasks.filter((task) => task.role === "qa_engineer");
  if (developers.length > 0 && qaTasks.length === 0) {
    errors.push("Une mission avec du développement doit inclure une tâche QA.");
  } else if (developers.length > 0 && !qaTasks.every((qa) => developers.every((developer) => qa.dependsOn.includes(developer.taskId)))) {
    errors.push("Une tâche QA doit dépendre de toutes les tâches développeur pour tester l'intégration complète.");
  }

  if (errors.length) return { valid: false as const, errors, waves: [], tasks: [] };

  const completed = new Set<string>();
  const serializationDependencies = new Map<string, Set<string>>();
  const waves: string[][] = [];

  while (completed.size < tasks.length) {
    const ready = tasks.filter((task) =>
      !completed.has(task.taskId) &&
      task.dependsOn.every((dependency) => completed.has(dependency)) &&
      [...(serializationDependencies.get(task.taskId) ?? [])].every((dependency) => completed.has(dependency))
    );

    if (ready.length === 0) {
      const pending = tasks.filter((task) => !completed.has(task.taskId)).map((task) => task.taskId);
      errors.push(`Cycle de dépendances détecté ou graphe impossible à ordonnancer : ${pending.join(", ")}.`);
      return { valid: false as const, errors, waves: [], tasks: [] };
    }

    const wave: MissionTask[] = [];
    for (const task of ready) {
      const conflict = wave.find((selected) =>
        task.writeScope.some((left) =>
          selected.writeScope.some((right) => scopesOverlap(normalizeScope(left)!, normalizeScope(right)!))
        )
      );
      if (conflict) {
        const dependencies = serializationDependencies.get(task.taskId) ?? new Set<string>();
        dependencies.add(conflict.taskId);
        serializationDependencies.set(task.taskId, dependencies);
      } else {
        wave.push(task);
      }
    }

    if (wave.length === 0) {
      errors.push("Aucune tâche ne peut être planifiée dans la vague courante.");
      return { valid: false as const, errors, waves: [], tasks: [] };
    }

    waves.push(wave.map((task) => task.taskId));
    for (const task of wave) completed.add(task.taskId);
  }

  const plannedTasks = tasks.map((task) => {
    const serializedAfter = [...(serializationDependencies.get(task.taskId) ?? [])];
    return {
      ...task,
      serializationDependencies: serializedAfter,
      executionDependsOn: [...new Set([...task.dependsOn, ...serializedAfter])],
    };
  });

  return { valid: true as const, errors: [], waves, tasks: plannedTasks };
}
