/**
 * Session Service — 会话管理
 */

export interface SessionInfo {
  session_id: string
  project_id: string
  title: string
  kind: "session" | "task"
  workspace_path: string
  message_count: number
  updated_at: string
}

export interface SessionMessage {
  id: number
  role: string
  content: string
}

export interface SearchResult {
  session_id: string
  session_title: string
  message: { role: string; content: string; timestamp: string }
  context: string
}

export const SessionService = {
  async list(projectId?: string): Promise<SessionInfo[]> {
    return window.electronAPI.ts.listSessions(projectId)
  },

  async create(projectId: string, title?: string): Promise<SessionInfo> {
    return window.electronAPI.ts.createSession(projectId, title)
  },

  async delete(sessionId: string): Promise<void> {
    return window.electronAPI.ts.deleteSession(sessionId)
  },

  async getMessages(sessionId: string): Promise<SessionMessage[]> {
    return window.electronAPI.ts.getSessionMessages(sessionId)
  },

  async search(query: string): Promise<SearchResult[]> {
    return window.electronAPI.ts.searchMessages(query)
  },
}
