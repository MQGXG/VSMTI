/**
 * 会话持久化 — 使用 JSON 文件保存每个 session 的消息历史
 */

import { app } from "electron"
import { join } from "path"
import fs from "fs"

export interface StoredMessage {
  role: "user" | "assistant" | "tool"
  content: string
  timestamp: string
  toolCallId?: string
}

export interface StoredSession {
  id: string
  title: string
  created: string
  updated: string
  messages: StoredMessage[]
  workspace: string
}

const MAX_SESSIONS = 100

function getStoreDir(): string {
  return join(app.getPath("userData"), "sessions")
}

function getSessionPath(id: string): string {
  return join(getStoreDir(), `${id}.json`)
}

/** 保存一条消息到会话 */
export function appendMessage(sessionID: string, message: StoredMessage): void {
  const session = loadSession(sessionID) || createSession(sessionID, "")
  session.messages.push(message)
  session.updated = new Date().toISOString()
  saveSession(session)
}

/** 加载完整会话 */
export function loadSession(sessionID: string): StoredSession | null {
  try {
    const path = getSessionPath(sessionID)
    if (!fs.existsSync(path)) return null
    return JSON.parse(fs.readFileSync(path, "utf-8"))
  } catch {
    return null
  }
}

/** 创建新会话 */
export function createSession(sessionID: string, workspace: string): StoredSession {
  const now = new Date().toISOString()
  return {
    id: sessionID,
    title: `会话 ${new Date().toLocaleDateString("zh-CN")}`,
    created: now,
    updated: now,
    messages: [],
    workspace,
  }
}

/** 保存会话 */
export function saveSession(session: StoredSession): void {
  try {
    const dir = getStoreDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(getSessionPath(session.id), JSON.stringify(session, null, 2), "utf-8")
  } catch { /* 静默忽略 */ }
}

/** 列出所有已保存会话（最新在前） */
export function listSessions(): StoredSession[] {
  try {
    const dir = getStoreDir()
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(join(dir, f), "utf-8"))
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((a: StoredSession, b: StoredSession) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
      .slice(0, MAX_SESSIONS)
  } catch {
    return []
  }
}

/** 删除会话 */
export function deleteSession(sessionID: string): void {
  try {
    const path = getSessionPath(sessionID)
    if (fs.existsSync(path)) fs.unlinkSync(path)
  } catch { /* 静默忽略 */ }
}

/** 获取会话消息数量 */
export function messageCount(sessionID: string): number {
  const session = loadSession(sessionID)
  return session?.messages.length || 0
}
