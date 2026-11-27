import assert from "node:assert/strict";
import test from "node:test";
import { capPrompt, compactPromptText, estimatePromptTokens } from "./context-budget.ts";

test("keeps short context unchanged", () => {
  assert.equal(compactPromptText("  contexte utile  ", 100), "contexte utile");
});

test("compacts oversized context while preserving its beginning and end", () => {
  const source = "A".repeat(500) + "IMPORTANT_END";
  const result = compactPromptText(source, 120, "test");
  assert.ok(result.length <= 120);
  assert.ok(result.startsWith("A"));
  assert.ok(result.endsWith("IMPORTANT_END"));
  assert.match(result, /réduit pour respecter le budget/);
});

test("caps a complete prompt to the requested character budget", () => {
  const result = capPrompt("x".repeat(2000), 300);
  assert.ok(result.length <= 300);
  assert.ok(result.includes("requête"));
});

test("provides a conservative deterministic token estimate", () => {
  assert.equal(estimatePromptTokens("12345678"), 3);
});
