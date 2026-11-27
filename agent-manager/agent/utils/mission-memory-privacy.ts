const sensitivePatterns = [
  { name: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { name: "telephone", pattern: /(?:\+33|0033|0)[1-9](?:[\s.-]?\d{2}){4}\b/ },
  { name: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: "api_key_assignment", pattern: /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret)\s*[:=]\s*["']?[^\s"']{8,}/i },
  { name: "github_token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { name: "openai_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
];

export function findSensitiveProjectData(value: unknown, path = "record"): { path: string; kind: string } | null {
  if (typeof value === "string") {
    for (const item of sensitivePatterns) {
      if (item.pattern.test(value)) return { path, kind: item.name };
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = findSensitiveProjectData(value[index], `${path}[${index}]`);
      if (match) return match;
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const match = findSensitiveProjectData(child, `${path}.${key}`);
      if (match) return match;
    }
  }

  return null;
}
