#!/usr/bin/env node
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { memoryFromJson, memoryFromLog } from "./input";
import { memoryDraftFromLog } from "./ingest";
import { startAntMcpServer } from "./mcp";
import { redactText } from "./redact";
import { createMemory } from "./schema";
import {
  dedupeMemories,
  defaultDbPath,
  getMemory,
  initDatabase,
  listMemories,
  saveMemory,
  searchMemories,
  updateMemory
} from "./db";
import { markGlobalFailed, markGlobalWorked, searchGlobalMemories, uploadMemory } from "./cloudClient";
import { startCloudServer } from "./cloudServer";
import { assertCanSync } from "./cloudSafety";
import type { RankedCloudMemory } from "./cloudStore";
import type { RankedMemory } from "./scoring";
import type { Memory, NewMemoryInput } from "./types";

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv.slice(2);

  try {
    if (command === "init") {
      const dbPath = defaultDbPath();
      await initDatabase(dbPath);
      console.log(`ANT database ready: ${dbPath}`);
      return;
    }

    if (command === "remember") {
      const memory = createMemory(await readMemoryInput(args));
      const result = await saveMemory(memory, { forceNew: args.includes("--force-new") });
      if (result.merged) {
        console.log(`Merged with existing memory: ${result.memory.title} (${result.memory.id})`);
      } else {
        console.log(`Remembered: ${result.memory.title} (${result.memory.id})`);
      }
      return;
    }

    if (command === "ingest") {
      const filePath = args.find((arg) => !arg.startsWith("--"));
      if (!filePath) {
        throw new Error("Usage: ant ingest <log-file> [--interactive]");
      }

      let memory = memoryDraftFromLog(filePath, fs.readFileSync(filePath, "utf8"));
      if (args.includes("--interactive")) {
        memory = await completeIngestDraft(memory);
      }

      const result = await saveMemory(createMemory(memory));
      console.log(`${args.includes("--interactive") ? "Ingested" : "Draft memory created"}: ${result.memory.title} (${result.memory.id})`);
      if (!result.memory.privacy.public_safe) {
        console.log("Status: pending completion or privacy review");
      }
      return;
    }

    if (command === "drafts") {
      const drafts = (await listMemories()).filter(isDraftMemory);
      printMemories(drafts, "No draft memories.");
      return;
    }

    if (command === "complete") {
      const id = args[0];
      if (!id) {
        throw new Error("Usage: ant complete <draft_id>");
      }

      const draft = await getMemory(id);
      if (!draft) {
        throw new Error(`Draft not found: ${id}`);
      }
      if (!isDraftMemory(draft)) {
        throw new Error(`Memory is not an incomplete draft: ${id}`);
      }

      const completedInput = await completeIngestDraft(draft);
      const completed = createMemory(completedInput);
      await updateMemory(
        {
          ...completed,
          id: draft.id,
          created_at: draft.created_at,
          updated_at: new Date().toISOString()
        }
      );
      console.log(`Completed draft: ${draft.title} (${draft.id})`);
      return;
    }

    if (command === "search") {
      if (args[0] === "--global") {
        const query = args.slice(1).join(" ").trim();
        if (!query) {
          throw new Error("Usage: ant search --global <query>");
        }
        printGlobalMemories((await searchGlobalMemories(query)).memories, `No global memories matched "${query}".`);
        return;
      }

      const query = args.join(" ").trim();
      if (!query) {
        throw new Error("Usage: ant search <query>");
      }

      printMemories(await searchMemories(query), `No memories matched "${query}".`);
      return;
    }

    if (command === "redact") {
      const filePath = args[0];
      if (!filePath) {
        throw new Error("Usage: ant redact <file>");
      }

      const result = redactText(fs.readFileSync(filePath, "utf8"));
      console.log(result.text);
      if (result.warnings.length > 0) {
        console.error(`Warnings: ${result.warnings.join("; ")}`);
      }
      return;
    }

    if (command === "inspect") {
      printMemories(await listMemories(), "No memories saved yet.");
      return;
    }

    if (command === "inspect-pending") {
      const pending = (await listMemories()).filter((memory) => !memory.privacy.public_safe);
      printMemories(pending, "No pending memories.");
      return;
    }

    if (command === "sync") {
      await syncMemories();
      return;
    }

    if (command === "dedupe") {
      const dryRun = args.includes("--dry-run");
      const candidates = await dedupeMemories({ dryRun });
      if (candidates.length === 0) {
        console.log("No duplicate memories found.");
        return;
      }
      for (const candidate of candidates) {
        console.log(`${dryRun ? "Would merge" : "Merged"} ${candidate.duplicate.id} into ${candidate.canonical.id}: ${candidate.reason}`);
      }
      return;
    }

    if (command === "worked") {
      const id = args[0];
      if (!id) {
        throw new Error("Usage: ant worked <memory_id>");
      }
      console.log((await markGlobalWorked(id)).message);
      return;
    }

    if (command === "failed") {
      const id = args[0];
      if (!id) {
        throw new Error("Usage: ant failed <memory_id>");
      }
      console.log((await markGlobalFailed(id)).message);
      return;
    }

    if (command === "mcp") {
      await startAntMcpServer();
      return;
    }

    if (command === "cloud") {
      await startCloudServer();
      return;
    }

    printHelp();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function syncMemories(): Promise<void> {
  const memories = await listMemories();
  let synced = 0;
  let skipped = 0;

  for (const memory of memories) {
    try {
      assertCanSync(memory);
      await uploadMemory(memory);
      synced += 1;
      console.log(`Synced: ${memory.title} (${memory.id})`);
    } catch (error) {
      skipped += 1;
      console.error(`Skipped ${memory.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Sync complete. synced=${synced} skipped=${skipped}`);
}

async function readMemoryInput(args: string[]): Promise<NewMemoryInput> {
  const jsonPath = getFlagValue(args, "--json");
  if (jsonPath) {
    return memoryFromJson(JSON.parse(fs.readFileSync(jsonPath, "utf8")));
  }

  const filePath = getFlagValue(args, "--from-file");
  if (filePath) {
    return memoryFromLog(filePath, fs.readFileSync(filePath, "utf8"));
  }

  const nonFlagArgs = args.filter((arg) => arg !== "--force-new");
  if (nonFlagArgs.length > 0) {
    throw new Error("Usage: ant remember [--json memory.json] [--from-file error.log]");
  }

  return promptForMemory();
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a file path`);
  }

  return value;
}

async function promptForMemory(): Promise<NewMemoryInput> {
  if (!input.isTTY) {
    return promptForMemoryFromLines(fs.readFileSync(0, "utf8").split(/\r?\n/));
  }

  const rl = createInterface({ input, output });

  try {
    const title = await askRequired(rl, "Title");
    const problem = await askRequired(rl, "Problem");
    const error_signature = await askOptional(rl, "Error signature");
    const language = await askOptional(rl, "Language");
    const framework = await askOptional(rl, "Framework");
    const package_name = await askOptional(rl, "Package name");
    const package_version = await askOptional(rl, "Package version");
    const runtime = await askOptional(rl, "Runtime");
    const os = await askOptional(rl, "OS");
    const tool = await askOptional(rl, "Tool");
    const cause = await askRequired(rl, "Cause");
    const summary = await askRequired(rl, "Solution summary");
    const steps = splitList(await askOptional(rl, "Solution steps (semicolon-separated)"));
    const commands = splitList(await askOptional(rl, "Solution commands (semicolon-separated)"));
    const patch_example = await askOptional(rl, "Patch example");
    const verification_type = await askOptional(rl, "Verification type");
    const commands_run = splitList(await askOptional(rl, "Commands run (semicolon-separated)"));
    const redacted = await askBoolean(rl, "Was sensitive data redacted?", true);
    const public_safe = await askBoolean(rl, "Is this public-safe?", false);

    return {
      title,
      problem,
      error_signature,
      context: { language, framework, package_name, package_version, runtime, os, tool },
      cause,
      solution: { summary, steps, commands, patch_example },
      evidence: { verification_type, commands_run },
      privacy: { redacted, public_safe, redaction_warnings: [] }
    };
  } finally {
    rl.close();
  }
}

async function completeIngestDraft(draft: NewMemoryInput): Promise<NewMemoryInput> {
  if (!input.isTTY) {
    return completeIngestDraftFromLines(draft, fs.readFileSync(0, "utf8").split(/\r?\n/));
  }

  const rl = createInterface({ input, output });
  try {
    const cause = await askRequired(rl, "Cause");
    const summary = await askRequired(rl, "Solution summary");
    const steps = splitList(await askRequired(rl, "Solution steps (semicolon-separated)"));
    const commands = splitList(await askOptional(rl, "Solution commands (semicolon-separated)"));
    const patch_example = await askOptional(rl, "Patch example");
    const verification_type = await askRequired(rl, "Evidence / verification type");
    const commands_run = splitList(await askOptional(rl, "Commands run (semicolon-separated)"));
    const public_safe = await askBoolean(rl, "Is this public-safe?", draft.privacy.redaction_warnings.length === 0);

    return completeDraft(draft, cause, summary, steps, commands, patch_example, verification_type, commands_run, public_safe);
  } finally {
    rl.close();
  }
}

function completeIngestDraftFromLines(draft: NewMemoryInput, lines: string[]): NewMemoryInput {
  let index = 0;
  const next = (label: string, required = false): string => {
    const value = (lines[index++] ?? "").trim();
    if (required && !value) {
      throw new Error(`${label} is required`);
    }

    return value;
  };

  return completeDraft(
    draft,
    next("cause", true),
    next("solution.summary", true),
    splitList(next("solution.steps", true)),
    splitList(next("solution.commands")),
    next("solution.patch_example"),
    next("evidence.verification_type", true),
    splitList(next("evidence.commands_run")),
    parseBoolean(next("privacy.public_safe"), draft.privacy.redaction_warnings.length === 0)
  );
}

function completeDraft(
  draft: NewMemoryInput,
  cause: string,
  summary: string,
  steps: string[],
  commands: string[],
  patch_example: string,
  verification_type: string,
  commands_run: string[],
  public_safe: boolean
): NewMemoryInput {
  return {
    ...draft,
    cause,
    solution: { summary, steps, commands, patch_example },
    evidence: { verification_type, commands_run },
    privacy: {
      ...draft.privacy,
      public_safe,
      redaction_warnings: draft.privacy.redaction_warnings.filter((warning) => warning !== "draft incomplete")
    }
  };
}

function isDraftMemory(memory: Memory): boolean {
  return memory.privacy.redaction_warnings.includes("draft incomplete");
}

function promptForMemoryFromLines(lines: string[]): NewMemoryInput {
  let index = 0;
  const next = (label: string, required = false): string => {
    const value = (lines[index++] ?? "").trim();
    if (required && !value) {
      throw new Error(`${label} is required`);
    }

    return value;
  };

  return {
    title: next("title", true),
    problem: next("problem", true),
    error_signature: next("error_signature"),
    context: {
      language: next("context.language"),
      framework: next("context.framework"),
      package_name: next("context.package_name"),
      package_version: next("context.package_version"),
      runtime: next("context.runtime"),
      os: next("context.os"),
      tool: next("context.tool")
    },
    cause: next("cause", true),
    solution: {
      summary: next("solution.summary", true),
      steps: splitList(next("solution.steps")),
      commands: splitList(next("solution.commands")),
      patch_example: next("solution.patch_example")
    },
    evidence: {
      verification_type: next("evidence.verification_type"),
      commands_run: splitList(next("evidence.commands_run"))
    },
    privacy: {
      redacted: parseBoolean(next("privacy.redacted"), true),
      public_safe: parseBoolean(next("privacy.public_safe"), false),
      redaction_warnings: []
    }
  };
}

async function askRequired(rl: ReturnType<typeof createInterface>, label: string): Promise<string> {
  const answer = (await rl.question(`${label}: `)).trim();
  if (!answer) {
    console.log(`${label} is required.`);
    return askRequired(rl, label);
  }

  return answer;
}

async function askOptional(rl: ReturnType<typeof createInterface>, label: string): Promise<string> {
  return (await rl.question(`${label}: `)).trim();
}

async function askBoolean(
  rl: ReturnType<typeof createInterface>,
  label: string,
  defaultValue: boolean
): Promise<boolean> {
  const suffix = defaultValue ? "Y/n" : "y/N";
  const answer = (await rl.question(`${label} (${suffix}): `)).trim().toLowerCase();

  if (!answer) {
    return defaultValue;
  }

  if (["y", "yes"].includes(answer)) {
    return true;
  }

  if (["n", "no"].includes(answer)) {
    return false;
  }

  console.log("Answer yes or no.");
  return askBoolean(rl, label, defaultValue);
}

function parseBoolean(value: string, defaultValue: boolean): boolean {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return defaultValue;
  }

  if (["y", "yes", "true"].includes(normalized)) {
    return true;
  }

  if (["n", "no", "false"].includes(normalized)) {
    return false;
  }

  throw new Error(`Expected boolean answer, got "${value}"`);
}

function splitList(value: string): string[] {
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function printMemories(memories: Memory[], emptyMessage: string): void {
  if (memories.length === 0) {
    console.log(emptyMessage);
    return;
  }

  for (const memory of memories) {
    console.log(`Title: ${memory.title}`);
    console.log(`ID: ${memory.id}`);
    printRanking(memory);
    if (memory.error_signature) {
      console.log(`Error signature: ${memory.error_signature}`);
    }
    console.log(`Cause: ${memory.cause}`);
    console.log("Solution steps:");
    if (memory.solution.steps.length > 0) {
      for (const [index, step] of memory.solution.steps.entries()) {
        console.log(`  ${index + 1}. ${step}`);
      }
    } else {
      console.log(`  ${memory.solution.summary}`);
    }
    console.log(`Evidence: ${formatEvidence(memory)}`);
    if (memory.privacy.redaction_warnings.length > 0) {
      console.log(`Redaction warnings: ${memory.privacy.redaction_warnings.join("; ")}`);
    }
    console.log(`Public safe: ${memory.privacy.public_safe ? "yes" : "no"}`);
    console.log("");
  }
}

function printGlobalMemories(memories: RankedCloudMemory[], emptyMessage: string): void {
  if (memories.length === 0) {
    console.log(emptyMessage);
    return;
  }

  for (const memory of memories) {
    console.log(`Title: ${memory.title}`);
    console.log(`ID: ${memory.id}`);
    printRanking(memory);
    if (memory.error_signature) {
      console.log(`Error signature: ${memory.error_signature}`);
    }
    console.log(`Cause: ${memory.cause}`);
    console.log("Solution steps:");
    for (const [index, step] of memory.solution.steps.entries()) {
      console.log(`  ${index + 1}. ${step}`);
    }
    console.log(`Evidence: ${formatEvidence(memory)}`);
    console.log("");
  }
}

function printRanking(memory: Memory): void {
  if (!isRankedMemory(memory)) {
    return;
  }

  console.log(`Score: ${memory.score}`);
  console.log(`Confidence: ${memory.confidence}`);
  console.log(`Ranking reason: ${memory.ranking_reason}`);
  console.log(`Worked: ${memory.worked_count}`);
  console.log(`Failed: ${memory.failed_count}`);
}

function isRankedMemory(memory: Memory): memory is RankedMemory {
  return (
    "score" in memory &&
    "confidence" in memory &&
    "ranking_reason" in memory &&
    "worked_count" in memory &&
    "failed_count" in memory
  );
}

function formatEvidence(memory: Memory): string {
  const commands = memory.evidence.commands_run.join("; ");
  if (memory.evidence.verification_type && commands) {
    return `${memory.evidence.verification_type} (${commands})`;
  }

  return memory.evidence.verification_type || commands || "not recorded";
}

function printHelp(): void {
  console.log(`ANT v0

Usage:
  ant init
  ant remember
  ant remember --json memory.json
  ant remember --from-file error.log
  ant ingest <log-file>
  ant ingest <log-file> --interactive
  ant drafts
  ant complete <draft_id>
  ant redact <file>
  ant search <query>
  ant search --global <query>
  ant inspect
  ant inspect-pending
  ant sync
  ant dedupe
  ant dedupe --dry-run
  ant worked <memory_id>
  ant failed <memory_id>
  ant mcp
  ant cloud`);
}

void main(process.argv);
