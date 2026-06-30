/**
 * Dream/Distill Manager — 知识提取和工作流发现
 * 参考 MiMo-Code 的 /dream 和 /distill 命令
 * /dream - 扫描近期会话轨迹，提取持久知识到项目记忆
 * /distill - 发现重复的手动工作流，打包成可复用的 skill/subagent/command
 *
 * 增强点：
 * 1. 自动触发 — 每 N 回合自动 Dream（集成到 Agent 循环）
 * 2. 知识持久化 — 保存到 .mira/knowledge/ 目录
 * 3. Skill 文件生成 — Distill 结果可自动生成 Skill 文件
 */

import { join } from "path"
import fs from "fs"
import { createLLMClient, type LLMMessage } from "../llm/client"
import { logError } from "../system/logger"

interface DreamResult {
  timestamp: string
  knowledgeExtracted: string[]
  outdatedRemoved: string[]
  summary: string
}

interface DistillResult {
  timestamp: string
  workflowsFound: DistillWorkflow[]
  summary: string
}

interface DistillWorkflow {
  id: string
  name: string
  description: string
  confidence: number
  type: "skill" | "subagent" | "command"
  steps: string[]
  examples: string[]
}

interface KnowledgeStore {
  entries: KnowledgeEntry[]
}

interface KnowledgeEntry {
  id: string
  content: string
  source: string
  createdAt: string
  updatedAt: string
  tags: string[]
}

const DREAM_SYSTEM_PROMPT = `You are a knowledge extraction agent. Your task is to analyze conversation history and extract persistent knowledge that should be saved for future sessions.

Extract:
1. Project decisions and architecture choices
2. User preferences and coding style
3. Important file paths and their purposes
4. Configuration details
5. Lessons learned and best practices

Also identify outdated or incorrect knowledge that should be removed.

Respond in JSON format:
{
  "knowledge": [
    {"content": "...", "tags": ["tag1", "tag2"]}
  ],
  "outdated": ["entry to remove"],
  "summary": "Brief summary of changes"
}`

const DISTILL_SYSTEM_PROMPT = `You are a workflow discovery agent. Your task is to analyze recent work patterns and identify repeated manual workflows that could be automated.

Look for:
1. Repeated sequences of tool calls
2. Similar tasks performed multiple times
3. Common development patterns
4. Multi-step workflows that follow a template

For each discovered workflow, provide:
- Name and description
- Confidence level (0-1)
- Type (skill/subagent/command)
- Steps involved
- Example usage

Respond in JSON format:
{
  "workflows": [
    {
      "name": "...",
      "description": "...",
      "confidence": 0.8,
      "type": "skill",
      "steps": ["step1", "step2"],
      "examples": ["example1"]
    }
  ],
  "summary": "Brief summary"
}`

export class DreamDistillManager {
  private knowledgeDir = ""
  private knowledgePath = ""
  private store: KnowledgeStore = { entries: [] }
  private dreamHistory: DreamResult[] = []
  private distillHistory: DistillResult[] = []
  private turnCount = 0
  private autoDreamInterval = 15
  private pendingConversation: LLMMessage[] = []
  private llmConfig: { apiKey: string; apiUrl: string; model: string; provider: string } | null = null

  async initialize(workspace: string): Promise<void> {
    this.knowledgeDir = join(workspace, ".mira", "knowledge")
    if (!fs.existsSync(this.knowledgeDir)) {
      fs.mkdirSync(this.knowledgeDir, { recursive: true })
    }
    this.knowledgePath = join(this.knowledgeDir, "knowledge.json")
    this.loadStore()
  }

  /** 设置 LLM 配置（用于自动 Dream） */
  setLLMConfig(config: { apiKey: string; apiUrl: string; model: string; provider: string }): void {
    this.llmConfig = config
  }

  /**
   * 记录回合（用于自动 Dream 触发）
   */
  recordTurn(user: string, assistant: string): void {
    this.turnCount++
    this.pendingConversation.push(
      { role: "user", content: user },
      { role: "assistant", content: assistant },
    )
    // 保留最近 30 条消息
    if (this.pendingConversation.length > 30) {
      this.pendingConversation = this.pendingConversation.slice(-30)
    }
  }

  /**
   * 判断是否应该自动触发 Dream
   */
  shouldAutoDream(): boolean {
    return this.turnCount > 0 && this.turnCount % this.autoDreamInterval === 0 && this.llmConfig !== null
  }

  /**
   * 自动 Dream — 在 Agent 循环中自动调用
   */
  async autoDream(): Promise<DreamResult | null> {
    if (!this.llmConfig || this.pendingConversation.length === 0) return null
    try {
      const result = await this.dream(this.pendingConversation, this.llmConfig)
      this.pendingConversation = []
      return result
    } catch (err) {
      logError("[DreamDistillManager] Auto dream failed", err)
      return null
    }
  }

  /**
   * /dream - 扫描近期会话轨迹，提取持久知识
   */
  async dream(
    conversationHistory: LLMMessage[],
    config: { apiKey: string; apiUrl: string; model: string; provider: string }
  ): Promise<DreamResult> {
    const result: DreamResult = {
      timestamp: new Date().toISOString(),
      knowledgeExtracted: [],
      outdatedRemoved: [],
      summary: "",
    }

    try {
      const messages: LLMMessage[] = [
        { role: "system", content: DREAM_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Current knowledge base:\n${this.knowledgeToText()}\n\nConversation history:\n${this.formatConversation(conversationHistory)}\n\nExtract new knowledge and identify outdated entries.`,
        },
      ]

      const client = createLLMClient(config)
      let responseText = ""
      for await (const event of client.stream({ messages })) {
        if (event.type === "delta") {
          responseText += event.delta
        }
      }

      const parsed = this.parseDreamResponse(responseText)

      for (const knowledge of parsed.knowledge) {
        const entry: KnowledgeEntry = {
          id: `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          content: knowledge.content,
          source: "dream",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: knowledge.tags || [],
        }
        this.store.entries.push(entry)
        result.knowledgeExtracted.push(knowledge.content)
      }

      for (const outdated of parsed.outdated) {
        const idx = this.store.entries.findIndex(e => e.content === outdated)
        if (idx !== -1) {
          this.store.entries.splice(idx, 1)
          result.outdatedRemoved.push(outdated)
        }
      }

      result.summary = parsed.summary || "Dream completed"
      this.dreamHistory.push(result)
      this.saveStore()

      // 同步写入 MEMORY.md 文件
      this.writeMemoryMd()
    } catch (err) {
      logError("[DreamDistillManager] Dream failed", err)
      result.summary = `Dream failed: ${String(err)}`
    }

    return result
  }

  /**
   * /distill - 发现重复的工作流，打包成可复用的 skill
   */
  async distill(
    conversationHistory: LLMMessage[],
    config: { apiKey: string; apiUrl: string; model: string; provider: string }
  ): Promise<DistillResult> {
    const result: DistillResult = {
      timestamp: new Date().toISOString(),
      workflowsFound: [],
      summary: "",
    }

    try {
      const messages: LLMMessage[] = [
        { role: "system", content: DISTILL_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Conversation history:\n${this.formatConversation(conversationHistory)}\n\nIdentify repeated workflows that could be automated.`,
        },
      ]

      const client = createLLMClient(config)
      let responseText = ""
      for await (const event of client.stream({ messages })) {
        if (event.type === "delta") {
          responseText += event.delta
        }
      }

      const parsed = this.parseDistillResponse(responseText)
      result.workflowsFound = parsed.workflows
      result.summary = parsed.summary || "Distill completed"
      this.distillHistory.push(result)

      // 自动生成 Skill 文件
      for (const workflow of result.workflowsFound) {
        if (workflow.confidence >= 0.7) {
          this.generateSkillFile(workflow)
        }
      }
    } catch (err) {
      logError("[DreamDistillManager] Distill failed", err)
      result.summary = `Distill failed: ${String(err)}`
    }

    return result
  }

  getKnowledge(): KnowledgeEntry[] {
    return [...this.store.entries]
  }

  knowledgeToText(): string {
    if (this.store.entries.length === 0) return "(Empty knowledge base)"
    return this.store.entries
      .map(e => `- [${e.tags.join(", ")}] ${e.content}`)
      .join("\n")
  }

  toSystemPrompt(): string {
    if (this.store.entries.length === 0) return ""
    const recent = this.store.entries.slice(-10)
    return (
      `[Project knowledge]\n` +
      recent.map(e => `- ${e.content}`).join("\n")
    )
  }

  toText(): string {
    const lines: string[] = ["# Dream/Distill"]

    lines.push("\n## Knowledge Base")
    lines.push(this.knowledgeToText())

    if (this.dreamHistory.length > 0) {
      lines.push("\n## Dream History")
      for (const dream of this.dreamHistory.slice(-5)) {
        lines.push(`- ${dream.timestamp}: ${dream.summary}`)
        if (dream.knowledgeExtracted.length > 0) {
          lines.push(`  - Extracted: ${dream.knowledgeExtracted.length} entries`)
        }
        if (dream.outdatedRemoved.length > 0) {
          lines.push(`  - Removed: ${dream.outdatedRemoved.length} entries`)
        }
      }
    }

    if (this.distillHistory.length > 0) {
      lines.push("\n## Distill History")
      for (const distill of this.distillHistory.slice(-5)) {
        lines.push(`- ${distill.timestamp}: ${distill.summary}`)
        if (distill.workflowsFound.length > 0) {
          lines.push(`  - Workflows: ${distill.workflowsFound.length}`)
        }
      }
    }

    return lines.join("\n")
  }

  /**
   * 将知识同步写入 MEMORY.md 文件
   */
  private writeMemoryMd(): void {
    if (this.store.entries.length === 0) return
    try {
      const memoryPath = join(this.knowledgeDir, "MEMORY.md")
      const content = [
        "# Project Memory",
        "",
        "Auto-generated by Dream/Distill system.",
        `Last updated: ${new Date().toISOString()}`,
        "",
        "## Knowledge",
        "",
        ...this.store.entries.map(e => `- ${e.content}`),
        "",
      ].join("\n")
      fs.writeFileSync(memoryPath, content, "utf-8")
    } catch { /* 静默 */ }
  }

  /**
   * 自动生成 Skill 文件
   */
  private generateSkillFile(workflow: DistillWorkflow): void {
    try {
      const skillsDir = join(this.knowledgeDir, "skills")
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true })
      }
      const skillPath = join(skillsDir, `${workflow.name}.md`)
      const content = [
        `# ${workflow.name}`,
        "",
        workflow.description,
        "",
        "## Steps",
        "",
        ...workflow.steps.map((s, i) => `${i + 1}. ${s}`),
        "",
        "## Examples",
        "",
        ...workflow.examples.map(e => `- ${e}`),
        "",
        `> Auto-generated by Distill (confidence: ${workflow.confidence})`,
      ].join("\n")
      fs.writeFileSync(skillPath, content, "utf-8")
    } catch { /* 静默 */ }
  }

  private formatConversation(messages: LLMMessage[]): string {
    return messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content)
        return `[${m.role}]: ${content.slice(0, 300)}`
      })
      .join("\n")
  }

  private parseDreamResponse(response: string): {
    knowledge: Array<{ content: string; tags: string[] }>
    outdated: string[]
    summary: string
  } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          knowledge: Array.isArray(parsed.knowledge) ? parsed.knowledge : [],
          outdated: Array.isArray(parsed.outdated) ? parsed.outdated : [],
          summary: String(parsed.summary || ""),
        }
      }
    } catch { /* JSON 解析失败 */ }
    return { knowledge: [], outdated: [], summary: response.slice(0, 200) }
  }

  private parseDistillResponse(response: string): {
    workflows: DistillWorkflow[]
    summary: string
  } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          workflows: Array.isArray(parsed.workflows) ? parsed.workflows : [],
          summary: String(parsed.summary || ""),
        }
      }
    } catch { /* JSON 解析失败 */ }
    return { workflows: [], summary: response.slice(0, 200) }
  }

  private loadStore(): void {
    try {
      if (fs.existsSync(this.knowledgePath)) {
        const raw = fs.readFileSync(this.knowledgePath, "utf-8")
        this.store = JSON.parse(raw)
      }
    } catch {
      this.store = { entries: [] }
    }
  }

  private saveStore(): void {
    try {
      fs.writeFileSync(this.knowledgePath, JSON.stringify(this.store, null, 2), "utf-8")
    } catch { /* 静默 */ }
  }
}


