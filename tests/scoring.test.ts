import assert from "node:assert/strict";
import { test } from "node:test";
import { rankMemories } from "../src/scoring";
import type { Memory } from "../src/types";

test("exact error match ranks above vague semantic match", () => {
  const exact = memory("exact", {
    title: "Fix Next.js params",
    error_signature: "Type error: PageProps params Promise"
  });
  const vague = memory("vague", {
    title: "Fix a Next.js build issue",
    problem: "The app had a vague params problem."
  });

  const results = rankMemories([vague, exact], "Type error PageProps params Promise");

  assert.equal(results[0].id, "exact");
  assert.match(results[0].ranking_reason, /error signature match/);
});

test("verified memory ranks above unverified memory", () => {
  const verified = memory("verified", {
    evidence: { verification_type: "test_passed", commands_run: ["npm test"] }
  });
  const unverified = memory("unverified", {
    evidence: { verification_type: "", commands_run: [] }
  });

  const results = rankMemories([unverified, verified], "prisma generate cache");

  assert.equal(results[0].id, "verified");
});

test("worked_count improves ranking", () => {
  const worked = memory("worked", { worked_count: 3 });
  const fresh = memory("fresh");

  const results = rankMemories([fresh, worked], "prisma generate cache");

  assert.equal(results[0].id, "worked");
  assert.ok(results[0].score > results[1].score);
});

test("failed_count lowers ranking", () => {
  const failed = memory("failed", { failed_count: 3 });
  const clean = memory("clean");

  const results = rankMemories([failed, clean], "prisma generate cache");

  assert.equal(results[0].id, "clean");
  assert.ok(results[0].score > results[1].score);
});

test("package framework and version match improves ranking", () => {
  const matching = memory("matching", {
    context: { framework: "Next.js", package_name: "next", package_version: "15.x" }
  });
  const generic = memory("generic", {
    context: { framework: "React", package_name: "react", package_version: "18.x" }
  });

  const results = rankMemories([generic, matching], "params promise", {
    framework: "Next.js",
    package_name: "next",
    package_version: "15.x"
  });

  assert.equal(results[0].id, "matching");
});

test("unsafe memories are excluded from global search", () => {
  const safe = memory("safe");
  const unsafe = memory("unsafe", {
    privacy: { redacted: true, public_safe: false, redaction_warnings: ["email redacted"] }
  });

  const results = rankMemories([unsafe, safe], "prisma generate cache", {}, { global: true });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, "safe");
});

function memory(
  id: string,
  overrides: Partial<Memory> & { worked_count?: number; failed_count?: number } = {}
): Memory & { worked_count?: number; failed_count?: number } {
  const now = new Date().toISOString();
  const base: Memory & { worked_count?: number; failed_count?: number } = {
    id,
    title: "Prisma generate cache fix",
    problem: "Prisma generate failed because the generated cache was stale.",
    error_signature: "prisma generate cache error",
    context: {
      language: "TypeScript",
      framework: "Next.js",
      package_name: "prisma",
      package_version: "5.x",
      runtime: "Node 20",
      os: "Linux",
      tool: "ANT"
    },
    cause: "Generated Prisma cache was stale.",
    solution: {
      summary: "Clear cache and rerun prisma generate.",
      steps: ["Remove stale generated artifacts", "Run npx prisma generate"],
      commands: ["npx prisma generate"],
      patch_example: "npx prisma generate"
    },
    evidence: {
      verification_type: "manual",
      commands_run: []
    },
    privacy: {
      redacted: true,
      public_safe: true,
      redaction_warnings: []
    },
    created_at: now,
    updated_at: now,
    worked_count: overrides.worked_count,
    failed_count: overrides.failed_count
  };

  return {
    ...base,
    ...overrides,
    context: { ...base.context, ...overrides.context },
    solution: { ...base.solution, ...overrides.solution },
    evidence: { ...base.evidence, ...overrides.evidence },
    privacy: { ...base.privacy, ...overrides.privacy }
  };
}
