import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { Pool } from "pg";
import { assertCanSync } from "./cloudSafety";
import { rankMemories, type RankedMemory } from "./scoring";
import type { Memory, MemoryContext } from "./types";

export type CloudMemory = Memory & {
  worked_count: number;
  failed_count: number;
};

export type RankedCloudMemory = RankedMemory;

export type CloudStore = {
  init(): Promise<void>;
  save(memory: Memory): Promise<CloudMemory>;
  search(query: string, context?: Partial<MemoryContext>): Promise<RankedCloudMemory[]>;
  markWorked(id: string): Promise<CloudMemory>;
  markFailed(id: string): Promise<CloudMemory>;
  close(): Promise<void>;
};

const sqliteSchema = `
CREATE TABLE IF NOT EXISTS cloud_memories (
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
  updated_at TEXT NOT NULL,
  worked_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0
);
`;

const postgresSchema = `
CREATE TABLE IF NOT EXISTS cloud_memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  error_signature TEXT NOT NULL,
  context JSONB NOT NULL,
  cause TEXT NOT NULL,
  solution JSONB NOT NULL,
  evidence JSONB NOT NULL,
  privacy JSONB NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  worked_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0
);
`;

export function defaultCloudDbPath(cwd = process.cwd()): string {
  return path.join(cwd, ".ant-cloud", "cloud.sqlite");
}

export function createCloudStore(options: { dbPath?: string; databaseUrl?: string } = {}): CloudStore {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (databaseUrl && databaseUrl.startsWith("postgres")) {
    return new PostgresCloudStore(databaseUrl);
  }

  return new SqliteCloudStore(options.dbPath ?? process.env.ANT_CLOUD_DB_PATH ?? defaultCloudDbPath());
}

class SqliteCloudStore implements CloudStore {
  constructor(private readonly dbPath: string) {}

  async init(): Promise<void> {
    const SQL = await loadSql();
    const db = openSqlite(SQL, this.dbPath);
    db.run(sqliteSchema);
    saveSqlite(db, this.dbPath);
    db.close();
  }

  async save(memory: Memory): Promise<CloudMemory> {
    assertCanSync(memory);
    const SQL = await loadSql();
    const db = openSqlite(SQL, this.dbPath);
    db.run(sqliteSchema);
    const existing = getSqliteMemory(db, memory.id);
    const counts = existing ? { worked: existing.worked_count, failed: existing.failed_count } : { worked: 0, failed: 0 };
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO cloud_memories (
        id, title, problem, error_signature, context, cause, solution, evidence, privacy,
        created_at, updated_at, worked_count, failed_count
      ) VALUES (
        $id, $title, $problem, $error_signature, $context, $cause, $solution, $evidence, $privacy,
        $created_at, $updated_at, $worked_count, $failed_count
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
      $updated_at: memory.updated_at,
      $worked_count: counts.worked,
      $failed_count: counts.failed
    });
    stmt.free();
    const saved = getSqliteMemory(db, memory.id);
    saveSqlite(db, this.dbPath);
    db.close();
    if (!saved) {
      throw new Error("Failed to save memory");
    }
    return saved;
  }

  async search(query: string, context: Partial<MemoryContext> = {}): Promise<RankedCloudMemory[]> {
    const SQL = await loadSql();
    const db = openSqlite(SQL, this.dbPath);
    db.run(sqliteSchema);
    const rows = getSqliteMemories(db);
    db.close();
    return rankCloudMemories(rows, query, context);
  }

  async markWorked(id: string): Promise<CloudMemory> {
    return this.mark(id, "worked_count");
  }

  async markFailed(id: string): Promise<CloudMemory> {
    return this.mark(id, "failed_count");
  }

  async close(): Promise<void> {}

  private async mark(id: string, column: "worked_count" | "failed_count"): Promise<CloudMemory> {
    const SQL = await loadSql();
    const db = openSqlite(SQL, this.dbPath);
    db.run(sqliteSchema);
    if (!getSqliteMemory(db, id)) {
      db.close();
      throw new Error(`Memory not found: ${id}`);
    }
    const stmt = db.prepare(`UPDATE cloud_memories SET ${column} = ${column} + 1 WHERE id = $id`);
    stmt.run({ $id: id });
    stmt.free();
    const updated = getSqliteMemory(db, id);
    saveSqlite(db, this.dbPath);
    db.close();
    if (!updated) {
      throw new Error(`Memory not found: ${id}`);
    }
    return updated;
  }
}

class PostgresCloudStore implements CloudStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async init(): Promise<void> {
    await this.pool.query(postgresSchema);
  }

  async save(memory: Memory): Promise<CloudMemory> {
    assertCanSync(memory);
    await this.init();
    const result = await this.pool.query(
      `
      INSERT INTO cloud_memories (
        id, title, problem, error_signature, context, cause, solution, evidence, privacy,
        created_at, updated_at, worked_count, failed_count
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,0)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        problem = EXCLUDED.problem,
        error_signature = EXCLUDED.error_signature,
        context = EXCLUDED.context,
        cause = EXCLUDED.cause,
        solution = EXCLUDED.solution,
        evidence = EXCLUDED.evidence,
        privacy = EXCLUDED.privacy,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
      [
        memory.id,
        memory.title,
        memory.problem,
        memory.error_signature,
        memory.context,
        memory.cause,
        memory.solution,
        memory.evidence,
        memory.privacy,
        memory.created_at,
        memory.updated_at
      ]
    );
    return pgRowToMemory(result.rows[0]);
  }

  async search(query: string, context: Partial<MemoryContext> = {}): Promise<RankedCloudMemory[]> {
    await this.init();
    const result = await this.pool.query("SELECT * FROM cloud_memories ORDER BY updated_at DESC");
    return rankCloudMemories(result.rows.map(pgRowToMemory), query, context);
  }

  async markWorked(id: string): Promise<CloudMemory> {
    return this.mark(id, "worked_count");
  }

  async markFailed(id: string): Promise<CloudMemory> {
    return this.mark(id, "failed_count");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async mark(id: string, column: "worked_count" | "failed_count"): Promise<CloudMemory> {
    await this.init();
    const result = await this.pool.query(
      `UPDATE cloud_memories SET ${column} = ${column} + 1 WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!result.rows[0]) {
      throw new Error(`Memory not found: ${id}`);
    }
    return pgRowToMemory(result.rows[0]);
  }
}

function rankCloudMemories(
  memories: CloudMemory[],
  query: string,
  context: Partial<MemoryContext>
): RankedCloudMemory[] {
  return rankMemories(memories, query, context, { global: true });
}

async function loadSql(): Promise<SqlJsStatic> {
  return initSqlJs({
    locateFile: (file) => path.join(path.dirname(require.resolve("sql.js/dist/sql-wasm.js")), file)
  });
}

function openSqlite(SQL: SqlJsStatic, dbPath: string): Database {
  if (fs.existsSync(dbPath)) {
    return new SQL.Database(fs.readFileSync(dbPath));
  }
  return new SQL.Database();
}

function saveSqlite(db: Database, dbPath: string): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function getSqliteMemories(db: Database): CloudMemory[] {
  const stmt = db.prepare("SELECT * FROM cloud_memories ORDER BY updated_at DESC");
  const rows: CloudMemory[] = [];
  while (stmt.step()) {
    rows.push(sqliteRowToMemory(stmt.getAsObject()));
  }
  stmt.free();
  return rows;
}

function getSqliteMemory(db: Database, id: string): CloudMemory | undefined {
  const stmt = db.prepare("SELECT * FROM cloud_memories WHERE id = $id");
  stmt.bind({ $id: id });
  const memory = stmt.step() ? sqliteRowToMemory(stmt.getAsObject()) : undefined;
  stmt.free();
  return memory;
}

function sqliteRowToMemory(row: Record<string, unknown>): CloudMemory {
  return {
    id: String(row.id),
    title: String(row.title),
    problem: String(row.problem),
    error_signature: String(row.error_signature),
    context: JSON.parse(String(row.context)),
    cause: String(row.cause),
    solution: JSON.parse(String(row.solution)),
    evidence: JSON.parse(String(row.evidence)),
    privacy: JSON.parse(String(row.privacy)),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    worked_count: Number(row.worked_count),
    failed_count: Number(row.failed_count)
  };
}

function pgRowToMemory(row: Record<string, unknown>): CloudMemory {
  return {
    id: String(row.id),
    title: String(row.title),
    problem: String(row.problem),
    error_signature: String(row.error_signature),
    context: row.context as MemoryContext,
    cause: String(row.cause),
    solution: row.solution as Memory["solution"],
    evidence: row.evidence as Memory["evidence"],
    privacy: row.privacy as Memory["privacy"],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    worked_count: Number(row.worked_count),
    failed_count: Number(row.failed_count)
  };
}
