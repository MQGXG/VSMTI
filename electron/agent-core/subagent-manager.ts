/**
 * Subagent Manager — 子智能体系统
 * 参考 MiMo-Code 的 subagent 系统
 * 支持：按需创建、并行执行、生命周期追踪、取消机制
 */

import { randomUUID } from "crypto"
import { Agent, type AgentConfig, type AgentEvent } from "./agent"
import { ToolRegistry } from "./registry"
import { logError } from "./logger"

export type SubagentStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface SubagentInfo {
  id: string
  parentId: string | null
  description: string
  status: SubagentStatus
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  result: string | null
  error: string | null
}

interface SubagentSession {
  info: SubagentInfo
  agent: Agent
  abortController: AbortController
  events: AgentEvent[]
  promise: Promise<SubagentInfo> | null
}

export class SubagentManager {
  private sessions = new Map<string, SubagentSession>()
  private registry: ToolRegistry

  constructor(registry: ToolRegistry) {
    this.registry = registry
  }

  /**
   * 创建并运行子智能体
   */
  async spawn(
    description: string,
    config: AgentConfig,
    options?: {
      parentId?: string
      prompt?: string
      model?: string
    }
  ): Promise<SubagentInfo> {
    const id = `sub-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`

    const info: SubagentInfo = {
      id,
      parentId: options?.parentId || null,
      description,
      status: "pending",
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
    }

    const agent = new Agent(
      this.registry,
      config.apiKey,
      config.apiUrl,
      config.workspace
    )

    const abortController = new AbortController()

    const session: SubagentSession = {
      info,
      agent,
      abortController,
      events: [],
      promise: null,
    }

    this.sessions.set(id, session)

    // 异步运行子智能体
    session.promise = this.runSubagent(session, config, options?.prompt || description)
      .catch((err) => {
        info.status = "failed"
        info.error = String(err)
        info.completedAt = new Date().toISOString()
        logError(`[SubagentManager] Subagent ${id} failed`, err)
        return info
      })

    return info
  }

  /**
   * 等待子智能体完成
   */
  async wait(id: string, timeoutMs = 300000): Promise<SubagentInfo> {
    const session = this.sessions.get(id)
    if (!session) throw new Error(`Subagent not found: ${id}`)
    if (!session.promise) throw new Error(`Subagent ${id} not started`)

    const result = await Promise.race([
      session.promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])

    if (result === null) {
      session.info.status = "cancelled"
      session.abortController.abort()
      return session.info
    }

    return result
  }

  /**
   * 取消子智能体
   */
  cancel(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false

    session.abortController.abort()
    session.info.status = "cancelled"
    session.info.completedAt = new Date().toISOString()
    return true
  }

  /**
   * 获取子智能体信息
   */
  getInfo(id: string): SubagentInfo | null {
    return this.sessions.get(id)?.info || null
  }

  /**
   * 列出所有子智能体
   */
  list(filter?: { parentId?: string; status?: SubagentStatus }): SubagentInfo[] {
    let infos = Array.from(this.sessions.values()).map(s => s.info)
    if (filter?.parentId) {
      infos = infos.filter(i => i.parentId === filter.parentId)
    }
    if (filter?.status) {
      infos = infos.filter(i => i.status === filter.status)
    }
    return infos
  }

  /**
   * 列出活跃子智能体
   */
  listActive(): SubagentInfo[] {
    return this.list({ status: "running" }).concat(this.list({ status: "pending" }))
  }

  /**
   * 取消所有子智能体
   */
  cancelAll(): void {
    for (const [id, session] of this.sessions) {
      if (session.info.status === "running" || session.info.status === "pending") {
        this.cancel(id)
      }
    }
  }

  /**
   * 生成子智能体树的文本表示
   */
  toText(): string {
    const lines: string[] = []
    const infos = Array.from(this.sessions.values()).map(s => s.info)

    // 按 parentId 分组
    const roots = infos.filter(i => !i.parentId)
    const children = new Map<string, SubagentInfo[]>()
    for (const info of infos) {
      if (info.parentId) {
        const list = children.get(info.parentId) || []
        list.push(info)
        children.set(info.parentId, list)
      }
    }

    const printTree = (info: SubagentInfo, indent = 0) => {
      const statusIcon = {
        pending: "○",
        running: "●",
        completed: "✓",
        failed: "✗",
        cancelled: "⊘",
      }[info.status]
      const prefix = "  ".repeat(indent)
      lines.push(`${prefix}${statusIcon} ${info.id}: ${info.description} [${info.status}]`)
      const kids = children.get(info.id) || []
      for (const kid of kids) {
        printTree(kid, indent + 1)
      }
    }

    for (const root of roots) {
      printTree(root)
    }

    return lines.join("\n")
  }

  /**
   * 生成系统提示
   */
  toSystemPrompt(): string {
    const active = this.listActive()
    if (active.length === 0) return ""
    return (
      `[Active subagents]\n` +
      active.map(s => `- ${s.id}: ${s.description} (${s.status})`).join("\n")
    )
  }

  private async runSubagent(
    session: SubagentSession,
    config: AgentConfig,
    prompt: string
  ): Promise<SubagentInfo> {
    const { info, agent, abortController } = session

    info.status = "running"
    info.startedAt = new Date().toISOString()

    try {
      const events: AgentEvent[] = []
      let finalText = ""

      for await (const event of agent.run(prompt, [], {
        ...config,
        sessionID: `${config.sessionID}-${info.id}`,
      })) {
        // 检查是否被取消
        if (abortController.signal.aborted) {
          info.status = "cancelled"
          info.completedAt = new Date().toISOString()
          return info
        }

        events.push(event)

        if (event.type === "content") {
          finalText += event.text
        } else if (event.type === "error") {
          info.status = "failed"
          info.error = event.message
          info.completedAt = new Date().toISOString()
          return info
        }
      }

      info.status = "completed"
      info.result = finalText
      info.completedAt = new Date().toISOString()
      session.events = events
      return info
    } catch (err) {
      info.status = "failed"
      info.error = String(err)
      info.completedAt = new Date().toISOString()
      throw err
    }
  }
}
