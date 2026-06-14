/**
 * 会话管理 — TS Core 版会话列表/创建/删除
 * 替代 Python sessions.py / projects.py API
 */

import { app } from "electron"
import { join } from "path"
import fs from "fs"
import { randomUUID } from "crypto"
import { loadSession, saveSession } from "./session-store"
import type { StoredSession } from "./session-store"

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

const SESSIONS_DIR = "sessions"
const PROJECTS_FILE = "projects.json"

function getDataDir(): string {
  return app.getPath("userData")
}

function getProjectsPath(): string {
  return join(getDataDir(), PROJECTS_FILE)
}

function loadProjects(): ProjectInfo[] {
  try {
    const path = getProjectsPath()
    if (fs.existsSync(path)) {
      return JSON.parse(fs.readFileSync(path, "utf-8"))
    }
  } catch { /* 静默 */ }
  return []
}

function saveProjects(projects: ProjectInfo[]): void {
  const dir = getDataDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getProjectsPath(), JSON.stringify(projects, null, 2), "utf-8")
}

/** 创建项目 */
export function createProject(name: string, workspacePath: string): ProjectInfo {
  const project: ProjectInfo = {
    project_id: `proj_${Date.now().toString(36)}`,
    name,
    workspace_path: workspacePath,
  }
  const projects = loadProjects()
  projects.push(project)
  saveProjects(projects)
  return project
}

/** 列出所有项目 */
export function listProjects(): ProjectInfo[] {
  return loadProjects()
}

/** 创建新会话 */
export function createSession(projectId: string, title?: string): SessionInfo {
  const sessionId = `ses_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()
  const projects = loadProjects()
  const project = projects.find((p) => p.project_id === projectId)

  const session: StoredSession = {
    id: sessionId,
    title: title || `新会话 ${new Date().toLocaleDateString("zh-CN")}`,
    created: now,
    updated: now,
    messages: [],
    workspace: project?.workspace_path || "",
  }
  saveSession(session)

  return {
    session_id: sessionId,
    project_id: projectId,
    title: session.title,
    kind: "session",
    workspace_path: session.workspace,
    message_count: 0,
    updated_at: now,
  }
}

/** 列出项目下的所有会话 */
export function listSessions(projectId?: string): SessionInfo[] {
  const sessionsDir = join(getDataDir(), SESSIONS_DIR)
  if (!fs.existsSync(sessionsDir)) return []

  try {
    const items: (SessionInfo | null)[] = fs.readdirSync(sessionsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const content = fs.readFileSync(join(sessionsDir, f), "utf-8")
          const s: StoredSession = JSON.parse(content)
          return {
            session_id: s.id,
            project_id: projectId || "",
            title: s.title,
            kind: "session" as SessionInfo["kind"],
            workspace_path: s.workspace,
            message_count: s.messages.length,
            updated_at: s.updated,
          }
        } catch { return null }
      })
    return items
      .filter((s): s is SessionInfo => s !== null)
      .filter((s) => !projectId || s.project_id === projectId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  } catch {
    return []
  }
}

/** 获取会话消息历史（供 ChatWindow 加载） */
export function getSessionMessages(sessionId: string): Array<{ role: string; content: string; id: number }> {
  const stored = loadSession(sessionId)
  if (!stored) return []
  return stored.messages.map((m, i) => ({
    id: i,
    role: m.role,
    content: m.content,
  }))
}

/** 删除项目（同时删除其下的所有会话） */
export function deleteProjectById(projectId: string): void {
  // 删除项目下所有会话
  const sessions = listSessions(projectId)
  for (const s of sessions) {
    deleteSessionById(s.session_id)
  }
  // 从项目列表中移除
  const projects = loadProjects().filter((p) => p.project_id !== projectId)
  saveProjects(projects)
}

/** 搜索所有会话消息 */
export function searchMessages(query: string): Array<{ session_id: string; session_title: string; message: { role: string; content: string; timestamp: string }; context: string }> {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  const allSessions = listSessions()
  const results: Array<{ session_id: string; session_title: string; message: { role: string; content: string; timestamp: string }; context: string }> = []

  for (const session of allSessions) {
    const stored = loadSession(session.session_id)
    if (!stored) continue
    for (const msg of stored.messages) {
      if (msg.content.toLowerCase().includes(q)) {
        // 取前后文
        const idx = stored.messages.indexOf(msg)
        const prev = idx > 0 ? stored.messages[idx - 1].content.slice(0, 100) : ""
        const next = idx < stored.messages.length - 1 ? stored.messages[idx + 1].content.slice(0, 100) : ""
        results.push({
          session_id: session.session_id,
          session_title: session.title,
          message: { role: msg.role, content: msg.content.slice(0, 300), timestamp: msg.timestamp },
          context: `…${prev} → ${msg.content.slice(0, 100)} → ${next}…`,
        })
        if (results.length >= 50) return results
      }
    }
  }
  return results
}

/** 删除会话 */
export function deleteSessionById(sessionId: string): void {
  const path = join(getDataDir(), SESSIONS_DIR, `${sessionId}.json`)
  try { if (fs.existsSync(path)) fs.unlinkSync(path) } catch { /* 静默 */ }
}
