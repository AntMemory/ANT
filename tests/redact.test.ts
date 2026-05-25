import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { insertMemory, initDatabase, listMemories } from "../src/db";
import { createMemory } from "../src/schema";
import { redactText } from "../src/redact";
import type { NewMemoryInput } from "../src/types";

const cliPath = path.join(process.cwd(), "src", "cli.ts");
const tsxPath = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.cjs");

test("redactText removes fake secrets and private identifiers", () => {
  const cwd = path.join(os.tmpdir(), "ExampleProject");
  const input = [
    "OPENAI_API_KEY=sk-test1234567890abcdefABCDEF123456",
    "password=super-secret-password",
    "DATABASE_URL=postgres://alice:secret@localhost:5432/app",
    "email alice@example.com",
    `path ${os.homedir()}\\repo`,
    "token=abcDEF1234567890abcDEF1234567890",
    "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----",
    "ExampleProject failed to build"
  ].join("\n");

  const result = redactText(input, cwd);

  assert.equal(result.redacted, true);
  assert.doesNotMatch(result.text, /sk-test1234567890abcdefABCDEF123456/);
  assert.doesNotMatch(result.text, /super-secret-password/);
  assert.doesNotMatch(result.text, /postgres:\/\/alice/);
  assert.doesNotMatch(result.text, /alice@example\.com/);
  assert.doesNotMatch(result.text, new RegExp(escapeRegExp(os.homedir()), "i"));
  assert.doesNotMatch(result.text, /abcDEF1234567890abcDEF1234567890/);
  assert.doesNotMatch(result.text, /BEGIN PRIVATE KEY/);
  assert.doesNotMatch(result.text, /ExampleProject/);
  assert.ok(result.warnings.includes("API key redacted"));
  assert.ok(result.warnings.includes("database URL redacted"));
  assert.ok(result.warnings.includes("email redacted"));
});

test("redactText minimizes Windows local project paths", () => {
  const result = redactText(
    "at C:\\Users\\devuser\\Documents\\ExampleProject\\src\\index.ts:10",
    "C:\\Users\\devuser\\Documents\\ExampleProject"
  );

  assert.match(result.text, /\[REDACTED_PATH\]\/src\/index\.ts:10/);
  assert.doesNotMatch(result.text, /devuser/);
  assert.doesNotMatch(result.text, /ExampleProject/);
});

test("redactText minimizes macOS local project paths", () => {
  const result = redactText(
    "at /Users/devuser/Documents/ExampleProject/src/index.ts:10",
    "/Users/devuser/Documents/ExampleProject"
  );

  assert.match(result.text, /\[REDACTED_PATH\]\/src\/index\.ts:10/);
  assert.doesNotMatch(result.text, /devuser/);
  assert.doesNotMatch(result.text, /ExampleProject/);
});

test("redactText minimizes Linux local project paths", () => {
  const result = redactText(
    "at /home/devuser/ExampleProject/src/index.ts:10",
    "/home/devuser/ExampleProject"
  );

  assert.match(result.text, /\[REDACTED_PATH\]\/src\/index\.ts:10/);
  assert.doesNotMatch(result.text, /devuser/);
  assert.doesNotMatch(result.text, /ExampleProject/);
});

test("createMemory redacts sensitive memory fields before storage", async () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ant-redact-db-")), "memory.sqlite");
  await initDatabase(dbPath);

  const memory = createMemory(secretMemory());
  await insertMemory(memory, dbPath);

  const [stored] = await listMemories(dbPath);
  const serialized = JSON.stringify(stored);
  assert.doesNotMatch(serialized, /sk-test1234567890abcdefABCDEF123456/);
  assert.doesNotMatch(serialized, /postgres:\/\/alice/);
  assert.doesNotMatch(serialized, /alice@example\.com/);
  assert.equal(stored.privacy.redacted, true);
  assert.equal(stored.privacy.public_safe, false);
  assert.ok(stored.privacy.redaction_warnings.length > 0);
});

test("createMemory redacts secrets across every memory field", () => {
  const memory = createMemory(secretInEveryMemoryField());
  const serialized = JSON.stringify(memory);

  for (const secret of everyFieldSecrets()) {
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(secret)), `Leaked secret: ${secret}`);
  }

  assert.equal(memory.title.includes("[REDACTED_API_KEY]"), true);
  assert.equal(memory.context.language, "[REDACTED_EMAIL]");
  assert.equal(memory.privacy.redacted, true);
  assert.equal(memory.privacy.public_safe, false);
  assert.ok(memory.privacy.redaction_warnings.includes("API key redacted"));
  assert.ok(memory.privacy.redaction_warnings.includes("database URL redacted"));
  assert.ok(memory.privacy.redaction_warnings.includes("email redacted"));
  assert.ok(memory.privacy.redaction_warnings.includes("token redacted"));
  assert.ok(memory.privacy.redaction_warnings.includes("password redacted"));
});

test("ant redact prints redacted file content and warnings", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-redact-cli-"));
  const filePath = path.join(cwd, "error.log");
  fs.writeFileSync(filePath, "TOKEN=abcDEF1234567890abcDEF1234567890\nuser alice@example.com\n");

  const result = runCli(["redact", filePath], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /abcDEF1234567890abcDEF1234567890/);
  assert.doesNotMatch(result.stdout, /alice@example\.com/);
  assert.match(result.stderr, /Warnings:/);
});

test("ant inspect-pending lists memories that need privacy review", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-pending-"));
  const memoryPath = path.join(cwd, "memory.json");
  fs.writeFileSync(memoryPath, JSON.stringify(secretMemory(), null, 2));

  assert.equal(runCli(["init"], cwd).status, 0);
  assert.equal(runCli(["remember", "--json", memoryPath], cwd).status, 0);
  const result = runCli(["inspect-pending"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Secret memory with fake API key/);
  assert.match(result.stdout, /Public safe: no/);
  assert.match(result.stdout, /Redaction warnings:/);
});

function secretMemory(): NewMemoryInput {
  return {
    title: "Secret memory with fake API key",
    problem: "Request failed for alice@example.com with OPENAI_API_KEY=sk-test1234567890abcdefABCDEF123456",
    error_signature: "password=super-secret-password",
    context: {
      language: "TypeScript",
      framework: "Next.js",
      package_name: "next",
      package_version: "15.x",
      runtime: "Node 20",
      os: "Windows",
      tool: "Codex"
    },
    cause: "Database URL leaked: postgres://alice:secret@localhost:5432/app",
    solution: {
      summary: "Rotate token=abcDEF1234567890abcDEF1234567890 and rebuild.",
      steps: ["Remove private key -----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----"],
      commands: ["PASSWORD=super-secret-password npm run build"],
      patch_example: `const home = "${os.homedir()}";`
    },
    evidence: {
      verification_type: "manual",
      commands_run: ["npm run build"]
    },
    privacy: {
      redacted: false,
      public_safe: false,
      redaction_warnings: []
    }
  };
}

function secretInEveryMemoryField(): NewMemoryInput {
  const [
    titleKey,
    problemEmail,
    errorPassword,
    contextEmail,
    contextToken,
    contextDb,
    contextPassword,
    contextKey,
    contextEnv,
    contextBearer,
    causeDb,
    summaryToken,
    stepKey,
    commandPassword,
    patchPrivateKey,
    evidenceEmail,
    evidenceEnv
  ] = everyFieldSecrets();

  return {
    title: `Build failed with ${titleKey}`,
    problem: `Problem reported by ${problemEmail}`,
    error_signature: `Error contained password=${errorPassword}`,
    context: {
      language: contextEmail,
      framework: `token=${contextToken}`,
      package_name: contextDb,
      package_version: `password=${contextPassword}`,
      runtime: contextKey,
      os: `NPM_TOKEN=${contextEnv}`,
      tool: `bearer=${contextBearer}`
    },
    cause: `Cause used ${causeDb}`,
    solution: {
      summary: `Rotate token=${summaryToken}`,
      steps: [`Remove ${stepKey}`],
      commands: [`PASSWORD=${commandPassword} npm test`],
      patch_example: patchPrivateKey
    },
    evidence: {
      verification_type: `checked by ${evidenceEmail}`,
      commands_run: [`API_KEY=${evidenceEnv} npm run build`]
    },
    privacy: {
      redacted: false,
      public_safe: true,
      redaction_warnings: []
    }
  };
}

function everyFieldSecrets(): string[] {
  return [
    "sk-title1234567890abcdefABCDEF123456",
    "problem@example.com",
    "field-password-secret",
    "context-language@example.com",
    "ctxTOKEN1234567890abcdefABCDEF",
    "postgres://ctx:secret@localhost:5432/app",
    "ctx-password-secret",
    "sk-runtime1234567890abcdefABCDEF123456",
    "envSECRET1234567890abcdefABCDEF",
    "bearerSECRET1234567890abcdefABCDEF",
    "mysql://cause:secret@localhost:3306/app",
    "summaryTOKEN1234567890abcdefABCDEF",
    "ghp_step1234567890abcdefABCDEF123456",
    "command-password-secret",
    "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----",
    "evidence@example.com",
    "evidenceSECRET1234567890abcdefABCDEF"
  ];
}

function runCli(args: string[], cwd: string): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [tsxPath, cliPath, ...args], {
    cwd,
    encoding: "utf8"
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
