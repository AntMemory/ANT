import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { initDatabase, listMemories, saveMemory } from "../src/db";
import { createMemory } from "../src/schema";
import type { NewMemoryInput } from "../src/types";

const cliPath = path.join(process.cwd(), "src", "cli.ts");
const tsxPath = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.cjs");

test("exact duplicate is merged", async () => {
  const dbPath = tempDb();
  await initDatabase(dbPath);
  const first = await saveMemory(createMemory(memory("Exact duplicate")), { dbPath });
  const second = await saveMemory(createMemory(memory("Exact duplicate")), { dbPath });

  const memories = await listMemories(dbPath);
  assert.equal(memories.length, 1);
  assert.equal(second.merged, true);
  assert.equal(second.memory.id, first.memory.id);
});

test("near duplicate is merged", async () => {
  const dbPath = tempDb();
  await initDatabase(dbPath);
  await saveMemory(createMemory(memory("Canonical", { solution: { steps: ["Run prisma generate"] } })), { dbPath });
  const second = await saveMemory(
    createMemory(
      memory("Near duplicate", {
        cause: "Prisma generated cache stayed stale after schema edits.",
        solution: { steps: ["Clear generated cache", "Run prisma generate"] }
      })
    ),
    { dbPath }
  );

  const memories = await listMemories(dbPath);
  assert.equal(memories.length, 1);
  assert.equal(second.merged, true);
  assert.ok(memories[0].solution.steps.includes("Clear generated cache"));
});

test("different package version is not merged", async () => {
  const dbPath = tempDb();
  await initDatabase(dbPath);
  await saveMemory(createMemory(memory("Prisma 5", { package_version: "5.12.0" })), { dbPath });
  await saveMemory(createMemory(memory("Prisma 6", { package_version: "6.0.0" })), { dbPath });

  assert.equal((await listMemories(dbPath)).length, 2);
});

test("--force-new creates a separate memory", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-force-new-"));
  const firstPath = path.join(cwd, "first.json");
  const secondPath = path.join(cwd, "second.json");
  fs.writeFileSync(firstPath, JSON.stringify(memory("Force first"), null, 2));
  fs.writeFileSync(secondPath, JSON.stringify(memory("Force second"), null, 2));

  assert.equal(runCli(["init"], cwd).status, 0);
  assert.equal(runCli(["remember", "--json", firstPath], cwd).status, 0);
  assert.equal(runCli(["remember", "--json", secondPath, "--force-new"], cwd).status, 0);
  const inspect = runCli(["inspect"], cwd);

  assert.equal((inspect.stdout.match(/^Title:/gm) ?? []).length, 2);
});

function tempDb(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ant-dedupe-")), "memory.sqlite");
}

type CliResult = ReturnType<typeof spawnSync> & { stdout: string; stderr: string };

function runCli(args: string[], cwd: string): CliResult {
  return spawnSync(process.execPath, [tsxPath, cliPath, ...args], { cwd, encoding: "utf8" }) as CliResult;
}

function memory(
  title: string,
  overrides: { cause?: string; package_version?: string; solution?: Partial<NewMemoryInput["solution"]> } = {}
): NewMemoryInput {
  return {
    title,
    problem: "Prisma generate failed because the generated client cache was stale.",
    error_signature: "PrismaClientInitializationError: generated client cache stale",
    context: {
      language: "TypeScript",
      framework: "Next.js",
      package_name: "prisma",
      package_version: overrides.package_version ?? "5.12.0",
      runtime: "Node 20",
      os: "Linux",
      tool: "ANT"
    },
    cause: overrides.cause ?? "The Prisma generated client cache was stale after schema changes.",
    solution: {
      summary: "Clear generated artifacts and run prisma generate.",
      steps: overrides.solution?.steps ?? ["Clear generated cache", "Run prisma generate"],
      commands: ["npx prisma generate"],
      patch_example: "npx prisma generate",
      ...overrides.solution
    },
    evidence: {
      verification_type: "build_passed",
      commands_run: ["npx prisma generate", "npm run build"]
    },
    privacy: {
      redacted: true,
      public_safe: true,
      redaction_warnings: []
    }
  };
}
