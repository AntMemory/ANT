import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { initDatabase, insertMemory, listMemories, searchMemories } from "../src/db";
import { createMemory } from "../src/schema";

function tempDb(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ant-")), "memory.sqlite");
}

test("initDatabase creates a SQLite database", async () => {
  const dbPath = tempDb();

  await initDatabase(dbPath);

  assert.equal(fs.existsSync(dbPath), true);
  assert.equal(fs.readFileSync(dbPath).subarray(0, 16).toString("utf8"), "SQLite format 3\u0000");
});

test("insert, list, and search memories", async () => {
  const dbPath = tempDb();
  await initDatabase(dbPath);

  const memory = createMemory({
    title: "Fix ts-node ESM loader failure",
    problem: "Tests failed to load TypeScript files in Node.",
    error_signature: "ERR_UNKNOWN_FILE_EXTENSION",
    context: {
      language: "TypeScript",
      framework: "node:test",
      package_name: "tsx",
      package_version: "4.16.2",
      runtime: "Node 20",
      os: "Windows",
      tool: "Codex"
    },
    cause: "Node needed a loader for TypeScript test files.",
    solution: {
      summary: "Run node tests with the tsx import hook.",
      steps: ["Add tsx dev dependency", "Use node --import tsx --test"],
      commands: ["npm test"],
      patch_example: "\"test\": \"node --import tsx --test tests/*.test.ts\""
    },
    evidence: {
      verification_type: "automated test",
      commands_run: ["npm test"]
    },
    privacy: {
      redacted: true,
      public_safe: true
    }
  });

  await insertMemory(memory, dbPath);
  await insertMemory(
    createMemory({
      title: "Fix package declaration",
      problem: "Build failed because a package had no declaration file.",
      error_signature: "TS7016",
      context: {
        language: "TypeScript",
        framework: "node:test",
        package_name: "sql.js",
        package_version: "1.10.3",
        runtime: "Node 20",
        os: "Windows",
        tool: "Codex"
      },
      cause: "The package did not expose declarations.",
      solution: {
        summary: "Add a local declaration.",
        steps: ["Create declaration file"],
        commands: ["npm test"],
        patch_example: "declare module"
      },
      evidence: {
        verification_type: "automated test",
        commands_run: ["npm test"]
      },
      privacy: {
        redacted: true,
        public_safe: true
      }
    }),
    dbPath
  );

  const listed = await listMemories(dbPath);
  assert.equal(listed.length, 2);

  const matches = await searchMemories("ERR_UNKNOWN_FILE_EXTENSION", dbPath);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].solution.commands[0], "npm test");

  const normalizedMatches = await searchMemories("typescript node", dbPath);
  assert.equal(normalizedMatches.length, 2);

  const valueOnlyMatches = await searchMemories("test error", dbPath);
  assert.equal(valueOnlyMatches.length, 0);
});

test("search normalizes punctuation and matches all query terms", async () => {
  const dbPath = tempDb();
  await initDatabase(dbPath);

  await insertMemory(
    createMemory({
      title: "Fix Next.js params Promise typing",
      problem: "Dynamic route params were read synchronously.",
      error_signature: "params should be awaited",
      context: {
        language: "TypeScript",
        framework: "Next.js",
        package_name: "next",
        package_version: "15.x",
        runtime: "Node 20",
        os: "Windows",
        tool: "Codex"
      },
      cause: "The props type used a plain params object.",
      solution: {
        summary: "Type params as a Promise and await it before reading fields.",
        steps: ["Change the params type", "Await params"],
        commands: ["npm run build"],
        patch_example: "const { slug } = await params"
      },
      evidence: {
        verification_type: "automated build",
        commands_run: ["npm run build"]
      },
      privacy: {
        redacted: true,
        public_safe: true
      }
    }),
    dbPath
  );

  const matches = await searchMemories("nextjs params promise", dbPath);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].title, "Fix Next.js params Promise typing");
});
