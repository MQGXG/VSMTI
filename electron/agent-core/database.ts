import initSqlJs, { type Database as SqliteDb } from "sql.js"
import { app } from "electron"
import { join } from "path"
import fs from "fs"

let db: SqliteDb | null = null
let dbInitPromise: Promise<SqliteDb> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function getDbPath(): string | null {
  try {
    return join(app.getPath("userData"), "mira.db")
  } catch {
    return null // 测试环境中 app 不可用
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY, project_id TEXT DEFAULT '', title TEXT DEFAULT '',
    workspace TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
    role TEXT NOT NULL, content TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('now')), tool_call_id TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
  );
  CREATE TABLE IF NOT EXISTS permissions (
    workspace TEXT NOT NULL, action TEXT NOT NULL,
    resource TEXT DEFAULT '*', effect TEXT NOT NULL,
    PRIMARY KEY (workspace, action, resource)
  );
`

async function createDb(): Promise<SqliteDb> {
  const SQL = await initSqlJs()
  const dbPath = getDbPath()
  let buffer: Buffer | undefined
  if (dbPath) {
    try {
      const dir = app.getPath("userData")
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      if (fs.existsSync(dbPath)) buffer = fs.readFileSync(dbPath)
    } catch {}
  }
  const newDb = new SQL.Database(buffer)
  newDb.run("PRAGMA journal_mode=WAL")
  newDb.run(SCHEMA)
  return newDb
}

export async function initDatabase(): Promise<SqliteDb> {
  if (db) return db
  if (dbInitPromise) return dbInitPromise
  dbInitPromise = createDb()
  db = await dbInitPromise
  return db
}

export async function getDbAsync(): Promise<SqliteDb> {
  if (db) return db
  return initDatabase()
}

/** 执行 SQL 写入并自动触发持久化 */
export function runWrite(sql: string, params?: any[]): void {
  if (!db) throw new Error("数据库未初始化")
  // 参数类型安全校验：防止对象被误传为参数
  if (params) {
    for (let i = 0; i < params.length; i++) {
      if (typeof params[i] === "object" && params[i] !== null) {
        params[i] = JSON.stringify(params[i])
      }
    }
  }
  db.run(sql, params)
  scheduleSave()
}

/** 异步持久化到磁盘（防抖 500ms） */
export function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    if (!db) return
    persist()
  }, 500)
}

/** 立即持久化 */
export function flushSave(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (!db) return
  persist()
}

function persist(): void {
  const p = getDbPath()
  if (!p) return
  try {
    const data = db!.export()
    fs.writeFileSync(p, Buffer.from(data))
  } catch {}
}
