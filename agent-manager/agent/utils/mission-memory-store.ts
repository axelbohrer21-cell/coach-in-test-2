import { get, list, put } from "@vercel/blob";
import type { MissionMemoryInput } from "./mission-memory-schema.js";

const PREFIX = "coach-in-manager/projects/coach-in/missions/";

export async function executeMissionMemoryStep(input: MissionMemoryInput) {
  "use step";

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { status: "unavailable", message: "Le stockage mémoire privé n'est pas configuré dans cet environnement." };
  }

  try {
    if (input.action === "save") {
      const pathname = `${PREFIX}${input.record.missionId}/${Date.now()}.json`;
      const savedAt = new Date().toISOString();
      const blob = await put(pathname, JSON.stringify({
        schemaVersion: 1,
        savedAt,
        ...input.record,
      }), {
        access: "private",
        addRandomSuffix: true,
        allowOverwrite: false,
        contentType: "application/json",
      });
      return { status: "saved", missionId: input.record.missionId, pathname: blob.pathname, savedAt };
    }

    if (input.action === "list") {
      const result = await list({ prefix: PREFIX, limit: input.limit ?? 20, cursor: input.cursor });
      const blobs = [...result.blobs]
        .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
        .map((blob) => ({
          pathname: blob.pathname,
          uploadedAt: blob.uploadedAt.toISOString(),
          size: blob.size,
        }));
      return { status: "listed", count: blobs.length, hasMore: Boolean(result.cursor), nextCursor: result.cursor ?? null, records: blobs };
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
}
