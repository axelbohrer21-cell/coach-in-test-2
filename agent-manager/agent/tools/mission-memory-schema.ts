import { z } from "zod";

const missionSchema = z.object({
  missionId: z.string().regex(/^[a-zA-Z0-9_-]{3,80}$/),
  title: z.string().min(3).max(240),
  status: z.enum(["planned", "in_progress", "completed", "blocked", "abandoned"]),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  tasks: z.array(z.object({
    taskId: z.string().min(3).max(80),
    role: z.string().min(2).max(80),
    status: z.enum(["completed", "blocked", "failed", "needs_input", "not_started"]),
    summary: z.string().max(3000),
    deliverables: z.array(z.string().max(500)).max(20),
    evidence: z.array(z.string().max(1000)).max(20),
  })).max(40),
  decisions: z.array(z.string().max(1000)).max(30),
  tests: z.array(z.object({
    name: z.string().max(200),
    status: z.enum(["passed", "failed", "not_run"]),
    evidence: z.string().max(1000),
  })).max(40),
  learnings: z.array(z.object({
    statement: z.string().max(1000),
    source: z.string().max(1000),
    validated: z.boolean(),
  })).max(30),
  nextStep: z.string().max(1000),
}).strict();

export const missionMemoryInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), record: missionSchema }),
  z.object({ action: z.literal("list"), limit: z.number().int().min(1).max(50).optional() }),
  z.object({
    action: z.literal("read"),
    pathname: z.string().min(1).max(500),
  }),
]);

export type MissionMemoryInput = z.infer<typeof missionMemoryInputSchema>;
