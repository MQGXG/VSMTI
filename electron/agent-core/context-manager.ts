import type { CheckpointProvider } from "./memory/checkpoint-provider"
import type { MemoryManager } from "./memory/manager"
import { needsContextRebuild, rebuildContextFromCheckpoint, truncateToBudget, type CheckpointData } from "./message-utils"
import type { LLMMessage } from "./llm-sdk"

export interface ContextConfig {
  maxContextTokens: number
  rebuildThreshold?: number
  checkpointTurnInterval?: number
  llmSummaryInterval?: number
  keepRecentRatio?: number
  memoryTokenBudget?: number
}

const DEFAULT_CONFIG: Required<ContextConfig> = {
  maxContextTokens: 8000,
  rebuildThreshold: 0.6,
  checkpointTurnInterval: 5,
  llmSummaryInterval: 10,
  keepRecentRatio: 0.2,
  memoryTokenBudget: 2000,
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
    await this.memoryManager.initialize(sessionID, workspace)
  }

  buildSystemPrompt(): string {
    return this.memoryManager.buildSystemPrompt()
  }

  /**
   * Token 预算化注入 — 按优先级排序记忆内容
   * checkpoint > builtin > fts > vector
   */
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

  /**
   * 每回合同步 — 创建检查点、更新记忆
   */
  async syncTurn(user: string, assistant: string, sessionID: string): Promise<void> {
    this.turnCount++

    await this.memoryManager.syncTurn(user, assistant, sessionID)
    await this.checkpointProvider.syncTurn(user, assistant, sessionID).catch(() => {})

    if (this.turnCount % this.config.checkpointTurnInterval === 0) {
      this.checkpointCount++
    }
  }

  /**
   * 检查并重建上下文 — 当接近 token 限制时
   * 策略：逐步重建，先从 checkpoint 恢复，再逐步裁剪
   */
  checkAndRebuild(
    messages: LLMMessage[],
    _sessionID: string,
  ): {
    messages: LLMMessage[]
    didRebuild: boolean
    reason: string
  } {
    const maxTokens = this.config.maxContextTokens

    if (!needsContextRebuild(messages, maxTokens)) {
      messages = truncateToBudget(messages, maxTokens)
      return { messages, didRebuild: false, reason: "" }
    }

    const checkpoint = this.checkpointProvider.getCheckpoint()
    if (checkpoint) {
      const checkpointData: CheckpointData = {
        summary: checkpoint.summary,
        activeTask: checkpoint.activeTask,
        recentDecisions: checkpoint.recentDecisions,
        keyFiles: checkpoint.keyFiles,
      }

      messages = rebuildContextFromCheckpoint(messages, checkpointData, maxTokens)

      this.rebuildCount++
      this.lastRebuildReason = "checkpoint_rebuild"
      this.lastRebuildAt = new Date().toISOString()

      return {
        messages,
        didRebuild: true,
        reason: "checkpoint_rebuild",
      }
    }

    messages = truncateToBudget(messages, maxTokens)
    this.rebuildCount++
    this.lastRebuildReason = "truncate_only"
    this.lastRebuildAt = new Date().toISOString()

    return {
      messages,
      didRebuild: true,
      reason: "truncate_only",
    }
  }

  /**
   * 会话恢复时重建上下文
   */
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
