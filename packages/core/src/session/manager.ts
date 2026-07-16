import { loadSession, listSessions as sqliteListSessions } from "../session/store"
import { getDbAsync, runWrite, reloadDatabase } from "../system/database"
import { getPlatformPaths } from "../config/paths"
import { join } from "path"
import fs from "fs"

export interface SessionInfo {
  session_id: string
  project_id: string
  title: string
  kind: "session" | "task"
  workspace_path: string
  message_count: number
  updated_at: string
}

export interface ProjectInfo {
  project_id: string
  name: string
  workspace_path: string
}

export async function createProject(name: string, workspacePath: string): Promise<ProjectInfo> {
  const project_id = `proj_${Date.now().toString(36)}`
  await getDbAsync()
  runWrite(
    "INSERT INTO projects (project_id, name, workspace_path) VALUES (?, ?, ?)",
    [project_id, name, workspacePath],
  )
  return { project_id, name, workspace_path: workspacePath }
}

export async function listProjects(): Promise<ProjectInfo[]> {
  reloadDatabase()
  const db = await getDbAsync()
  const rows = db.exec("SELECT project_id, name, workspace_path FROM projects")
  if (rows.length === 0) return []
  return rows[0].values.map((row) => {
    const [project_id, name, workspace_path] = row as string[]
    return { project_id, name, workspace_path: workspace_path || "" }
  })
}

export async function createSession(projectId: string, title?: string): Promise<SessionInfo> {
  const sessionId = `ses_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()
  const projects = await listProjects()
  const project = projects.find((p) => p.project_id === projectId)
  const workspace = project?.workspace_path || ""

  await getDbAsync()
  runWrite(
    "INSERT INTO sessions (session_id, project_id, title, workspace, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [sessionId, projectId, title || `新会话 ${new Date().toLocaleDateString("zh-CN")}`, workspace, now, now],
  )

  return { session_id: sessionId, project_id: projectId, title: title || "新会话", kind: "session", workspace_path: workspace, message_count: 0, updated_at: now }
}

export async function listSessions(projectId?: string): Promise<SessionInfo[]> {
  reloadDatabase()
  const db = await getDbAsync()
  const rows = db.exec(
    projectId
      ? "SELECT session_id, project_id, title, workspace, created_at, updated_at FROM sessions WHERE project_id = ? ORDER BY updated_at DESC"
      : "SELECT session_id, project_id, title, workspace, created_at, updated_at FROM sessions ORDER BY updated_at DESC",
    projectId ? [projectId] : [],
  )
  if (rows.length === 0) return []

  // 统计每个会话的消息数
  const countMap = new Map<string, number>()
  try {
    const countRows = db.exec(
      "SELECT session_id, COUNT(*) as cnt FROM messages GROUP BY session_id"
    )
    if (countRows.length > 0) {
      for (const row of countRows[0].values) {
        countMap.set(String(row[0]), Number(row[1]))
      }
    }
  } catch { /* messages 表可能不存在 */ }

  return rows[0].values.map((row) => {
    const [session_id, project_id, title, workspace, _created, updated_at] = row as string[]
    return {
      session_id,
      project_id: project_id || projectId || "",
      title: title || "",
      kind: "session" as SessionInfo["kind"],
      workspace_path: workspace || "",
      message_count: countMap.get(session_id) || 0,
      updated_at: updated_at || "",
    }
  })
}

export async function getSessionMessages(sessionId: string): Promise<Array<{ role: string; content: string; id: number; retryCount?: number }>> {
  reloadDatabase()
  const stored = await loadSession(sessionId)
  if (!stored) return []
  return stored.messages.map((m, i) => ({ id: i, role: m.role, content: m.content, retryCount: (m as any).retryCount || 0 }))
}

export async function updateProject(projectId: string, data: { name?: string; workspace_path?: string }): Promise<void> {
  const db = await getDbAsync()
  const updates: string[] = []
  const params: string[] = []
  if (data.name !== undefined) { updates.push("name = ?"); params.push(data.name) }
  if (data.workspace_path !== undefined) { updates.push("workspace_path = ?"); params.push(data.workspace_path) }
  if (updates.length === 0) return
  params.push(projectId)
  runWrite(`UPDATE projects SET ${updates.join(", ")} WHERE project_id = ?`, params)
}

export async function restoreSnapshot(snapshotId: string, workspace: string): Promise<string[]> {
  const { getSnapshotManager } = await import("./snapshot")
  const mgr = getSnapshotManager(workspace)
  return mgr.restore(snapshotId)
}

export async function updateSession(sessionId: string, data: { title?: string }): Promise<void> {
  const db = await getDbAsync()
  const updates: string[] = []
  const params: string[] = []
  if (data.title !== undefined) { updates.push("title = ?"); params.push(data.title) }
  if (updates.length === 0) return
  updates.push("updated_at = ?")
  params.push(new Date().toISOString())
  params.push(sessionId)
  runWrite(`UPDATE sessions SET ${updates.join(", ")} WHERE session_id = ?`, params)
}

export async function deleteProjectById(projectId: string): Promise<void> {
  const db = await getDbAsync()
  runWrite("DELETE FROM messages WHERE session_id IN (SELECT session_id FROM sessions WHERE project_id = ?)", [projectId])
  runWrite("DELETE FROM sessions WHERE project_id = ?", [projectId])
  runWrite("DELETE FROM projects WHERE project_id = ?", [projectId])
}

export async function searchMessages(query: string): Promise<Array<{ session_id: string; session_title: string; message: { role: string; content: string; timestamp: string }; context: string }>> {
  if (!query.trim()) return []
  const db = await getDbAsync()

  // 优先使用 FTS5 全文搜索
  try {
    const ftsResult = db.exec(
      `SELECT fts.session_id, fts.role, fts.content, s.title
       FROM messages_fts fts
       JOIN sessions s ON s.session_id = fts.session_id
       WHERE messages_fts MATCH ?
       ORDER BY rank LIMIT 50`,
      [query],
    )
    if (ftsResult.length > 0 && ftsResult[0].values.length > 0) {
      return ftsResult[0].values.map(row => ({
        session_id: row[0] as string,
        session_title: row[3] as string,
        message: { role: row[1] as string, content: (row[2] as string).slice(0, 300), timestamp: "" },
        context: (row[2] as string).slice(0, 100),
      }))
    }
  } catch { /* FTS5 不可用，回退到 LIKE */ }

  // LIKE 回退
  const q = query.toLowerCase()
  const allSessions = await sqliteListSessions()
  const results: Array<{ session_id: string; session_title: string; message: { role: string; content: string; timestamp: string }; context: string }> = []

  for (const s of allSessions) {
    for (const msg of s.messages) {
      if (msg.content.toLowerCase().includes(q)) {
        const idx = s.messages.indexOf(msg)
        const prev = idx > 0 ? s.messages[idx - 1].content.slice(0, 100) : ""
        const next = idx < s.messages.length - 1 ? s.messages[idx + 1].content.slice(0, 100) : ""
        results.push({
          session_id: s.id,
          session_title: s.title,
          message: { role: msg.role, content: msg.content.slice(0, 300), timestamp: msg.timestamp },
          context: `…${prev} → ${msg.content.slice(0, 100)} → ${next}…`,
        })
        if (results.length >= 50) return results
      }
    }
  }
  return results
}

export async function deleteSessionById(sessionId: string): Promise<void> {
  const db = await getDbAsync()
  runWrite("DELETE FROM messages WHERE session_id = ?", [sessionId])
  runWrite("DELETE FROM sessions WHERE session_id = ?", [sessionId])

  // 清理关联的记忆文件
  try {
    const baseDir = getPlatformPaths().userData
    // 清理 BuiltinMemoryProvider JSON
    const memoryPath = join(baseDir, "memory", `${sessionId}.json`)
    if (fs.existsSync(memoryPath)) fs.unlinkSync(memoryPath)
    // 清理 VectorMemoryProvider JSON
    const vectorPath = join(baseDir, "vector-memory", `${sessionId}.json`)
    if (fs.existsSync(vectorPath)) fs.unlinkSync(vectorPath)
    // 清理 CheckpointProvider 目录
    const checkpointDir = join(baseDir, "checkpoints", sessionId)
    if (fs.existsSync(checkpointDir)) fs.rmSync(checkpointDir, { recursive: true, force: true })
  } catch { /* 文件清理失败不阻塞主流程 */ }

  // 清理 FTS 记忆索引
  try {
    const initSqlJs = require("sql.js")
    const _SQL = await initSqlJs()
    const ftsPath = join(getPlatformPaths().userData, "fts-memory.db")
    if (fs.existsSync(ftsPath)) {
      const buffer = fs.readFileSync(ftsPath)
      const ftsDb = new _SQL.Database(buffer)
      ftsDb.run("DELETE FROM fts_memory WHERE session_id = ?", [sessionId])
      ftsDb.run("DELETE FROM fts_memory_fts WHERE session_id = ?", [sessionId])
      fs.writeFileSync(ftsPath, Buffer.from(ftsDb.export()))
      ftsDb.close()
    }
  } catch { /* FTS 清理失败不阻塞 */ }
}
