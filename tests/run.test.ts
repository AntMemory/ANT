import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createCloudServer } from "../src/cloudServer";
import { createCloudStore, type CloudStore } from "../src/cloudStore";
import { createMemory } from "../src/schema";
import type { NewMemoryInput } from "../src/types";

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

test("ant run auto-searches global memories when enabled", async () => {
  const cwd = tempCwd("ant-run-global-search-");
  const cloud = await startCloudApi();
  const scriptPath = writeScript(
    cwd,
    "fail-global.js",
    [
      "console.error('Type error: Type { params: { slug: string } } does not satisfy the constraint PageProps');",
      "process.exit(1);"
    ]
  );

  try {
    await cloud.store.save(createMemory(validMemory("Global Next.js params fix")));
    assert.equal(runCli(["init"], cwd).status, 0);
    assert.equal(runCli(["config", "set", "auto_search_global", "true"], cwd).status, 0);
    const result = await runCliAsync(["run", "--", process.execPath, scriptPath], cwd, { ANT_CLOUD_URL: cloud.baseUrl });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /Global memories:/);
    assert.match(result.stdout, /Global Next\.js params fix/);
  } finally {
    await cloud.close();
  }
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

function runCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): CliResult {
  return spawnSync(process.execPath, [tsxPath, cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env }
  }) as CliResult;
}

async function runCliAsync(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): Promise<CliResult> {
  const child = spawn(process.execPath, [tsxPath, cliPath, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const status = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  return { status, stdout, stderr } as CliResult;
}

async function startCloudApi(): Promise<{ baseUrl: string; store: CloudStore; close(): Promise<void> }> {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ant-run-cloud-")), "cloud.sqlite");
  const store: CloudStore = createCloudStore({ dbPath, databaseUrl: "" });
  await store.init();
  const server = createCloudServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    store,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await store.close();
    }
  };
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

function validMemory(title: string): NewMemoryInput {
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
