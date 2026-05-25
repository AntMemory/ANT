import { assertCanSync } from "./cloudSafety";
import type { CloudMemory, RankedCloudMemory } from "./cloudStore";
import type { Memory, MemoryContext } from "./types";

export function cloudUrl(): string {
  return (process.env.ANT_CLOUD_URL ?? "http://localhost:3737").replace(/\/$/, "");
}

export async function uploadMemory(memory: Memory, baseUrl = cloudUrl()): Promise<{ id: string; memory: CloudMemory }> {
  assertCanSync(memory);
  const response = await fetch(`${baseUrl}/memories`, {
    method: "POST",
    headers: cloudHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(memory)
  });
  return readResponse(response);
}

export async function searchGlobalMemories(
  query: string,
  context: Partial<MemoryContext> = {},
  baseUrl = cloudUrl()
): Promise<{ memories: RankedCloudMemory[] }> {
  const url = new URL(`${baseUrl}/search`);
  url.searchParams.set("q", query);
  if (Object.keys(context).length > 0) {
    url.searchParams.set("context", JSON.stringify(context));
  }
  return readResponse(await fetch(url, { headers: cloudHeaders() }));
}

export async function markGlobalWorked(id: string, baseUrl = cloudUrl()): Promise<{ message: string; memory: CloudMemory }> {
  return readResponse(
    await fetch(`${baseUrl}/memories/${encodeURIComponent(id)}/worked`, {
      method: "POST",
      headers: cloudHeaders()
    })
  );
}

export async function markGlobalFailed(id: string, baseUrl = cloudUrl()): Promise<{ message: string; memory: CloudMemory }> {
  return readResponse(
    await fetch(`${baseUrl}/memories/${encodeURIComponent(id)}/failed`, {
      method: "POST",
      headers: cloudHeaders()
    })
  );
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? `Cloud API failed with ${response.status}`);
  }
  return body as T;
}

function cloudHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const token = process.env.ANT_CLOUD_TOKEN;
  if (!token) {
    return headers;
  }

  return { ...headers, authorization: `Bearer ${token}` };
}
