import type { CheckpointProvider } from "./memory/checkpoint-provider"
import type { MemoryManager } from "./memory/manager"
import { needsContextRebuild, rebuildContextFromCheckpoint, truncateToBudget, estimateTokens, type CheckpointData } from "./message-utils"
import type { LLMMessage, ContentPart, ToolResultPart } from "./llm/schema/messages"
import { compactMessages, type CompactLevel } from "./compaction"
import { createLLMClient } from "./llm-sdk"
import * as fs from "fs"
import * as path from "path"

export interface ContextConfig {
  maxContextTokens: number
  rebuildThreshold?: number
  checkpointTurnInterval?: number
  llmSummaryInterval?: number
  keepRecentRatio?: number
  memoryTokenBudget?: number
  toolResultBudgetBytes?: number
  pruneMinimum?: number
  pruneProtect?: number
  toolOutputMaxChars?: number
  tailTurns?: number
}

const DEFAULT_CONFIG: Required<ContextConfig> = {
  maxContextTokens: 8000,
  rebuildThreshold: 0.6,
  checkpointTurnInterval: 5,
  llmSummaryInterval: 10,
  keepRecentRatio: 0.2,
  memoryTokenBudget: 2000,
  toolResultBudgetBytes: 200_000,
  pruneMinimum: 20_000,
  pruneProtect: 40_000,
  toolOutputMaxChars: 2_000,
  tailTurns: 2,
}

export interface ContextStats {
  totalTokens: number
  rebuildCount: number
  checkpointCount: number
  lastRebuildReason: string
  lastRebuildAt: string | null
}

export class ContextManager {
  private checkpointProvider: CheckpointProvider
  private memoryManager: MemoryManager
  private config: Required<ContextConfig>
  private turnCount = 0
  private rebuildCount = 0
  private checkpointCount = 0
  private lastRebuildReason = ""
  private lastRebuildAt: string | null = null
  private llmConfig: { apiKey: string; apiUrl: string; model: string; provider: string } | null = null
  private workspace = ""

  constructor(
    checkpointProvider: CheckpointProvider,
    memoryManager: MemoryManager,
    config?: Partial<ContextConfig>,
  ) {
    this.checkpointProvider = checkpointProvider
    this.memoryManager = memoryManager
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  setLLMConfig(config: { apiKey: string; apiUrl: string; model: string; provider: string }): void {
    this.llmConfig = config
    this.checkpointProvider.setLLMConfig(config)
  }

  getStats(): ContextStats {
    return {
      totalTokens: 0,
      rebuildCount: this.rebuildCount,
      checkpointCount: this.checkpointCount,
      lastRebuildReason: this.lastRebuildReason,
      lastRebuildAt: this.lastRebuildAt,
    }
  }

  async initialize(sessionID: string, workspace: string): Promise<void> {
    this.workspace = workspace
    await this.memoryManager.initialize(sessionID, workspace)
  }

  buildSystemPrompt(): string {
    return this.memoryManager.buildSystemPrompt()
  }

  async prepareContext(
    userMessage: string,
    sessionID: string,
  ): Promise<{ enrichedUser: string; memoryPrompt: string }> {
    const memoryPrompt = this.memoryManager.buildSystemPrompt()
    const tokenBudget = this.config.memoryTokenBudget
    const prefetched = await this.memoryManager.prefetch(userMessage, sessionID, tokenBudget)
    const enrichedUser = prefetched ? `${prefetched}\n\n${userMessage}` : userMessage
    return { enrichedUser, memoryPrompt }
  }

  async syncTurn(user: string, assistant: string, sessionID: string): Promise<void> {
    this.turnCount++

    await this.memoryManager.syncTurn(user, assistant, sessionID)
    await this.checkpointProvider.syncTurn(user, assistant, sessionID).catch(() => {})

    if (this.turnCount % this.config.checkpointTurnInterval === 0) {
      this.checkpointCount++
    }
  }

  /** 每轮记忆注入：在 LLM 调用前，将相关记忆注入最后一条用户消息 */
  async injectMemories(messages: LLMMessage[], sessionID: string): Promise<LLMMessage[]> {
    const memoryContent = await this.memoryManager.selectMemories(messages, sessionID, this.config.memoryTokenBudget)
    if (!memoryContent) return messages

    const result = [...messages]
    for (let i = result.length - 1; i >= 0; i--) {
      const msg = result[i]
      if (msg.role === "user" && typeof msg.content === "string") {
        result[i] = { ...msg, content: `${memoryContent}\n\n${msg.content}` }
        break
      }
    }
    return result
  }

  /**
   * 计算 token 预算分配 — 参考 MiMo-Code 的 budgeted injection
   * 在压缩/重建前决定各组件应占多少 token
   */
  private computeTokenBudget(currentTokens: number): {
    systemBudget: number
    checkpointBudget: number
    recentBudget: number
    toolResultBudget: number
  } {
    const max = this.config.maxContextTokens
    const target = Math.floor(max * 0.7)

    return {
      systemBudget: Math.floor(target * 0.1),
      checkpointBudget: Math.floor(target * 0.2),
      recentBudget: Math.floor(target * 0.5),
      toolResultBudget: Math.floor(target * 0.2),
    }
  }

  /**
   * 轻量压缩 — 在未达重建阈值时做 partial compression
   * 仅裁剪/占位化旧 tool_result，无需 checkpoint 重建
   */
  private budgetedCompress(messages: LLMMessage[]): LLMMessage[] {
    const currentTokens = estimateTokens(messages)
    if (currentTokens <= this.config.maxContextTokens) return messages

    // 使用 compaction.ts 的三层管线做轻量压缩
    const level: CompactLevel =
      currentTokens > this.config.maxContextTokens * 1.5 ? "l3_auto"
        : currentTokens > this.config.maxContextTokens * 1.2 ? "l2_micro"
          : "l1_snip"

    const result = compactMessages(messages, this.config.maxContextTokens, level)

    if (result.level !== "none") {
      this.lastRebuildReason = `budgeted_${result.level}`
    }
    return result.messages
  }

  // ── 压缩管线入口 ────────────────────────────────────────────
  async compactPipeline(
    messages: LLMMessage[],
    sessionID: string,
  ): Promise<{
    messages: LLMMessage[]
    didRebuild: boolean
    reason: string
  }> {
    const oldTokens = estimateTokens(messages)

    // 第 1 层：最便宜的 0-API 操作
    messages = this.toolResultBudget(messages)
    messages = this.budgetedCompress(messages)
    messages = this.microCompact(messages)

    const currentTokens = estimateTokens(messages)
    const usage = currentTokens / this.config.maxContextTokens

    if (usage >= this.config.rebuildThreshold) {
      this.writeTranscript(messages)
      const checkpoint = this.checkpointProvider.getCheckpoint()
      if (checkpoint) {
        const checkpointData: CheckpointData = {
          summary: checkpoint.summary,
          activeTask: checkpoint.activeTask,
          recentDecisions: checkpoint.recentDecisions,
          keyFiles: checkpoint.keyFiles,
          userPreferences: checkpoint.userPreferences || [],
          intent: checkpoint.intent || undefined,
          taskTree: checkpoint.taskTree || undefined,
          currentWork: checkpoint.currentWork || undefined,
          findings: checkpoint.findings || undefined,
          errorFixes: checkpoint.errorFixes || undefined,
          designDecisions: checkpoint.designDecisions || undefined,
        }
        messages = this.proactiveRebuild(messages, checkpointData, currentTokens)
        this.rebuildCount++
        this.lastRebuildReason = "proactive_rebuild"
        this.lastRebuildAt = new Date().toISOString()
        return { messages, didRebuild: true, reason: "proactive_rebuild" }
      }
    }

    // 超限处理：L1-L3 后仍然超 budget
    if (currentTokens <= this.config.maxContextTokens) {
      this.lastRebuildReason = ""
      return { messages, didRebuild: false, reason: "" }
    }

    if (this.llmConfig && this.turnCount % this.config.llmSummaryInterval === 0) {
      messages = await this.compactHistory(messages)
      this.rebuildCount++
      this.lastRebuildReason = "llm_summary"
      this.lastRebuildAt = new Date().toISOString()
      return { messages, didRebuild: true, reason: "llm_summary" }
    }

    const checkpoint = this.checkpointProvider.getCheckpoint()
    if (checkpoint) {
      const checkpointData: CheckpointData = {
        summary: checkpoint.summary,
        activeTask: checkpoint.activeTask,
        recentDecisions: checkpoint.recentDecisions,
        keyFiles: checkpoint.keyFiles,
        userPreferences: checkpoint.userPreferences || [],
        intent: checkpoint.intent || undefined,
        taskTree: checkpoint.taskTree || undefined,
        currentWork: checkpoint.currentWork || undefined,
        findings: checkpoint.findings || undefined,
        errorFixes: checkpoint.errorFixes || undefined,
        designDecisions: checkpoint.designDecisions || undefined,
      }
      messages = rebuildContextFromCheckpoint(messages, checkpointData, this.config.maxContextTokens)
      this.rebuildCount++
      this.lastRebuildReason = "checkpoint_rebuild"
      this.lastRebuildAt = new Date().toISOString()
      return { messages, didRebuild: true, reason: "checkpoint_rebuild" }
    }

    messages = truncateToBudget(messages, this.config.maxContextTokens)
    this.rebuildCount++
    this.lastRebuildReason = "truncate_only"
    this.lastRebuildAt = new Date().toISOString()
    return { messages, didRebuild: true, reason: "truncate_only" }
  }

  /** 提前重建：不等满，主动注入 checkpoint 保留上下文 */
  private proactiveRebuild(
    messages: LLMMessage[],
    checkpoint: CheckpointData,
    currentTokens: number,
  ): LLMMessage[] {
    const system = messages.find(m => m.role === "system")
    const systemContent = typeof system?.content === "string" ? system.content : ""
    const systemMsg = system ? { ...system } : null

    const sections: string[] = [
      `[Proactive Checkpoint — context at ${Math.round(currentTokens / this.config.maxContextTokens * 100)}% capacity]`,
    ]
    if (checkpoint.intent) sections.push(`Intent: ${checkpoint.intent}`)
    if (checkpoint.summary) sections.push(`Summary: ${checkpoint.summary}`)
    if (checkpoint.activeTask) sections.push(`Active: ${checkpoint.activeTask}`)
    if (checkpoint.currentWork) sections.push(`Current: ${checkpoint.currentWork}`)
    if (checkpoint.recentDecisions && checkpoint.recentDecisions.length > 0) {
      sections.push(`Decisions:\n${checkpoint.recentDecisions.slice(-3).map(d => `- ${d}`).join("\n")}`)
    }
    if (checkpoint.keyFiles && checkpoint.keyFiles.length > 0) {
      sections.push(`Files:\n${checkpoint.keyFiles.slice(-5).map(f => `- ${f}`).join("\n")}`)
    }
    if (checkpoint.findings && checkpoint.findings.length > 0) {
      sections.push(`Findings:\n${checkpoint.findings.slice(-3).map(f => `- ${f}`).join("\n")}`)
    }
    if (checkpoint.errorFixes && checkpoint.errorFixes.length > 0) {
      sections.push(`Fixes:\n${checkpoint.errorFixes.slice(-3).map(e => `- ${e}`).join("\n")}`)
    }
    if (checkpoint.designDecisions && checkpoint.designDecisions.length > 0) {
      sections.push(`Design:\n${checkpoint.designDecisions.slice(-3).map(d => `- ${d}`).join("\n")}`)
    }
    if (checkpoint.taskTree && checkpoint.taskTree.length > 0) {
      sections.push(`Tasks:\n${checkpoint.taskTree.slice(-3).map(t => `- ${t}`).join("\n")}`)
    }
    if (checkpoint.userPreferences && checkpoint.userPreferences.length > 0) {
      sections.push(`Prefs:\n${checkpoint.userPreferences.slice(-3).map(p => `- ${p}`).join("\n")}`)
    }

    const checkpointMsg: LLMMessage = {
      role: "user",
      content: sections.filter(Boolean).join("\n\n"),
    }

    const keepRecentCount = Math.max(this.config.tailTurns * 2, 3)
    const recentMessages = messages.slice(-keepRecentCount)

    const result = systemMsg
      ? [systemMsg, checkpointMsg, ...recentMessages]
      : [checkpointMsg, ...recentMessages]

    return result
  }

  // ── L3: 大结果持久化 ──────────────────────────────────────
  private toolResultBudget(messages: LLMMessage[], maxBytes?: number): LLMMessage[] {
    const limit = maxBytes ?? this.config.toolResultBudgetBytes
    const last = messages[messages.length - 1]
    if (!last || last.role !== "user" || typeof last.content === "string") return messages

    const resultParts: Array<{ index: number; part: ToolResultPart; size: number }> = []
    for (let i = 0; i < last.content.length; i++) {
      const part = last.content[i]
      if (part.type === "tool-result") {
        const output = typeof part.output === "string" ? part.output : part.output?.value || ""
        resultParts.push({ index: i, part: part as ToolResultPart, size: output.length })
      }
    }

    if (resultParts.length === 0) return messages
    const total = resultParts.reduce((s, r) => s + r.size, 0)
    if (total <= limit) return messages

    resultParts.sort((a, b) => b.size - a.size)
    let remaining = total
    for (const rp of resultParts) {
      if (remaining <= limit) break
      if (rp.size <= 30000) continue
      const output = typeof rp.part.output === "string" ? rp.part.output : rp.part.output?.value || ""
      const persisted = this.persistOutput(rp.part.toolCallId, output)
      rp.part.output = persisted
      remaining = remaining - rp.size + persisted.length
    }

    return messages
  }

  private persistOutput(toolCallId: string, output: string): string {
    if (output.length <= 30000) return output
    try {
      const dir = path.join(this.workspace, ".task_outputs", "tool-results")
      fs.mkdirSync(dir, { recursive: true })
      const filePath = path.join(dir, `${toolCallId}.txt`)
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, output, "utf-8")
      }
      return `<persisted-output>\nFull: ${filePath}\nPreview:\n${output.slice(0, 2000)}\n</persisted-output>`
    } catch {
      return output
    }
  }

  // ── L2: 旧结果占位（按 token 预算） ──────────────────────
  private microCompact(messages: LLMMessage[]): LLMMessage[] {
    const maxChars = this.config.toolOutputMaxChars
    let changed = false

    for (const msg of messages) {
      if (msg.role !== "user" || typeof msg.content === "string") continue
      for (const part of msg.content) {
        if (part.type !== "tool-result") continue
        const tr = part as ToolResultPart
        const output = typeof tr.output === "string" ? tr.output : tr.output?.value || ""
        if (output.length > maxChars) {
          tr.output = output.slice(0, maxChars) + `\n... [truncated ${output.length - maxChars} chars]`
          changed = true
        }
      }
    }

    return changed ? messages : messages
  }

  // ── L4: LLM 摘要 ──────────────────────────────────────────
  private async compactHistory(messages: LLMMessage[]): Promise<LLMMessage[]> {
    this.writeTranscript(messages)
    const summary = await this.summarizeHistory(messages)
    return [{ role: "user" as const, content: `[Compacted]\n\n${summary}` }]
  }

  private writeTranscript(messages: LLMMessage[]): void {
    try {
      const dir = path.join(this.workspace, ".transcripts")
      fs.mkdirSync(dir, { recursive: true })
      const filePath = path.join(dir, `transcript_${Date.now()}.jsonl`)
      const lines = messages.map(m => JSON.stringify(m))
      fs.writeFileSync(filePath, lines.join("\n"), "utf-8")
    } catch {
      // transcript 写入失败不阻塞主流程
    }
  }

  private async summarizeHistory(messages: LLMMessage[]): Promise<string> {
    if (!this.llmConfig) return "(no LLM config for summary)"

    const conversation = messages.map(m => {
      const content = typeof m.content === "string"
        ? m.content
        : m.content.map((p: ContentPart) => {
            if (p.type === "text") return p.text
            if (p.type === "tool-call") return `[Tool: ${p.toolName}]`
            if (p.type === "tool-result") {
              const out = typeof p.output === "string" ? p.output : p.output?.value || ""
              return `[Result: ${out.slice(0, 200)}]`
            }
            return ""
          }).join("\n")
      return `${m.role}: ${content.slice(0, 500)}`
    }).join("\n").slice(0, 80000)

    const prompt: LLMMessage[] = [
      {
        role: "user",
        content: `Summarize this coding-agent conversation so work can continue.\nPreserve: 1. current goal, 2. key findings/decisions, 3. files read/changed, 4. remaining work, 5. user constraints.\nBe compact but concrete.\n\n${conversation}`,
      },
    ]

    try {
      const client = createLLMClient({
        provider: this.llmConfig.provider || "openai",
        model: this.llmConfig.model,
        apiKey: this.llmConfig.apiKey,
        apiUrl: this.llmConfig.apiUrl,
      } as any)

      const result = await client.complete({ messages: prompt })
      const text = typeof result.content === "string"
        ? result.content
        : Array.isArray(result.content)
          ? (result.content as any[]).filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
          : ""
      return text.trim() || "(empty summary)"
    } catch {
      return "(summary failed)"
    }
  }

  // ── 应急压缩 ──────────────────────────────────────────────
  async reactiveCompact(messages: LLMMessage[]): Promise<LLMMessage[]> {
    this.writeTranscript(messages)
    const tailStart = Math.max(0, messages.length - 5)

    let tailStartAdj = tailStart
    if (tailStartAdj > 0 && tailStartAdj < messages.length) {
      const msg = messages[tailStartAdj]
      if (msg.role === "user" && typeof msg.content !== "string" && msg.content.some((p: ContentPart) => p.type === "tool-result")) {
        const prev = messages[tailStartAdj - 1]
        if (prev.role === "assistant" && typeof prev.content !== "string" && prev.content.some((p: ContentPart) => p.type === "tool-call")) {
          tailStartAdj--
        }
      }
    }

    const summary = await this.summarizeHistory(messages.slice(0, tailStartAdj))
    return [
      { role: "user" as const, content: `[Reactive compact]\n\n${summary}` },
      ...messages.slice(tailStartAdj),
    ]
  }

  // ── 向后兼容的 checkAndRebuild ─────────────────────────────
  async checkAndRebuild(
    messages: LLMMessage[],
    sessionID: string,
  ): Promise<{
    messages: LLMMessage[]
    didRebuild: boolean
    reason: string
  }> {
    return this.compactPipeline(messages, sessionID)
  }

  onSessionResume(
    history: LLMMessage[],
    _sessionID: string,
  ): LLMMessage[] {
    const checkpoint = this.checkpointProvider.getCheckpoint()
    if (!checkpoint || history.length === 0) return history

    const maxTokens = this.config.maxContextTokens
    const checkpointData: CheckpointData = {
      summary: checkpoint.summary,
      activeTask: checkpoint.activeTask,
      recentDecisions: checkpoint.recentDecisions,
      keyFiles: checkpoint.keyFiles,
    }

    const rebuilt = rebuildContextFromCheckpoint(
      [{ role: "system", content: "" }, ...history],
      checkpointData,
      maxTokens,
    )

    this.rebuildCount++
    this.lastRebuildReason = "session_resume"
    this.lastRebuildAt = new Date().toISOString()

    return rebuilt
  }

  shouldAutoDream(): boolean {
    return this.memoryManager.shouldAutoDream()
  }

  async shutdown(): Promise<void> {
    await this.checkpointProvider.shutdown()
    await this.memoryManager.shutdown().catch(() => {})
  }

  toText(): string {
    const active = this.checkpointProvider.getCheckpoint()
    if (!active) return "Context Manager: active"
    return [
      "Context Manager: active",
      `  Turns: ${this.turnCount}`,
      `  Rebuilds: ${this.rebuildCount} (last: ${this.lastRebuildReason})`,
      `  Checkpoints: ${this.checkpointCount}`,
      `  Summary: ${active.summary.slice(0, 100)}${active.summary.length > 100 ? "..." : ""}`,
    ].join("\n")
  }
}
