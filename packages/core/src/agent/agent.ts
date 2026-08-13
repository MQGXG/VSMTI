import type { ToolRegistry } from "../system/registry"
import type { AgentEvent } from "../types"
import { join } from "path"
import { createHash } from "crypto"
import { promises as fs } from "fs"
import { getPlatformPaths } from "../config/paths"
import type { LLMMessage } from "../llm/client"
import { estimateTokens, repairMessageSequence } from "../shared/message-utils"
import { calculateCost, getModelPricing } from "../shared/cost"
import { pluginHooks } from "../shared/plugin-hooks"
import type { PermissionSet, PermissionRule } from "../system/permission"
import { MemoryManager } from "../memory/manager"
import { DynamicMemoryManager, createDynamicMemory } from "../memory/dynamic-memory"
import { setDynamicMemoryManager } from "../tools/knowledge/memory-activate"
import { BuiltinMemoryProvider } from "../memory/builtin-provider"
import { appendMessage, loadSession } from "../session/store"
import { VectorMemoryProvider } from "../memory/vector-provider"
import { FileMemoryProvider } from "../memory/file-memory-provider"
import { FTSMemoryProvider } from "../memory/fts-memory-provider"
import { CheckpointProvider } from "../memory/checkpoint-provider"
import { setFTSProvider } from "../tools/knowledge/memory"
import { MemoryExtractor, createExtractorLlmCall } from "../memory/memory-extractor"
import { applyRecallBudget } from "../memory/recall-budget"
import { calculateStrength } from "../memory/memory-strength"
import { getSessionMessages } from "../session/manager"
import { ToolOrchestrator } from "../orchestrate/execution"
import { AgentStateMachine } from "./state-machine"
import { buildToolContext, buildSystemMessage, createSourceManager, prepareSourceManagerContext } from "./context"
import type { SourceManager } from "../session/context-source"
import { ApprovalStore } from "../system/permission/approval-store"
import { DreamDistillManager } from "../orchestrate/dream"
import { ContextManager } from "../session/context"
import { GoalJudge } from "../orchestrate/goal-judge"
import type { LLMTurnConfig } from "./turn"
import { getModeMaxIterations, getModeSystemPromptSuffix } from "../config/modes"
import type { AgentMode } from "../config/modes"
import { DEFAULT_SYSTEM, type AgentConfig } from "./constants"

import { classifyStep, isTerminal, isRecovery, MAX_STEPS_WARNING, MAX_STEPS_REACHED } from "./turn-classifier"
import { ProviderCatalog } from "../llm/provider-catalog"
import { runTurn, runMaxModeTurn, type TurnRunnerInput, type TurnRunnerOutput } from "./turn-runner"
import { runStopHooks, registerStopHook, autoDreamHook, memoryPromoteHook } from "./stop-hooks"
import { PendingInputQueue } from "./input-queue"

export type PermissionReply = "allow" | "deny" | "always"

export type { AgentConfig } from "./constants"

export type { AgentEvent } from "../types"

/** 用户附带的文件路径引用（文本/Office，不落库内容） */
export interface FileRef {
  name: string
  path?: string
  kind?: string
}
export class Agent {
  private stateMachine = new AgentStateMachine()
  private memoryManager!: MemoryManager
  private dynamicMemory!: DynamicMemoryManager
  private approvalStore!: ApprovalStore
  private orchestrator!: ToolOrchestrator
  private checkpointProvider!: CheckpointProvider
  private dreamDistillManager!: DreamDistillManager
  private contextManager!: ContextManager
  private goalJudge!: GoalJudge

  /** System Context Sources — 增量式系统上下文管理 */
  private sourceManager: SourceManager | null = null
  private sourceManagerSources: {
    memory: import("../session/context-source").MemorySource
    code: import("../session/context-source").CodeSource
    goal: import("../session/context-source").GoalSource
    mode: import("../session/context-source").ModeSource
    knowledge: import("../session/context-source").KnowledgeSource
  } | null = null

  /** VectorMemoryProvider 惰性初始化，避免构造函数中网络阻塞 */
  private _vectorProvider: VectorMemoryProvider | null = null

  /** 文本 N-gram 缓冲区 — 用于分类器的 text-repeat 检测 */
  private ngramBuffer: string[] = []

  /** 全局 Token 预算累计（跨输入队列、跨 run 持久于实例） */
  private runTotalTokens = 0

  /** 连续纯工具轮次计数 — 无文本输出的工具调用轮数，超过阈值强制收敛 */
  private consecutiveToolTurns = 0

  /** pre_llm 插件钩子取消函数 — run 结束时移除，防内存泄漏 */
  private _preLLMOff: (() => void) | null = null

  /** 同批次提取的记忆节点 id — 用于会话收尾时自动建边（co_occurred 共现） */
  private graphBatchIds: string[] = []

  /** 上次自动图谱维护时间戳 — 用于低频衰减/固化调度 */
  private lastGraphMaintenanceAt = 0

  get aborted(): boolean { return this.stateMachine.aborted }
  abort(): void { this.stateMachine.stop() }

  private ensureVectorProvider(): VectorMemoryProvider {
    if (!this._vectorProvider) {
      this._vectorProvider = new VectorMemoryProvider()
      this.memoryManager.addProvider(this._vectorProvider)
    }
    return this._vectorProvider
  }

  constructor(
    private registry: ToolRegistry,
    apiKey?: string,
    apiUrl?: string,
    workspace?: string,
    private deps?: {
      memoryManager?: MemoryManager
      checkpointProvider?: CheckpointProvider
      dreamDistillManager?: DreamDistillManager
      contextManager?: ContextManager
      goalJudge?: GoalJudge
      orchestrator?: ToolOrchestrator
      ftsProvider?: FTSMemoryProvider
    },
  ) {
    this.memoryManager = deps?.memoryManager ?? new MemoryManager()
    this.dynamicMemory = createDynamicMemory()
    setDynamicMemoryManager(this.dynamicMemory)
    this.checkpointProvider = deps?.checkpointProvider ?? new CheckpointProvider()
    this.dreamDistillManager = deps?.dreamDistillManager ?? new DreamDistillManager()
    this.contextManager = deps?.contextManager ?? new ContextManager(this.checkpointProvider, this.memoryManager)
    this.goalJudge = deps?.goalJudge ?? new GoalJudge()
    this.approvalStore = new ApprovalStore()
    this.orchestrator = deps?.orchestrator ?? new ToolOrchestrator(
      registry,
      workspace ? { persistDir: join(workspace, ".task_outputs", "tool-results") } : undefined,
    )
    const ftsProvider = deps?.ftsProvider ?? new FTSMemoryProvider()
    this.memoryManager.addProvider(new BuiltinMemoryProvider())
    this.memoryManager.addProvider(this.checkpointProvider)
    if (workspace) {
      this.memoryManager.addProvider(new FileMemoryProvider())
      this.memoryManager.addProvider(ftsProvider)
    }
    this.checkpointProvider.setFTSProvider(ftsProvider)
    setFTSProvider(ftsProvider)

    // 保存 pre_llm 监听器取消函数，run 结束时移除，避免插件钩子累积导致内存泄漏
    this._preLLMOff = pluginHooks.on("pre_llm", async (messages: LLMMessage[], config: AgentConfig) => {
      if (!config.sessionID || !config.workspace) return messages
      // 静态记忆注入（原有链路）
      let result = await this.contextManager.injectMemories(messages, config.sessionID)
      // 动态记忆图谱激活召回（图谱沉淀的记忆主动参与本轮推理）
      result = await this.injectGraphMemory(result)
      return result
    })

    // 注册默认 stop hooks
    registerStopHook(autoDreamHook)
    registerStopHook(memoryPromoteHook)
  }

  getGoalJudge(): GoalJudge { return this.goalJudge }
  getContextManager(): ContextManager { return this.contextManager }
  getSourceManager(): SourceManager | null { return this.sourceManager }
  getFTSProvider() { return this.memoryManager.getFTSProvider() }

  replyPermission(id: string, reply: PermissionReply): void {
    this.stateMachine.replyPermission(id, reply)
  }

  /* ════════════════════════════════════════════════
     阶段拆分 — run 方法拆为 5 个阶段
     1. prepare     → 初始化所有管理器 + 工具集
     2. restore     → 会话恢复（从 DB 重建上下文）
     3. buildPrompt → 系统提示构建 + 消息列表组装
     4. executeLoop → 两层循环（外层输入队列/内层推理-行动）
     5. finalize    → stop hooks + 清理
     ════════════════════════════════════════════════ */

  /** 阶段 1: 初始化所有管理器 + 工具集 */
  private async prepareRun(config: AgentConfig): Promise<{ ctx: ReturnType<typeof buildToolContext>; toolSet: Record<string, any>; llmConfig: LLMTurnConfig; maxSteps: number }> {
    if (!ProviderCatalog.isInitialized()) ProviderCatalog.registerBuiltins()

    // 每次 run 重置图谱共现批次（会话收尾提取的记忆仅与本会话批次互连）
    this.graphBatchIds = []

    const ctx = buildToolContext(config)
    if (config.permissions) this.approvalStore.setPermissions(config.permissions)

    const modelFilter = { providerID: config.provider || "openai", modelID: config.model }
    const materialized = this.registry.materializeWithModel(modelFilter, config.permissions)
    let toolSet = materialized.definitions
    // invalid 是内部自愈修复工具，不暴露给 LLM（参考 opencode activeTools 过滤）
    if (toolSet && "invalid" in toolSet) {
      const { invalid: _invalid, ...rest } = toolSet
      toolSet = rest
    }
    if (config.toolAllowlist && config.toolAllowlist.length > 0) {
      const allowed = new Set(config.toolAllowlist)
      toolSet = Object.fromEntries(Object.entries(toolSet).filter(([name]) => allowed.has(name)))
    }

    await this.contextManager.initialize(config.sessionID, config.workspace)
    this.goalJudge.bindSession(config.sessionID)

    if (config.workspace) {
      const { sourceManager, sources } = createSourceManager(config.workspace)
      this.sourceManager = sourceManager
      this.sourceManagerSources = sources
    }

    pluginHooks.emit("session_start", { sessionID: config.sessionID, workspace: config.workspace })

    if (config.goalDescription) {
      this.goalJudge.setGoal(config.goalDescription)
      if (config.judgeModel && config.apiKey) {
        this.goalJudge.setJudgeConfig({
          apiKey: config.apiKey, apiUrl: config.apiUrl, model: config.judgeModel,
          provider: config.judgeProvider || config.provider || "openai",
        })
      } else if (config.apiKey) {
        this.goalJudge.setJudgeConfig({
          apiKey: config.apiKey, apiUrl: config.apiUrl, model: config.model,
          provider: config.provider || "openai",
        })
      }
    }

    const modeMaxSteps = getModeMaxIterations(config.mode || "assistant")
    const maxSteps = config.maxSteps || modeMaxSteps || 10
    const llmConfig: LLMTurnConfig = {
      provider: config.provider || "openai", model: config.model,
      apiKey: config.apiKey, apiUrl: config.apiUrl,
      headers: config.headers, options: config.options,
    }

    return { ctx, toolSet, llmConfig, maxSteps }
  }

  /** 阶段 2: 会话恢复 */
  private async restoreSession(history: LLMMessage[], config: AgentConfig): Promise<LLMMessage[]> {
    if (history.length > 0) return history
    const stored = await loadSession(config.sessionID)
    if (!stored || stored.messages.length === 0) return history

    const restored: LLMMessage[] = []
    for (const m of stored.messages) {
      if (m.role === "assistant") {
        const parsed = tryParseAssistantPayload(m.content)
        if (parsed) {
          restored.push({
            role: "assistant",
            content: [
              { type: "text", text: parsed.text },
              ...parsed.tool_calls.map((tc) => ({
                type: "tool-call" as const,
                toolCallId: tc.id, toolName: tc.name,
                args: JSON.parse(tc.args),
              })),
            ],
            ...(parsed.reasoning_content ? { reasoning_content: parsed.reasoning_content } : {}),
          })
          continue
        }
        restored.push({ role: "assistant", content: m.content })
        continue
      }
      if (m.role === "tool") {
        if (!m.toolCallId) {
          restored.push({ role: "tool", content: [{ type: "tool-result" as const, toolCallId: "unknown", toolName: "unknown", output: m.content }] })
          continue
        }
        const lastAssistant = [...restored].reverse().find(r => r.role === "assistant")
        if (lastAssistant && typeof lastAssistant.content === "string" && !hasToolCalls(lastAssistant.content)) {
          lastAssistant.content += `\n\n[Tool result: ${m.content.slice(0, 500)}]`
          continue
        }
        restored.push({ role: "tool", content: [{ type: "tool-result" as const, toolCallId: m.toolCallId, toolName: "unknown", output: m.content }], tool_call_id: m.toolCallId })
        continue
      }
      // user 消息：若为 JSON {text, images, files} 则恢复文本并读回图片/文件提示
      const parsedUser = tryParseUserWithImages(m.content)
      if (parsedUser) {
        const contentParts: Array<{ type: "text"; text: string } | { type: "image"; image: string; mediaType: string }> =
          [{ type: "text" as const, text: parsedUser.text }]
        for (const relPath of parsedUser.images) {
          const dataUrl = await this.readAttachmentDataUrl(relPath)
          if (dataUrl) {
            const mime = /^data:(image\/[a-z0-9.+-]+);/.exec(dataUrl)?.[1] || "image/png"
            contentParts.push({ type: "image" as const, image: dataUrl, mediaType: mime })
          }
        }
        // 文件路径引用：文本→路径提示（Agent 可 read_file）；Office→仅卡片（内容不可重建）
        for (const f of parsedUser.files) {
          if (f.kind === "text" && f.path) {
            contentParts.push({ type: "text" as const, text: `📎 ${f.name} (${f.path})` })
          } else if (f.name) {
            contentParts.push({ type: "text" as const, text: `📎 ${f.name}` })
          }
        }
        restored.push({ role: "user", content: contentParts })
        continue
      }
      restored.push({ role: "user", content: m.content })
    }

    // 修复消息序列（孤立 tool / 乱序 tool），确保发给 LLM 的序列合法
    const repaired = repairMessageSequence(restored)
    const rebuilt = this.contextManager.onSessionResume(repaired, config.sessionID)
    return rebuilt.length > repaired.length ? rebuilt : repaired
  }

  /** 读取附件文件为 data URL（{userData}/{relPath}），失败返回 null */
  private async readAttachmentDataUrl(relPath: string): Promise<string | null> {
    try {
      const abs = join(getPlatformPaths().userData, relPath)
      const data = await fs.readFile(abs)
      const ext = relPath.split(".").pop()?.toLowerCase() || "png"
      const mime = ext === "pdf" ? "application/pdf"
        : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
        : ext === "gif" ? "image/gif"
        : ext === "webp" ? "image/webp"
        : "image/png"
      return `data:${mime};base64,${data.toString("base64")}`
    } catch { return null }
  }

  /**
   * 持久化用户上传的图片到 {userData}/attachments/{sessionId}/。
   * 返回相对路径数组（供数据库落库与历史恢复），失败时返回空数组（不阻断主流程）。
   */
  private async persistImages(sessionId: string, images: string[]): Promise<string[]> {
    const paths: string[] = []
    try {
      const baseDir = join(getPlatformPaths().userData, "attachments", sessionId)
      await fs.mkdir(baseDir, { recursive: true })
      for (let i = 0; i < images.length; i++) {
        const dataUrl = images[i]
        // 解析 data URL → 扩展名 + base64 数据（支持图片与 PDF）
        const mimeMatch = /^data:((?:image|application)\/[a-z0-9.+-]+);base64,(.*)$/s.exec(dataUrl)
        if (!mimeMatch) continue
        const mime = mimeMatch[1]
        const base64 = mimeMatch[2]
        const ext = mime === "application/pdf" ? "pdf" : (mime.split("/")[1]?.replace("+", "-") || "png")
        const fileName = `${Date.now()}_${i}.${ext}`
        const filePath = join(baseDir, fileName)
        await fs.writeFile(filePath, Buffer.from(base64, "base64"))
        paths.push(`attachments/${sessionId}/${fileName}`)
      }
    } catch { /* 落盘失败不阻断主流程 */ }
    return paths
  }

  /** 阶段 3: 构建系统提示和初始消息列表 */
  private async buildMessages(
    config: AgentConfig,
    userMessage: string,
    enrichedUser: string,
    memoryPrompt: string,
    history: LLMMessage[],
    imagePaths?: string[],
    fileRefs?: FileRef[],
  ): Promise<LLMMessage[]> {
    // 含图片/文件时以 JSON 落库（保存路径引用，历史会话可恢复；文本/Office 内容不落库）
    const hasMedia = (imagePaths && imagePaths.length > 0) || (fileRefs && fileRefs.length > 0)
    const storedContent = hasMedia
      ? JSON.stringify({
          text: userMessage,
          ...(imagePaths && imagePaths.length > 0 ? { images: imagePaths } : {}),
          ...(fileRefs && fileRefs.length > 0 ? { files: fileRefs } : {}),
        })
      : userMessage
    await appendMessage(config.sessionID, {
      role: "user", content: storedContent, timestamp: new Date().toISOString(),
    })
    pluginHooks.emit("user_prompt_submit", { sessionID: config.sessionID, message: userMessage })

    const goalPrompt = this.goalJudge.toSystemPrompt()
    let systemContent: string
    if (this.sourceManager && this.sourceManagerSources) {
      await prepareSourceManagerContext(this.sourceManager, this.sourceManagerSources, config, memoryPrompt, goalPrompt)
      systemContent = await this.sourceManager.build({
        sessionID: config.sessionID, workspace: config.workspace, mode: config.mode,
        customSystemPrompt: config.systemPrompt || DEFAULT_SYSTEM, currentFile: config.currentFile,
      })
    } else {
      const modeSuffix = getModeSystemPromptSuffix(config.mode || "assistant")
      const baseSystem = await buildSystemMessage(config, memoryPrompt, DEFAULT_SYSTEM)
      const systemWithMode = modeSuffix ? `${baseSystem}\n\n[MODE: ${config.mode}]\n${modeSuffix}` : baseSystem
      systemContent = goalPrompt ? `${systemWithMode}\n\n${goalPrompt}` : systemWithMode
    }

    return [
      { role: "system", content: systemContent },
      ...history.map((m) => {
        const role = String(m.role || "user") as LLMMessage["role"]
        const content = m.content
        if (role === "assistant" && "tool_calls" in m && m.tool_calls && typeof content === "string") {
          const oldTc = m.tool_calls as Array<{ id?: string; name?: string; args?: unknown; toolCallId?: string; toolName?: string; function?: { name?: string; arguments?: string } }>
          const assistantMsg: LLMMessage = {
            role: "assistant",
            content: [
              { type: "text" as const, text: content },
              ...oldTc.map((tc) => ({
                type: "tool-call" as const,
                toolCallId: String(tc.id || tc.toolCallId || ""),
                toolName: String(tc.function?.name || tc.toolName || ""),
                args: typeof tc.function?.arguments === "string" ? JSON.parse(tc.function.arguments) : (tc.args || {}),
              })),
            ],
          }
          return assistantMsg
        }
        const msg: LLMMessage = { role, content }
        if (m.tool_call_id) msg.tool_call_id = String(m.tool_call_id)
        return msg
      }),
      { role: "user", content: enrichedUser },
    ]
  }

  /**
   * 阶段 4: 内层循环单步 — 处理 LLM 信号 + Doom 检测 + Goal 检查 + 持久化
   * 返回 true 表示继续循环，false 表示终止
   */
  private async *handleTurnOutput(
    turnOutput: TurnRunnerOutput,
    messages: LLMMessage[],
    config: AgentConfig,
    currentInput: { message: string },
    allToolCalls: Array<{ name: string; args: string }>,
  ): AsyncGenerator<AgentEvent, { messages: LLMMessage[]; shouldContinue: boolean }> {
    messages = turnOutput.messages

    if (turnOutput.signal === "context_overflow") {
      yield { type: "thinking", text: "⚠️ Context too long, performing emergency compaction..." }
      const compacted = await this.contextManager.reactiveCompact(messages)
      if (compacted.length < messages.length) {
        messages.length = 0
        messages.push(...compacted)
        yield { type: "thinking", text: "🔄 Emergency compaction complete, retrying..." }
        return { messages, shouldContinue: true }
      }
      yield { type: "error", message: "Context overflow: compaction failed to reduce size" }
      return { messages, shouldContinue: false }
    }

    if (turnOutput.signal === "stop") {
      // LLM 失败或无有效输出时，持久化错误消息，避免历史记录丢失
      const llmFailedWithError = !!turnOutput.error
      if (!this.stateMachine.aborted && (llmFailedWithError || (!turnOutput.text && turnOutput.toolCalls.length === 0))) {
        // 部分输出 + 中途失败：先落部分文本，再补错误提示
        if (turnOutput.text) {
          try {
            await appendMessage(config.sessionID, { role: "assistant", content: turnOutput.text, timestamp: new Date().toISOString(), retryCount: turnOutput.retryCount || 0 })
          } catch { /* 持久化失败不阻塞 */ }
        }
        const msg = `⚠️ 模型调用失败${turnOutput.error ? `：${turnOutput.error}` : ""}，请检查 API Key / 模型配置后重试。`
        try {
          await appendMessage(config.sessionID, { role: "assistant", content: msg, timestamp: new Date().toISOString() })
        } catch { /* 持久化失败不阻塞 */ }
      }
      yield { type: "finish", reason: this.stateMachine.aborted ? "stopped" : "error", usage: turnOutput.usage }
      return { messages, shouldContinue: false }
    }

    if (!turnOutput.text && turnOutput.toolCalls.length === 0) {
      if (this.stateMachine.aborted) yield { type: "finish", reason: "stopped", usage: turnOutput.usage }
      return { messages, shouldContinue: false }
    }

    if (turnOutput.toolCalls.length > 0) {
      // 收敛控制：连续纯工具轮次（无文本输出）超阈值时，强制 LLM 总结并停止，避免"一直搜索不收敛"
      // 搜索类工具更激进（4 轮），其他工具 8 轮
      const allNames = turnOutput.toolCalls.map(tc => tc.name)
      const isSearchTurn = allNames.some(n => ["web_search", "web_fetch", "web_browse", "web_fetch_url"].includes(n))
      const MAX_PURE_TOOL_TURNS = isSearchTurn ? 4 : 8
      if (!turnOutput.text) {
        this.consecutiveToolTurns++
      } else {
        this.consecutiveToolTurns = 0
      }
      if (this.consecutiveToolTurns >= MAX_PURE_TOOL_TURNS) {
        yield { type: "thinking", text: `⛔ 已连续 ${this.consecutiveToolTurns} 轮工具调用但未产生回复，强制总结当前结果并停止。` }
        messages.push({ role: "user", content: "你已经连续调用工具多次但尚未给出文字回复。请立即基于已有信息总结回答，不要再调用任何工具。" })
        this.consecutiveToolTurns = 0
        return { messages, shouldContinue: true }
      }

      for (const tc of turnOutput.toolCalls) allToolCalls.push({ name: tc.name, args: tc.arguments })
      const lastCall = turnOutput.toolCalls[turnOutput.toolCalls.length - 1]
      const { detectDoomLoop } = await import("./utils")
      if (detectDoomLoop({ name: lastCall.name, args: lastCall.arguments }, allToolCalls.slice(0, -1))) {
        const { id, waitForReply } = this.stateMachine.createPermissionRequest()
        yield { type: "permission_request", id, action: "doom_loop", resources: [`${lastCall.name}(${lastCall.arguments.slice(0, 100)})`], toolCall: { id: lastCall.id, name: lastCall.name, input: {} } }
        const allowed = await waitForReply()
        if (!allowed) {
          yield { type: "thinking", text: "⛔ Doom loop blocked by user" }
          yield { type: "finish", reason: "doom_loop_blocked" }
          return { messages, shouldContinue: false }
        }
      }
    }

    if (turnOutput.toolCalls.length === 0) {
      // 纯文本回复：此处必须先落库再 return，否则下方 finish 分支提前返回导致消息丢失（工具调用消息已由 turn-runner 按序落库）
      const content = turnOutput.reasoningContent
        ? JSON.stringify({ text: turnOutput.text || "", reasoning_content: turnOutput.reasoningContent })
        : (turnOutput.text || "")
      await appendMessage(config.sessionID, { role: "assistant", content, timestamp: new Date().toISOString(), retryCount: turnOutput.retryCount || 0 })
      // 携带 reasoning_content 到内存消息，保证下一轮能回传（DeepSeek thinking 必需）
      if (turnOutput.reasoningContent) {
        messages.push({
          role: "assistant",
          content: turnOutput.text || "",
          reasoning_content: turnOutput.reasoningContent,
        })
      } else if (turnOutput.text) {
        messages.push({ role: "assistant", content: turnOutput.text })
      }

      const activeGoal = this.goalJudge.getActiveGoal()
      if (activeGoal) {
        const quickCheck = this.goalJudge.quickCheck(activeGoal, messages)
        if (quickCheck?.satisfied) {
          activeGoal.status = "satisfied"
          yield { type: "goal_status", goalId: activeGoal.id, description: activeGoal.description, status: "satisfied", reasoning: quickCheck.reasoning }
          yield { type: "finish", reason: "goal_satisfied" }
          return { messages, shouldContinue: false }
        }
        const evaluation = await this.goalJudge.evaluate(activeGoal, messages)
        yield { type: "goal_status", goalId: activeGoal.id, description: activeGoal.description, status: evaluation.satisfied ? "satisfied" : "still_active", reasoning: evaluation.reasoning }
        if (evaluation.satisfied) {
          yield { type: "finish", reason: "goal_satisfied" }
          return { messages, shouldContinue: false }
        }
        yield { type: "thinking", text: `🎯 Goal still active: ${evaluation.reasoning}` }
        return { messages, shouldContinue: true }
      }

      const stopMessage = await pluginHooks.triggerUntil("stop", messages, config)
      if (stopMessage) {
        messages.push({ role: "user", content: String(stopMessage) })
        return { messages, shouldContinue: true }
      }
      yield { type: "finish", reason: "stop", usage: turnOutput.usage }
      return { messages, shouldContinue: false }
    }

    const { messages: postToolMessages, didRebuild, reason } = await this.contextManager.checkAndRebuild(messages, config.sessionID)
    if (didRebuild) {
      messages = postToolMessages
      yield { type: "thinking", text: "🔄 Context compacted after tool execution" }
      yield { type: "context_rebuild", reason, tokensBefore: 0, tokensAfter: 0 }
    }

    return { messages, shouldContinue: true }
  }

  /** 阶段 5: 清理 */
  private finalizeRun = async (config: AgentConfig): Promise<void> => {
    pluginHooks.emit("session_end", { sessionID: config.sessionID, workspace: config.workspace })
    // pre_llm 监听器由 run() 的 finally 统一移除（防泄漏），这里只做资源关闭
    // 会话结束自动记忆提取（fire-and-forget，永不阻塞/阻断会话收尾）
    await this.maybeExtractSessionMemory(config)
    // 自动图谱维护：低频衰减弱记忆 + 固化高频记忆，防止图谱无限膨胀
    await this.maybeMaintainGraph()
    await this.contextManager.shutdown()
    this.memoryManager.shutdown().catch(() => {})
  }

  /**
   * 低频自动图谱维护（D 优化）：距上次维护超过阈值才执行衰减/固化。
   * 失败静默，绝不阻断会话收尾。
   */
  private async maybeMaintainGraph(): Promise<void> {
    const now = Date.now()
    const THRESHOLD_MS = 60 * 60 * 1000 // 1 小时
    if (now - this.lastGraphMaintenanceAt < THRESHOLD_MS) return
    this.lastGraphMaintenanceAt = now
    try {
      const forgotten = await this.dynamicMemory.performDecay()
      const consolidated = await this.dynamicMemory.performConsolidation()
      if (forgotten > 0 || consolidated > 0) {
        pluginHooks.emit("graph_maintenance", { forgotten, consolidated })
      }
    } catch {
      // 维护失败静默，不影响会话收尾
    }
  }

  /**
   * 会话结束自动记忆提取（M9）：用轻量文本模型从本次转写提取用户长期事实。
   * 提取本身 fire-and-forget，失败静默；这里的 await 只用于获取 llm 配置（异步懒加载）。
   */
  private async maybeExtractSessionMemory(config: AgentConfig): Promise<void> {
    if (!config.sessionID || !config.apiKey) return
    const fts = this.memoryManager.getFTSProvider()
    if (!fts) return
    try {
      const llmCall = await createExtractorLlmCall({
        provider: config.provider || "openai",
        model: config.model,
        apiKey: config.apiKey,
        apiUrl: config.apiUrl,
        headers: config.headers,
        options: config.options,
      })
      if (!llmCall) return
      const extractor = new MemoryExtractor({
        store: {
          list: (sessionID, limit) => fts.listMemories(sessionID, limit),
          remember: (content, sessionID) => {
            // 写入全文搜索记忆（原有链路）
            fts.remember(content, sessionID)
            // 同步沉淀进动态记忆图谱（失败静默，不阻断会话收尾）
            this.rememberExtractedToGraph(content).catch(() => {})
          },
        },
        listMessages: (sessionID) => getSessionMessages(sessionID),
        llmCall,
        minUserMessages: 4,
        keepInferred: config.keepInferredMemories,
      })
      await extractor.maybeRun(config.sessionID)
    } catch {
      // 提取失败绝不阻断会话收尾
    }
  }

  /**
   * 将提取的记忆沉淀进动态记忆图谱（M9 扩展）。
   * 提取器 store.remember 拿到的内容形如 "[persona] 用户……"，
   * 解析类型前缀后写入图谱节点；id 用内容哈希保证稳定去重。
   * 失败静默 —— 图谱写入失败不影响会话收尾。
   */
  private async rememberExtractedToGraph(content: string): Promise<void> {
    const raw = String(content || "").trim()
    if (!raw) return
    // 解析提取器类型前缀：persona/episodic/instruction（对齐 memory-extractor.ts）
    const match = /^\[(persona|episodic|instruction)\]\s*(.*)$/.exec(raw)
    const prefix = match?.[1]
    const clean = (match?.[2] || raw).trim()
    if (!clean) return
    // 映射到图谱 MemoryType：persona→declarative（稳定属性）、instruction→procedural（行为规则）、episodic→episodic（事件）
    const graphType = prefix === "persona" ? "declarative"
      : prefix === "instruction" ? "procedural"
      : "episodic"
    // 稳定 id：内容哈希（相同内容自然去重，addNode 为覆盖写入）
    const id = `mem-${createHash("sha256").update(clean).digest("hex").slice(0, 16)}`
    await this.dynamicMemory.addNode(id, clean, graphType)
    // 自动建边：与同批次（同一次会话收尾）提取的其它记忆建立共现关系，
    // 让激活传播沿边扩散，避免图谱全是孤立节点
    for (const prevId of this.graphBatchIds) {
      if (prevId !== id) {
        try {
          await this.dynamicMemory.addEdge(prevId, id, "co_occurred", 0.5)
        } catch { /* 建边失败静默，不阻断提取 */ }
      }
    }
    this.graphBatchIds.push(id)
    // 批次上限保护（防单次提取 5 条全两两互连时 O(n²) 过大）
    if (this.graphBatchIds.length > 32) this.graphBatchIds.shift()
  }

  /**
   * 动态记忆图谱激活召回：在每次 LLM 调用前，用最后一条用户消息激活图谱，
   * 将高相关记忆以独立 system 消息注入，让长期沉淀的记忆参与本轮推理。
   * 召回预算受限（单条 300 字符 / 总 3000 字符），失败静默降级为原消息。
   */
  private async injectGraphMemory(messages: LLMMessage[]): Promise<LLMMessage[]> {
    // 取最后一条用户消息作为激活查询
    let query = ""
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === "user" && typeof msg.content === "string") {
        query = msg.content.slice(0, 200)
        break
      }
    }
    if (!query) return messages

    try {
      const result = await this.dynamicMemory.activate(query)
      if (result.nodes.length === 0) return messages

      const lines = result.nodes.slice(0, 15).map((node) => {
        const strength = calculateStrength(node).toFixed(2)
        return `- [${node.type}] ${node.content} (强度 ${strength})`
      })
      // 预算保护：截断/丢弃超限内容（对齐 Tencent applyRecallBudget）
      const budgeted = applyRecallBudget(lines, { maxCharsPerMemory: 300, maxTotalRecallChars: 3000 })
      if (budgeted.length === 0) return messages

      const memoryPrompt = `## 动态记忆图谱相关记忆\n${budgeted.join("\n")}\n\n（以上为与当前问题相关的长期记忆，可参考其中稳定的用户偏好/决策/规则）`
      return [{ role: "system", content: memoryPrompt }, ...messages]
    } catch {
      // 召回失败静默降级，绝不阻断推理
      return messages
    }
  }

  async *run(
    userMessage: string,
    history: LLMMessage[],
    config: AgentConfig,
    images?: string[],
    files?: FileRef[],
  ): AsyncGenerator<AgentEvent> {
    try {
      yield* this._runCore(userMessage, history, config, images, files)
    } finally {
      // 无论正常结束、中断、abort 或异常，都确保清理（移除插件监听器，防止累积泄漏）
      this._preLLMOff?.()
      this._preLLMOff = null
    }
  }

  private async *_runCore(
    userMessage: string,
    history: LLMMessage[],
    config: AgentConfig,
    images?: string[],
    files?: FileRef[],
  ): AsyncGenerator<AgentEvent> {
    const { ctx, toolSet, llmConfig, maxSteps } = await this.prepareRun(config)

    if (this.dreamDistillManager && this.contextManager.shouldAutoDream?.()) {
      try {
        this.dreamDistillManager.setLLMConfig({ apiKey: config.apiKey, apiUrl: config.apiUrl, model: config.model, provider: config.provider || "openai" })
        await this.dreamDistillManager.autoDream()
        yield { type: "thinking", text: "🧠 Memory consolidated from recent session" }
      } catch { /* 不阻塞 */ }
    }

    const restoredHistory = await this.restoreSession(history, config)

    // 图片落盘：写入 {userData}/attachments/{sessionId}/，返回相对路径供落库与历史恢复
    let imagePaths: string[] | undefined
    if (images && images.length > 0) {
      imagePaths = await this.persistImages(config.sessionID, images)
    }

    // 文件（文本/Office）：文本存路径提示（Agent 用 read_file）；Office 解析注入一次性
    const fileRefs = files
    let fileInjectedText = ""
    if (files && files.length > 0) {
      const { parseOfficeFileForModel } = await import("../llm/ooxml-core")
      const officeTexts: string[] = []
      for (const f of files) {
        if (f.kind === "text" && f.path) {
          // 文本文件：只给路径提示，Agent 通过 read_file 读取
          officeTexts.push(`📎 ${f.name} (${f.path})`)
        } else if ((f.kind === "excel" || f.kind === "word" || f.kind === "ppt") && f.path) {
          const content = await parseOfficeFileForModel(f.path, f.name)
          if (content) officeTexts.push(`### ${f.name}\n\n${content}`)
          else officeTexts.push(`📎 ${f.name} (${f.path})`)
        }
      }
      if (officeTexts.length > 0) {
        fileInjectedText = `\n\n${officeTexts.join("\n\n")}`
      }
    }

    const { enrichedUser, memoryPrompt } = await this.contextManager.prepareContext(userMessage + fileInjectedText, config.sessionID)
    let messages = await this.buildMessages(config, userMessage, enrichedUser, memoryPrompt, restoredHistory, imagePaths, fileRefs)

    // 用户上传的图片：注入首条 user 消息为 ImagePart（含图片时模型才能识图）
    if (images && images.length > 0) {
      const lastUserIdx = messages.findLastIndex((m) => m.role === "user")
      if (lastUserIdx >= 0) {
        const baseContent = messages[lastUserIdx].content
        const textContent = typeof baseContent === "string"
          ? baseContent
          : baseContent.filter((p) => p.type === "text").map((p) => (p as { text?: string }).text || "").join("\n")
        messages[lastUserIdx] = {
          ...messages[lastUserIdx],
          content: [
            { type: "text" as const, text: textContent },
            ...images.map((img) => {
              // img 为完整 data URL（data:image/png;base64,...），由协议层序列化为 image_url
              const mime = /^data:(image\/[a-z0-9.+-]+);/.exec(img)?.[1] || "image/png"
              return { type: "image" as const, image: img, mediaType: mime }
            }),
          ],
        }
      }
    }

    const inputQueue = new PendingInputQueue()
    inputQueue.push({ message: userMessage, type: "user" })

    while (inputQueue.hasPending()) {
      const currentInput = inputQueue.next()!
      const isFirstInput = currentInput.message === userMessage
      if (!isFirstInput) {
        messages.push({ role: "user", content: currentInput.message })
        await appendMessage(config.sessionID, { role: "user", content: currentInput.message, timestamp: new Date().toISOString() })
      }

      let step = 0
      let hasLastAssistant = false
      const allToolCalls: Array<{ name: string; args: string }> = []
      this.consecutiveToolTurns = 0
      // 全局 Token 预算累计（跨输入队列）
      const maxTotalTokens = config.maxTotalTokens || 0
      let totalTokensUsed = this.runTotalTokens
      const budgetCheckpointAt = Math.floor(maxTotalTokens * 0.8)

      while (true) {
        step++

        if (step === maxSteps - 1) {
          // 最后一轮前注入警告，本轮正常调用 LLM（不再 continue 浪费一轮）
          yield { type: "thinking", text: "⚠️ 已达步数上限，LLM 正在做总结..." }
          messages.push({ role: "user", content: MAX_STEPS_WARNING })
        } else if (step >= maxSteps) {
          yield { type: "thinking", text: "⛔ 超出步数上限，强制总结..." }
          messages.push({ role: "user", content: MAX_STEPS_REACHED })
        }

        if (hasLastAssistant) {
          const stepAction = classifyStep(messages, {
            step, maxSteps, ngramBuffer: this.ngramBuffer,
            activeGoal: this.goalJudge.getActiveGoal(), toolErrorCount: 0,
            toolCallCount: messages.filter(m => Array.isArray(m.content) && m.content.some((p: any) => p.type === "tool-call")).length,
            userIntent: detectUserIntent(currentInput.message),
          })
          if (isTerminal(stepAction)) break
          if (isRecovery(stepAction)) {
            yield { type: "thinking", text: getNudgeMessage(stepAction) }
            messages.push({ role: "user", content: stepAction.nudge })
            continue
          }
        }

        if (this.stateMachine.aborted) {
          yield { type: "finish", reason: "stopped" }
          return
        }

        const { messages: rebuiltMessages, didRebuild, reason } = await this.contextManager.checkAndRebuild(messages, config.sessionID)
        if (didRebuild) {
          messages = rebuiltMessages
          const tokensAfter = estimateTokens(messages)
          yield { type: "context_rebuild", reason, tokensBefore: 0, tokensAfter }
        }

        messages = await pluginHooks.emitWaterfall("pre_llm", messages, config)

        for (const m of messages) {
          if (Array.isArray(m.content)) {
            for (const p of m.content) {
              if (p.type === "tool-call") allToolCalls.push({ name: p.toolName, args: JSON.stringify(p.args) })
            }
          }
        }

        const turnInput: TurnRunnerInput = {
          messages, tools: toolSet, sessionID: config.sessionID, workspace: config.workspace,
          config: { ...llmConfig, maxContextTokens: config.maxContextTokens, permissions: config.permissions, onPermissionSave: config.onPermissionSave, autoAcceptPermissions: config.autoAcceptPermissions, fallbacks: config.fallbacks, visionModel: config.visionModel, modelVision: config.modelVision },
          deps: { registry: this.registry, stateMachine: this.stateMachine, approvalStore: this.approvalStore, orchestrator: this.orchestrator },
          ctx,
          // 最后一步禁用所有工具定义，强制纯文本收尾（参考 OpenCode MAX_STEPS_PROMPT）
          ...(step >= maxSteps ? { tools: {} } : {}),
        }

        const turnOutput = config.maxMode
          ? yield* runMaxModeTurn({ ...turnInput, maxModeConfig: { n: config.maxModeCandidates || 3, candidateConfig: llmConfig, judgeConfig: config.judgeModelConfig } })
          : yield* runTurn(turnInput)

        const { messages: newMessages, shouldContinue } = yield* this.handleTurnOutput(turnOutput, messages, config, currentInput, allToolCalls)
        messages = newMessages
        if (!shouldContinue) return

        // ── 成本/用量累加到会话（参考 opencode Session.Info.cost/tokens） ──
        if (turnOutput.usage) {
          const pricing = getModelPricing(config.model)
          const result = calculateCost(turnOutput.usage, pricing)
          const { accumulateSessionUsage } = await import("../session/manager")
          await accumulateSessionUsage(config.sessionID, {
            cost: result.cost,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            reasoningTokens: result.reasoningTokens,
            cacheReadTokens: result.cacheReadTokens,
            cacheWriteTokens: result.cacheWriteTokens,
          })
        }

        // ── 全局 Token 预算闸门 ──
        if (turnOutput.usage?.totalTokens) {
          totalTokensUsed += turnOutput.usage.totalTokens
          this.runTotalTokens = totalTokensUsed
          if (maxTotalTokens > 0 && totalTokensUsed >= maxTotalTokens) {
            yield { type: "thinking", text: `⛔ Token 预算已耗尽（${totalTokensUsed}/${maxTotalTokens}），强制总结并终止...` }
            messages.push({ role: "user", content: MAX_STEPS_REACHED })
          } else if (maxTotalTokens > 0 && totalTokensUsed >= budgetCheckpointAt) {
            yield { type: "thinking", text: `⚠️ Token 预算已使用 ${Math.round((totalTokensUsed / maxTotalTokens) * 100)}%（${totalTokensUsed}/${maxTotalTokens}），请尽快收尾...` }
          }
        }

        await this.contextManager.syncTurn(currentInput.message, turnOutput.text, config.sessionID)
        await this.memoryManager.promoteMemories(config.sessionID)
        this.dreamDistillManager.recordTurn(currentInput.message, turnOutput.text)

        if (turnOutput.text) {
          this.ngramBuffer.push(turnOutput.text)
          if (this.ngramBuffer.length > 20) this.ngramBuffer.shift()
        }

        if (config.apiKey && !this.checkpointProvider.hasLLMConfig) {
          this.contextManager.setLLMConfig({ apiKey: config.apiKey, apiUrl: config.apiUrl, model: config.model, provider: config.provider || "openai" })
        }

        hasLastAssistant = true
      }

      const stopResult = await runStopHooks({ sessionID: config.sessionID, workspace: config.workspace, messages, contextManager: this.contextManager, memoryManager: this.memoryManager, dreamDistillManager: this.dreamDistillManager })
      if (stopResult.additionalMessages.length > 0) {
        inputQueue.pushMany(stopResult.additionalMessages.map(msg => ({ message: msg, type: "steer" as const })))
      }
    }

    await this.finalizeRun(config)
    yield { type: "finish", reason: "length" }
  }
}

/* ── 辅助函数 ── */

/** 解析 user 消息 JSON {text, images:[paths]}，非此格式返回 null */
function tryParseUserWithImages(content: string): { text: string; images: string[]; files: FileRef[] } | null {
  if (!content.trim().startsWith("{")) return null
  try {
    const parsed = JSON.parse(content) as { text?: unknown; images?: unknown; files?: unknown }
    if (parsed && typeof parsed === "object") {
      const images = Array.isArray(parsed.images)
        ? parsed.images.filter((p: unknown): p is string => typeof p === "string")
        : []
      const files = Array.isArray(parsed.files)
        ? parsed.files.filter((f): f is FileRef => !!f && typeof f === "object" && typeof (f as FileRef).name === "string")
        : []
      if (images.length > 0 || files.length > 0) {
        return { text: typeof parsed.text === "string" ? parsed.text : "", images, files }
      }
    }
  } catch { /* json parse fallback */ }
  return null
}

function hasToolCalls(content: string | any[]): boolean {
  if (Array.isArray(content)) return content.some((p) => p.type === "tool-call")
  return false
}

function tryParseAssistantPayload(content: string): { text: string; tool_calls: Array<{ id: string; name: string; args: string }>; reasoning_content?: string } | null {
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.tool_calls)) {
      return { text: parsed.text || "", tool_calls: parsed.tool_calls, reasoning_content: parsed.reasoning_content }
    }
    if (parsed && typeof parsed === "object" && "text" in parsed && "reasoning_content" in parsed) {
      return { text: parsed.text || "", tool_calls: [], reasoning_content: parsed.reasoning_content }
    }
  } catch { /* json parse fallback */ }
  return null
}

function getNudgeMessage(action: { type: string; nudge?: string; reason?: string }): string {
  if (action.type === "retry") return "🔄 正在修正回答..."
  if (action.type === "text-repeat") return "🔁 检测到重复输出，正在尝试不同方式..."
  if (action.type === "auto-continue") return `⏩ 自动续跑中 (${(action as any).reason || ""})...`
  return "⏳ 处理中..."
}

/**
 * 检测用户意图：区分"纯聊天"与"需要工具"。
 * - 简单寒暄/概念问答 → chat_only（不应误调工具）
 * - 涉及文件/代码/数据/网络 → requires_tool
 * 参考 kimi.txt:7 的问答-任务区分逻辑。
 */
function detectUserIntent(message: string): "requires_tool" | "chat_only" | undefined {
  if (!message) return undefined
  const text = message.trim()
  const chatOnlyPatterns = [
    /^(你好|嗨|hi|hello|哈喽|早上好|下午好|晚上好|谢谢|再见|拜拜|在吗|你是谁|你能做什么|介绍一下你自己)\s*[!！。.]*$/i,
  ]
  if (chatOnlyPatterns.some(p => p.test(text))) return "chat_only"

  // 明确需要工具的迹象
  const toolIndicators = [
    /(读|查|看|打开|修改|编辑|创建|写|删除|搜索|找|统计|分析|比较|运行|执行|安装|下载|检查|测试|部署|构建|打包|git|npm|python|node|文件|目录|代码|报错|错误|日志|数据库|接口|api|url|网页|新闻|数据)/i,
  ]
  if (toolIndicators.some(p => p.test(text))) return "requires_tool"

  // 抽象概念问答（如"什么是递归"）→ 需要工具但可能只是解释
  return undefined
}
