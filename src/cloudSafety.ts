import type { Memory } from "./types";

const highSeverityWarnings = new Set([
  "API key redacted",
  "token redacted",
  "password redacted",
  "private key redacted",
  ".env value redacted",
  "database URL redacted",
  "high entropy secret redacted"
]);

export function assertCanSync(memory: Memory): void {
  if (!memory.privacy.public_safe) {
    throw new Error(`Memory ${memory.id} is not public-safe and will not be synced.`);
  }

  const highWarnings = memory.privacy.redaction_warnings.filter((warning) => highSeverityWarnings.has(warning));
  if (highWarnings.length > 0) {
    throw new Error(`Memory ${memory.id} has high-severity redaction warnings: ${highWarnings.join(", ")}`);
  }
}
