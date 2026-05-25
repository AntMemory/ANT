import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createCloudServer } from "../src/cloudServer";
import { createCloudStore, type CloudStore } from "../src/cloudStore";
import { createMemory } from "../src/schema";
import type { Memory, NewMemoryInput } from "../src/types";

let server: http.Server;
let store: CloudStore;
let baseUrl: string;

beforeEach(async () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ant-cloud-test-")), "cloud.sqlite");
  store = createCloudStore({ dbPath, databaseUrl: "" });
  await store.init();
  server = createCloudServer(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await store.close();
});

test("safe memory syncs", async () => {
  const memory = createMemory(safeMemory("Cloud safe memory"));

  const response = await postJson("/memories", memory);

  assert.equal(response.status, 201);
  assert.equal(response.body.id, memory.id);
  assert.equal(response.body.memory.id, memory.id);
  assert.equal(response.body.memory.title, "Cloud safe memory");
  assert.equal(response.body.memory.worked_count, 0);
  assert.equal(response.body.memory.failed_count, 0);
});

test("unsafe memory is rejected", async () => {
  const memory = createMemory({
    ...safeMemory("Unsafe memory"),
    problem: "Leaked key sk-test1234567890abcdefABCDEF123456"
  });

  const response = await postJson("/memories", memory);

  assert.equal(response.status, 400);
  assert.match(response.body.error, /not public-safe|high-severity/);
});

test("global search returns synced memory", async () => {
  const memory = createMemory(safeMemory("Next.js params cloud memory"));
  await postJson("/memories", memory);

  const response = await getJson("/search?q=nextjs%20params&context=%7B%22framework%22%3A%22Next.js%22%7D");

  assert.equal(response.status, 200);
  assert.equal(response.body.memories.length, 1);
  assert.equal(response.body.memories[0].title, "Next.js params cloud memory");
  assert.equal(typeof response.body.memories[0].score, "number");
});

test("worked and failed update counts", async () => {
  const saved = await postJson("/memories", createMemory(safeMemory("Reusable memory")));
  const id = String(saved.body.id);

  const worked = await postJson(`/memories/${id}/worked`, {});
  const failed = await postJson(`/memories/${id}/failed`, {});

  assert.equal(worked.status, 200);
  assert.equal(worked.body.memory.worked_count, 1);
  assert.equal(worked.body.memory.failed_count, 0);
  assert.equal(failed.status, 200);
  assert.equal(failed.body.memory.worked_count, 1);
  assert.equal(failed.body.memory.failed_count, 1);
});

async function postJson(route: string, body: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function getJson(route: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${route}`);
  return { status: response.status, body: await response.json() };
}

function safeMemory(title: string): NewMemoryInput {
  return {
    title,
    problem: "Next.js params Promise PageProps issue in a public repro.",
    error_signature: "PageProps params Promise error",
    context: {
      language: "TypeScript",
      framework: "Next.js",
      package_name: "next",
      package_version: "15.x",
      runtime: "Node 20",
      os: "Linux",
      tool: "ANT"
    },
    cause: "Next.js 15 treats app router params as a Promise.",
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
