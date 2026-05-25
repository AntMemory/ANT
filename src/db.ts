import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { findDuplicate, findDuplicates, mergeMemories, type DedupeCandidate, type MergeResult } from "./dedupe";
import { rankMemories, type RankedMemory } from "./scoring";
import type { Memory, MemoryContext, MemoryOutcome, MemoryOutcomeStatus } from "./types";

const schemaSql = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  error_signature TEXT NOT NULL,
  context TEXT NOT NULL,
  cause TEXT NOT NULL,
  solution TEXT NOT NULL,
  evidence TEXT NOT NULL,
  privacy TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_search
ON memories(title, problem, error_signature, cause);

CREATE TABLE IF NOT EXISTS memory_outcomes (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('worked', 'failed')),
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES memories(id)
);

CREATE INDEX IF NOT EXISTS idx_memory_outcomes_memory_id
ON memory_outcomes(memory_id, created_at);
`;

export function defaultDbPath(cwd = process.cwd()): string {
  return path.join(cwd, ".ant", "memory.sqlite");
}

export async function initDatabase(dbPath = defaultDbPath()): Promise<void> {
  const SQL = await loadSql();
  const db = openDatabase(SQL, dbPath);
  db.run(schemaSql);
  saveDatabase(db, dbPath);
  db.close();
}

export async function insertMemory(memory: Memory, dbPath = defaultDbPath()): Promise<void> {
  const SQL = await loadSql();
  const db = openDatabase(SQL, dbPath);
  db.run(schemaSql);
  const stmt = db.prepare(`
    INSERT INTO memories (
      id, title, problem, error_signature, context, cause, solution, evidence, privacy, created_at, updated_at
    ) VALUES (
      $id, $title, $problem, $error_signature, $context, $cause, $solution, $evidence, $privacy, $created_at, $updated_at
    )
  `);

  stmt.run({
    $id: memory.id,
    $title: memory.title,
    $problem: memory.problem,
    $error_signature: memory.error_signature,
    $context: JSON.stringify(memory.context),
    $cause: memory.cause,
    $solution: JSON.stringify(memory.solution),
    $evidence: JSON.stringify(memory.evidence),
    $privacy: JSON.stringify(memory.privacy),
    $created_at: memory.created_at,
    $updated_at: memory.updated_at
  });
  stmt.free();
  saveDatabase(db, dbPath);
  db.close();
}

export async function saveMemory(memory: Memory, options: { forceNew?: boolean; dbPath?: string } = {}): Promise<MergeResult> {
  const dbPath = options.dbPath ?? defaultDbPath();
  if (options.forceNew) {
    await insertMemory(memory, dbPath);
    return { memory, merged: false };
  }

  const existing = await listMemories(dbPath).catch(() => []);
  const duplicate = findDuplicate(memory, existing);
  if (!duplicate) {
    await insertMemory(memory, dbPath);
    return { memory, merged: false };
  }

  const merged = mergeMemories(duplicate.canonical, memory);
  await updateMemory(merged, dbPath);
  return { memory: merged, merged: true, duplicateOf: duplicate.canonical.id };
}

export async function dedupeMemories(options: { dryRun?: boolean; dbPath?: string } = {}): Promise<DedupeCandidate[]> {
  const dbPath = options.dbPath ?? defaultDbPath();
  const memories = await listMemories(dbPath);
  const candidates = findDuplicates(memories);
  if (options.dryRun) {
    return candidates;
  }

  for (const candidate of candidates) {
    const merged = mergeMemories(candidate.canonical, candidate.duplicate);
    await updateMemory(merged, dbPath);
    await moveOutcomes(candidate.duplicate.id, candidate.canonical.id, dbPath);
    await deleteMemory(candidate.duplicate.id, dbPath);
  }

  return candidates;
}

export async function updateMemory(memory: Memory, dbPath = defaultDbPath()): Promise<void> {
  const SQL = await loadSql();
  const db = openExistingDatabase(SQL, dbPath);
  db.run(schemaSql);
  const stmt = db.prepare(`
    UPDATE memories SET
      title = $title,
      problem = $problem,
      error_signature = $error_signature,
      context = $context,
      cause = $cause,
      solution = $solution,
      evidence = $evidence,
      privacy = $privacy,
      created_at = $created_at,
      updated_at = $updated_at
    WHERE id = $id
  `);
  stmt.run({
    $id: memory.id,
    $title: memory.title,
    $problem: memory.problem,
    $error_signature: memory.error_signature,
    $context: JSON.stringify(memory.context),
    $cause: memory.cause,
    $solution: JSON.stringify(memory.solution),
    $evidence: JSON.stringify(memory.evidence),
    $privacy: JSON.stringify(memory.privacy),
    $created_at: memory.created_at,
    $updated_at: memory.updated_at
  });
  stmt.free();
  saveDatabase(db, dbPath);
  db.close();
}

export async function listMemories(dbPath = defaultDbPath()): Promise<Memory[]> {
  const SQL = await loadSql();
  const db = openExistingDatabase(SQL, dbPath);
  const rows = selectMemories(db, "SELECT * FROM memories ORDER BY updated_at DESC");
  db.close();
  return rows;
}

export async function getMemory(id: string, dbPath = defaultDbPath()): Promise<Memory | undefined> {
  const SQL = await loadSql();
  const db = openExistingDatabase(SQL, dbPath);
  const stmt = db.prepare("SELECT * FROM memories WHERE id = $id");
  stmt.bind({ $id: id });
  const memory = stmt.step() ? rowToMemory(stmt.getAsObject()) : undefined;
  stmt.free();
  db.close();
  return memory;
}

export async function searchMemories(
  query: string,
  dbPath = defaultDbPath(),
  context: Partial<MemoryContext> = {}
): Promise<RankedMemory[]> {
  const SQL = await loadSql();
  const db = openExistingDatabase(SQL, dbPath);
  const rows = selectMemories(db, "SELECT * FROM memories ORDER BY updated_at DESC");
  const memoriesWithCounts = rows.map((memory) => ({
    ...memory,
    ...getOutcomeCounts(db, memory.id)
  }));
  db.close();
  return rankMemories(memoriesWithCounts, query, context);
}

export async function markMemoryOutcome(
  memoryId: string,
  status: MemoryOutcomeStatus,
  note = "",
  dbPath = defaultDbPath()
): Promise<MemoryOutcome> {
  const SQL = await loadSql();
  const db = openExistingDatabase(SQL, dbPath);
  db.run(schemaSql);

  const memoryStmt = db.prepare("SELECT id FROM memories WHERE id = $id");
  memoryStmt.bind({ $id: memoryId });
  const exists = memoryStmt.step();
  memoryStmt.free();
  if (!exists) {
    db.close();
    throw new Error(`Memory not found: ${memoryId}`);
  }

  const outcome: MemoryOutcome = {
    id: randomUUID(),
    memory_id: memoryId,
    status,
    note,
    created_at: new Date().toISOString()
  };
  const stmt = db.prepare(`
    INSERT INTO memory_outcomes (id, memory_id, status, note, created_at)
    VALUES ($id, $memory_id, $status, $note, $created_at)
  `);
  stmt.run({
    $id: outcome.id,
    $memory_id: outcome.memory_id,
    $status: outcome.status,
    $note: outcome.note,
    $created_at: outcome.created_at
  });
  stmt.free();
  saveDatabase(db, dbPath);
  db.close();
  return outcome;
}

export async function listMemoryOutcomes(memoryId: string, dbPath = defaultDbPath()): Promise<MemoryOutcome[]> {
  const SQL = await loadSql();
  const db = openExistingDatabase(SQL, dbPath);
  db.run(schemaSql);
  const stmt = db.prepare("SELECT * FROM memory_outcomes WHERE memory_id = $memory_id ORDER BY created_at DESC");
  stmt.bind({ $memory_id: memoryId });
  const outcomes: MemoryOutcome[] = [];
  while (stmt.step()) {
    outcomes.push(rowToMemoryOutcome(stmt.getAsObject()));
  }
  stmt.free();
  db.close();
  return outcomes;
}

async function moveOutcomes(fromId: string, toId: string, dbPath: string): Promise<void> {
  const SQL = await loadSql();
  const db = openExistingDatabase(SQL, dbPath);
  const stmt = db.prepare("UPDATE memory_outcomes SET memory_id = $to WHERE memory_id = $from");
  stmt.run({ $to: toId, $from: fromId });
  stmt.free();
  saveDatabase(db, dbPath);
  db.close();
}

async function deleteMemory(id: string, dbPath: string): Promise<void> {
  const SQL = await loadSql();
  const db = openExistingDatabase(SQL, dbPath);
  const stmt = db.prepare("DELETE FROM memories WHERE id = $id");
  stmt.run({ $id: id });
  stmt.free();
  saveDatabase(db, dbPath);
  db.close();
}

function selectMemories(db: Database, sql: string): Memory[] {
  const stmt = db.prepare(sql);
  const rows: Memory[] = [];
  while (stmt.step()) {
    rows.push(rowToMemory(stmt.getAsObject()));
  }
  stmt.free();
  return rows;
}

function rowToMemory(row: Record<string, unknown>): Memory {
  const privacy = JSON.parse(String(row.privacy));
  return {
    id: String(row.id),
    title: String(row.title),
    problem: String(row.problem),
    error_signature: String(row.error_signature),
    context: JSON.parse(String(row.context)),
    cause: String(row.cause),
    solution: JSON.parse(String(row.solution)),
    evidence: JSON.parse(String(row.evidence)),
    privacy: {
      redacted: Boolean(privacy.redacted),
      public_safe: Boolean(privacy.public_safe),
      redaction_warnings: Array.isArray(privacy.redaction_warnings) ? privacy.redaction_warnings : []
    },
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function rowToMemoryOutcome(row: Record<string, unknown>): MemoryOutcome {
  return {
    id: String(row.id),
    memory_id: String(row.memory_id),
    status: String(row.status) as MemoryOutcomeStatus,
    note: String(row.note),
    created_at: String(row.created_at)
  };
}

function getOutcomeCounts(db: Database, memoryId: string): { worked_count: number; failed_count: number } {
  const stmt = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'worked' THEN 1 ELSE 0 END) AS worked_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
    FROM memory_outcomes
    WHERE memory_id = $memory_id
  `);
  stmt.bind({ $memory_id: memoryId });
  const row = stmt.step() ? stmt.getAsObject() : {};
  stmt.free();
  return {
    worked_count: Number(row.worked_count ?? 0),
    failed_count: Number(row.failed_count ?? 0)
  };
}

async function loadSql(): Promise<SqlJsStatic> {
  return initSqlJs({
    locateFile: (file) => path.join(path.dirname(require.resolve("sql.js/dist/sql-wasm.js")), file)
  });
}

function openExistingDatabase(SQL: SqlJsStatic, dbPath: string): Database {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`ANT database not found at ${dbPath}. Run "ant init" first.`);
  }

  return new SQL.Database(fs.readFileSync(dbPath));
}

function openDatabase(SQL: SqlJsStatic, dbPath: string): Database {
  if (fs.existsSync(dbPath)) {
    return new SQL.Database(fs.readFileSync(dbPath));
  }

  return new SQL.Database();
}

function saveDatabase(db: Database, dbPath: string): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}
