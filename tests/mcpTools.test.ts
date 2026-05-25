import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { initDatabase } from "../src/db";
import {
  inspectMemoriesTool,
  markMemoryFailedTool,
  markMemoryWorkedTool,
  memoryWithOutcomes,
  saveMemoryTool,
  searchMemoryTool
} from "../src/mcpTools";
import type { NewMemoryInput } from "../src/types";

function tempDb(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ant-mcp-")), "memory.sqlite");
}

test("MCP save_memory saves a memory and returns its id", async () => {
  const dbPath = tempDb();
  await initDatabase(dbPath);

  const saved = await saveMemoryTool({ memory: validMemory("Fix MCP smoke test error") }, dbPath);

  assert.match(saved.id, /^[0-9a-f-]+$/);
});

test("MCP search_memory returns matching memories with relevance scores", async () => {
  const dbPath = tempDb();
  await initDatabase(dbPath);
  const saved = await saveMemoryTool({ memory: validMemory("Fix MCP smoke test error") }, dbPath);

  const search = await searchMemoryTool(
    {
      query: "mcp smoke",
      context: {
        language: "TypeScript",
        framework: "MCP"
      }
    },
    dbPath
  );

  assert.equal(search.memories.length, 1);
  assert.equal(search.memories[0].id, saved.id);
  assert.equal(search.memories[0].title, "Fix MCP smoke test error");
  assert.equal(search.memories[0].error_signature, "mcp smoke test error");
  assert.equal(typeof search.memories[0].score, "number");
  assert.ok(search.memories[0].score > 0);
});

test("MCP inspect_memories lists recent memories with an optional limit", async () => {
  const dbPath = tempDb();
  await initDatabase(dbPath);
  await saveMemoryTool({ memory: validMemory("First MCP memory") }, dbPath);
  await saveMemoryTool({ memory: validMemory("Second MCP memory") }, dbPath);

  const inspected = await inspectMemoriesTool({ limit: 1 }, dbPath);

  assert.equal(inspected.memories.length, 1);
  assert.equal(inspected.memories[0].title, "Second MCP memory");
});

test("MCP mark_memory_worked records a worked outcome", async () => {
  const dbPath = tempDb();
  await initDatabase(dbPath);
  const saved = await saveMemoryTool({ memory: validMemory("Worked MCP memory") }, dbPath);

  const result = await markMemoryWorkedTool({ id: saved.id }, dbPath);
  const withOutcomes = await memoryWithOutcomes(saved.id, dbPath);

  assert.equal(result.success, true);
  assert.equal(result.message, `Memory ${saved.id} marked as worked.`);
  assert.equal(withOutcomes.outcomes[0].status, "worked");
});

test("MCP mark_memory_failed records a failed outcome with a reason", async () => {
  const dbPath = tempDb();
  await initDatabase(dbPath);
  const saved = await saveMemoryTool({ memory: validMemory("Failed MCP memory") }, dbPath);

  const result = await markMemoryFailedTool({ id: saved.id, reason: "Did not apply to this version." }, dbPath);
  const withOutcomes = await memoryWithOutcomes(saved.id, dbPath);

  assert.equal(result.success, true);
  assert.equal(result.message, `Memory ${saved.id} marked as failed.`);
  assert.equal(withOutcomes.outcomes[0].status, "failed");
  assert.equal(withOutcomes.outcomes[0].note, "Did not apply to this version.");
});

test("MCP save_memory rejects invalid memories", async () => {
  const dbPath = tempDb();
  await initDatabase(dbPath);

  await assert.rejects(
    () =>
      saveMemoryTool(
        {
          memory: {
            title: "Invalid memory",
            problem: "Missing cause and solution."
          }
        },
        dbPath
      ),
    /cause is required/
  );
});

function validMemory(title: string): NewMemoryInput {
  return {
    title,
    problem: "An MCP server smoke test needs a searchable memory.",
    error_signature: "mcp smoke test error",
    context: {
      language: "TypeScript",
      framework: "MCP",
      package_name: "@modelcontextprotocol/sdk",
      package_version: "1.x",
      runtime: "Node 20",
      os: "Windows",
      tool: "Codex"
    },
    cause: "The MCP tools need to reuse the ANT SQLite database.",
    solution: {
      summary: "Save memories through the same insert path used by the CLI.",
      steps: ["Call save_memory", "Search with search_memory", "Mark the result"],
      commands: ["npm test"],
      patch_example: "await saveMemoryTool({ memory }, dbPath)"
    },
    evidence: {
      verification_type: "automated test",
      commands_run: ["npm test"]
    },
    privacy: {
      redacted: true,
      public_safe: true
    }
  };
}
