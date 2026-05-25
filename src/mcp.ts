#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import {
  inspectMemoriesTool,
  markMemoryFailedTool,
  markMemoryWorkedTool,
  saveMemoryTool,
  searchMemoryTool
} from "./mcpTools";

const contextSchema = z
  .object({
    language: z.string().optional(),
    framework: z.string().optional(),
    package_name: z.string().optional(),
    package_version: z.string().optional(),
    runtime: z.string().optional(),
    os: z.string().optional(),
    tool: z.string().optional()
  })
  .optional();

const memoryInputSchema = {
  title: z.string(),
  problem: z.string(),
  error_signature: z.string().optional(),
  context: z.object({
    language: z.string().optional(),
    framework: z.string().optional(),
    package_name: z.string().optional(),
    package_version: z.string().optional(),
    runtime: z.string().optional(),
    os: z.string().optional(),
    tool: z.string().optional()
  }),
  cause: z.string(),
  solution: z.object({
    summary: z.string(),
    steps: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional(),
    patch_example: z.string().optional()
  }),
  evidence: z
    .object({
      verification_type: z.string().optional(),
      commands_run: z.array(z.string()).optional()
    })
    .optional(),
  privacy: z
    .object({
      redacted: z.boolean().optional(),
      public_safe: z.boolean().optional()
    })
    .optional()
};

export function createAntMcpServer(): McpServer {
  const server = new McpServer({
    name: "ant-memory-ai",
    version: "0.0.0"
  });

  server.registerTool(
    "search_memory",
    {
      title: "Search ANT memory",
      description: "Search saved ANT memories in the local SQLite database.",
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
        context: contextSchema
      }
    },
    async ({ query, context }) => asJsonResult(await searchMemoryTool({ query, context }))
  );

  server.registerTool(
    "save_memory",
    {
      title: "Save ANT memory",
      description: "Save a structured ANT memory to the local SQLite database.",
      inputSchema: memoryInputSchema
    },
    async (memory) => asJsonResult(await saveMemoryTool({ memory }))
  );

  server.registerTool(
    "inspect_memories",
    {
      title: "Inspect ANT memories",
      description: "List recent saved ANT memories in the local SQLite database.",
      inputSchema: {
        limit: z.number().int().positive().optional().describe("Optional maximum number of memories to return")
      }
    },
    async ({ limit }) => asJsonResult(await inspectMemoriesTool({ limit }))
  );

  server.registerTool(
    "mark_memory_worked",
    {
      title: "Mark memory worked",
      description: "Record that a memory worked for a later coding task.",
      inputSchema: {
        id: z.string().min(1).describe("Memory id")
      }
    },
    async ({ id }) => asJsonResult(await markMemoryWorkedTool({ id }))
  );

  server.registerTool(
    "mark_memory_failed",
    {
      title: "Mark memory failed",
      description: "Record that a memory did not work for a later coding task.",
      inputSchema: {
        id: z.string().min(1).describe("Memory id"),
        reason: z.string().optional().describe("Optional reason why it failed")
      }
    },
    async ({ id, reason }) => asJsonResult(await markMemoryFailedTool({ id, reason }))
  );

  return server;
}

export async function startAntMcpServer(): Promise<void> {
  const server = createAntMcpServer();
  await server.connect(new StdioServerTransport());
}

function asJsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ],
    structuredContent: value as Record<string, unknown>
  };
}

if (require.main === module) {
  startAntMcpServer().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
