import { ToolRegistry } from "../system/registry"
import type { AgentEvent } from "../types"
import type { LLMMessage } from "../llm/client"
import { estimateTokens } from "../shared/message-utils"
import { pluginHooks } from "../shared/plugin-hooks"
import type { PermissionSet, PermissionRule } from "../system/permission"
import { MemoryManager } from "../memory/manager"
import { BuiltinMemoryProvider } from "../memory/builtin-provider"
import { appendMessage, loadSession } from "../session/store"
import { VectorMemoryProvider } from "../memory/vector-provider"
import { FileMemoryProvider } from "../memory/file-memory-provider"
import { FTSMemoryProvider } from "../memory/fts-memory-provider"
import { CheckpointProvider } from "../memory/checkpoint-provider"
import { setFTSProvider } from "../tools/knowledge/memory"
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

import { classifyStep, isTerminal, isRecovery } from "./turn-classifier"
import { runTurn, runMaxModeTurn, type TurnRunnerInput } from "./turn-runner"
import { runStopHooks, registerStopHook, autoDreamHook, memoryPromoteHook } from "./stop-hooks"
import { PendingInputQueue } from "./input-queue"

export type PermissionReply = "allow" | "deny" | "always"

export interface AgentConfig {
  sessionID: string
  workspace: string
  model: string
  apiKey: string
  apiUrl: string
  provider?: string
  headers?: Record<string, string>
  options?: Record<string, unknown>
  systemPrompt?: string
  maxSteps?: number
  maxContextTokens?: number
  permissions?: PermissionSet
  hardPermission?: PermissionRule[]
  mode?: AgentMode
  toolAllowlist?: string[]
  onPermissionSave?: (rules: PermissionRule[]) => void
  goalDescription?: string
  judgeModel?: string
  judgeProvider?: string
  fallbacks?: Array<{ provider: string; model: string; apiKey: string; apiUrl: string }>
  maxMode?: boolean
  maxModeCandidates?: number
  judgeModelConfig?: LLMTurnConfig
  autoAcceptPermissions?: boolean
}

export type { AgentEvent } from "../types"

export const DEFAULT_SYSTEM = `You are Mira, an AI assistant integrated into a desktop application.

You have access to tools that let you interact with the user's system. ALWAYS use tools when they can help answer the user's question or complete their task. NEVER guess or make up information when you can get real data.

## Tool Usage Guide

### File Operations
- **read_file**: Use when you need to see file content, check code, read data, or examine any file. ALWAYS use this before modifying a file.
  - Example: "What's in this file?" → read_file
  - Example: "Check the config" → read_file
  
- **write_file**: Use when creating new files or completely replacing file content.
  - Example: "Create a new script" → write_file
  - Example: "Save this code to a file" → write_file

- **edit_file**: Use when modifying specific parts of existing files. ALWAYS read the file first.
  - Example: "Change line 10" → edit_file
  - Example: "Fix the bug in this function" → edit_file

- **list_files**: Use when exploring directory structure or finding files.
  - Example: "What files are in this folder?" → list_files
  - Example: "Show me the project structure" → list_files

### Search Operations
- **grep**: Use when searching for text patterns in files.
  - Example: "Find where this function is used" → grep
  - Example: "Search for TODO comments" → grep

- **glob**: Use when finding files by name pattern.
  - Example: "Find all TypeScript files" → glob
  - Example: "Where are the config files?" → glob

### Web Operations
- **web_search**: Use when you need current information from the internet.
  - Example: "What's the latest news about X?" → web_search
  - Example: "How do I use this library?" → web_search

- **web_fetch**: Use when you need to read content from a specific URL.
  - Example: "Read this documentation page" → web_fetch
  - Example: "Get the content of this article" → web_fetch

### Code Operations
- **bash**: Use when you need to run system commands, install packages, or execute scripts.
  - Example: "Install this npm package" → bash
  - Example: "Run the tests" → bash
  - Example: "Check git status" → bash

- **code_exec**: Use when you need to execute code snippets (Python/Node.js).
  - Example: "Calculate this for me" → code_exec
  - Example: "Test this logic" → code_exec

### Git Operations
- **git_status**: Use when checking repository status.
- **git_diff**: Use when viewing changes.
- **git_log**: Use when viewing commit history.
- **git_commit**: Use when saving changes to git.

### Document Generation
- **create_docx**: Use when users ask to generate documents, reports, or export content to Word format.
  - Example: "整理成文档" / "生成报告" / "做成Word" → create_docx
  - Example: "导出" / "保存为" / "输出文件" → create_docx
  - Example: "把这个数据做成报表" → create_docx

## Common Workflows

### Reading and Analyzing Files
1. User: "What's in config.json?" → read_file(path="config.json")
2. User: "Show me the project structure" → read_file(path=".")
3. User: "Find all TypeScript files" → glob(pattern="**/*.ts")

### Modifying Code
1. User: "Fix the bug in line 15" → read_file → edit_file
2. User: "Update this function" → read_file → edit_file
3. User: "Create a new file" → write_file

### Web Research
1. User: "How do I use React hooks?" → web_search(query="React hooks tutorial")
2. User: "Read this documentation" → web_fetch(url="https://...")
3. User: "What's the latest Node.js version?" → web_search(query="Node.js latest version")

### Git Operations
1. User: "What changed?" → git_status → git_diff
2. User: "Commit these changes" → git_status → git_commit
3. User: "Show recent commits" → git_log

### Document Generation
1. User: "整理成文档" → create_docx
2. User: "生成报告" → create_docx
3. User: "把这个数据做成Word" → create_docx

## Guidelines
1. **Always use tools** - If a tool can help, use it. Don't guess when you can know.
2. **Read before write** - Always read files before modifying them.
3. **Be direct** - Give concise, actionable answers.
4. **Explain briefly** - When using tools, briefly say what you're doing.
5. **Structure documents** - Use headings, paragraphs, tables for clear documents.`

export class Agent {
  private stateMachine = new AgentStateMachine()
  private memoryManager = new MemoryManager()
  private approvalStore = new ApprovalStore()
  private orchestrator: ToolOrchestrator
  private checkpointProvider: CheckpointProvider
  private dreamDistillManager: DreamDistillManager
  private contextManager: ContextManager
  private goalJudge: GoalJudge

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

  get aborted(): boolean { return this.stateMachine.aborted }
  abort(): void { this.stateMachine.stop() }

  private ensureVectorProvider(): VectorMemoryProvider {
    if (!this._vectorProvider) {
      this._vectorProvider = new VectorMemoryProvider()
      this.memoryManager.addProvider(this._vectorProvider)
    }
    return this._vectorProvider
  }

  constructor(private registry: ToolRegistry, apiKey?: string, apiUrl?: string, workspace?: string) {
    this.orchestrator = new ToolOrchestrator(registry)
    this.checkpointProvider = new CheckpointProvider()
    this.dreamDistillManager = new DreamDistillManager()
    this.contextManager = new ContextManager(this.checkpointProvider, this.memoryManager)
    this.goalJudge = new GoalJudge()
    const ftsProvider = new FTSMemoryProvider()
    this.memoryManager.addProvider(new BuiltinMemoryProvider())
    this.memoryManager.addProvider(this.checkpointProvider)
    // VectorMemoryProvider 改为惰性初始化，不在构造函数中阻塞
    if (workspace) {
      this.memoryManager.addProvider(new FileMemoryProvider())
      this.memoryManager.addProvider(ftsProvider)
    }
    this.checkpointProvider.setFTSProvider(ftsProvider)
    setFTSProvider(ftsProvider)

    pluginHooks.on("pre_llm", async (messages: LLMMessage[], config: AgentConfig) => {
      if (!config.sessionID || !config.workspace) return messages
      return this.contextManager.injectMemories(messages, config.sessionID)
    })

    // 注册默认 stop hooks
    registerStopHook(autoDreamHook)
    registerStopHook(memoryPromoteHook)
  }

  getGoalJudge(): GoalJudge { return this.goalJudge }
  getContextManager(): ContextManager { return this.contextManager }
  getSourceManager(): SourceManager | null { return this.sourceManager }
  getFTSProvider(): any { return (this.memoryManager as any).getFTSProvider() }

  replyPermission(id: string, reply: PermissionReply): void {
    this.stateMachine.replyPermission(id, reply)
  }

  async *run(
    userMessage: string,
    history: LLMMessage[],
    config: AgentConfig,
  ): AsyncGenerator<AgentEvent> {
    const ctx = buildToolContext(config)

    if (config.permissions) {
      this.approvalStore.setPermissions(config.permissions)
    }

    const modelFilter = { providerID: config.provider || "openai", modelID: config.model }
    const materialized = this.registry.materializeWithModel(modelFilter, config.permissions)
    let toolSet = materialized.definitions

    if (config.toolAllowlist && config.toolAllowlist.length > 0) {
      const allowed = new Set(config.toolAllowlist)
      toolSet = Object.fromEntries(Object.entries(toolSet).filter(([name]) => allowed.has(name)))
    }

    await this.contextManager.initialize(config.sessionID, config.workspace)
    this.goalJudge.bindSession(config.sessionID)

    // 初始化 SourceManager（如果 workspace 可用）
    if (config.workspace) {
      const { sourceManager, sources } = createSourceManager(config.workspace)
      this.sourceManager = sourceManager
      this.sourceManagerSources = sources
    }

    pluginHooks.emit("session_start", { sessionID: config.sessionID, workspace: config.workspace })

    const { enrichedUser, memoryPrompt } = await this.contextManager.prepareContext(userMessage, config.sessionID)

    if (config.goalDescription) {
      this.goalJudge.setGoal(config.goalDescription)
      if (config.judgeModel && config.apiKey) {
        this.goalJudge.setJudgeConfig({
          apiKey: config.apiKey,
          apiUrl: config.apiUrl,
          model: config.judgeModel,
          provider: config.judgeProvider || config.provider || "openai",
        })
      } else if (config.apiKey) {
        this.goalJudge.setJudgeConfig({
          apiKey: config.apiKey,
          apiUrl: config.apiUrl,
          model: config.model,
          provider: config.provider || "openai",
        })
      }
    }

    if (this.dreamDistillManager && (this.contextManager as any).shouldAutoDream?.()) {
      try {
        this.dreamDistillManager.setLLMConfig({
          apiKey: config.apiKey,
          apiUrl: config.apiUrl,
          model: config.model,
          provider: config.provider || "openai",
        })
        await this.dreamDistillManager.autoDream()
        yield { type: "thinking", text: "🧠 Memory consolidated from recent session" }
      } catch { /* 不阻塞 */ }
    }

    /* ── 会话恢复逻辑（同原版） ── */
    if (history.length === 0) {
      const stored = await loadSession(config.sessionID)
      if (stored && stored.messages.length > 0) {
        const restored: LLMMessage[] = []
        for (const m of stored.messages) {
          if (m.role === "assistant") {
            const parsed = tryParseAssistantPayload(m.content)
            if (parsed) {
              restored.push({
                role: "assistant",
                content: [
                  { type: "text", text: parsed.text },
                  ...parsed.tool_calls.map((tc: any) => ({
                    type: "tool-call" as const,
                    toolCallId: tc.id,
                    toolName: tc.name,
                    args: JSON.parse(tc.args),
                  })),
                ],
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
            if (lastAssistant && !hasToolCalls(lastAssistant.content)) {
              lastAssistant.content += `\n\n[Tool result: ${m.content.slice(0, 500)}]`
              continue
            }
            restored.push({ role: "tool", content: [{ type: "tool-result" as const, toolCallId: m.toolCallId, toolName: "unknown", output: m.content }], tool_call_id: m.toolCallId })
            continue
          }
          restored.push({ role: "user", content: m.content })
        }
        history = restored

        const rebuilt = this.contextManager.onSessionResume(history, config.sessionID)
        if (rebuilt.length > history.length) {
          history = rebuilt
          yield { type: "thinking", text: "🔄 Context reconstructed from checkpoint on session resume" }
        }
      }
    }

    await appendMessage(config.sessionID, {
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    })

    pluginHooks.emit("user_prompt_submit", { sessionID: config.sessionID, message: userMessage })

    const goalPrompt = this.goalJudge.toSystemPrompt()

    // 优先使用 SourceManager 构建系统提示（增量式）
    let systemContent: string
    if (this.sourceManager && this.sourceManagerSources) {
      // 设置动态 Source 内容
      await prepareSourceManagerContext(
        this.sourceManager,
        this.sourceManagerSources,
        config,
        memoryPrompt,
        goalPrompt,
      )
      systemContent = await this.sourceManager.build({
        sessionID: config.sessionID,
        workspace: config.workspace,
        mode: config.mode,
        customSystemPrompt: config.systemPrompt || DEFAULT_SYSTEM,
        currentFile: config.currentFile,
      })
    } else {
      // 向后兼容：使用旧路径
      const modeSuffix = getModeSystemPromptSuffix(config.mode || "assistant")
      const baseSystem = await buildSystemMessage(config, memoryPrompt, DEFAULT_SYSTEM)
      const systemWithMode = modeSuffix ? `${baseSystem}\n\n[MODE: ${config.mode}]\n${modeSuffix}` : baseSystem
      systemContent = goalPrompt
        ? `${systemWithMode}\n\n${goalPrompt}`
        : systemWithMode
    }

    let messages: LLMMessage[] = [
      { role: "system", content: systemContent },
      ...history.map((m: any) => {
        const role = String(m.role || "user") as LLMMessage["role"]
        const content = m.content as LLMMessage["content"]
        if (role === "assistant" && m.tool_calls && typeof content === "string") {
          const oldTc = (m.tool_calls || [])
          return {
            role: "assistant" as const,
            content: [
              { type: "text" as const, text: content },
              ...oldTc.map((tc: any) => ({
                type: "tool-call" as const,
                toolCallId: String(tc.id || tc.toolCallId || ""),
                toolName: String(tc.function?.name || tc.toolName || ""),
                args: typeof tc.function?.arguments === "string" ? JSON.parse(tc.function.arguments) : (tc.args || {}),
              })),
            ],
          } as LLMMessage
        }
        const msg: LLMMessage = { role, content }
        if (m.tool_call_id) msg.tool_call_id = String(m.tool_call_id)
        return msg
      }),
      { role: "user", content: enrichedUser },
    ]

    const modeMaxSteps = getModeMaxIterations(config.mode || "assistant")
    const maxSteps = config.maxSteps || modeMaxSteps || 10
    const llmConfig: LLMTurnConfig = {
      provider: config.provider || "openai",
      model: config.model,
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      headers: config.headers,
      options: config.options,
    }

    /* ════════════════════════════════════════════════
       两层循环 — 外层消费输入队列，内层分类驱动推理
       
       设计来源：
       - OpenCode: 外层 while 消费 steer/queue，内层 while 处理连续回合
       - MiMo-Code: 每轮内层循环先分类再执行
       - Claude Code: 显式退出类型
       ════════════════════════════════════════════════ */

    const inputQueue = new PendingInputQueue()
    inputQueue.push({ message: userMessage, type: "user" })

    // 外层循环：消费输入队列
    while (inputQueue.hasPending()) {
      const currentInput = inputQueue.next()!

      // 第一条输入使用已构建的 enrichedUser，后续输入追加到消息列表
      const isFirstInput = currentInput.message === userMessage
      if (!isFirstInput) {
        messages.push({ role: "user", content: currentInput.message })
        await appendMessage(config.sessionID, {
          role: "user",
          content: currentInput.message,
          timestamp: new Date().toISOString(),
        })
      }

      let step = 0
      let hasLastAssistant = false

      // 内层循环：单条输入的多轮推理-行动周期
      while (true) {
        step++

        // ── 第 1 步：分类上一步结果（仅当存在上一条 Assistant 消息）──
        if (hasLastAssistant) {
          const stepAction = classifyStep(messages, {
            step,
            maxSteps,
            ngramBuffer: this.ngramBuffer,
            activeGoal: this.goalJudge.getActiveGoal(),
            toolErrorCount: 0,
            toolCallCount: (messages.filter(m => Array.isArray(m.content) && m.content.some((p: any) => p.type === "tool-call"))).length,
          })

          if (isTerminal(stepAction)) break
          if (isRecovery(stepAction)) {
            yield { type: "thinking", text: getNudgeMessage(stepAction) }
            messages.push({ role: "user", content: stepAction.nudge })
            continue
          }
        }

        // ── 第 2 步：回合前检查 ──
        if (this.stateMachine.aborted) {
          yield { type: "finish", reason: "stopped" as const }
          return
        }

        const tokensBefore = estimateTokens(messages)
        const { messages: rebuiltMessages, didRebuild, reason } = await this.contextManager.checkAndRebuild(messages, config.sessionID)
        if (didRebuild) {
          messages = rebuiltMessages
          const tokensAfter = estimateTokens(messages)
          if (reason === "checkpoint_rebuild" || reason === "llm_summary" || reason === "proactive_rebuild") {
            const text = reason === "checkpoint_rebuild" ? "Context reconstructed from checkpoint"
              : reason === "proactive_rebuild" ? "Proactive checkpoint — preserving conversation context"
              : "Context compacted via summary"
            yield { type: "thinking" as const, text: `🔄 ${text}` }
          }
          yield { type: "context_rebuild" as const, reason, tokensBefore, tokensAfter }
        }

        messages = await pluginHooks.emitWaterfall("pre_llm", messages, config)

        // ── Doom loop 检测 ──
        const allToolCalls: Array<{ name: string; args: string }> = []
        for (const m of messages) {
          if (Array.isArray(m.content)) {
            for (const p of m.content) {
              if (p.type === "tool-call") {
                allToolCalls.push({ name: p.toolName, args: JSON.stringify(p.args) })
              }
            }
          }
        }

        // ── 第 3 步：执行 LLM 回合 ──
        const turnInput: TurnRunnerInput = {
          messages,
          tools: toolSet,
          sessionID: config.sessionID,
          workspace: config.workspace,
          config: {
            ...llmConfig,
            maxContextTokens: config.maxContextTokens,
            permissions: config.permissions,
            onPermissionSave: config.onPermissionSave,
            autoAcceptPermissions: config.autoAcceptPermissions,
            fallbacks: config.fallbacks,
          },
          deps: {
            registry: this.registry,
            stateMachine: this.stateMachine,
            approvalStore: this.approvalStore,
            orchestrator: this.orchestrator,
          },
          ctx,
        }

        const turnOutput = config.maxMode
          ? yield* runMaxModeTurn({
              ...turnInput,
              maxModeConfig: {
                n: config.maxModeCandidates || 3,
                candidateConfig: llmConfig,
                judgeConfig: config.judgeModelConfig,
              },
            })
          : yield* runTurn(turnInput)

        messages = turnOutput.messages

        // ── 第 4 步：处理 LLM 信号 ──
        if (turnOutput.signal === "context_overflow") {
          yield { type: "thinking" as const, text: "⚠️ Context too long, performing emergency compaction..." }
          const compacted = await this.contextManager.reactiveCompact(messages)
          if (compacted.length < messages.length) {
            messages.length = 0
            messages.push(...compacted)
            yield { type: "thinking" as const, text: "🔄 Emergency compaction complete, retrying..." }
            continue
          }
          yield { type: "error" as const, message: "Context overflow: compaction failed to reduce size" }
          return
        }

        if (turnOutput.signal === "stop") {
          if (this.stateMachine.aborted) {
            yield { type: "finish", reason: "stopped", usage: turnOutput.usage }
          } else {
            yield { type: "finish", reason: "error", usage: turnOutput.usage }
          }
          return
        }

        if (!turnOutput.text && turnOutput.toolCalls.length === 0) {
          if (this.stateMachine.aborted) {
            yield { type: "finish", reason: "stopped", usage: turnOutput.usage }
          }
          return
        }

        // ── Doom loop 检测（工具调用级别） ──
        if (turnOutput.toolCalls.length > 0) {
          for (const tc of turnOutput.toolCalls) {
            allToolCalls.push({ name: tc.name, args: tc.arguments })
          }
          const lastCall = turnOutput.toolCalls[turnOutput.toolCalls.length - 1]
          const { detectDoomLoop } = await import("./utils")
          if (detectDoomLoop(
            { name: lastCall.name, args: lastCall.arguments },
            allToolCalls.slice(0, -1),
          )) {
            const { id, waitForReply } = this.stateMachine.createPermissionRequest()
            yield {
              type: "permission_request" as const,
              id,
              action: "doom_loop",
              resources: [`${lastCall.name}(${lastCall.arguments.slice(0, 100)})`],
              toolCall: { id: lastCall.id, name: lastCall.name, input: {} },
            }
            const allowed = await waitForReply()
            if (!allowed) {
              yield { type: "thinking" as const, text: "⛔ Doom loop blocked by user" }
              yield { type: "finish", reason: "doom_loop_blocked" }
              return
            }
          }
        }

        // ── Goal Judge 检查（无工具调用时） ──
        if (turnOutput.toolCalls.length === 0) {
          const activeGoal = this.goalJudge.getActiveGoal()
          if (activeGoal) {
            const quickCheck = this.goalJudge.quickCheck(activeGoal, messages)
            if (quickCheck && quickCheck.satisfied) {
              activeGoal.status = "satisfied"
              yield { type: "goal_status", goalId: activeGoal.id, description: activeGoal.description, status: "satisfied", reasoning: quickCheck.reasoning }
              yield { type: "finish", reason: "goal_satisfied" }
              return
            }
            const evaluation = await this.goalJudge.evaluate(activeGoal, messages)
            yield { type: "goal_status", goalId: activeGoal.id, description: activeGoal.description, status: evaluation.satisfied ? "satisfied" : "still_active", reasoning: evaluation.reasoning }
            if (evaluation.satisfied) {
              yield { type: "finish", reason: "goal_satisfied" }
              return
            }
            yield { type: "thinking", text: `🎯 Goal still active: ${evaluation.reasoning}` }
            continue
          }

          if (!this.goalJudge.getActiveGoal()) {
            const stopMessage = await pluginHooks.triggerUntil("stop", messages, config)
            if (stopMessage) {
              messages.push({ role: "user", content: String(stopMessage) })
              continue
            }
            yield { type: "finish", reason: "stop", usage: turnOutput.usage }
          }
          return
        }

        // ── 持久化 Assistant 消息 ──
        if (turnOutput.text || turnOutput.toolCalls.length > 0) {
          const content = turnOutput.toolCalls.length > 0
            ? JSON.stringify({
                text: turnOutput.text || "",
                tool_calls: turnOutput.toolCalls.map(tc => ({ id: tc.id, name: tc.name, args: tc.arguments })),
              })
            : (turnOutput.text || "")
          await appendMessage(config.sessionID, {
            role: "assistant",
            content,
            timestamp: new Date().toISOString(),
            retryCount: turnOutput.retryCount || 0,
          })
        }

        // ── 回合后上下文检查 ──
        const { messages: postToolMessages, didRebuild: postToolRebuild, reason: postToolReason } =
          await this.contextManager.checkAndRebuild(messages, config.sessionID)
        if (postToolRebuild) {
          messages = postToolMessages
          yield { type: "thinking" as const, text: `🔄 Context compacted after tool execution` }
          yield { type: "context_rebuild", reason: postToolReason, tokensBefore: 0, tokensAfter: 0 }
        }

        // ── 回合同步 ──
        const currentUserText = currentInput.message
        await this.contextManager.syncTurn(currentUserText, turnOutput.text, config.sessionID)
        await this.memoryManager.promoteMemories(config.sessionID)
        this.dreamDistillManager.recordTurn(currentUserText, turnOutput.text)

        // ── 更新 N-gram 缓冲区 ──
        if (turnOutput.text) {
          this.ngramBuffer.push(turnOutput.text)
          if (this.ngramBuffer.length > 20) this.ngramBuffer.shift()
        }

        // ── LLM 配置绑定 ──
        if (config.apiKey && !this.checkpointProvider.hasLLMConfig) {
          this.contextManager.setLLMConfig({
            apiKey: config.apiKey,
            apiUrl: config.apiUrl,
            model: config.model,
            provider: config.provider || "openai",
          })
        }

        hasLastAssistant = true
        // 继续内层循环
      }

      /* ── Stop hooks（每条输入退出后执行） ── */
      const stopResult = await runStopHooks({
        sessionID: config.sessionID,
        workspace: config.workspace,
        messages,
        contextManager: this.contextManager,
        memoryManager: this.memoryManager,
        dreamDistillManager: this.dreamDistillManager,
      })

      // Stop hook 的附加消息推回队列
      if (stopResult.additionalMessages.length > 0) {
        inputQueue.pushMany(
          stopResult.additionalMessages.map(msg => ({ message: msg, type: "steer" as const }))
        )
      }
    }

    /* ── 全部输入处理完毕 ── */
    pluginHooks.emit("session_end", { sessionID: config.sessionID, workspace: config.workspace })
    await this.contextManager.shutdown()
    this.memoryManager.shutdown().catch(() => {})
    yield { type: "finish", reason: "length" }
  }
}

/* ── 辅助函数 ── */

function hasToolCalls(content: string | any[]): boolean {
  if (Array.isArray(content)) return content.some((p) => p.type === "tool-call")
  return false
}

function tryParseAssistantPayload(content: string): { text: string; tool_calls: Array<{ id: string; name: string; args: string }> } | null {
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.tool_calls)) {
      return { text: parsed.text || "", tool_calls: parsed.tool_calls }
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
