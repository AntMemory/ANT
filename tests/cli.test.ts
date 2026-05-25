import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const cliPath = path.join(process.cwd(), "src", "cli.ts");
const tsxPath = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.cjs");

test("CLI initializes, remembers from stdin, and searches", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-cli-"));

  const init = runCli(["init"], cwd);
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, /ANT database ready/);

  const remember = runCli(
    ["remember"],
    cwd,
    [
      "Fix TS7016 for sql.js",
      "Build failed because sql.js had no bundled declaration file.",
      "TS7016",
      "TypeScript",
      "node:test",
      "sql.js",
      "1.10.3",
      "Node 20",
      "Windows",
      "Codex",
      "The package did not expose TypeScript declarations.",
      "Add a narrow local module declaration.",
      "Create src/sql-js.d.ts; Rebuild",
      "npm run build",
      "declare module \"sql.js\"",
      "automated build",
      "npm run build",
      "Y",
      "Y"
    ].join("\n")
  );
  assert.equal(remember.status, 0, remember.stderr);
  assert.match(remember.stdout, /Remembered: Fix TS7016 for sql\.js/);

  const search = runCli(["search", "TS7016"], cwd);
  assert.equal(search.status, 0, search.stderr);
  assert.match(search.stdout, /Fix TS7016 for sql\.js/);
});

test("init creates database", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-cli-init-"));

  const result = runCli(["init"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(cwd, ".ant", "memory.sqlite")), true);
});

test("remember saves memory from JSON", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-cli-json-"));
  const memoryPath = path.join(cwd, "memory.json");
  fs.writeFileSync(memoryPath, JSON.stringify(validMemory("JSON import test error"), null, 2));

  assert.equal(runCli(["init"], cwd).status, 0);
  const result = runCli(["remember", "--json", memoryPath], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Remembered: JSON import test error/);
});

test("remember saves memory from error log", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-cli-log-"));
  const logPath = path.join(cwd, "error.log");
  fs.writeFileSync(logPath, "TypeError: cannot read properties of undefined\n    at app.ts:10\n");

  assert.equal(runCli(["init"], cwd).status, 0);
  const result = runCli(["remember", "--from-file", logPath], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Remembered: Imported error log: error\.log/);
});

test("search finds memory and prints detailed output", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-cli-search-"));
  const memoryPath = path.join(cwd, "memory.json");
  fs.writeFileSync(memoryPath, JSON.stringify(validMemory("Searchable params Promise issue"), null, 2));

  assert.equal(runCli(["init"], cwd).status, 0);
  assert.equal(runCli(["remember", "--json", memoryPath], cwd).status, 0);
  const result = runCli(["search", "params promise"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Title: Searchable params Promise issue/);
  assert.match(result.stdout, /ID: /);
  assert.match(result.stdout, /Error signature: PageProps constraint error/);
  assert.match(result.stdout, /Cause: Next.js changed params behavior./);
  assert.match(result.stdout, /Solution steps:/);
  assert.match(result.stdout, /Evidence: automated build \(npm run build\)/);
});

test("inspect lists memories", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-cli-inspect-"));
  const memoryPath = path.join(cwd, "memory.json");
  fs.writeFileSync(memoryPath, JSON.stringify(validMemory("Inspect listed memory"), null, 2));

  assert.equal(runCli(["init"], cwd).status, 0);
  assert.equal(runCli(["remember", "--json", memoryPath], cwd).status, 0);
  const result = runCli(["inspect"], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Title: Inspect listed memory/);
});

test("invalid memory is rejected", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-cli-invalid-"));
  const memoryPath = path.join(cwd, "invalid.json");
  fs.writeFileSync(
    memoryPath,
    JSON.stringify({
      title: "Missing required fields",
      problem: "This is incomplete.",
      solution: { summary: "No cause was provided." }
    })
  );

  assert.equal(runCli(["init"], cwd).status, 0);
  const result = runCli(["remember", "--json", memoryPath], cwd);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cause is required/);
});

type CliResult = ReturnType<typeof spawnSync> & { stdout: string; stderr: string };

function runCli(args: string[], cwd: string, input?: string): CliResult {
  return spawnSync(process.execPath, [tsxPath, cliPath, ...args], {
    cwd,
    input,
    encoding: "utf8"
  }) as CliResult;
}

function validMemory(title: string): object {
  return {
    title,
    problem: "Next.js dynamic route params are a Promise.",
    error_signature: "PageProps constraint error",
    context: {
      language: "TypeScript",
      framework: "Next.js",
      package_name: "next",
      package_version: "15.x",
      runtime: "Node 20",
      os: "Windows",
      tool: "Codex"
    },
    cause: "Next.js changed params behavior.",
    solution: {
      summary: "Await params before destructuring.",
      steps: ["Change params type to Promise<{ slug: string }>", "Use const { slug } = await params"],
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
  };
}
