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
  intent: string
  taskTree: string[]
  currentWork: string
  findings: string[]
  errorFixes: string[]
  designDecisions: string[]
}

const MAX_RECENT_DECISIONS = 20
const MAX_KEY_FILES = 30
const MAX_USER_PREFERENCES = 15
const MAX_TASK_TREE = 15
const MAX_FINDINGS = 15
const MAX_ERROR_FIXES = 10
const MAX_DESIGN_DECISIONS = 15

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

  get hasLLMConfig(): boolean { return this.llmConfig !== null }

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

  setLLMConfig(config: { apiKey: string; apiUrl: string; model: string; provider: string }): void {
    this.llmConfig = config
  }

  buildSystemPrompt(): string {
    if (!this.data) return ""
    const parts: string[] = []
    if (this.data.summary) parts.push(`[Session checkpoint: ${this.data.summary}]`)
    if (this.data.activeTask) parts.push(`[Active task: ${this.data.activeTask}]`)
    if (this.data.currentWork) parts.push(`[Current work: ${this.data.currentWork}]`)
    if (this.data.recentDecisions.length > 0) {
      parts.push(`[Recent decisions: ${this.data.recentDecisions.slice(-5).join("; ")}]`)
    }
    if (this.data.userPreferences.length > 0) {
      parts.push(`[User preferences: ${this.data.userPreferences.slice(-5).join("; ")}]`)
    }
    if (this.data.findings.length > 0) {
      parts.push(`[Findings: ${this.data.findings.slice(-3).join("; ")}]`)
    }
    return parts.join("\n")
  }

  async prefetch(query: string, _sessionId: string): Promise<string> {
    if (!this.data) return ""
    const parts: string[] = []

    if (this.data.summary) parts.push(`Session context: ${this.data.summary}`)
    if (this.data.activeTask) parts.push(`Active task: ${this.data.activeTask}`)
    if (this.data.currentWork) parts.push(`Current work: ${this.data.currentWork}`)
    if (this.data.keyFiles.length > 0) {
      parts.push(`Key files: ${this.data.keyFiles.slice(-8).join(", ")}`)
    }
    if (this.data.recentDecisions.length > 0) {
      parts.push(`Recent decisions: ${this.data.recentDecisions.slice(-3).join("; ")}`)
    }
    if (this.data.findings.length > 0) {
      parts.push(`Findings: ${this.data.findings.slice(-3).join("; ")}`)
    }
    if (this.data.designDecisions.length > 0) {
      parts.push(`Design decisions: ${this.data.designDecisions.slice(-3).join("; ")}`)
    }
    if (this.data.userPreferences.length > 0) {
      parts.push(`User preferences: ${this.data.userPreferences.slice(-3).join("; ")}`)
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
      this.data = this.createEmptyData(sessionId)
    }

    this.data.updatedAt = new Date().toISOString()
    this.extractFromTurn(user, assistant)

    this.pendingTurns.push({ user, assistant })
    if (this.pendingTurns.length > 20) {
      this.pendingTurns = this.pendingTurns.slice(-20)
    }

    if (this.turnCount % this.llmSummaryInterval === 0 && this.llmConfig) {
      await this.generateLLMSummary()
    }

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

  private createEmptyData(sessionId: string): CheckpointData {
    return {
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
      intent: "",
      taskTree: [],
      currentWork: "",
      findings: [],
      errorFixes: [],
      designDecisions: [],
    }
  }

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
    const data = this.createEmptyData("")

    const lines = content.split("\n")
    let currentSection = ""

    for (const line of lines) {
      if (line.startsWith("## Summary")) { currentSection = "summary"; continue }
      if (line.startsWith("## Active Task")) { currentSection = "task"; continue }
      if (line.startsWith("## Current Work")) { currentSection = "work"; continue }
      if (line.startsWith("## Intent")) { currentSection = "intent"; continue }
      if (line.startsWith("## Recent Decisions")) { currentSection = "decisions"; continue }
      if (line.startsWith("## Key Files")) { currentSection = "files"; continue }
      if (line.startsWith("## User Preferences")) { currentSection = "preferences"; continue }
      if (line.startsWith("## Task Tree")) { currentSection = "tasktree"; continue }
      if (line.startsWith("## Findings")) { currentSection = "findings"; continue }
      if (line.startsWith("## Error Fixes")) { currentSection = "errors"; continue }
      if (line.startsWith("## Design Decisions")) { currentSection = "design"; continue }
      if (line.startsWith("## Metadata")) { currentSection = "metadata"; continue }

      if (currentSection === "summary" && line.trim() && !line.startsWith("#")) {
        data.summary += (data.summary ? "\n" : "") + line.trim()
      } else if (currentSection === "task" && line.trim() && !line.startsWith("#")) {
        data.activeTask += (data.activeTask ? "\n" : "") + line.trim()
      } else if (currentSection === "work" && line.trim() && !line.startsWith("#")) {
        data.currentWork += (data.currentWork ? "\n" : "") + line.trim()
      } else if (currentSection === "intent" && line.trim() && !line.startsWith("#")) {
        data.intent += (data.intent ? "\n" : "") + line.trim()
      } else if (currentSection === "decisions" && line.trim().startsWith("- ")) {
        data.recentDecisions.push(line.trim().slice(2))
      } else if (currentSection === "files" && line.trim().startsWith("- ")) {
        data.keyFiles.push(line.trim().slice(2))
      } else if (currentSection === "preferences" && line.trim().startsWith("- ")) {
        data.userPreferences.push(line.trim().slice(2))
      } else if (currentSection === "tasktree" && line.trim().startsWith("- ")) {
        data.taskTree.push(line.trim().slice(2))
      } else if (currentSection === "findings" && line.trim().startsWith("- ")) {
        data.findings.push(line.trim().slice(2))
      } else if (currentSection === "errors" && line.trim().startsWith("- ")) {
        data.errorFixes.push(line.trim().slice(2))
      } else if (currentSection === "design" && line.trim().startsWith("- ")) {
        data.designDecisions.push(line.trim().slice(2))
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
      "## Intent",
      data.intent || "(No intent set)",
      "",
      "## Active Task",
      data.activeTask || "(No active task)",
      "",
      "## Current Work",
      data.currentWork || "(Not currently working on anything)",
      "",
      "## Task Tree",
      ...(data.taskTree.length > 0 ? data.taskTree.slice(-MAX_TASK_TREE).map((t) => `- ${t}`) : ["- (No tasks)"]),
      "",
      "## Recent Decisions",
      ...(data.recentDecisions.length > 0 ? data.recentDecisions.slice(-MAX_RECENT_DECISIONS).map((d) => `- ${d}`) : ["- (No decisions recorded)"]),
      "",
      "## Key Files",
      ...(data.keyFiles.length > 0 ? data.keyFiles.slice(-MAX_KEY_FILES).map((f) => `- ${f}`) : ["- (No files recorded)"]),
      "",
      "## Findings",
      ...(data.findings.length > 0 ? data.findings.slice(-MAX_FINDINGS).map((f) => `- ${f}`) : ["- (No findings)"]),
      "",
      "## Error Fixes",
      ...(data.errorFixes.length > 0 ? data.errorFixes.slice(-MAX_ERROR_FIXES).map((e) => `- ${e}`) : ["- (No errors recorded)"]),
      "",
      "## Design Decisions",
      ...(data.designDecisions.length > 0 ? data.designDecisions.slice(-MAX_DESIGN_DECISIONS).map((d) => `- ${d}`) : ["- (No design decisions)"]),
      "",
      "## User Preferences",
      ...(data.userPreferences.length > 0 ? data.userPreferences.slice(-MAX_USER_PREFERENCES).map((p) => `- ${p}`) : ["- (No preferences)"]),
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
        const d = match[1].trim().slice(0, 150)
        if (d.length > 5 && !this.data.recentDecisions.includes(d)) {
          this.data.recentDecisions.push(d)
        }
      }
    }
    if (this.data.recentDecisions.length > MAX_RECENT_DECISIONS) {
      this.data.recentDecisions = this.data.recentDecisions.slice(-MAX_RECENT_DECISIONS)
    }

    // 提取设计决策
    const designPatterns = [
      /(?:采用|选择|使用)\s*(.+?)(?:技术|框架|库|方案|架构)[。\n]/g,
      /(?:choose|use|adopt|select|go with)\s*(.+?)(?:framework|library|approach|pattern)[.\n]/gi,
    ]
    for (const pattern of designPatterns) {
      let match
      while ((match = pattern.exec(combined)) !== null) {
        const d = match[0].trim().slice(0, 120)
        if (d.length > 5 && !this.data.designDecisions.includes(d)) {
          this.data.designDecisions.push(d)
        }
      }
    }
    if (this.data.designDecisions.length > MAX_DESIGN_DECISIONS) {
      this.data.designDecisions = this.data.designDecisions.slice(-MAX_DESIGN_DECISIONS)
    }

    // 提取文件路径
    const filePatterns = [
      /[`]([\w/\\\-_.]+\.[a-z]+)[`]/g,
      /["']([\w/\\\-_.]+\.[a-z]+)["']/g,
    ]
    for (const pattern of filePatterns) {
      let match
      while ((match = pattern.exec(combined)) !== null) {
        const p = match[1]
        if (p.includes("node_modules") || p.includes(".git") || p.includes("dist")) continue
        if (!this.data.keyFiles.includes(p)) {
          this.data.keyFiles.push(p)
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
        const p = match[0].trim().slice(0, 100)
        if (p.length > 5 && !this.data.userPreferences.includes(p)) {
          this.data.userPreferences.push(p)
        }
      }
    }
    if (this.data.userPreferences.length > MAX_USER_PREFERENCES) {
      this.data.userPreferences = this.data.userPreferences.slice(-MAX_USER_PREFERENCES)
    }

    // 提取任务
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

    // 提取意图（仅在 session 开始时）
    if (!this.data.intent) {
      const intentPatterns = [
        /(?:我想|我要|我的目标|目标是|目的|goal|objective|aim)\s*(.{10,100})/i,
        /(?:这个项目|本次任务|本次目标是?)\s*(.{10,100})/i,
      ]
      for (const pattern of intentPatterns) {
        const match = user.match(pattern)
        if (match) {
          this.data.intent = match[1].trim().slice(0, 200)
          break
        }
      }
    }

    // 提取发现
    const findingPatterns = [
      /(?:发现|观察到|注意到|发现是|原因是|because|found that|noticed|turns out)\s*(.{10,120})/gi,
    ]
    for (const pattern of findingPatterns) {
      let match
      while ((match = pattern.exec(combined)) !== null) {
        const f = match[1].trim().slice(0, 150)
        if (f.length > 5 && !this.data.findings.includes(f)) {
          this.data.findings.push(f)
        }
      }
    }
    if (this.data.findings.length > MAX_FINDINGS) {
      this.data.findings = this.data.findings.slice(-MAX_FINDINGS)
    }

    // 提取错误修复
    const errorPatterns = [
      /(?:错误|修复|bug|fix|error|issue|problem|was getting|encountered)\s*(.{10,100})/gi,
      /(?:解决了|修复了|把|改成)\s*(.{10,80})/gi,
    ]
    for (const pattern of errorPatterns) {
      let match
      while ((match = pattern.exec(combined)) !== null) {
        const e = match[0].trim().slice(0, 120)
        if (e.length > 5 && !this.data.errorFixes.includes(e)) {
          this.data.errorFixes.push(e)
        }
      }
    }
    if (this.data.errorFixes.length > MAX_ERROR_FIXES) {
      this.data.errorFixes = this.data.errorFixes.slice(-MAX_ERROR_FIXES)
    }

    // 提取当前工作
    const workPattern = /(?:正在|现在(?:在)?|currently|right now|working on)\s*(.{10,80})/i
    const workMatch = user.match(workPattern) || assistant.match(workPattern)
    if (workMatch) {
      this.data.currentWork = workMatch[1].trim().slice(0, 150)
    }

    // 更新任务树（检测新的独立任务）
    const newTaskPattern = /(?:下一步|接下来|然后|还要做|still need to|next|then|after that)\s*(.{10,80})/gi
    let taskMatch
    while ((taskMatch = newTaskPattern.exec(combined)) !== null) {
      const task = taskMatch[1].trim().slice(0, 100)
      if (task.length > 5 && !this.data.taskTree.includes(task)) {
        this.data.taskTree.push(task)
      }
    }
    if (this.data.taskTree.length > MAX_TASK_TREE) {
      this.data.taskTree = this.data.taskTree.slice(-MAX_TASK_TREE)
    }
  }
}
