import { get, list, put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

const PREFIX = "coach-in-manager/projects/coach-in/missions/";
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

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), record: missionSchema }),
  z.object({ action: z.literal("list"), limit: z.number().int().min(1).max(50).optional() }),
  z.object({
    action: z.literal("read"),
    pathname: z.string().min(1).max(500),
  }),
]);

export default defineWorkflowTool({
  description:
    "Read and write durable Coach In Manager project mission records in a private Vercel Blob store. Use list at the start of non-trivial missions, read relevant records, and save a structured record at completion. Store project facts only: never secrets, credentials, player personal data, or private coaching notes. The store is private and the tool is available only to authenticated Manager sessions.",
  inputSchema,
  async execute(input) {
    "use workflow";

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return { status: "unavailable", message: "Le stockage mémoire privé n'est pas configuré dans cet environnement." };
    }

    try {
      if (input.action === "save") {
        const pathname = `${PREFIX}${input.record.missionId}/${Date.now()}-${nanoid(10)}.json`;
        const blob = await put(pathname, JSON.stringify({
          schemaVersion: 1,
          savedAt: new Date().toISOString(),
          ...input.record,
        }), {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: "application/json",
        });
        return { status: "saved", missionId: input.record.missionId, pathname: blob.pathname, savedAt: new Date().toISOString() };
      }

      if (input.action === "list") {
        const result = await list({ prefix: PREFIX, limit: input.limit ?? 20 });
        const blobs = [...result.blobs]
          .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
          .map((blob) => ({
            pathname: blob.pathname,
            uploadedAt: blob.uploadedAt.toISOString(),
            size: blob.size,
          }));
        return { status: "listed", count: blobs.length, hasMore: Boolean(result.cursor), records: blobs };
      }

      if (!input.pathname.startsWith(PREFIX) || input.pathname.includes("..") || !input.pathname.endsWith(".json")) {
        return { status: "blocked", message: "Chemin mémoire hors du périmètre projet autorisé." };
      }
      const result = await get(input.pathname, { access: "private" });
      if (!result || result.statusCode !== 200) {
        return { status: "not_found", pathname: input.pathname };
      }
      const text = await new Response(result.stream).text();
      const parsed = JSON.parse(text);
      return { status: "read", pathname: input.pathname, record: parsed };
    } catch (error) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : "Erreur inconnue du stockage mémoire.",
      };
    }
  },
});
