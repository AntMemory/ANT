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
  await startTestServer();
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await store.close();
});

async function startTestServer(token?: string): Promise<void> {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ant-cloud-test-")), "cloud.sqlite");
  store = createCloudStore({ dbPath, databaseUrl: "" });
  await store.init();
  server = createCloudServer(store, { token, jsonBodyLimitBytes: 1024 });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
}

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

test("server controls timestamps and counters", async () => {
  const memory = {
    ...createMemory(safeMemory("Server controlled fields")),
    created_at: "1999-01-01T00:00:00.000Z",
    updated_at: "1999-01-01T00:00:00.000Z",
    worked_count: 99,
    failed_count: 88
  };

  const response = await postJson("/memories", memory);

  assert.equal(response.status, 201);
  assert.notEqual(response.body.memory.created_at, "1999-01-01T00:00:00.000Z");
  assert.notEqual(response.body.memory.updated_at, "1999-01-01T00:00:00.000Z");
  assert.equal(response.body.memory.worked_count, 0);
  assert.equal(response.body.memory.failed_count, 0);
});

test("invalid client memory id is rejected", async () => {
  const memory = {
    ...createMemory(safeMemory("Invalid id memory")),
    id: "not-a-uuid"
  };

  const response = await postJson("/memories", memory);

  assert.equal(response.status, 400);
  assert.match(response.body.error, /UUID/);
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

test("high-severity redaction warnings block public sync", async () => {
  const memory = {
    ...createMemory(safeMemory("High warning memory")),
    privacy: {
      redacted: true,
      public_safe: true,
      redaction_warnings: ["API key redacted"]
    }
  };

  const response = await postJson("/memories", memory);

  assert.equal(response.status, 400);
  assert.match(response.body.error, /not public-safe|high-severity/);
});

test("draft memory is rejected", async () => {
  const memory = {
    ...createMemory(safeMemory("Draft memory")),
    privacy: {
      redacted: true,
      public_safe: true,
      redaction_warnings: ["draft incomplete"]
    }
  };

  const response = await postJson("/memories", memory);

  assert.equal(response.status, 400);
  assert.match(response.body.error, /not public-safe|draft|incomplete/);
});

test("placeholder cause or solution is rejected by publish review", async () => {
  const memory = createMemory({
    ...safeMemory("Placeholder memory"),
    cause: "TODO",
    solution: {
      ...safeMemory("Placeholder memory").solution,
      summary: "TBD"
    }
  });

  const response = await postJson("/memories", memory);

  assert.equal(response.status, 400);
  assert.match(response.body.error, /publish review/);
  assert.match(response.body.error, /cause looks incomplete|solution summary looks incomplete/);
});

test("automated verification requires commands_run before publish", async () => {
  const memory = createMemory({
    ...safeMemory("Evidence without command"),
    evidence: {
      verification_type: "build passed",
      commands_run: []
    }
  });

  const response = await postJson("/memories", memory);

  assert.equal(response.status, 400);
  assert.match(response.body.error, /publish review/);
  assert.match(response.body.error, /commands_run/);
});

test("auth missing fails when token is set", async () => {
  await restartServerWithToken("secret-token");

  const response = await postJson("/memories", createMemory(safeMemory("Needs auth")));

  assert.equal(response.status, 401);
});

test("auth wrong fails when token is set", async () => {
  await restartServerWithToken("secret-token");

  const response = await postJson("/memories", createMemory(safeMemory("Wrong auth")), "wrong-token");

  assert.equal(response.status, 401);
});

test("auth correct succeeds when token is set", async () => {
  await restartServerWithToken("secret-token");

  const response = await postJson("/memories", createMemory(safeMemory("Correct auth")), "secret-token");

  assert.equal(response.status, 201);
  assert.equal(response.body.memory.title, "Correct auth");
});

test("search requires auth when token is set", async () => {
  await restartServerWithToken("secret-token");
  await postJson("/memories", createMemory(safeMemory("Search auth memory")), "secret-token");

  const missing = await getJson("/search?q=auth");
  const wrong = await getJson("/search?q=auth", "wrong-token");
  const correct = await getJson("/search?q=auth", "secret-token");

  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(correct.status, 200);
  assert.equal(correct.body.memories.length, 1);
});

test("worked and failed require auth when token is set", async () => {
  await restartServerWithToken("secret-token");
  const saved = await postJson("/memories", createMemory(safeMemory("Outcome auth memory")), "secret-token");
  const id = String(saved.body.id);

  const workedMissing = await postJson(`/memories/${id}/worked`, {});
  const failedWrong = await postJson(`/memories/${id}/failed`, {}, "wrong-token");
  const workedCorrect = await postJson(`/memories/${id}/worked`, {}, "secret-token");
  const failedCorrect = await postJson(`/memories/${id}/failed`, {}, "secret-token");

  assert.equal(workedMissing.status, 401);
  assert.equal(failedWrong.status, 401);
  assert.equal(workedCorrect.status, 200);
  assert.equal(failedCorrect.status, 200);
});

test("oversized body returns 413", async () => {
  const response = await rawRequest("POST", "/memories", `${"x".repeat(1200)}`, {
    "content-type": "application/json"
  });

  assert.equal(response.status, 413);
});

test("malformed JSON returns 400", async () => {
  const response = await rawRequest("POST", "/memories", "{not json", {
    "content-type": "application/json"
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /Malformed JSON/);
});

test("BOM-prefixed JSON body is accepted", async () => {
  const response = await rawRequest("POST", "/memories", `\uFEFF${JSON.stringify(createMemory(safeMemory("BOM cloud memory")))}`, {
    "content-type": "application/json"
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.memory.title, "BOM cloud memory");
});

test("unsupported methods return 405", async () => {
  const response = await rawRequest("GET", "/memories");

  assert.equal(response.status, 405);
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

test("global sync does not create duplicates", async () => {
  const first = createMemory(safeMemory("Global duplicate one"));
  const second = createMemory(safeMemory("Global duplicate two"));

  const firstResponse = await postJson("/memories", first);
  const secondResponse = await postJson("/memories", second);
  const search = await getJson("/search?q=PageProps%20params%20Promise");

  assert.equal(firstResponse.status, 201);
  assert.equal(secondResponse.status, 201);
  assert.equal(secondResponse.body.id, firstResponse.body.id);
  assert.equal(search.body.memories.length, 1);
});

async function restartServerWithToken(token: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await store.close();
  await startTestServer(token);
}

async function postJson(route: string, body: unknown, token?: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }, token),
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function getJson(route: string, token?: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${route}`, { headers: authHeaders({}, token) });
  return { status: response.status, body: await response.json() };
}

async function rawRequest(
  method: string,
  route: string,
  body?: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body
  });
  return { status: response.status, body: await response.json() };
}

function authHeaders(headers: Record<string, string>, token: string | undefined): Record<string, string> {
  if (!token) {
    return headers;
  }

  return { ...headers, authorization: `Bearer ${token}` };
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
