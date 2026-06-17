/**
 * Dream/Distill Manager — 知识提取和工作流发现
 * 参考 MiMo-Code 的 /dream 和 /distill 命令
 * /dream - 扫描近期会话轨迹，提取持久知识到项目记忆
 * /distill - 发现重复的手动工作流，打包成可复用的 skill/subagent/command
 */

import { app } from "electron"
import { join } from "path"
import fs from "fs"
import { createLLMClient, type LLMMessage } from "./llm-sdk"
import { logError } from "./logger"

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

  async initialize(workspace: string): Promise<void> {
    this.knowledgeDir = join(workspace, ".mira", "knowledge")
    if (!fs.existsSync(this.knowledgeDir)) {
      fs.mkdirSync(this.knowledgeDir, { recursive: true })
    }
    this.knowledgePath = join(this.knowledgeDir, "knowledge.json")
    this.loadStore()
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
      // 构建分析消息
      const messages: LLMMessage[] = [
        {
          role: "system",
          content: DREAM_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Current knowledge base:\n${this.knowledgeToText()}\n\nConversation history:\n${this.formatConversation(conversationHistory)}\n\nExtract new knowledge and identify outdated entries.`,
        },
      ]

      // 使用配置的模型进行分析
      const client = createLLMClient({
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        apiUrl: config.apiUrl,
      })

      let responseText = ""
      for await (const event of client.stream({ messages })) {
        if (event.type === "delta") {
          responseText += event.delta
        }
      }

      // 解析结果
      const parsed = this.parseDreamResponse(responseText)

      // 添加新知识
      for (const knowledge of parsed.knowledge) {
        const entry: KnowledgeEntry = {
          id: `k-${Date.now().toString(36)}`,
          content: knowledge.content,
          source: "dream",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: knowledge.tags || [],
        }
        this.store.entries.push(entry)
        result.knowledgeExtracted.push(knowledge.content)
      }

      // 移除过时知识
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
      // 构建分析消息
      const messages: LLMMessage[] = [
        {
          role: "system",
          content: DISTILL_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Conversation history:\n${this.formatConversation(conversationHistory)}\n\nIdentify repeated workflows that could be automated.`,
        },
      ]

      // 使用配置的模型进行分析
      const client = createLLMClient({
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        apiUrl: config.apiUrl,
      })

      let responseText = ""
      for await (const event of client.stream({ messages })) {
        if (event.type === "delta") {
          responseText += event.delta
        }
      }

      // 解析结果
      const parsed = this.parseDistillResponse(responseText)
      result.workflowsFound = parsed.workflows
      result.summary = parsed.summary || "Distill completed"
      this.distillHistory.push(result)
    } catch (err) {
      logError("[DreamDistillManager] Distill failed", err)
      result.summary = `Distill failed: ${String(err)}`
    }

    return result
  }

  /**
   * 获取所有知识条目
   */
  getKnowledge(): KnowledgeEntry[] {
    return [...this.store.entries]
  }

  /**
   * 获取知识库的文本表示
   */
  knowledgeToText(): string {
    if (this.store.entries.length === 0) return "(Empty knowledge base)"
    return this.store.entries
      .map(e => `- [${e.tags.join(", ")}] ${e.content}`)
      .join("\n")
  }

  /**
   * 生成系统提示
   */
  toSystemPrompt(): string {
    if (this.store.entries.length === 0) return ""
    const recent = this.store.entries.slice(-10)
    return (
      `[Project knowledge]\n` +
      recent.map(e => `- ${e.content}`).join("\n")
    )
  }

  /**
   * 生成 Dream/Distill 状态的文本
   */
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
    } catch {
      // JSON 解析失败
    }

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
    } catch {
      // JSON 解析失败
    }

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
