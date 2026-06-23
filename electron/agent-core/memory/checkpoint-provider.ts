/**
 * Structured Checkpoint Provider — 管理会话状态快照
 * 参考 MiMo-Code 的 checkpoint.md 系统
 *
 * 增强点：
 * 1. LLM 增强摘要 — 每 N 回合用 LLM 生成更精确的摘要
 * 2. 智能提取 — 从对话中提取决策、文件、任务、偏好
 * 3. Token 预算感知 — prefetch 时考虑 token 预算
 */

import { app } from "electron"
import { join } from "path"
import fs from "fs"
import { MemoryProvider } from "./types"
import { createLLMClient, type LLMMessage } from "../llm-sdk"
import { logError } from "../logger"
import type { FTSMemoryProvider } from "./fts-memory-provider"

interface CheckpointData {
  sessionId: string
  workspace: string
  createdAt: string
  updatedAt: string
  summary: string
  activeTask: string
  recentDecisions: string[]
  keyFiles: string[]
  userPreferences: string[]
  contextBudget: number
}

const MAX_RECENT_DECISIONS = 20
const MAX_KEY_FILES = 30
const MAX_USER_PREFERENCES = 15

const SUMMARY_SYSTEM_PROMPT = `You are a session summarizer. Given the recent conversation turns, produce a concise checkpoint summary (2-4 sentences) covering:
1. What the user is trying to accomplish
2. Key decisions made
3. Files and areas of code being worked on
4. Any blockers or open questions

Be factual and concise. Do not repeat the user's words verbatim.`

export class CheckpointProvider implements MemoryProvider {
  name = "checkpoint"
  private checkpointDir = ""
  private ftsProvider: FTSMemoryProvider | null = null
  private checkpointPath = ""
  private data: CheckpointData | null = null
  private turnCount = 0
  private autosaveInterval = 5
  private llmSummaryInterval = 10
  private pendingTurns: Array<{ user: string; assistant: string }> = []
  private llmConfig: { apiKey: string; apiUrl: string; model: string; provider: string } | null = null

  /** 获取 LLM 配置状态 */
  get hasLLMConfig(): boolean { return this.llmConfig !== null }

  /** 设置 FTS Provider 引用（用于联动索引） */
  setFTSProvider(provider: FTSMemoryProvider): void {
    this.ftsProvider = provider
  }

  async initialize(sessionId: string, workspace: string): Promise<void> {
    this.checkpointDir = join(app.getPath("userData"), "checkpoints", sessionId)
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true })
    }
    this.checkpointPath = join(this.checkpointDir, "checkpoint.md")
    this.loadCheckpoint(sessionId, workspace)
  }

  /** 设置 LLM 配置（用于 LLM 增强摘要） */
  setLLMConfig(config: { apiKey: string; apiUrl: string; model: string; provider: string }): void {
    this.llmConfig = config
  }

  buildSystemPrompt(): string {
    if (!this.data) return ""
    const parts: string[] = []
    if (this.data.summary) {
      parts.push(`[Session checkpoint: ${this.data.summary}]`)
    }
    if (this.data.activeTask) {
      parts.push(`[Active task: ${this.data.activeTask}]`)
    }
    if (this.data.recentDecisions.length > 0) {
      const recent = this.data.recentDecisions.slice(-5)
      parts.push(`[Recent decisions: ${recent.join("; ")}]`)
    }
    if (this.data.userPreferences.length > 0) {
      const prefs = this.data.userPreferences.slice(-5)
      parts.push(`[User preferences: ${prefs.join("; ")}]`)
    }
    return parts.join("\n")
  }

  /**
   * 预算注入 — 按 token 预算控制输出
   * checkpoint 数据按重要性排序：summary > activeTask > decisions > files > preferences
   */
  async prefetch(query: string, _sessionId: string): Promise<string> {
    if (!this.data) return ""
    const parts: string[] = []

    if (this.data.summary) {
      parts.push(`Session context: ${this.data.summary}`)
    }
    if (this.data.activeTask) {
      parts.push(`Active task: ${this.data.activeTask}`)
    }
    if (this.data.keyFiles.length > 0) {
      const recentFiles = this.data.keyFiles.slice(-8)
      parts.push(`Key files: ${recentFiles.join(", ")}`)
    }
    if (this.data.recentDecisions.length > 0) {
      const recent = this.data.recentDecisions.slice(-3)
      parts.push(`Recent decisions: ${recent.join("; ")}`)
    }
    if (this.data.userPreferences.length > 0) {
      const prefs = this.data.userPreferences.slice(-3)
      parts.push(`User preferences: ${prefs.join("; ")}`)
    }

    if (parts.length === 0) return ""
    return (
      `<checkpoint-context>\n` +
      `[System note: Session checkpoint context]\n\n` +
      parts.join("\n") +
      `\n</checkpoint-context>`
    )
  }

  async syncTurn(user: string, assistant: string, sessionId: string): Promise<void> {
    this.turnCount++
    if (!this.data) {
      this.data = {
        sessionId,
        workspace: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: "",
        activeTask: "",
        recentDecisions: [],
        keyFiles: [],
        userPreferences: [],
        contextBudget: 0,
      }
    }

    this.data.updatedAt = new Date().toISOString()
    this.extractFromTurn(user, assistant)

    // 积累回合用于 LLM 摘要
    this.pendingTurns.push({ user, assistant })
    if (this.pendingTurns.length > 20) {
      this.pendingTurns = this.pendingTurns.slice(-20)
    }

    // 每 N 回合触发 LLM 摘要
    if (this.turnCount % this.llmSummaryInterval === 0 && this.llmConfig) {
      await this.generateLLMSummary()
    }

    // 每 N 回合自动保存 checkpoint
    if (this.turnCount % this.autosaveInterval === 0) {
      this.saveCheckpoint()
    }
  }

  async shutdown(): Promise<void> {
    this.saveCheckpoint()
  }

  getCheckpoint(): CheckpointData | null {
    return this.data
  }

  updateSummary(summary: string): void {
    if (this.data) {
      this.data.summary = summary
      this.saveCheckpoint()
    }
  }

  setActiveTask(task: string): void {
    if (this.data) {
      this.data.activeTask = task
      this.saveCheckpoint()
    }
  }

  /**
   * LLM 增强摘要 — 用 LLM 生成更精确的会话摘要
   */
  private async generateLLMSummary(): Promise<void> {
    if (!this.llmConfig || this.pendingTurns.length === 0) return

    try {
      const client = createLLMClient(this.llmConfig)
      const conversationText = this.pendingTurns
        .slice(-10)
        .map((t) => `[user]: ${t.user.slice(0, 300)}\n[assistant]: ${t.assistant.slice(0, 500)}`)
        .join("\n\n")

      const messages: LLMMessage[] = [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: `Current checkpoint summary: ${this.data?.summary || "(none)"}\n\nRecent conversation:\n${conversationText}\n\nGenerate an updated checkpoint summary.` },
      ]

      let summary = ""
      for await (const event of client.stream({ messages })) {
        if (event.type === "delta") {
          summary += event.delta
        }
      }

      if (summary && this.data) {
        this.data.summary = summary.trim().slice(0, 500)
        this.saveCheckpoint()

        if (this.ftsProvider) {
          this.ftsProvider.indexCheckpoint(this.data.summary, this.data.sessionId)
        }
      }
    } catch (err) {
      logError("[CheckpointProvider] LLM summary failed", err)
    }
  }

  private loadCheckpoint(sessionId: string, workspace: string): void {
    try {
      if (fs.existsSync(this.checkpointPath)) {
        const content = fs.readFileSync(this.checkpointPath, "utf-8")
        this.data = this.parseCheckpointMd(content)
        this.data.sessionId = sessionId
        this.data.workspace = workspace
      }
    } catch {
      this.data = null
    }
  }

  private saveCheckpoint(): void {
    if (!this.data) return
    try {
      const content = this.toCheckpointMd(this.data)
      fs.writeFileSync(this.checkpointPath, content, "utf-8")
    } catch { /* 静默 */ }
  }

  private parseCheckpointMd(content: string): CheckpointData {
    const data: CheckpointData = {
      sessionId: "",
      workspace: "",
      createdAt: "",
      updatedAt: "",
      summary: "",
      activeTask: "",
      recentDecisions: [],
      keyFiles: [],
      userPreferences: [],
      contextBudget: 0,
    }

    const lines = content.split("\n")
    let currentSection = ""

    for (const line of lines) {
      if (line.startsWith("## Summary")) {
        currentSection = "summary"
      } else if (line.startsWith("## Active Task")) {
        currentSection = "task"
      } else if (line.startsWith("## Recent Decisions")) {
        currentSection = "decisions"
      } else if (line.startsWith("## Key Files")) {
        currentSection = "files"
      } else if (line.startsWith("## User Preferences")) {
        currentSection = "preferences"
      } else if (line.startsWith("## Metadata")) {
        currentSection = "metadata"
      } else if (currentSection === "summary" && line.trim() && !line.startsWith("#")) {
        data.summary += (data.summary ? "\n" : "") + line.trim()
      } else if (currentSection === "task" && line.trim() && !line.startsWith("#")) {
        data.activeTask += (data.activeTask ? "\n" : "") + line.trim()
      } else if (currentSection === "decisions" && line.trim().startsWith("- ")) {
        data.recentDecisions.push(line.trim().slice(2))
      } else if (currentSection === "files" && line.trim().startsWith("- ")) {
        data.keyFiles.push(line.trim().slice(2))
      } else if (currentSection === "preferences" && line.trim().startsWith("- ")) {
        data.userPreferences.push(line.trim().slice(2))
      } else if (currentSection === "metadata") {
        if (line.includes("created:")) data.createdAt = line.split(":").slice(1).join(":").trim()
        if (line.includes("updated:")) data.updatedAt = line.split(":").slice(1).join(":").trim()
      }
    }

    return data
  }

  private toCheckpointMd(data: CheckpointData): string {
    const parts: string[] = [
      "# Session Checkpoint",
      "",
      "## Summary",
      data.summary || "(No summary yet)",
      "",
      "## Active Task",
      data.activeTask || "(No active task)",
      "",
      "## Recent Decisions",
      ...data.recentDecisions.slice(-MAX_RECENT_DECISIONS).map((d) => `- ${d}`),
      "",
      "## Key Files",
      ...data.keyFiles.slice(-MAX_KEY_FILES).map((f) => `- ${f}`),
      "",
      "## User Preferences",
      ...data.userPreferences.slice(-MAX_USER_PREFERENCES).map((p) => `- ${p}`),
      "",
      "## Metadata",
      `- created: ${data.createdAt}`,
      `- updated: ${data.updatedAt}`,
    ]
    return parts.join("\n")
  }

  private extractFromTurn(user: string, assistant: string): void {
    if (!this.data) return
    const combined = `${user}\n${assistant}`

    // 提取决策
    const decisionPatterns = [
      /(?:决定|计划|方案|改用|迁移|架构|选型|采用|实现|拆分)[：:]\s*(.+?)[。\n]/g,
      /(?:we'll|let's|I'll|plan|decide|implement|refactor)[：:]\s*(.+?)[.\n]/gi,
    ]
    for (const pattern of decisionPatterns) {
      let match
      while ((match = pattern.exec(combined)) !== null) {
        const decision = match[1].trim().slice(0, 150)
        if (decision.length > 5 && !this.data.recentDecisions.includes(decision)) {
          this.data.recentDecisions.push(decision)
        }
      }
    }
    if (this.data.recentDecisions.length > MAX_RECENT_DECISIONS) {
      this.data.recentDecisions = this.data.recentDecisions.slice(-MAX_RECENT_DECISIONS)
    }

    // 提取文件路径（支持反引号和引号包裹）
    const filePatterns = [
      /[`]([\w/\\\-_.]+\.[a-z]+)[`]/g,
      /["']([\w/\\\-_.]+\.[a-z]+)["']/g,
    ]
    for (const pattern of filePatterns) {
      let match
      while ((match = pattern.exec(combined)) !== null) {
        const path = match[1]
        if (path.includes("node_modules") || path.includes(".git") || path.includes("dist")) continue
        if (!this.data.keyFiles.includes(path)) {
          this.data.keyFiles.push(path)
        }
      }
    }
    if (this.data.keyFiles.length > MAX_KEY_FILES) {
      this.data.keyFiles = this.data.keyFiles.slice(-MAX_KEY_FILES)
    }

    // 提取用户偏好
    const prefPatterns = [
      /(?:我喜欢|我习惯|我倾向|请(?:总是|永远)|prefer|always use|never use)\s*(.+)/gi,
      /(?:不要|别|don't|never)\s*(.{5,50})/gi,
    ]
    for (const pattern of prefPatterns) {
      let match
      while ((match = pattern.exec(user)) !== null) {
        const pref = match[0].trim().slice(0, 100)
        if (pref.length > 5 && !this.data.userPreferences.includes(pref)) {
          this.data.userPreferences.push(pref)
        }
      }
    }
    if (this.data.userPreferences.length > MAX_USER_PREFERENCES) {
      this.data.userPreferences = this.data.userPreferences.slice(-MAX_USER_PREFERENCES)
    }

    // 提取任务描述
    const taskPatterns = [
      /(?:帮我|请|现在需要|接下来要?|let's|please|I need to|I want to)\s*(.{10,80})/i,
    ]
    for (const pattern of taskPatterns) {
      const match = user.match(pattern)
      if (match && !this.data.activeTask) {
        this.data.activeTask = match[1].trim()
        break
      }
    }
  }
}
