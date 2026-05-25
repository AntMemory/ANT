import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const cliPath = path.join(process.cwd(), "src", "cli.ts");
const tsxPath = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.cjs");

test("ant run creates a draft for a failing npm-style command", () => {
  const cwd = tempCwd("ant-run-fail-");
  const scriptPath = writeScript(
    cwd,
    "fail.js",
    [
      "console.error('> app@0.1.0 build');",
      "console.error('> next build');",
      "console.error('Type error: Type { params: { slug: string } } does not satisfy the constraint PageProps');",
      "console.error('npm ERR! code ELIFECYCLE');",
      "process.exit(1);"
    ]
  );

  assert.equal(runCli(["init"], cwd).status, 0);
  const result = runCli(["run", "--", process.execPath, scriptPath], cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Type error:/);
  assert.match(result.stdout, /Draft memory created:/);
  assert.match(result.stdout, /Draft ID: [0-9a-f-]+/);

  const drafts = runCli(["drafts"], cwd);
  assert.equal(drafts.status, 0, drafts.stderr);
  assert.match(drafts.stdout, /Type error:/);
  assert.match(drafts.stdout, /draft incomplete/);
});

test("ant run creates no draft for a passing command", () => {
  const cwd = tempCwd("ant-run-pass-");
  const scriptPath = writeScript(cwd, "pass.js", ["console.log('all good');"]);

  assert.equal(runCli(["init"], cwd).status, 0);
  const result = runCli(["run", "--", process.execPath, scriptPath], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /all good/);
  assert.match(result.stdout, /Command succeeded/);

  const drafts = runCli(["drafts"], cwd);
  assert.equal(drafts.status, 0, drafts.stderr);
  assert.match(drafts.stdout, /No draft memories\./);
});

test("ant run suggests similar existing memories", () => {
  const cwd = tempCwd("ant-run-similar-");
  const memoryPath = path.join(cwd, "memory.json");
  const scriptPath = writeScript(
    cwd,
    "fail-similar.js",
    [
      "console.error('Type error: Type { params: { slug: string } } does not satisfy the constraint PageProps');",
      "process.exit(1);"
    ]
  );

  fs.writeFileSync(memoryPath, JSON.stringify(validMemory("Existing Next.js params fix"), null, 2));

  assert.equal(runCli(["init"], cwd).status, 0);
  assert.equal(runCli(["remember", "--json", memoryPath], cwd).status, 0);
  const result = runCli(["run", "--", process.execPath, scriptPath], cwd);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Similar memories:/);
  assert.match(result.stdout, /Existing Next\.js params fix/);
});

test("ant run redacts secrets in saved command logs and drafts", () => {
  const cwd = tempCwd("ant-run-redact-");
  const secret = "sk-test1234567890abcdefABCDEF123456";
  const scriptPath = writeScript(
    cwd,
    "fail-secret.js",
    [
      `console.error('OPENAI_API_KEY=${secret}');`,
      "console.error('TypeError: failed while calling API');",
      "process.exit(1);"
    ]
  );

  assert.equal(runCli(["init"], cwd).status, 0);
  const result = runCli(["run", "--save-log", "--no-search", "--", process.execPath, scriptPath], cwd);

  assert.equal(result.status, 1);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(escapeRegExp(secret)));
  const logPath = extractLogPath(result.stdout);
  const log = fs.readFileSync(logPath, "utf8");
  assert.doesNotMatch(log, new RegExp(escapeRegExp(secret)));
  assert.match(log, /\[REDACTED_ENV_VALUE\]|\[REDACTED_API_KEY\]/);

  const drafts = runCli(["drafts"], cwd);
  assert.equal(drafts.status, 0, drafts.stderr);
  assert.doesNotMatch(drafts.stdout, new RegExp(escapeRegExp(secret)));
  assert.match(drafts.stdout, /Redaction warnings:/);
});

type CliResult = ReturnType<typeof spawnSync> & { stdout: string; stderr: string };

function runCli(args: string[], cwd: string): CliResult {
  return spawnSync(process.execPath, [tsxPath, cliPath, ...args], {
    cwd,
    encoding: "utf8"
  }) as CliResult;
}

function tempCwd(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeScript(cwd: string, name: string, lines: string[]): string {
  const scriptPath = path.join(cwd, name);
  fs.writeFileSync(scriptPath, lines.join("\n"));
  return scriptPath;
}

function extractLogPath(output: string): string {
  const match = output.match(/Redacted log saved: (.+command\.log)/);
  assert.ok(match, `Could not find saved log path in output:\n${output}`);
  return match[1].trim();
}

function validMemory(title: string): object {
  return {
    title,
    problem: "Next.js dynamic route params are a Promise.",
    error_signature: "Type error: Type { params: { slug: string } } does not satisfy the constraint PageProps",
    context: {
      language: "TypeScript",
      framework: "Next.js",
      package_name: "next",
      package_version: "15.x",
      runtime: "Node 20",
      os: "Linux",
      tool: "ANT test"
    },
    cause: "Next.js changed app router params behavior.",
    solution: {
      summary: "Await params before destructuring.",
      steps: ["Type params as Promise<{ slug: string }>", "Use const { slug } = await params"],
      commands: ["npm run build"],
      patch_example: "const { slug } = await params"
    },
    evidence: {
      verification_type: "automated build",
      commands_run: ["npm run build"]
    },
    privacy: {
      redacted: true,
      public_safe: true,
      redaction_warnings: []
    }
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
