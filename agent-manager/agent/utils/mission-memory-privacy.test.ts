import assert from "node:assert/strict";
import test from "node:test";
import { findSensitiveProjectData } from "./mission-memory-privacy.ts";
import { missionMemoryInputSchema } from "./mission-memory-schema.ts";

test("repère une adresse e-mail dans un livrable", () => {
  assert.deepEqual(
    findSensitiveProjectData({ tasks: [{ deliverables: ["contact: coach@example.fr"] }] }),
    { path: "record.tasks[0].deliverables[0]", kind: "email" },
  );
});

test("repère un token ou un secret dans les décisions", () => {
  assert.equal(
    findSensitiveProjectData({ decisions: ["API_KEY=sk_test_verylongsecretvalue"] })?.kind,
    "api_key_assignment",
  );
});

test("accepte les notes de projet ordinaires", () => {
  assert.equal(
    findSensitiveProjectData({ title: "Amélioration du calendrier coach", nextStep: "Ajouter les tests de réservation" }),
    null,
  );
});


test("repère également un numéro de téléphone français et un token Bearer", () => {
  assert.equal(findSensitiveProjectData({ note: "06 12 34 56 78" })?.kind, "telephone");
  assert.equal(findSensitiveProjectData({ note: "Authorization: Bearer abcdefghijklmnop123456" })?.kind, "bearer_token");
});


const validMission = {
  missionId: "mission-123",
  title: "Amélioration du Manager",
  status: "completed" as const,
  tasks: [{
    taskId: "task-123",
    role: "solution_architect",
    status: "completed" as const,
    summary: "Contrat de coordination défini",
    deliverables: ["agent-cooperation.md"],
    evidence: ["Revue du protocole"],
  }],
  decisions: ["Conserver la séparation des rôles"],
  tests: [{ name: "coordination", status: "passed" as const, evidence: "8/8" }],
  learnings: [{ statement: "Les dépendances doivent être explicites", source: "Tests de coordination", validated: true }],
  nextStep: "Contrôler la Preview",
};

test("le schéma de sauvegarde refuse une adresse e-mail personnelle", () => {
  const result = missionMemoryInputSchema.safeParse({
    action: "save",
    record: { ...validMission, decisions: ["Contact joueur: joueur@example.fr"] },
  });
  assert.equal(result.success, false);
});

test("le schéma accepte une sauvegarde de mission sans donnée sensible détectée", () => {
  const result = missionMemoryInputSchema.safeParse({ action: "save", record: validMission });
  assert.equal(result.success, true);
});

test("la liste mémoire accepte pagination et filtre de mission", () => {
  const result = missionMemoryInputSchema.safeParse({
    action: "list",
    limit: 10,
    cursor: "cursor-token",
    missionId: "mission-123",
  });
  assert.equal(result.success, true);
});
