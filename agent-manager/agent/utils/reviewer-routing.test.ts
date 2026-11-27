import assert from "node:assert/strict";
import test from "node:test";
import { selectReviewers } from "./reviewer-routing.ts";

test("ajoute l'expert tennis pour une règle de réservation", () => {
  const result = selectReviewers("Modifier le planning et les réservations joueurs");
  assert.deepEqual(result.reviewers, ["tennis_expert"]);
  assert.ok(!result.reviewers.includes("data_security_reviewer"));
});

test("ajoute UX pour une tâche d'interface mobile", () => {
  const result = selectReviewers("Corriger l'affichage responsive sur iPhone");
  assert.deepEqual(result.reviewers, ["ux_reviewer"]);
});

test("ajoute sécurité pour les permissions et l'isolation", () => {
  const result = selectReviewers("Sécuriser l'authentification et l'isolation multi-coach");
  assert.deepEqual(result.reviewers, ["data_security_reviewer"]);
});

test("garde QA seul pour une tâche générique", () => {
  assert.deepEqual(selectReviewers("Mettre à jour une note interne").reviewers, ["qa_reviewer"]);
});

test("analyse aussi le contexte fourni", () => {
  const result = selectReviewers("Refactoriser un service", "Le service écrit dans Supabase avec RLS");
  assert.ok(result.reviewers.includes("data_security_reviewer"));
});


test("ajoute l'expert Supabase pour une migration SQL", () => {
  const result = selectReviewers("Créer une migration SQL pour une RPC Supabase");
  assert.deepEqual(result.reviewers, ["supabase_expert"]);
});

test("limite la revue à un expert de domaine et donne priorité à la sécurité", () => {
  const result = selectReviewers("Modifier les policies RLS sur Supabase pour isoler les notes privées");
  assert.deepEqual(result.reviewers, ["data_security_reviewer"]);
});

test("ne lance qu’un seul expert même si une tâche touche plusieurs domaines", () => {
  const result = selectReviewers("Refondre l’interface mobile du planning tennis");
  assert.deepEqual(result.reviewers, ["tennis_expert"]);
});
