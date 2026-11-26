import assert from "node:assert/strict";
import test from "node:test";
import { selectReviewers } from "./reviewer-routing";

test("ajoute l'expert tennis pour une règle de réservation", () => {
  const result = selectReviewers("Modifier le planning et les réservations joueurs");
  assert.ok(result.reviewers.includes("qa_reviewer"));
  assert.ok(result.reviewers.includes("tennis_expert"));
  assert.ok(!result.reviewers.includes("data_security_reviewer"));
});

test("ajoute UX pour une tâche d'interface mobile", () => {
  const result = selectReviewers("Corriger l'affichage responsive sur iPhone");
  assert.ok(result.reviewers.includes("ux_reviewer"));
  assert.ok(result.reviewers.includes("qa_reviewer"));
});

test("ajoute sécurité pour les permissions et l'isolation", () => {
  const result = selectReviewers("Sécuriser l'authentification et l'isolation multi-coach");
  assert.ok(result.reviewers.includes("data_security_reviewer"));
});

test("garde QA seul pour une tâche générique", () => {
  assert.deepEqual(selectReviewers("Mettre à jour une note interne").reviewers, ["qa_reviewer"]);
});

test("analyse aussi le contexte fourni", () => {
  const result = selectReviewers("Refactoriser un service", "Le service écrit dans Supabase avec RLS");
  assert.ok(result.reviewers.includes("data_security_reviewer"));
});
