/**
 * Agent Service — Agent 执行与工具调用
 */

export interface ToolInfo {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolResult {
  success: boolean
  output?: string
  error?: string
}

export interface SkillInfo {
  name: string
  description: string
  category: string | null
}

export interface AgentEvent {
  type: string
  [key: string]: unknown
}

export const AgentService = {
  // ─── 工具 ──────────────────────────────────────────────────

  async listTools(): Promise<ToolInfo[]> {
    return window.electronAPI.agent.listTools()
  },

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    return window.electronAPI.agent.executeTool(name, args)
  },

  // ─── Skill ─────────────────────────────────────────────────

  async listSkills(): Promise<SkillInfo[]> {
    return window.electronAPI.agent.listSkills()
  },

  // ─── 流式执行 ──────────────────────────────────────────────

  async startStream(
    sessionId: string,
    message: string,
    config: Record<string, unknown>
  ): Promise<string> {
    return window.electronAPI.agent.startStream(sessionId, message, config)
  },

  async stopStream(channel: string): Promise<void> {
    return window.electronAPI.agent.stopStream(channel)
  },

  async replyPermission(
    channel: string,
    requestId: string,
    reply: "allow" | "deny" | "always"
  ): Promise<void> {
    return window.electronAPI.agent.replyPermission(channel, requestId, reply)
  },

  onEvent(channel: string, callback: (event: AgentEvent) => void): () => void {
    return window.electronAPI.agent.onEvent(channel, callback)
  },

  // ─── 任务 ──────────────────────────────────────────────────

  task: {
    async create(summary: string, parentId?: string) {
      return window.electronAPI.agent.task.create(summary, parentId)
    },
    async list(status?: string) {
      return window.electronAPI.agent.task.list(status)
    },
    async get(taskId: string) {
      return window.electronAPI.agent.task.get(taskId)
    },
  },

  // ─── 子 Agent ──────────────────────────────────────────────

  subagent: {
    async spawn(description: string, options?: { parentId?: string; prompt?: string }) {
      return window.electronAPI.agent.subagent.spawn(description, options)
    },
    async wait(id: string, timeoutMs?: number) {
      return window.electronAPI.agent.subagent.wait(id, timeoutMs)
    },
    async cancel(id: string) {
      return window.electronAPI.agent.subagent.cancel(id)
    },
    async list(filter?: { parentId?: string; status?: string }) {
      return window.electronAPI.agent.subagent.list(filter)
    },
  },

  // ─── Goal ──────────────────────────────────────────────────

  goal: {
    async set(description: string, timeoutMs?: number) {
      return window.electronAPI.agent.goal.set(description)
    },
    async getActive() {
      return window.electronAPI.agent.goal.getActive()
    },
    async list() {
      return window.electronAPI.agent.goal.list()
    },
    async cancel() {
      return window.electronAPI.agent.goal.cancel()
    },
  },
}
