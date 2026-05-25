import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { createCloudStore, type CloudStore } from "./cloudStore";
import { memoryFromJson } from "./input";
import { createMemory } from "./schema";
import type { Memory } from "./types";

export function createCloudServer(store: CloudStore = createCloudStore()): http.Server {
  return http.createServer(async (req, res) => {
    try {
      await route(req, res, store);
    } catch (error) {
      sendJson(res, statusForError(error), {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

export async function startCloudServer(port = Number(process.env.PORT ?? 3737)): Promise<http.Server> {
  const store = createCloudStore();
  await store.init();
  const server = createCloudServer(store);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.error(`ANT cloud alpha listening on http://localhost:${port}`);
  return server;
}

async function route(req: IncomingMessage, res: ServerResponse, store: CloudStore): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "POST" && url.pathname === "/memories") {
    const body = await readJson(req);
    const memory = memoryFromRequest(body);
    const saved = await store.save(memory);
    sendJson(res, 201, { id: saved.id, memory: saved });
    return;
  }

  if (req.method === "GET" && url.pathname === "/search") {
    const query = url.searchParams.get("q") ?? "";
    const context = parseContext(url.searchParams.get("context"));
    sendJson(res, 200, { memories: await store.search(query, context) });
    return;
  }

  const workedMatch = url.pathname.match(/^\/memories\/([^/]+)\/worked$/);
  if (req.method === "POST" && workedMatch) {
    const memory = await store.markWorked(decodeURIComponent(workedMatch[1]));
    sendJson(res, 200, { message: `Memory ${memory.id} marked worked.`, memory });
    return;
  }

  const failedMatch = url.pathname.match(/^\/memories\/([^/]+)\/failed$/);
  if (req.method === "POST" && failedMatch) {
    const memory = await store.markFailed(decodeURIComponent(failedMatch[1]));
    sendJson(res, 200, { message: `Memory ${memory.id} marked failed.`, memory });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function memoryFromRequest(body: unknown): Memory {
  const memory = createMemory(memoryFromJson(body));
  if (body && typeof body === "object") {
    const maybeMemory = body as Record<string, unknown>;
    if (typeof maybeMemory.id === "string" && maybeMemory.id.trim()) {
      memory.id = maybeMemory.id;
    }
    if (typeof maybeMemory.created_at === "string" && maybeMemory.created_at.trim()) {
      memory.created_at = maybeMemory.created_at;
    }
    if (typeof maybeMemory.updated_at === "string" && maybeMemory.updated_at.trim()) {
      memory.updated_at = maybeMemory.updated_at;
    }
  }
  return memory;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function parseContext(raw: string | null): Record<string, string> {
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function statusForError(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("not public-safe") || message.includes("high-severity")) {
    return 400;
  }
  if (message.includes("not found") || message.includes("Not found")) {
    return 404;
  }
  return 500;
}
