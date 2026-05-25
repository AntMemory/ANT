import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type ToolResult = {
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

const repoRoot = process.cwd();

async function main(): Promise<void> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ant-mcp-smoke-"));
  const client = new Client({ name: "ant-mcp-smoke", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "dist", "cli.js"), "mcp"],
    cwd,
    stderr: "pipe"
  });

  try {
    await client.connect(transport);

    const saveResult = await call(client, "save_memory", smokeMemory());
    const savedId = getPath<string>(saveResult, ["id"]);
    assert.match(savedId, /^[0-9a-f-]+$/, "save_memory did not return a saved memory id");
    console.log(`save_memory ok: ${savedId}`);

    const searchResult = await call(client, "search_memory", {
      query: "mcp smoke promise",
      context: {
        language: "TypeScript",
        framework: "MCP"
      }
    });
    const matches = getPath<unknown[]>(searchResult, ["memories"]);
    assert.ok(matches.length > 0, "search_memory returned no matches");
    assert.equal(getPath(matches[0], ["id"]), savedId, "search_memory did not return the saved memory first");
    assert.equal(typeof getPath(matches[0], ["score"]), "number", "search_memory did not include a score");
    console.log("search_memory ok");

    const inspectResult = await call(client, "inspect_memories", { limit: 1 });
    const inspected = getPath<unknown[]>(inspectResult, ["memories"]);
    assert.equal(inspected.length, 1, "inspect_memories did not respect limit: 1");
    assert.equal(getPath(inspected[0], ["id"]), savedId, "inspect_memories did not list the saved memory");
    console.log("inspect_memories ok");

    const workedResult = await call(client, "mark_memory_worked", { id: savedId });
    assert.equal(getPath(workedResult, ["success"]), true, "mark_memory_worked did not return success");
    console.log("mark_memory_worked ok");

    const failedResult = await call(client, "mark_memory_failed", {
      id: savedId,
      reason: "Smoke test exercised failure marking."
    });
    assert.equal(getPath(failedResult, ["success"]), true, "mark_memory_failed did not return success");
    console.log("mark_memory_failed ok");

    console.log("ANT MCP smoke test passed");
  } finally {
    await client.close();
  }
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  if (result.isError) {
    throw new Error(`${name} returned MCP error: ${JSON.stringify(result)}`);
  }

  const structured = result.structuredContent ?? parseTextContent(result);
  assert.ok(structured && typeof structured === "object", `${name} did not return structured JSON content`);
  return structured;
}

function parseTextContent(result: ToolResult): unknown {
  const text = result.content?.find((entry) => entry.type === "text")?.text;
  if (!text) {
    return undefined;
  }

  return JSON.parse(text);
}

function getPath<T>(value: unknown, pathParts: Array<string | number>): T {
  let current: unknown = value;
  for (const part of pathParts) {
    if (typeof part === "number") {
      assert.ok(Array.isArray(current), `Expected array while reading ${pathParts.join(".")}`);
      current = current[part];
      continue;
    }

    assert.ok(current && typeof current === "object", `Expected object while reading ${pathParts.join(".")}`);
    current = (current as Record<string, unknown>)[part];
  }

  assert.notEqual(current, undefined, `Missing ${pathParts.join(".")}`);
  return current as T;
}

function smokeMemory(): Record<string, unknown> {
  return {
    title: "MCP smoke test params promise memory",
    problem: "The MCP smoke test needs a memory that can be saved and found.",
    error_signature: "mcp smoke promise error",
    context: {
      language: "TypeScript",
      framework: "MCP",
      package_name: "@modelcontextprotocol/sdk",
      package_version: "1.x",
      runtime: "Node 20",
      os: process.platform,
      tool: "ant"
    },
    cause: "ANT MCP should expose the same local SQLite memory store as the CLI.",
    solution: {
      summary: "Start the MCP server and call every required tool.",
      steps: [
        "Call save_memory with a full ANT memory",
        "Call search_memory with a query and context",
        "Call inspect_memories",
        "Mark the memory worked and failed"
      ],
      commands: ["npm run test:mcp"],
      patch_example: "client.callTool({ name: \"save_memory\", arguments: memory })"
    },
    evidence: {
      verification_type: "MCP smoke test",
      commands_run: ["npm run test:mcp"]
    },
    privacy: {
      redacted: true,
      public_safe: true
    }
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
