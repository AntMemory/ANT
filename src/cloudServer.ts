import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { createCloudStore, type CloudStore } from "./cloudStore";
import { memoryFromJson } from "./input";
import { createMemory } from "./schema";
import type { Memory } from "./types";

const DEFAULT_JSON_BODY_LIMIT_BYTES = 256 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CloudServerOptions = {
  token?: string;
  jsonBodyLimitBytes?: number;
};

type CloudServerConfig = {
  token: string | undefined;
  jsonBodyLimitBytes: number;
};

export function createCloudServer(
  store: CloudStore = createCloudStore(),
  options: CloudServerOptions = {}
): http.Server {
  const config = {
    token: options.token ?? process.env.ANT_CLOUD_TOKEN,
    jsonBodyLimitBytes: options.jsonBodyLimitBytes ?? DEFAULT_JSON_BODY_LIMIT_BYTES
  };

  return http.createServer(async (req, res) => {
    try {
      await route(req, res, store, config);
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
  if (!process.env.ANT_CLOUD_TOKEN) {
    console.error("Warning: ANT_CLOUD_TOKEN is not set. Running unauthenticated local alpha cloud API.");
  }
  const server = createCloudServer(store);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.error(`ANT cloud alpha listening on http://localhost:${port}`);
  return server;
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  store: CloudStore,
  options: CloudServerConfig
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/memories") {
    requireMethod(req, ["POST"]);
    requireAuth(req, options.token);
    const body = await readJson(req, options.jsonBodyLimitBytes);
    const memory = memoryFromRequest(body);
    const saved = await store.save(memory);
    sendJson(res, 201, { id: saved.id, memory: saved });
    return;
  }

  if (url.pathname === "/search") {
    requireMethod(req, ["GET"]);
    requireAuth(req, options.token);
    const query = url.searchParams.get("q") ?? "";
    const context = parseContext(url.searchParams.get("context"));
    sendJson(res, 200, { memories: await store.search(query, context) });
    return;
  }

  const workedMatch = url.pathname.match(/^\/memories\/([^/]+)\/worked$/);
  if (workedMatch) {
    requireMethod(req, ["POST"]);
    requireAuth(req, options.token);
    const memory = await store.markWorked(decodeURIComponent(workedMatch[1]));
    sendJson(res, 200, { message: `Memory ${memory.id} marked worked.`, memory });
    return;
  }

  const failedMatch = url.pathname.match(/^\/memories\/([^/]+)\/failed$/);
  if (failedMatch) {
    requireMethod(req, ["POST"]);
    requireAuth(req, options.token);
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
      if (!uuidPattern.test(maybeMemory.id)) {
        throw new HttpError(400, "Memory id must be a UUID when provided.");
      }
      memory.id = maybeMemory.id;
    }
  }
  return memory;
}

async function readJson(req: IncomingMessage, limitBytes: number): Promise<unknown> {
  const contentLength = req.headers["content-length"];
  if (typeof contentLength === "string" && Number(contentLength) > limitBytes) {
    throw new HttpError(413, `JSON body exceeds ${limitBytes} bytes.`);
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limitBytes) {
      throw new HttpError(413, `JSON body exceeds ${limitBytes} bytes.`);
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(stripBom(raw)) : {};
  } catch {
    throw new HttpError(400, "Malformed JSON body.");
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseContext(raw: string | null): Record<string, string> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new HttpError(400, "Malformed search context JSON.");
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function statusForError(error: unknown): number {
  if (error instanceof HttpError) {
    return error.status;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("failed publish review") ||
    message.includes("not public-safe") ||
    message.includes("high-severity") ||
    message.includes("draft or incomplete")
  ) {
    return 400;
  }
  if (message.includes("not found") || message.includes("Not found")) {
    return 404;
  }
  return 500;
}

function requireMethod(req: IncomingMessage, allowed: string[]): void {
  if (!req.method || !allowed.includes(req.method)) {
    throw new HttpError(405, `Method ${req.method ?? "UNKNOWN"} not allowed. Use ${allowed.join(", ")}.`);
  }
}

function requireAuth(req: IncomingMessage, token: string | undefined): void {
  if (!token) {
    return;
  }

  if (req.headers.authorization !== `Bearer ${token}`) {
    throw new HttpError(401, "Unauthorized.");
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
