import { createMemory, validateNewMemory } from "./schema";
import { memoryFromJson } from "./input";
import {
  getMemory,
  listMemories,
  listMemoryOutcomes,
  markMemoryOutcome,
  saveMemory,
  searchMemories
} from "./db";
import type { Memory, MemoryContext, MemoryOutcome } from "./types";
import type { RankedMemory } from "./scoring";

export type SearchMemoryInput = {
  query: string;
  context?: Partial<MemoryContext>;
};

export type ScoredMemory = Pick<
  RankedMemory,
  "id" | "title" | "problem" | "error_signature" | "cause" | "solution" | "evidence"
> & {
  score: number;
  confidence: "low" | "medium" | "high";
  ranking_reason: string;
  worked_count: number;
  failed_count: number;
};

export async function searchMemoryTool(args: SearchMemoryInput, dbPath?: string): Promise<{ memories: ScoredMemory[] }> {
  const matches = await searchMemories(args.query, dbPath, args.context ?? {});
  const memories = matches.map(toScoredMemory);

  return { memories };
}

export async function saveMemoryTool(args: { memory: unknown }, dbPath?: string): Promise<{ id: string }> {
  const input = memoryFromJson(args.memory);
  validateNewMemory(input);
  const memory = createMemory(input);
  const result = await saveMemory(memory, { dbPath });
  return { id: result.memory.id };
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

function toScoredMemory(memory: RankedMemory): ScoredMemory {
  return {
    id: memory.id,
    title: memory.title,
    problem: memory.problem,
    error_signature: memory.error_signature,
    cause: memory.cause,
    solution: memory.solution,
    evidence: memory.evidence,
    score: memory.score,
    confidence: memory.confidence,
    ranking_reason: memory.ranking_reason,
    worked_count: memory.worked_count,
    failed_count: memory.failed_count
  };
}
