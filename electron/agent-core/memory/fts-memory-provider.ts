/**
 * FTS5 全文搜索 Memory Provider
 * 参考 MiMo-Code memory/service.ts — SQLite FTS5 + BM25
 */

import { MemoryProvider } from "./types"
import initSqlJs, { type Database as SqliteDb } from "sql.js"
import { app } from "electron"
import { join } from "path"
import * as fss from "fs"
import * as fsp from "fs/promises"
import * as pt from "path"

const DEFAULT_IGNORE_DIRS = ["node_modules", ".git", ".svn", ".hg", "target", "dist", "build", ".next", ".nuxt", "venv", "__pycache__", ".cache", ".idea", ".vscode", ".mimo", ".opencode"]
const DEFAULT_IGNORE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".woff", ".woff2", ".eot", ".ttf", ".otf", ".pyc", ".class", ".o", ".so", ".dll", ".exe", ".zip", ".tar", ".gz"]
const DEFAULT_MAX_FILE_SIZE = 100 * 1024
const DEFAULT_MAX_RESULTS = 5
const DEFAULT_SCORE_FLOOR = 0.15
const DEFAULT_RECONCILE_INTERVAL = 5 * 60 * 1000  // 5 分钟自动重索引
const DEFAULT_SAVE_INTERVAL = 60 * 1000  // 60 秒自动保存

export interface FTSMemoryOptions {
  ignoreDirs?: string[]
  ignoreExts?: string[]
  maxFileSize?: number
  maxResults?: number
  scoreFloor?: number
  reconcileInterval?: number  // ms, 0 禁用
  saveInterval?: number       // ms, 0 禁用
}

export class FTSMemoryProvider implements MemoryProvider {
  name = "fts-memory"
  private workspace = ""
  private db: SqliteDb | null = null
  private SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null
  private ready = false

  private ignoreDirs: Set<string>
  private ignoreExts: Set<string>
  private maxFileSize: number
  private maxResults: number
  private scoreFloor: number
  private reconcileInterval: number
  private saveInterval: number

  private reconcileTimer: ReturnType<typeof setInterval> | null = null
  private saveTimer: ReturnType<typeof setInterval> | null = null
  private reconciling = false

  /** 文件最后修改时间缓存，用于增量索引 */
  private fileMtimes = new Map<string, number>()

  constructor(opts?: FTSMemoryOptions) {
    this.ignoreDirs = new Set(opts?.ignoreDirs || DEFAULT_IGNORE_DIRS)
    this.ignoreExts = new Set(opts?.ignoreExts || DEFAULT_IGNORE_EXTS)
    this.maxFileSize = opts?.maxFileSize || DEFAULT_MAX_FILE_SIZE
    this.maxResults = opts?.maxResults || DEFAULT_MAX_RESULTS
    this.scoreFloor = opts?.scoreFloor ?? DEFAULT_SCORE_FLOOR
    this.reconcileInterval = opts?.reconcileInterval ?? DEFAULT_RECONCILE_INTERVAL
    this.saveInterval = opts?.saveInterval ?? DEFAULT_SAVE_INTERVAL
  }

  private dbPath(): string {
    try { return join(app.getPath("userData"), "fts-memory.db") } catch { return "" }
  }

  async initialize(_sessionID: string, workspace: string): Promise<void> {
    this.workspace = workspace
    this.SQL = await initSqlJs()
    const dbPath = this.dbPath()
    if (dbPath) {
      try {
        const buffer = fss.readFileSync(dbPath)
        this.db = new this.SQL.Database(buffer)
      } catch { /* 新数据库 */ }
    }
    if (!this.db) this.db = new this.SQL.Database()

    this.db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_files USING fts5(
      path UNINDEXED, content, filetype UNINDEXED, tokenize='unicode61'
    )`)

    // 启动定时器
    if (this.reconcileInterval > 0) {
      this.reconcileTimer = setInterval(() => this.reconcile(), this.reconcileInterval)
    }
    if (this.saveInterval > 0) {
      this.saveTimer = setInterval(() => this.save(), this.saveInterval)
    }

    this.ready = true
  }

  buildSystemPrompt(): string {
    return `你有一个 FTS5 全文搜索记忆系统(${this.ignoreDirs.size} 个忽略目录, ${this.ignoreExts.size} 种忽略格式)，可检索项目文件内容。通过 FTS5 + BM25 排序，分数阈值 ${(this.scoreFloor * 100).toFixed(0)}%。需要回忆之前见过的信息时，系统会自动搜索并提供相关上下文。`
  }

  async prefetch(query: string, _sessionID: string): Promise<string> {
    if (!this.ready) return ""
    try {
      return await this.search(query)
    } catch { return "" }
  }

  async syncTurn(_user: string, _assistant: string, _sessionID: string): Promise<void> {
    // FTS memory 不需要逐轮同步
  }

  async shutdown(): Promise<void> {
    if (this.reconcileTimer) { clearInterval(this.reconcileTimer); this.reconcileTimer = null }
    if (this.saveTimer) { clearInterval(this.saveTimer); this.saveTimer = null }
    this.save()
    if (this.db) { this.db.close(); this.db = null }
    this.ready = false
  }

  /** 索引重建：全量扫描，增量更新 */
  async reconcile(): Promise<{ indexed: number; pruned: number }> {
    if (!this.db || this.reconciling) return { indexed: 0, pruned: 0 }
    this.reconciling = true
    try {
      const files = await this.scanFiles(this.workspace)
      let indexed = 0
      let pruned = 0

      // 清理已不存在的文件
      const existing = this.db.exec("SELECT path FROM fts_files")
      const indexedPaths = new Set(existing[0]?.values?.map((r: any) => r[0]) || [])
      for (const p of indexedPaths) {
        if (!files.some((f) => f.path === p)) {
          this.db.run("DELETE FROM fts_files WHERE path = ?", [p])
          pruned++
        }
      }

      // 增量更新：只处理 mtime 变化的文件
      const insert = this.db.prepare("INSERT OR REPLACE INTO fts_files (path, content, filetype) VALUES (?, ?, ?)")
      for (const file of files) {
        try {
          const stat = await fsp.stat(file.path)
          const lastMtime = this.fileMtimes.get(file.path)
          if (lastMtime === stat.mtimeMs && indexedPaths.has(file.path)) continue // 未变更

          const content = await fsp.readFile(file.path, "utf-8")
          insert.run([file.path, content, file.filetype])
          this.fileMtimes.set(file.path, stat.mtimeMs)
          indexed++
        } catch { /* 跳过 */ }
      }
      insert.free()

      this.db.run("INSERT INTO fts_files(fts_files) VALUES('rebuild')")
      this.save()
      return { indexed, pruned }
    } finally {
      this.reconciling = false
    }
  }

  /** FTS5 全文搜索 */
  async search(query: string): Promise<string> {
    if (!this.db) return ""

    const terms = query
      .split(/[\s,，。；;：:！!？?、]+/)
      .filter(Boolean)
      .map((t) => `"${t.replace(/"/g, "")}"`)
      .join(" OR ")

    if (!terms) return ""

    try {
      const stmt = this.db.prepare(`
        SELECT path, snippet(fts_files_idx, 0, '<<', '>>', '...', 40) AS snippet,
               bm25(fts_files_idx) AS score
        FROM fts_files_idx JOIN fts_files ON fts_files.id = fts_files_idx.rowid
        WHERE fts_files_idx MATCH ?
        ORDER BY score LIMIT ?
      `)
      stmt.bind([terms, this.maxResults])

      const results: Array<{ path: string; snippet: string; score: number }> = []
      while (stmt.step()) {
        const row = stmt.getAsObject() as any
        if (row.path) results.push({ path: row.path, snippet: row.snippet, score: row.score })
      }
      stmt.free()

      if (results.length === 0) return ""

      // BM25 lower = better; scoreFloor relative to top hit
      const topScore = results[0].score
      const cutoff = this.scoreFloor > 0 ? topScore * (1 - this.scoreFloor) : -Infinity
      const relevant = results.filter((r, i) => i === 0 || r.score <= cutoff)

      return `[相关记忆]\n${relevant.map((r) =>
        `文件: ${pt.relative(this.workspace, r.path)}\n片段: ${r.snippet}\n相关度: ${(-r.score).toFixed(2)}`
      ).join("\n\n")}`
    } catch { return "" }
  }

  private save(): void {
    const dbPath = this.dbPath()
    if (!dbPath || !this.db) return
    try { fss.writeFileSync(dbPath, Buffer.from(this.db.export())) } catch { /* ignore */ }
  }

  private async scanFiles(dir: string): Promise<Array<{ path: string; filetype: string }>> {
    const results: Array<{ path: string; filetype: string }> = []
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = pt.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!this.ignoreDirs.has(entry.name) && !entry.name.startsWith(".")) {
            results.push(...(await this.scanFiles(fullPath)))
          }
        } else if (entry.isFile()) {
          const ext = pt.extname(entry.name).toLowerCase()
          if (!this.ignoreExts.has(ext)) {
            const stat = await fsp.stat(fullPath).catch(() => null)
            if (stat && stat.size <= this.maxFileSize) {
              results.push({ path: fullPath, filetype: ext.slice(1) || "txt" })
            }
          }
        }
      }
    } catch { /* 跳过无权限目录 */ }
    return results
  }
}
