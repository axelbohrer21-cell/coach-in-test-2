/**
 * Small, deterministic prompt-budget helpers for delegated agent calls.
 *
 * Character-based estimates are deliberately conservative heuristics, not a
 * tokenizer. They keep oversized project context from being copied wholesale
 * into every specialist request.
 */
export function estimatePromptTokens(value: string): number {
  return Math.ceil(value.length / 3.5);
}

export function compactPromptText(value: string | undefined, maxChars: number, label = "contexte"): string {
  const normalized = value?.trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;

  const marker = `\n[… ${label} réduit pour respecter le budget de contexte …]\n`;
  const available = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(available * 0.72);
  const tail = available - head;
  return `${normalized.slice(0, head)}${marker}${tail > 0 ? normalized.slice(-tail) : ""}`;
}

export function capPrompt(value: string, maxChars: number): string {
  return compactPromptText(value, maxChars, "requête");
}
