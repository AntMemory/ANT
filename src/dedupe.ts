import type { Memory } from "./types";

export type MergeResult = {
  memory: Memory;
  merged: boolean;
  duplicateOf?: string;
};

export type DedupeCandidate = {
  canonical: Memory;
  duplicate: Memory;
  reason: string;
};

export function fingerprintMemory(memory: Memory): string {
  return [
    normalize(memory.error_signature),
    normalize(memory.context.package_name),
    majorMinor(memory.context.package_version),
    normalize(memory.context.framework),
    normalize(memory.context.language),
    keywordSignature(`${memory.cause} ${memory.solution.summary} ${memory.solution.steps.join(" ")}`)
  ].join("|");
}

export function findDuplicate(memory: Memory, existing: Memory[]): DedupeCandidate | undefined {
  const exactFingerprint = fingerprintMemory(memory);
  const exact = existing.find((candidate) => fingerprintMemory(candidate) === exactFingerprint);
  if (exact) {
    return { canonical: exact, duplicate: memory, reason: "exact fingerprint match" };
  }

  return existing
    .map((candidate) => ({
      canonical: candidate,
      duplicate: memory,
      score: similarity(memory, candidate),
      reason: "near fingerprint match"
    }))
    .filter((candidate) => candidate.score >= 0.78)
    .sort((left, right) => right.score - left.score)[0];
}

export function findDuplicates(memories: Memory[]): DedupeCandidate[] {
  const candidates: DedupeCandidate[] = [];
  const canonical: Memory[] = [];

  for (const memory of memories) {
    const duplicate = findDuplicate(memory, canonical);
    if (duplicate) {
      candidates.push(duplicate);
    } else {
      canonical.push(memory);
    }
  }

  return candidates;
}

export function mergeMemories(canonical: Memory, duplicate: Memory): Memory {
  return {
    ...canonical,
    evidence: {
      verification_type: strongestEvidence(canonical.evidence.verification_type, duplicate.evidence.verification_type),
      commands_run: unique([...canonical.evidence.commands_run, ...duplicate.evidence.commands_run])
    },
    context: {
      ...canonical.context,
      package_version: mergeVersions(canonical.context.package_version, duplicate.context.package_version)
    },
    solution: {
      ...canonical.solution,
      steps: unique([...canonical.solution.steps, ...differentSteps(canonical.solution.steps, duplicate.solution.steps)]),
      commands: unique([...canonical.solution.commands, ...duplicate.solution.commands]),
      patch_example: canonical.solution.patch_example || duplicate.solution.patch_example
    },
    privacy: {
      redacted: canonical.privacy.redacted && duplicate.privacy.redacted,
      public_safe: canonical.privacy.public_safe && duplicate.privacy.public_safe,
      redaction_warnings: unique([...canonical.privacy.redaction_warnings, ...duplicate.privacy.redaction_warnings])
    },
    updated_at: newer(canonical.updated_at, duplicate.updated_at)
  };
}

function similarity(left: Memory, right: Memory): number {
  if (normalize(left.context.package_name) !== normalize(right.context.package_name)) return 0;
  if (majorMinor(left.context.package_version) !== majorMinor(right.context.package_version)) return 0;
  if (normalize(left.context.framework) !== normalize(right.context.framework)) return 0;
  if (normalize(left.context.language) !== normalize(right.context.language)) return 0;

  const errorScore = normalize(left.error_signature) === normalize(right.error_signature) ? 0.45 : 0;
  const keywordScore = jaccard(
    keywords(`${left.cause} ${left.solution.summary} ${left.solution.steps.join(" ")}`),
    keywords(`${right.cause} ${right.solution.summary} ${right.solution.steps.join(" ")}`)
  );
  return errorScore + keywordScore * 0.55;
}

function differentSteps(existing: string[], incoming: string[]): string[] {
  return incoming.filter((step) => {
    const normalized = normalize(step);
    return !existing.some((candidate) => jaccard(keywords(normalized), keywords(candidate)) > 0.72);
  });
}

function strongestEvidence(left: string, right: string): string {
  return evidenceRank(right) > evidenceRank(left) ? right : left;
}

function evidenceRank(value: string): number {
  const normalized = normalize(value);
  if (normalized.includes("sourceconfirmed")) return 5;
  if (normalized.includes("reproduced")) return 4;
  if (normalized.includes("buildpassed") || normalized.includes("testpassed")) return 3;
  if (normalized.includes("build") || normalized.includes("test")) return 2;
  if (normalized.includes("manual")) return 1;
  return 0;
}

function mergeVersions(left: string, right: string): string {
  return unique(splitVersions(left).concat(splitVersions(right))).join(", ");
}

function splitVersions(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function newer(left: string, right: string): string {
  return Date.parse(right) > Date.parse(left) ? right : left;
}

function keywordSignature(value: string): string {
  return keywords(value).slice(0, 8).join("-");
}

function keywords(value: string): string[] {
  const stop = new Set(["the", "and", "with", "from", "that", "this", "before", "after", "because", "error"]);
  return unique(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !stop.has(word))
  ).sort();
}

function jaccard(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const intersection = left.filter((entry) => rightSet.has(entry)).length;
  return intersection / new Set([...left, ...right]).size;
}

function majorMinor(value: string): string {
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? match[0] : normalize(value);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
