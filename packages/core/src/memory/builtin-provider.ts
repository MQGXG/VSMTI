/**
 * 内置 Memory Provider — 使用 JSON 文件存储关键上下文
 * 在每回合后保存关键信息，下回合前召回
 */

import { app } from "electron"
import { join } from "path"
import fs from "fs"
import { MemoryProvider } from "./types"

interface MemoryEntry {
  timestamp: string
  user: string
  assistant: string
  keyFacts: string[]
}

interface MemoryStore {
  entries: MemoryEntry[]
}

const MAX_ENTRIES = 50

export class BuiltinMemoryProvider implements MemoryProvider {
  name = "builtin"
  private sessionID = ""
  private storePath = ""
  private store: MemoryStore = { entries: [] }

  async initialize(sessionID: string, _workspace: string): Promise<void> {
    this.sessionID = sessionID
    const dir = join(app.getPath("userData"), "memory")
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.storePath = join(dir, `${sessionID}.json`)
    this.loadStore()
  }

  buildSystemPrompt(): string {
    const count = this.store.entries.length
    if (count === 0) return ""
    return (
      `[Memory: You have ${count} previous interactions in this session. ` +
      `If the user refers to something discussed earlier, recall it from the conversation history.]`
    )
  }

  async prefetch(_query: string, _sessionID: string): Promise<string> {
    if (this.store.entries.length === 0) return ""

    // 取最近 5 条的关键信息
    const recentFacts = this.store.entries
      .slice(-5)
      .flatMap((e) => e.keyFacts)
      .slice(-10)

    if (recentFacts.length === 0) return ""

    return (
      `<memory-context>\n` +
      `[System note: The following is recalled memory context, ` +
      `NOT new user input. Treat as authoritative reference data — ` +
      `this is the agent's persistent memory and should inform all responses.]\n\n` +
      recentFacts.map((f) => `- ${f}`).join("\n") +
      `\n</memory-context>`
    )
  }

  async syncTurn(user: string, assistant: string, _sessionID: string): Promise<void> {
    const keyFacts = this.extractKeyFacts(user, assistant)
    if (!user && !assistant) return

    this.store.entries.push({
      timestamp: new Date().toISOString(),
      user: user.slice(0, 200),
      assistant: assistant.slice(0, 500),
      keyFacts,
    })

    // 限制条目数量
    if (this.store.entries.length > MAX_ENTRIES) {
      this.store.entries = this.store.entries.slice(-MAX_ENTRIES)
    }

    this.saveStore()
  }

  async shutdown(): Promise<void> {
    this.saveStore()
  }

  private loadStore(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, "utf-8")
        this.store = JSON.parse(raw)
      }
    } catch {
      this.store = { entries: [] }
    }
  }

  private saveStore(): void {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), "utf-8")
    } catch { /* 静默忽略写入失败 */ }
  }

  private extractKeyFacts(user: string, assistant: string): string[] {
    const facts: string[] = []

    // 提取用户的主文件路径
    const fileMatch = user.match(/(?:read|write|edit|open|查看|读取|写入)\s+`([^`]+)`/i)
    if (fileMatch) facts.push(`User was working with file: ${fileMatch[1]}`)

    // 提取用户的问题主题
    const questionMatch = user.match(/(什么是|如何|怎样|为什么|能不能|帮我|请)\s*(.+)/)
    if (questionMatch && questionMatch[2]) {
      facts.push(`User asked about: ${questionMatch[2].slice(0, 100)}`)
    }

    // 提取用户偏好
    const prefMatch = user.match(/(?:我喜欢|我习惯|我倾向|请(?:总是|永远))\s*(.+)/i)
    if (prefMatch) facts.push(`User preference: ${prefMatch[1].slice(0, 100)}`)

    // 检测决策
    const decisionMatch = assistant.match(/(?:决定|计划|方案|步骤|summary|plan|steps):?\s*(.+)/is)
    if (decisionMatch) facts.push(`Decision/Plan: ${decisionMatch[1].slice(0, 200)}`)

    return facts
  }
}
