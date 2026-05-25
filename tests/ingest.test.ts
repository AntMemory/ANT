import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { memoryDraftFromLog } from "../src/ingest";

const examplesRoot = path.join(process.cwd(), "examples", "logs");

test("ingest extracts npm Next.js error context", () => {
  const filePath = path.join(examplesRoot, "npm-nextjs.log");
  const draft = memoryDraftFromLog(filePath, fs.readFileSync(filePath, "utf8"));

  assert.match(draft.error_signature, /Type error: Type/);
  assert.equal(draft.context.language, "TypeScript");
  assert.equal(draft.context.framework, "Next.js");
  assert.equal(draft.context.package_name, "next");
  assert.equal(draft.context.package_version, "15.0.3");
  assert.equal(draft.privacy.public_safe, false);
  assert.ok(draft.privacy.redaction_warnings.includes("draft incomplete"));
});

test("ingest extracts Python error context and redacts local paths", () => {
  const filePath = path.join(examplesRoot, "python-django.log");
  const draft = memoryDraftFromLog(filePath, fs.readFileSync(filePath, "utf8"));

  assert.equal(draft.error_signature, "ModuleNotFoundError: No module named 'django'");
  assert.equal(draft.context.language, "Python");
  assert.equal(draft.context.framework, "Django");
  assert.equal(draft.context.package_name, "django");
  assert.equal(draft.context.runtime, "Python 3.12.1");
  assert.doesNotMatch(draft.problem, /SecretProject|alice/);
  assert.match(draft.problem, /\[REDACTED_PATH\]\/manage\.py/);
});

test("ingest extracts Docker build error context", () => {
  const filePath = path.join(examplesRoot, "docker-build.log");
  const draft = memoryDraftFromLog(filePath, fs.readFileSync(filePath, "utf8"));

  assert.match(draft.error_signature, /failed to solve:/);
  assert.equal(draft.context.framework, "Docker");
  assert.equal(draft.context.package_name, "node:20-alpine");
  assert.equal(draft.context.runtime, "Docker");
  assert.equal(draft.context.tool, "docker");
});

test("ant ingest creates pending draft memory", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-ingest-"));
  const logPath = path.join(examplesRoot, "npm-nextjs.log");

  assert.equal(runCli(["init"], cwd).status, 0);
  const ingest = runCli(["ingest", logPath], cwd);
  assert.equal(ingest.status, 0, ingest.stderr);
  assert.match(ingest.stdout, /Draft memory created:/);
  assert.match(ingest.stdout, /Status: pending completion or privacy review/);

  const pending = runCli(["inspect-pending"], cwd);
  assert.equal(pending.status, 0, pending.stderr);
  assert.match(pending.stdout, /draft incomplete/);
  assert.match(pending.stdout, /Draft memory:/);
});

test("ant ingest --interactive requires solved fields and creates complete memory", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-ingest-interactive-"));
  const logPath = path.join(examplesRoot, "docker-build.log");

  assert.equal(runCli(["init"], cwd).status, 0);
  const ingest = runCli(
    ["ingest", logPath, "--interactive"],
    cwd,
    [
      "package-lock.json was missing from the Docker build context.",
      "Commit package-lock.json or stop copying it in the Dockerfile.",
      "Add package-lock.json; rerun docker build",
      "docker build .",
      "COPY package.json package-lock.json ./",
      "docker build passed",
      "docker build .",
      "Y"
    ].join("\n")
  );

  assert.equal(ingest.status, 0, ingest.stderr);
  assert.match(ingest.stdout, /Ingested:/);

  const pending = runCli(["inspect-pending"], cwd);
  assert.equal(pending.status, 0, pending.stderr);
  assert.match(pending.stdout, /No pending memories\./);

  const search = runCli(["search", "package-lock docker"], cwd);
  assert.equal(search.status, 0, search.stderr);
  assert.match(search.stdout, /docker build passed/);
});

function runCli(args: string[], cwd: string, input?: string): ReturnType<typeof spawnSync> {
  const cliPath = path.join(process.cwd(), "src", "cli.ts");
  const tsxPath = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.cjs");
  return spawnSync(process.execPath, [tsxPath, cliPath, ...args], {
    cwd,
    input,
    encoding: "utf8"
  });
}
