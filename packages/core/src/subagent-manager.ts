import { randomUUID } from "crypto"
import { Agent } from "./agent"
import type { AgentConfig, AgentEvent } from "./agent"
import type { ToolRegistry } from "./registry"
import type { LLMMessage } from "./llm-sdk"
import { logError } from "./logger"

export type SubagentStatus = "pending" | "running" | "completing" | "completed" | "failed" | "cancelled"

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

export type SubagentEventType = "created" | "started" | "completing" | "completed" | "failed" | "cancelled"

export interface SubagentEvent {
  type: SubagentEventType
  subagentId: string
  timestamp: string
  info: SubagentInfo
  parentEvent?: AgentEvent
}

interface SubagentSession {
  info: SubagentInfo
  agent: Agent
  abortController: AbortController
  events: AgentEvent[]
  promise: Promise<SubagentInfo> | null
  onEvent?: (event: SubagentEvent) => void
}

export class SubagentManager {
  private sessions = new Map<string, SubagentSession>()
  private registry: ToolRegistry
  private onEventCallback: ((event: SubagentEvent) => void) | null = null
  private maxParallel = 5
  private pendingQueue: Array<() => void> = []

  constructor(registry: ToolRegistry, options?: { maxParallel?: number }) {
    this.registry = registry
    if (options?.maxParallel) this.maxParallel = options.maxParallel
  }

  setMaxParallel(limit: number): void {
    this.maxParallel = Math.max(1, limit)
  }

  /** 当前活跃（running）的数量 */
  get activeCount(): number {
    return Array.from(this.sessions.values()).filter(s => s.info.status === "running").length
  }

  private async acquireSlot(): Promise<void> {
    while (this.activeCount >= this.maxParallel) {
      await new Promise<void>(resolve => this.pendingQueue.push(resolve))
    }
  }

  private releaseSlot(): void {
    const next = this.pendingQueue.shift()
    next?.()
  }

  onEvent(callback: (event: SubagentEvent) => void): void {
    this.onEventCallback = callback
  }

  /**
   * 创建并运行子智能体，支持共享父上下文
   */
  spawn(
    description: string,
    config: AgentConfig,
    options?: {
      parentId?: string
      prompt?: string
      model?: string
      parentContext?: LLMMessage[]
    }
  ): SubagentInfo {
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

    const agent = new Agent(this.registry, config.apiKey, config.apiUrl, config.workspace)
    const abortController = new AbortController()

    const session: SubagentSession = {
      info,
      agent,
      abortController,
      events: [],
      promise: null,
    }

    this.sessions.set(id, session)
    this.emitEvent("created", id)

    const parentContext = options?.parentContext || []
    this.acquireSlot().then(() => {
      session.promise = this.runSubagent(session, config, options?.prompt || description, id, parentContext)
        .catch((err) => {
          info.status = "failed"
          info.error = String(err)
          info.completedAt = new Date().toISOString()
          this.emitEvent("failed", id)
          logError(`[SubagentManager] Subagent ${id} failed`, err)
          return info
        })
        .finally(() => this.releaseSlot())
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
      this.emitEvent("cancelled", id)
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
    this.emitEvent("cancelled", id)

    this.cancelAllByParent(id)

    return true
  }

  /**
   * 获取子智能体信息
   */
  getInfo(id: string): SubagentInfo | null {
    return this.sessions.get(id)?.info || null
  }

  /**
   * 获取子智能体的事件列表
   */
  getEvents(id: string): AgentEvent[] {
    return this.sessions.get(id)?.events || []
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
    return this.list({ status: "running" })
      .concat(this.list({ status: "pending" }))
      .concat(this.list({ status: "completing" }))
  }

  /**
   * 列出特定父节点下的所有子智能体（递归）
   */
  listByParent(parentId: string): SubagentInfo[] {
    const result: SubagentInfo[] = []
    const directChildren = this.list({ parentId })
    result.push(...directChildren)

    for (const child of directChildren) {
      const descendants = this.listByParent(child.id)
      result.push(...descendants)
    }

    return result
  }

  /**
   * 取消特定父节点下的所有子智能体
   */
  cancelAllByParent(parentId: string): void {
    const children = this.list({ parentId })
    for (const child of children) {
      if (child.status === "running" || child.status === "pending" || child.status === "completing") {
        this.cancel(child.id)
      }
    }
  }

  cancelAll(): void {
    for (const [id, session] of this.sessions) {
      if (session.info.status === "running" || session.info.status === "pending" || session.info.status === "completing") {
        this.cancel(id)
      }
    }
  }

  toText(): string {
    const lines: string[] = []
    const infos = Array.from(this.sessions.values()).map(s => s.info)
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
        completing: "◐",
        completed: "✓",
        failed: "✗",
        cancelled: "⊘",
      }[info.status]
      const prefix = "  ".repeat(indent)
      lines.push(`${prefix}${statusIcon} ${info.id}: ${info.description} [${info.status}]`)
      const kids = children.get(info.id) || []
      for (const kid of kids) printTree(kid, indent + 1)
    }

    for (const root of roots) printTree(root)
    return lines.join("\n")
  }

  toSystemPrompt(): string {
    const active = this.listActive()
    if (active.length === 0) return ""
    return [
      `[Active subagents]`,
      ...active.map(s => `- ${s.id}: ${s.description} (${s.status})`),
    ].join("\n")
  }

  private emitEvent(type: SubagentEventType, subagentId: string): void {
    if (!this.onEventCallback) return
    const session = this.sessions.get(subagentId)
    if (!session) return
    this.onEventCallback({ type, subagentId, timestamp: new Date().toISOString(), info: session.info })
  }

  private async runSubagent(
    session: SubagentSession,
    config: AgentConfig,
    prompt: string,
    id: string,
    parentContext: LLMMessage[],
  ): Promise<SubagentInfo> {
    const { info, agent, abortController } = session

    info.status = "running"
    info.startedAt = new Date().toISOString()
    this.emitEvent("started", id)

    try {
      const events: AgentEvent[] = []
      let finalText = ""

      for await (const event of agent.run(prompt, parentContext, {
        ...config,
        sessionID: `${config.sessionID}-${info.id}`,
      })) {
        if (abortController.signal.aborted) {
          info.status = "cancelled"
          info.completedAt = new Date().toISOString()
          this.emitEvent("cancelled", id)
          return info
        }

        events.push(event)

        if (event.type === "content") {
          finalText += event.text
        } else if (event.type === "error") {
          info.status = "failed"
          info.error = event.message
          info.completedAt = new Date().toISOString()
          this.emitEvent("failed", id)
          return info
        } else if (event.type === "finish") {
          info.status = "completing"
          this.emitEvent("completing", id)
        }
      }

      info.status = "completed"
      info.result = finalText
      info.completedAt = new Date().toISOString()
      session.events = events
      this.emitEvent("completed", id)
      return info
    } catch (err) {
      info.status = "failed"
      info.error = String(err)
      info.completedAt = new Date().toISOString()
      this.emitEvent("failed", id)
      throw err
    }
  }
}
