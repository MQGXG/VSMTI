import { getDbAsync, runWrite } from "./database"

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

export async function appendMessage(sessionID: string, message: StoredMessage): Promise<void> {
  const db = await getDbAsync()

  const existing = db.exec("SELECT title FROM sessions WHERE session_id = ?", [sessionID])
  const isNew = existing.length === 0 || existing[0].values.length === 0

  if (isNew) {
    runWrite(
      "INSERT INTO sessions (session_id, project_id, title, workspace, created_at, updated_at) VALUES (?, '', ?, '', datetime('now'), datetime('now'))",
      [sessionID, `会话 ${new Date().toLocaleDateString("zh-CN")}`],
    )
  }

  runWrite(
    "INSERT INTO messages (session_id, role, content, timestamp, tool_call_id) VALUES (?, ?, ?, ?, ?)",
    [sessionID, message.role, message.content, message.timestamp, message.toolCallId || null],
  )

  runWrite("UPDATE sessions SET updated_at = ? WHERE session_id = ?", [new Date().toISOString(), sessionID])

  // 第一条用户消息 → 更新会话标题
  if (message.role === "user" && message.content.trim()) {
    const msgCount = db.exec("SELECT COUNT(*) FROM messages WHERE session_id = ? AND role = 'user'", [sessionID])
    const count = msgCount.length > 0 ? Number(msgCount[0].values[0]) : 0
    if (count <= 1) {
      const preview = message.content.trim().slice(0, 50)
      runWrite("UPDATE sessions SET title = ? WHERE session_id = ?", [preview, sessionID])
    }
  }
}

export async function loadSession(sessionID: string): Promise<StoredSession | null> {
  try {
    const db = await getDbAsync()
    const result = db.exec("SELECT session_id, title, created_at, updated_at, workspace FROM sessions WHERE session_id = ?", [sessionID])
    if (result.length === 0 || result[0].values.length === 0) return null

    const row = result[0].values[0]
    const [id, title, created, updated, workspace] = row as string[]

    const msgResult = db.exec(
      "SELECT role, content, timestamp, tool_call_id FROM messages WHERE session_id = ? ORDER BY id ASC",
      [sessionID],
    )
    const messages: StoredMessage[] = msgResult.length > 0
      ? msgResult[0].values.map((r: any) => ({
          role: r[0] as StoredMessage["role"],
          content: r[1] as string,
          timestamp: r[2] as string,
          ...(r[3] ? { toolCallId: r[3] as string } : {}),
        }))
      : []

    return { id, title, created, updated, messages, workspace }
  } catch {
    return null
  }
}

export async function createSession(sessionID: string, workspace: string): Promise<StoredSession> {
  const now = new Date().toISOString()
  const session: StoredSession = {
    id: sessionID,
    title: `会话 ${new Date().toLocaleDateString("zh-CN")}`,
    created: now,
    updated: now,
    messages: [],
    workspace,
  }
  const db = await getDbAsync()
  runWrite(
    "INSERT OR IGNORE INTO sessions (session_id, project_id, title, workspace, created_at, updated_at) VALUES (?, '', ?, ?, ?, ?)",
    [sessionID, session.title, workspace, now, now],
  )
  return session
}

export async function saveSession(session: StoredSession): Promise<void> {
  const db = await getDbAsync()
  runWrite(
    "INSERT OR REPLACE INTO sessions (session_id, project_id, title, workspace, created_at, updated_at) VALUES (?, '', ?, ?, ?, ?)",
    [session.id, session.title, session.workspace, session.created, session.updated],
  )
  runWrite("DELETE FROM messages WHERE session_id = ?", [session.id])
  for (const msg of session.messages) {
    runWrite(
      "INSERT INTO messages (session_id, role, content, timestamp, tool_call_id) VALUES (?, ?, ?, ?, ?)",
      [session.id, msg.role, msg.content, msg.timestamp, msg.toolCallId || null],
    )
  }
}

export async function listSessions(): Promise<StoredSession[]> {
  try {
    const db = await getDbAsync()
    const result = db.exec("SELECT session_id FROM sessions ORDER BY updated_at DESC LIMIT 100")
    if (result.length === 0) return []
    const results = await Promise.all(
      result[0].values.map((row) => loadSession(String(row[0]))),
    )
    return results.filter((s): s is StoredSession => s !== null)
  } catch {
    return []
  }
}

export async function deleteSession(sessionID: string): Promise<void> {
  try {
    const db = await getDbAsync()
    runWrite("DELETE FROM messages WHERE session_id = ?", [sessionID])
    runWrite("DELETE FROM sessions WHERE session_id = ?", [sessionID])
  } catch {}
}

export async function messageCount(sessionID: string): Promise<number> {
  try {
    const db = await getDbAsync()
    const result = db.exec("SELECT COUNT(*) FROM messages WHERE session_id = ?", [sessionID])
    if (result.length === 0 || result[0].values.length === 0) return 0
    return (result[0].values[0][0] as number) || 0
  } catch {
    return 0
  }
}
