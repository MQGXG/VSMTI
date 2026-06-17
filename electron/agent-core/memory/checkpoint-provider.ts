/**
 * Structured Checkpoint Provider — 管理会话状态快照
 * 参考 MiMo-Code 的 checkpoint.md 系统
 */

import { app } from "electron"
import { join } from "path"
import fs from "fs"
import { MemoryProvider } from "./types"

interface CheckpointData {
  sessionId: string
  workspace: string
  createdAt: string
  updatedAt: string
  summary: string
  activeTask: string
  recentDecisions: string[]
  keyFiles: string[]
  contextBudget: number
}

const MAX_RECENT_DECISIONS = 20
const MAX_KEY_FILES = 30

export class CheckpointProvider implements MemoryProvider {
  name = "checkpoint"
  private checkpointDir = ""
  private checkpointPath = ""
  private data: CheckpointData | null = null
  private turnCount = 0
  private autosaveInterval = 5

  async initialize(sessionId: string, workspace: string): Promise<void> {
    this.checkpointDir = join(app.getPath("userData"), "checkpoints", sessionId)
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true })
    }
    this.checkpointPath = join(this.checkpointDir, "checkpoint.md")
    this.loadCheckpoint(sessionId, workspace)
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
    return parts.join("\n")
  }

  async prefetch(query: string, _sessionId: string): Promise<string> {
    if (!this.data) return ""
    const parts: string[] = []

    if (this.data.summary) {
      parts.push(`Session context: ${this.data.summary}`)
    }
    if (this.data.keyFiles.length > 0) {
      const recentFiles = this.data.keyFiles.slice(-8)
      parts.push(`Key files: ${recentFiles.join(", ")}`)
    }
    if (this.data.recentDecisions.length > 0) {
      const recent = this.data.recentDecisions.slice(-3)
      parts.push(`Recent decisions: ${recent.join("; ")}`)
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
        contextBudget: 0,
      }
    }

    this.data.updatedAt = new Date().toISOString()
    this.extractFromTurn(user, assistant)

    // 每 N 回合自动保存 checkpoint
    if (this.turnCount % this.autosaveInterval === 0) {
      this.saveCheckpoint()
    }
  }

  async shutdown(): Promise<void> {
    this.saveCheckpoint()
  }

  /** 获取当前 checkpoint 数据 */
  getCheckpoint(): CheckpointData | null {
    return this.data
  }

  /** 手动更新摘要 */
  updateSummary(summary: string): void {
    if (this.data) {
      this.data.summary = summary
      this.saveCheckpoint()
    }
  }

  /** 设置活跃任务 */
  setActiveTask(task: string): void {
    if (this.data) {
      this.data.activeTask = task
      this.saveCheckpoint()
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
    const decisionMatch = combined.match(/(?:决定|计划|方案|改用|迁移|架构|选型|采用)[：:]\s*(.+?)[。\n]/)
    if (decisionMatch) {
      const decision = decisionMatch[1].trim().slice(0, 150)
      if (!this.data.recentDecisions.includes(decision)) {
        this.data.recentDecisions.push(decision)
        if (this.data.recentDecisions.length > MAX_RECENT_DECISIONS) {
          this.data.recentDecisions = this.data.recentDecisions.slice(-MAX_RECENT_DECISIONS)
        }
      }
    }

    // 提取文件路径
    const fileMatches = combined.matchAll(/[`]([\w/\\\-_.]+\.[a-z]+)[`]/g)
    for (const m of fileMatches) {
      const path = m[1]
      if (path.includes("node_modules") || path.includes(".git")) continue
      if (!this.data.keyFiles.includes(path)) {
        this.data.keyFiles.push(path)
        if (this.data.keyFiles.length > MAX_KEY_FILES) {
          this.data.keyFiles = this.data.keyFiles.slice(-MAX_KEY_FILES)
        }
      }
    }

    // 提取任务描述
    const taskMatch = user.match(/(?:帮我|请|现在需要|接下来要?)(.{10,80})/)
    if (taskMatch && !this.data.activeTask) {
      this.data.activeTask = taskMatch[1].trim()
    }
  }
}
