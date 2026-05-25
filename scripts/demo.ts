import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ant-demo-"));
const cliPath = path.join(repoRoot, "dist", "cli.js");
const cloudPath = path.join(repoRoot, "dist", "cloud.js");
const port = 4837;
const cloudUrl = `http://127.0.0.1:${port}`;
const cloudDbPath = path.join(tempRoot, "cloud", "cloud.sqlite");

let cloud: ChildProcessWithoutNullStreams | undefined;

async function main(): Promise<void> {
  header("ANT Demo");
  line("This demo uses a clean temporary workspace:");
  line(tempRoot);

  section("1. Build local CLI");
  run("cmd.exe", ["/c", "npm run build"], repoRoot, {}, false);
  ok("CLI built.");

  section("2. Start local cloud API");
  cloud = startCloud();
  await waitForApi();
  ok(`Cloud API is running at ${cloudUrl}`);

  section("3. Initialize a clean local ANT database");
  show(runCli(["init"]).stdout);

  section("4. Save a sample bugfix memory");
  const memoryPath = path.join(tempRoot, "nextjs-params-memory.json");
  fs.writeFileSync(memoryPath, JSON.stringify(sampleMemory(), null, 2));
  show(runCli(["remember", "--json", memoryPath]).stdout);

  section("5. Search the memory locally");
  show(runCli(["search", "nextjs params promise"]).stdout);

  section("6. Redact a fake secret log");
  const secretLog = path.join(tempRoot, "secret.log");
  fs.writeFileSync(
    secretLog,
    [
      "OPENAI_API_KEY=sk-test1234567890abcdefABCDEF123456",
      "DATABASE_URL=postgres://alice:secret@localhost:5432/app",
      "Contact alice@example.com",
      "at C:\\Users\\devuser\\Documents\\ExampleProject\\src\\index.ts:10"
    ].join("\n")
  );
  const redacted = runCli(["redact", secretLog]);
  show(redacted.stdout.trim());
  if (redacted.stderr.trim()) {
    line(redacted.stderr.trim());
  }

  section("7. Sync the public-safe memory to the local API");
  show(runCli(["sync"]).stdout);

  section("8. Search globally");
  show(runCli(["search", "--global", "nextjs params promise"]).stdout);

  header("Demo Complete");
  line("ANT saved a structured local memory, redacted secrets locally, synced only the public-safe memory, and found it through the cloud API.");
}

function startCloud(): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, [cloudPath], {
    cwd: tempRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ANT_CLOUD_DB_PATH: cloudDbPath,
      DATABASE_URL: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) {
      line(`[api] ${text}`);
    }
  });
  return child;
}

async function waitForApi(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${cloudUrl}/search?q=demo`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the API is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Cloud API did not start in time.");
}

function runCli(args: string[]): { stdout: string; stderr: string } {
  return run(process.execPath, [cliPath, ...args], tempRoot, {
    ANT_CLOUD_URL: cloudUrl,
    DATABASE_URL: ""
  });
}

function run(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
  capture = true
): { stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${result.stderr ?? ""}`);
  }

  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function sampleMemory(): object {
  return {
    title: "Next.js params Promise build fix",
    problem: "Build failed because app router params were typed as a plain object.",
    error_signature: "PageProps params Promise type error",
    context: {
      language: "TypeScript",
      framework: "Next.js",
      package_name: "next",
      package_version: "15.x",
      runtime: "Node 20",
      os: "Linux",
      tool: "ANT demo"
    },
    cause: "Next.js 15 treats app router params as a Promise.",
    solution: {
      summary: "Type params as a Promise and await params before destructuring.",
      steps: [
        "Change params type to Promise<{ slug: string }>",
        "Use const { slug } = await params",
        "Run npm run build"
      ],
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

function header(text: string): void {
  console.log(`\n=== ${text} ===\n`);
}

function section(text: string): void {
  console.log(`\n-- ${text} --`);
}

function ok(text: string): void {
  console.log(`OK: ${text}`);
}

function line(text: string): void {
  console.log(text);
}

function show(text: string): void {
  console.log(text.trim());
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
