import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "dist", "cli.js");
const cloudPath = path.join(repoRoot, "dist", "cloud.js");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ant-e2e-"));
const cloudDbPath = path.join(tempRoot, "cloud", "cloud.sqlite");
const cloudPort = 4737;
const cloudUrl = `http://127.0.0.1:${cloudPort}`;

let cloud: ChildProcess | undefined;

async function main(): Promise<void> {
  step("build local CLI");
  runNpmScript("build");

  step("start local cloud API");
  cloud = startCloud();
  await waitForApi();

  step("ant init");
  runCli(["init"]);

  step("create test memory JSON");
  const memoryPath = path.join(tempRoot, "memory.json");
  fs.writeFileSync(memoryPath, JSON.stringify(testMemory(), null, 2));

  step("ant remember --json");
  runCli(["remember", "--json", memoryPath]);

  step("ant inspect-pending");
  const pending = runCli(["inspect-pending"]);
  assert.match(pending.stdout, /No pending memories\./, "Expected no pending memories for public-safe test memory");

  step("ant sync");
  const sync = runCli(["sync"]);
  assert.match(sync.stdout, /synced=1 skipped=0/, "Expected exactly one synced memory");

  step('ant search --global "prisma generate cache"');
  const firstSearch = runCli(["search", "--global", "prisma generate cache"]);
  const memoryId = extractMemoryId(firstSearch.stdout);
  assert.match(firstSearch.stdout, /Prisma generate cache fix/, "Global search did not return the synced memory");

  step("ant worked <memory_id>");
  runCli(["worked", memoryId]);

  step("ant failed <memory_id>");
  runCli(["failed", memoryId]);

  step("search again and assert reuse counts");
  const secondSearch = runCli(["search", "--global", "prisma generate cache"]);
  assert.match(secondSearch.stdout, /Worked: 1/, "worked_count did not increment");
  assert.match(secondSearch.stdout, /Failed: 1/, "failed_count did not increment");

  step("create fake secret log");
  const secretLog = path.join(tempRoot, "secret.log");
  const fakeApiKey = "sk-test1234567890abcdefABCDEF123456";
  const fakeDbUrl = "postgres://alice:secret@localhost:5432/prod";
  const fakeEmail = "alice@example.com";
  const fakePath = "C:\\Users\\devuser\\Documents\\ExampleProject\\src\\index.ts";
  fs.writeFileSync(secretLog, [fakeApiKey, fakeDbUrl, fakeEmail, fakePath].join("\n"));

  step("ant redact <secret-log>");
  const redacted = runCli(["redact", secretLog]);
  assert.doesNotMatch(redacted.stdout, new RegExp(escapeRegExp(fakeApiKey)), "redact leaked API key");
  assert.doesNotMatch(redacted.stdout, new RegExp(escapeRegExp(fakeDbUrl)), "redact leaked DATABASE_URL");
  assert.doesNotMatch(redacted.stdout, new RegExp(escapeRegExp(fakeEmail)), "redact leaked email");
  assert.doesNotMatch(redacted.stdout, /ExampleProject|devuser/, "redact leaked local path details");
  assert.match(redacted.stdout, /\[REDACTED_PATH\]\\src\\index\.ts/, "redact did not preserve useful path tail");

  step("MCP smoke test");
  runNpmScript("test:mcp");

  console.log("ANT E2E test passed");
}

function startCloud(): ChildProcess {
  const child = spawn(process.execPath, [cloudPath], {
    cwd: tempRoot,
    env: {
      ...process.env,
      PORT: String(cloudPort),
      ANT_CLOUD_DB_PATH: cloudDbPath,
      DATABASE_URL: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[api] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[api] ${chunk}`));
  return child;
}

async function waitForApi(): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${cloudUrl}/search?q=health`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`API returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Cloud API did not start: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function runCli(args: string[]): { stdout: string; stderr: string } {
  return run(process.execPath, [cliPath, ...args], tempRoot, {
    ANT_CLOUD_URL: cloudUrl,
    DATABASE_URL: ""
  });
}

function runNpmScript(script: string): { stdout: string; stderr: string } {
  if (process.platform === "win32") {
    return run("cmd.exe", ["/c", "npm", "run", script], repoRoot);
  }

  return run("npm", ["run", script], repoRoot);
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {}
): { stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return { stdout: result.stdout, stderr: result.stderr };
}

function extractMemoryId(output: string): string {
  const match = output.match(/^ID: ([0-9a-f-]+)/m);
  assert.ok(match, `Could not extract memory id from output:\n${output}`);
  return match[1];
}

function testMemory(): object {
  return {
    title: "Prisma generate cache fix",
    problem: "Prisma client generation failed because the cache contained stale generated artifacts.",
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
    cause: "The generated Prisma client cache was stale after schema changes.",
    solution: {
      summary: "Clear generated cache and rerun prisma generate.",
      steps: ["Remove stale generated artifacts", "Run npx prisma generate", "Run npm run build"],
      commands: ["npx prisma generate", "npm run build"],
      patch_example: "npx prisma generate"
    },
    evidence: {
      verification_type: "automated build",
      commands_run: ["npx prisma generate", "npm run build"]
    },
    privacy: {
      redacted: true,
      public_safe: true,
      redaction_warnings: []
    }
  };
}

function step(label: string): void {
  console.log(`\n[E2E] ${label}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (cloud && !cloud.killed) {
      cloud.kill();
    }
  });
