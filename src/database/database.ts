import initSqlJs, { BindParams, Database, SqlValue } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let dbInstance: Database | null = null;
let resolvedDbPath = path.resolve(process.cwd(), env.databasePath);
let saveTimer: NodeJS.Timeout | null = null;
let backupTimer: NodeJS.Timeout | null = null;

export function setDatabasePath(customPath: string): void {
  resolvedDbPath = path.resolve(customPath);
}

export function getDb(): Database {
  if (!dbInstance) {
    throw new Error('Database not initialized');
  }
  return dbInstance;
}

export function saveDatabase(): void {
  if (!dbInstance) return;
  try {
    const dir = path.dirname(resolvedDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = dbInstance.export();
    const tmpPath = `${resolvedDbPath}.tmp`;
    fs.writeFileSync(tmpPath, Buffer.from(data));
    fs.renameSync(tmpPath, resolvedDbPath);
  } catch (err) {
    logger.error('DB', 'Failed to persist database', err);
  }
}

export function backupDatabase(): string | null {
  if (!dbInstance) return null;
  try {
    const backupsDir = path.join(path.dirname(resolvedDbPath), 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(backupsDir, `feedbacks-${stamp}.db`);
    fs.writeFileSync(target, Buffer.from(dbInstance.export()));

    const existing = fs
      .readdirSync(backupsDir)
      .filter((f) => f.startsWith('feedbacks-') && f.endsWith('.db'))
      .map((f) => ({
        fullPath: path.join(backupsDir, f),
        mtime: fs.statSync(path.join(backupsDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const stale of existing.slice(7)) {
      fs.unlinkSync(stale.fullPath);
    }
    return target;
  } catch (err) {
    logger.error('DB', 'Failed to create rolling backup', err);
    return null;
  }
}

export function queryAll<T extends Record<string, unknown>>(
  sql: string,
  params: SqlValue[] = []
): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params as BindParams);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function queryOne<T extends Record<string, unknown>>(
  sql: string,
  params: SqlValue[] = []
): T | null {
  const rows = queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function executeRun(
  sql: string,
  params: SqlValue[] = [],
  persist: boolean = true
): { changes: number; lastInsertRowid: number } {
  const db = getDb();
  db.run(sql, params as BindParams);
  const changes = db.getRowsModified();
  const idRes = db.exec('SELECT last_insert_rowid() AS id');
  const rawId = idRes[0]?.values[0]?.[0];
  const lastInsertRowid = typeof rawId === 'number' ? rawId : Number(rawId || 0);
  if (persist) {
    saveDatabase();
  }
  return { changes, lastInsertRowid };
}

function ensureColumn(db: Database, table: string, column: string, definition: string): void {
  const res = db.exec(`PRAGMA table_info(${table})`);
  const cols = res[0]?.values?.map((row) => String(row[1])) ?? [];
  if (!cols.includes(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function applySchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS guild_configs (
      guild_id TEXT PRIMARY KEY,
      feedback_channel_id TEXT,
      approval_channel_id TEXT,
      log_channel_id TEXT,
      client_role_id TEXT,
      staff_role_id TEXT,
      panel_channel_id TEXT,
      panel_message_id TEXT,
      sticky_message_id TEXT,
      require_client_role INTEGER NOT NULL DEFAULT 0,
      require_approval INTEGER NOT NULL DEFAULT 0,
      sticky_panel INTEGER NOT NULL DEFAULT 1,
      strict_channel INTEGER NOT NULL DEFAULT 0,
      auto_feedback INTEGER NOT NULL DEFAULT 1,
      allow_helpful INTEGER NOT NULL DEFAULT 1,
      allow_self_edit INTEGER NOT NULL DEFAULT 1,
      allow_staff_tag INTEGER NOT NULL DEFAULT 1,
      dm_on_status INTEGER NOT NULL DEFAULT 1,
      use_canvas_stats INTEGER NOT NULL DEFAULT 1,
      use_canvas_card INTEGER NOT NULL DEFAULT 1,
      min_comment_length INTEGER NOT NULL DEFAULT 3,
      cooldown_minutes INTEGER NOT NULL DEFAULT 5,
      accent_color INTEGER NOT NULL DEFAULT 5793266,
      services_json TEXT,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT NOT NULL,
      staff_id TEXT,
      service TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'PUBLISHED',
      channel_id TEXT,
      message_id TEXT,
      queue_channel_id TEXT,
      queue_message_id TEXT,
      moderator_id TEXT,
      reject_reason TEXT,
      staff_reply TEXT,
      staff_reply_by TEXT,
      staff_reply_at INTEGER,
      helpful_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      edited_at INTEGER,
      UNIQUE(guild_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_feedbacks_guild_status_created
      ON feedbacks (guild_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_feedbacks_guild_user
      ON feedbacks (guild_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_feedbacks_guild_staff
      ON feedbacks (guild_id, staff_id, status);
    CREATE INDEX IF NOT EXISTS idx_feedbacks_message
      ON feedbacks (message_id);

    CREATE TABLE IF NOT EXISTS helpful_votes (
      feedback_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (feedback_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS feedback_blacklist (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );
  `);

  ensureColumn(db, 'guild_configs', 'sticky_message_id', 'TEXT');
  ensureColumn(db, 'guild_configs', 'auto_feedback', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'guild_configs', 'use_canvas_card', 'INTEGER NOT NULL DEFAULT 1');
}

export async function initDatabase(customPath?: string): Promise<void> {
  if (customPath) {
    setDatabasePath(customPath);
  }
  const dir = path.dirname(resolvedDbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const SQL = await initSqlJs();
  if (fs.existsSync(resolvedDbPath)) {
    const fileBuffer = fs.readFileSync(resolvedDbPath);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  applySchema(dbInstance);
  saveDatabase();

  if (!saveTimer) {
    saveTimer = setInterval(saveDatabase, 30_000);
    saveTimer.unref();
  }
  if (!backupTimer) {
    backupTimer = setInterval(backupDatabase, 12 * 60 * 60 * 1000);
    backupTimer.unref();
  }

  logger.success('DB', `SQLite initialized at ${resolvedDbPath}`);
}

export function closeDatabase(): void {
  if (saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
  if (dbInstance) {
    saveDatabase();
    dbInstance.close();
    dbInstance = null;
  }
}
