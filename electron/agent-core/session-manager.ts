import { app } from "electron"
import { join } from "path"
import fs from "fs"
import { randomUUID } from "crypto"
import { loadSession, listSessions as sqliteListSessions, saveSession } from "./session-store"
import type { StoredSession } from "./session-store"
import { getDbAsync, runWrite } from "./database"

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
  } catch {}
  return []
}

function saveProjects(projects: ProjectInfo[]): void {
  const dir = getDataDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getProjectsPath(), JSON.stringify(projects, null, 2), "utf-8")
}

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

export function listProjects(): ProjectInfo[] {
  return loadProjects()
}

export async function createSession(projectId: string, title?: string): Promise<SessionInfo> {
  const sessionId = `ses_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()
  const projects = loadProjects()
  const project = projects.find((p) => p.project_id === projectId)
  const workspace = project?.workspace_path || ""

  const db = await getDbAsync()
  runWrite(
    "INSERT INTO sessions (session_id, project_id, title, workspace, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [sessionId, projectId, title || `新会话 ${new Date().toLocaleDateString("zh-CN")}`, workspace, now, now],
  )

  return { session_id: sessionId, project_id: projectId, title: title || "新会话", kind: "session", workspace_path: workspace, message_count: 0, updated_at: now }
}

export async function listSessions(projectId?: string): Promise<SessionInfo[]> {
  const stored = await sqliteListSessions()
  return stored
    .filter((s) => !projectId || true) // 所有会话
    .map((s) => ({
      session_id: s.id,
      project_id: projectId || "",
      title: s.title,
      kind: "session" as SessionInfo["kind"],
      workspace_path: s.workspace,
      message_count: s.messages.length,
      updated_at: s.updated,
    }))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

export async function getSessionMessages(sessionId: string): Promise<Array<{ role: string; content: string; id: number }>> {
  const stored = await loadSession(sessionId)
  if (!stored) return []
  return stored.messages.map((m, i) => ({ id: i, role: m.role, content: m.content }))
}

export async function deleteProjectById(projectId: string): Promise<void> {
  const db = await getDbAsync()
  runWrite("DELETE FROM messages WHERE session_id IN (SELECT session_id FROM sessions WHERE project_id = ?)", [projectId])
  runWrite("DELETE FROM sessions WHERE project_id = ?", [projectId])
  const projects = loadProjects().filter((p) => p.project_id !== projectId)
  saveProjects(projects)
}

export async function searchMessages(query: string): Promise<Array<{ session_id: string; session_title: string; message: { role: string; content: string; timestamp: string }; context: string }>> {
  if (!query.trim()) return []
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
}
