import type { Memory, MemoryContext } from "./types";

export type RankedMemory = Memory & {
  score: number;
  confidence: "low" | "medium" | "high";
  ranking_reason: string;
  worked_count: number;
  failed_count: number;
};

export type ScoringInput = Memory & {
  worked_count?: number;
  failed_count?: number;
};

export function rankMemories(
  memories: ScoringInput[],
  query: string,
  context: Partial<MemoryContext> = {},
  options: { global?: boolean } = {}
): RankedMemory[] {
  return memories
    .filter((memory) => !options.global || memory.privacy.public_safe)
    .map((memory) => scoreMemory(memory, query, context))
    .filter((memory) => memory.score > 0)
    .sort((left, right) => right.score - left.score);
}

export function scoreMemory(memory: ScoringInput, query: string, context: Partial<MemoryContext> = {}): RankedMemory {
  const factors = scoreFactors(memory, query, context);
  const workedCount = memory.worked_count ?? 0;
  const failedCount = memory.failed_count ?? 0;
  if (factors.text === 0 && factors.error === 0 && factors.context === 0) {
    return {
      ...memory,
      worked_count: workedCount,
      failed_count: failedCount,
      score: 0,
      confidence: "low",
      ranking_reason: "no query or context match"
    };
  }
  const score =
    factors.text * 35 +
    factors.error * 25 +
    factors.context * 15 +
    factors.evidence * 15 +
    Math.min(12, workedCount * 3) -
    Math.min(18, failedCount * 5) +
    factors.freshness * 5;
  const rounded = Number(Math.max(0, Math.min(100, score)).toFixed(1));

  return {
    ...memory,
    worked_count: workedCount,
    failed_count: failedCount,
    score: rounded,
    confidence: confidenceLabel(rounded),
    ranking_reason: rankingReason(factors, workedCount, failedCount)
  };
}

function scoreFactors(memory: Memory, query: string, context: Partial<MemoryContext>) {
  return {
    text: textRelevance(memory, query),
    error: errorSignatureMatch(memory.error_signature, query),
    context: contextMatch(memory, context),
    evidence: evidenceQuality(memory.evidence.verification_type),
    freshness: freshnessBoost(memory.updated_at)
  };
}

function textRelevance(memory: Memory, query: string): number {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return 0;
  }

  const searchable = normalize(
    `${memory.title} ${memory.problem} ${memory.error_signature} ${memory.cause} ${Object.values(memory.context).join(" ")} ${memory.solution.summary} ${memory.solution.steps.join(" ")} ${memory.evidence.verification_type}`
  );
  const matched = terms.filter((term) => searchable.includes(term)).length;
  return matched === terms.length ? 1 : 0;
}

function errorSignatureMatch(errorSignature: string, query: string): number {
  const normalizedError = normalize(errorSignature);
  const normalizedQuery = normalize(query);
  if (!normalizedError || !normalizedQuery) {
    return 0;
  }

  if (normalizedError === normalizedQuery || normalizedQuery.includes(normalizedError)) {
    return 1;
  }

  const errorTerms = tokenize(errorSignature);
  const queryTerms = tokenize(query);
  if (errorTerms.length === 0 || queryTerms.length === 0) {
    return 0;
  }

  const matched = errorTerms.filter((term) => queryTerms.some((queryTerm) => queryTerm.includes(term) || term.includes(queryTerm))).length;
  return matched / errorTerms.length >= 0.75 ? 0.75 : 0;
}

function contextMatch(memory: Memory, context: Partial<MemoryContext>): number {
  const entries = Object.entries(context).filter((entry): entry is [keyof MemoryContext, string] => {
    return typeof entry[1] === "string" && entry[1].trim() !== "";
  });
  if (entries.length === 0) {
    return 0;
  }

  const matched = entries.filter(([key, value]) => normalize(memory.context[key]).includes(normalize(value))).length;
  return matched / entries.length;
}

function evidenceQuality(value: string): number {
  const normalized = normalize(value);
  if (!normalized) {
    return 0;
  }
  if (normalized.includes("sourceconfirmed")) {
    return 1;
  }
  if (normalized.includes("reproduced")) {
    return 0.9;
  }
  if (normalized.includes("buildpassed") || normalized.includes("testpassed")) {
    return 0.8;
  }
  if (normalized.includes("build") || normalized.includes("test")) {
    return 0.75;
  }
  if (normalized.includes("manual")) {
    return 0.45;
  }
  return 0.2;
}

function freshnessBoost(updatedAt: string): number {
  const timestamp = Date.parse(updatedAt);
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (ageDays <= 30) {
    return 1;
  }
  if (ageDays <= 180) {
    return 0.6;
  }
  if (ageDays <= 365) {
    return 0.3;
  }
  return 0;
}

function confidenceLabel(score: number): "low" | "medium" | "high" {
  if (score >= 70) {
    return "high";
  }
  if (score >= 40) {
    return "medium";
  }
  return "low";
}

function rankingReason(
  factors: ReturnType<typeof scoreFactors>,
  workedCount: number,
  failedCount: number
): string {
  const reasons: string[] = [];
  if (factors.error >= 1) {
    reasons.push("exact error signature match");
  } else if (factors.error > 0) {
    reasons.push("near error signature match");
  }
  if (factors.text > 0) {
    reasons.push(`text relevance ${Math.round(factors.text * 100)}%`);
  }
  if (factors.context > 0) {
    reasons.push(`context match ${Math.round(factors.context * 100)}%`);
  }
  if (factors.evidence >= 0.8) {
    reasons.push("strong verification evidence");
  } else if (factors.evidence > 0) {
    reasons.push("some verification evidence");
  }
  if (workedCount > 0) {
    reasons.push(`worked ${workedCount} time${workedCount === 1 ? "" : "s"}`);
  }
  if (failedCount > 0) {
    reasons.push(`failed ${failedCount} time${failedCount === 1 ? "" : "s"}`);
  }
  if (factors.freshness > 0) {
    reasons.push("fresh memory");
  }
  return reasons.join("; ") || "weak text match";
}

function tokenize(value: string): string[] {
  return value
    .split(/\s+/)
    .map((term) => normalize(term))
    .filter(Boolean);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
