import assert from "node:assert/strict";
import test from "node:test";
import { findSensitiveProjectData } from "./mission-memory-privacy.ts";

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
