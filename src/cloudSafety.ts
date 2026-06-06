import type { Memory } from "./types";
import { redactText } from "./redact";

const highSeverityWarnings = new Set([
  "API key redacted",
  "token redacted",
  "password redacted",
  "private key redacted",
  ".env value redacted",
  "database URL redacted",
  "high entropy secret redacted"
]);

export type PublishReview = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function assertCanSync(memory: Memory): void {
  const review = reviewMemoryForPublish(memory);
  if (!review.ok) {
    throw new Error(`Memory ${memory.id} failed publish review: ${review.errors.join("; ")}`);
  }
}

export function reviewMemoryForPublish(memory: Memory): PublishReview {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!memory.privacy.public_safe) {
    errors.push("memory is not public-safe");
  }

  if (memory.privacy.redaction_warnings.includes("draft incomplete")) {
    errors.push("memory is a draft or incomplete");
  }

  const highWarnings = memory.privacy.redaction_warnings.filter((warning) => highSeverityWarnings.has(warning));
  if (highWarnings.length > 0) {
    errors.push(`high-severity redaction warnings: ${highWarnings.join(", ")}`);
  }

  const redactionProbe = redactText(publishableText(memory));
  if (redactionProbe.redacted) {
    errors.push(`publish review found unredacted private data: ${redactionProbe.warnings.join(", ")}`);
  }

  if (looksIncomplete(memory.cause)) {
    errors.push("cause looks incomplete or placeholder");
  }
  if (looksIncomplete(memory.solution.summary)) {
    errors.push("solution summary looks incomplete or placeholder");
  }
  if (memory.solution.steps.length === 0 || memory.solution.steps.some(looksIncomplete)) {
    errors.push("solution steps are missing or placeholder");
  }
  if (looksIncomplete(memory.evidence.verification_type)) {
    errors.push("evidence verification type is missing or placeholder");
  }
  if (claimsAutomatedVerification(memory.evidence.verification_type) && memory.evidence.commands_run.length === 0) {
    errors.push("automated verification evidence must include commands_run");
  }

  if (!memory.error_signature.trim()) {
    warnings.push("error_signature is empty");
  }

  return { ok: errors.length === 0, errors, warnings };
}

function publishableText(memory: Memory): string {
  return [
    memory.title,
    memory.problem,
    memory.error_signature,
    Object.values(memory.context).join("\n"),
    memory.cause,
    memory.solution.summary,
    memory.solution.steps.join("\n"),
    memory.solution.commands.join("\n"),
    memory.solution.patch_example,
    memory.evidence.verification_type,
    memory.evidence.commands_run.join("\n")
  ].join("\n");
}

function looksIncomplete(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "unknown" ||
    normalized === "n/a" ||
    normalized === "na" ||
    /\b(?:todo|tbd|fixme|placeholder)\b/.test(normalized) ||
    normalized.includes("required before completion") ||
    normalized.startsWith("draft memory")
  );
}

function claimsAutomatedVerification(value: string): boolean {
  const normalized = value.toLowerCase();
  return /\b(?:automated|build|test|passed|reproduced|source_confirmed|source confirmed)\b/.test(normalized);
}
