import { createMemory } from "./schema";
import { memoryFromJson } from "./input";
import {
  getMemory,
  insertMemory,
  listMemories,
  listMemoryOutcomes,
  markMemoryOutcome,
  searchMemories
} from "./db";
import type { Memory, MemoryContext, MemoryOutcome } from "./types";

export type SearchMemoryInput = {
  query: string;
  context?: Partial<MemoryContext>;
};

export type ScoredMemory = Pick<
  Memory,
  "id" | "title" | "problem" | "error_signature" | "cause" | "solution" | "evidence"
> & {
  score: number;
};

export async function searchMemoryTool(args: SearchMemoryInput, dbPath?: string): Promise<{ memories: ScoredMemory[] }> {
  const matches = await searchMemories(args.query, dbPath);
  const memories = matches
    .map((memory) => toScoredMemory(memory, args.query, args.context ?? {}))
    .sort((left, right) => right.score - left.score);

  return { memories };
}

export async function saveMemoryTool(args: { memory: unknown }, dbPath?: string): Promise<{ id: string }> {
  const memory = createMemory(memoryFromJson(args.memory));
  await insertMemory(memory, dbPath);
  return { id: memory.id };
}

export async function inspectMemoriesTool(args: { limit?: number } = {}, dbPath?: string): Promise<{ memories: Memory[] }> {
  const memories = await listMemories(dbPath);
  return { memories: typeof args.limit === "number" ? memories.slice(0, args.limit) : memories };
}

export async function markMemoryWorkedTool(
  args: { id: string; note?: string },
  dbPath?: string
): Promise<{ success: true; message: string }> {
  await markMemory(args.id, "worked", args.note, dbPath);
  return { success: true, message: `Memory ${args.id} marked as worked.` };
}

export async function markMemoryFailedTool(
  args: { id: string; reason?: string; note?: string },
  dbPath?: string
): Promise<{ success: true; message: string }> {
  await markMemory(args.id, "failed", args.reason ?? args.note, dbPath);
  return { success: true, message: `Memory ${args.id} marked as failed.` };
}

export async function memoryWithOutcomes(
  id: string,
  dbPath?: string
): Promise<{ memory: Memory; outcomes: MemoryOutcome[] }> {
  const memory = await getRequiredMemory(id, dbPath);
  return { memory, outcomes: await listMemoryOutcomes(id, dbPath) };
}

async function markMemory(
  id: string,
  status: "worked" | "failed",
  note = "",
  dbPath?: string
): Promise<{ memory: Memory; outcome: MemoryOutcome }> {
  const memory = await getRequiredMemory(id, dbPath);
  const outcome = await markMemoryOutcome(id, status, note, dbPath);
  return { memory, outcome };
}

async function getRequiredMemory(id: string, dbPath?: string): Promise<Memory> {
  const memory = await getMemory(id, dbPath);
  if (!memory) {
    throw new Error(`Memory not found: ${id}`);
  }

  return memory;
}

function toScoredMemory(memory: Memory, query: string, context: Partial<MemoryContext>): ScoredMemory {
  return {
    id: memory.id,
    title: memory.title,
    problem: memory.problem,
    error_signature: memory.error_signature,
    cause: memory.cause,
    solution: memory.solution,
    evidence: memory.evidence,
    score: scoreMemory(memory, query, context)
  };
}

function scoreMemory(memory: Memory, query: string, context: Partial<MemoryContext>): number {
  const queryTerms = tokenize(query);
  const searchable = normalize(`${memory.title} ${memory.problem} ${memory.error_signature} ${memory.cause} ${JSON.stringify(memory.solution)} ${JSON.stringify(memory.evidence)}`);
  const matchedTerms = queryTerms.filter((term) => searchable.includes(term)).length;
  const queryScore = queryTerms.length === 0 ? 0 : matchedTerms / queryTerms.length;

  const contextEntries = Object.entries(context).filter((entry): entry is [keyof MemoryContext, string] => {
    return typeof entry[1] === "string" && entry[1].trim() !== "";
  });
  const matchedContext = contextEntries.filter(([key, value]) => normalize(memory.context[key]).includes(normalize(value))).length;
  const contextScore = contextEntries.length === 0 ? 0 : matchedContext / contextEntries.length;

  return Number(Math.min(1, queryScore * 0.75 + contextScore * 0.25).toFixed(3));
}

function tokenize(query: string): string[] {
  return query
    .split(/\s+/)
    .map((term) => normalize(term))
    .filter(Boolean);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
