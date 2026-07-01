import { ToolRegistry } from "../system/registry"
import type { ToolContext, ToolResult } from "../shared/tool"
import type { AgentEvent } from "../types"
import { IterationBudget } from "../task/budget"
import type { LLMMessage } from "../llm/client"
import { estimateTokens } from "../shared/message-utils"
import { pluginHooks } from "../shared/plugin-hooks"
import { PermissionSet, type PermissionRule } from "../system/permission"
import { MemoryManager } from "../memory/manager"
import { BuiltinMemoryProvider } from "../memory/builtin-provider"
import { appendMessage, loadSession } from "../session/store"
import { VectorMemoryProvider } from "../memory/vector-provider"
import { FileMemoryProvider } from "../memory/file-memory-provider"
import { FTSMemoryProvider } from "../memory/fts-memory-provider"
import { CheckpointProvider } from "../memory/checkpoint-provider"
import { evaluateToolCalls, extractResources } from "../system/permission/gate"
import { setFTSProvider } from "../tools/knowledge/memory"
import { ToolOrchestrator } from "../orchestrate/execution"
import { AgentStateMachine } from "./state-machine"
import { buildToolContext, buildSystemMessage } from "./context"
import { ApprovalStore } from "../system/permission/approval-store"
import { DreamDistillManager } from "../orchestrate/dream"
import { ContextManager } from "../session/context"
import { GoalJudge } from "../orchestrate/goal-judge"
import type { LLMTurnConfig } from "./turn"
import { runMaxMode, type MaxModeConfig } from "./max-mode"
import { processTurn, executeCollectedTools } from "./turn-processor"
import { detectDoomLoop } from "./utils"
import type { AgentMode } from "../config/modes"
import { getModeMaxIterations, getModeSystemPromptSuffix, modeSystemPrompt } from "../config/modes"

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
  mode?: AgentMode
  toolAllowlist?: string[]
  onPermissionSave?: (rules: PermissionRule[]) => void
  goalDescription?: string
  judgeModel?: string
  judgeProvider?: string
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

  get aborted(): boolean { return this.stateMachine.aborted }
  abort(): void { this.stateMachine.stop() }

  constructor(private registry: ToolRegistry, apiKey?: string, apiUrl?: string, workspace?: string) {
    this.orchestrator = new ToolOrchestrator(registry)
    this.checkpointProvider = new CheckpointProvider()
    this.dreamDistillManager = new DreamDistillManager()
    this.contextManager = new ContextManager(this.checkpointProvider, this.memoryManager)
    this.goalJudge = new GoalJudge()
    const ftsProvider = new FTSMemoryProvider()
    this.memoryManager.addProvider(new BuiltinMemoryProvider())
    this.memoryManager.addProvider(this.checkpointProvider)
    this.memoryManager.addProvider(new VectorMemoryProvider())
    if (workspace) {
      this.memoryManager.addProvider(new FileMemoryProvider())
      this.memoryManager.addProvider(ftsProvider)
    }
    this.checkpointProvider.setFTSProvider(ftsProvider)
    setFTSProvider(ftsProvider)

    // 注册 pre_llm hook：每轮 LLM 调用前注入相关记忆
    pluginHooks.on("pre_llm", async (messages: LLMMessage[], config: AgentConfig) => {
      if (!config.sessionID || !config.workspace) return messages
      return this.contextManager.injectMemories(messages, config.sessionID)
    })
  }

  getGoalJudge(): GoalJudge { return this.goalJudge }
  getContextManager(): ContextManager { return this.contextManager }
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

    if (this.dreamDistillManager && this.contextManager.shouldAutoDream()) {
      try {
        this.dreamDistillManager.setLLMConfig({
          apiKey: config.apiKey,
          apiUrl: config.apiUrl,
          model: config.model,
          provider: config.provider || "openai",
        })
        await this.dreamDistillManager.autoDream()
        yield { type: "thinking", text: "🧠 Memory consolidated from recent session" }
      } catch { /* Dream 失败不阻塞主流程 */ }
    }

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
              restored.push({ role: "tool", content: m.content })
              continue
            }
            const lastAssistant = [...restored].reverse().find(r => r.role === "assistant")
            if (lastAssistant && !hasToolCalls(lastAssistant.content)) {
              lastAssistant.content += `\n\n[Tool result: ${m.content.slice(0, 500)}]`
              continue
            }
            restored.push({ role: "tool", content: m.content, tool_call_id: m.toolCallId })
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

    const goalPrompt = this.goalJudge.toSystemPrompt()
    const modeSuffix = getModeSystemPromptSuffix(config.mode || "assistant")
    const baseSystem = await buildSystemMessage(config, memoryPrompt, DEFAULT_SYSTEM)
    const systemWithMode = modeSuffix ? `${baseSystem}\n\n[MODE: ${config.mode}]\n${modeSuffix}` : baseSystem
    const systemContent = goalPrompt
      ? `${systemWithMode}\n\n${goalPrompt}`
      : systemWithMode

    let messages: LLMMessage[] = [
      { role: "system", content: systemContent },
      ...history.map((m: Record<string, unknown>) => {
        const role = String(m.role || "user") as LLMMessage["role"]
        const content = m.content as LLMMessage["content"]
        if (role === "assistant" && m.tool_calls && typeof content === "string") {
          const oldTc = (m.tool_calls || []) as Array<Record<string, unknown>>
          return {
            role: "assistant" as const,
            content: [
              { type: "text", text: content },
              ...oldTc.map((tc) => ({
                type: "tool-call" as const,
                toolCallId: String(tc.id || tc.toolCallId || ""),
                toolName: String((tc.function as Record<string, unknown>)?.name || tc.toolName || ""),
                args: typeof (tc.function as Record<string, unknown>)?.arguments === "string" ? JSON.parse((tc.function as Record<string, unknown>).arguments as string) : ((tc.args as Record<string, unknown>) || {}),
              })),
            ],
          }
        }
        const msg: LLMMessage = { role, content }
        if (m.tool_call_id) msg.tool_call_id = String(m.tool_call_id)
        return msg
      }),
      { role: "user", content: enrichedUser },
    ]

    const modeMaxSteps = getModeMaxIterations(config.mode || "assistant")
    const budget = new IterationBudget(config.maxSteps || modeMaxSteps || 10)
    const llmConfig: LLMTurnConfig = {
      provider: config.provider || "openai",
      model: config.model,
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      headers: config.headers,
      options: config.options,
    }

    // Doom loop 追踪：记录所有轮次的工具调用
    const allToolCalls: Array<{ name: string; args: string }> = []

    while (budget.consume()) {
      if (this.stateMachine.aborted) {
        yield { type: "finish", reason: "stopped" }
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

        const rebuildEvent: AgentEvent = {
          type: "context_rebuild" as const,
          reason,
          tokensBefore,
          tokensAfter,
        }
        yield rebuildEvent
      }

      messages = await pluginHooks.emitWaterfall("pre_llm", messages, config)

      // ── LLM 调用 — processTurn（流式 + 同步工具执行）或 runMaxMode ──
      const turnInput = {
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
        },
        deps: {
          registry: this.registry,
          stateMachine: this.stateMachine,
          approvalStore: this.approvalStore,
          orchestrator: this.orchestrator,
        },
        ctx,
      }

      const maxModeResult = config.maxMode
        ? yield* runMaxMode({
            messages,
            tools: toolSet,
            config: {
              n: config.maxModeCandidates || 3,
              candidateConfig: llmConfig,
              judgeConfig: config.judgeModelConfig,
            },
          })
        : null

      if (config.maxMode) {
        const maxResult = maxModeResult!
        if (!maxResult.text && (!maxResult.toolCalls || maxResult.toolCalls.length === 0)) {
          if (this.stateMachine.aborted) yield { type: "finish", reason: "stopped" }
          return
        }
        const turnText = maxResult.text
        const toolCallsArray = (maxResult.toolCalls || [])
          .filter((tc: any) => tc.id && tc.name)
          .map((tc: any) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          }))

        messages.push({
          role: "assistant",
          content: [
            { type: "text", text: turnText },
            ...toolCallsArray.map((tc) => ({
              type: "tool-call" as const,
              toolCallId: tc.id,
              toolName: tc.function.name,
              args: JSON.parse(tc.function.arguments),
            })),
          ],
        })

        await appendMessage(config.sessionID, {
          role: "assistant",
          content: turnText || JSON.stringify({ text: turnText, tool_calls: toolCallsArray.map(tc => ({ id: tc.id, name: tc.function.name, args: tc.function.arguments })) }),
          timestamp: new Date().toISOString(),
        })

        if (toolCallsArray.length > 0) {
          yield* executeCollectedTools(
            toolCallsArray.map(tc => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments })),
            turnText,
            { messages, sessionID: config.sessionID, workspace: config.workspace, permissions: config.permissions, onPermissionSave: config.onPermissionSave, autoAcceptPermissions: config.autoAcceptPermissions, deps: { registry: this.registry, stateMachine: this.stateMachine, approvalStore: this.approvalStore, orchestrator: this.orchestrator }, ctx },
          )
        }

        await this.contextManager.syncTurn(userMessage, turnText, config.sessionID)
        this.dreamDistillManager.recordTurn(userMessage, turnText)
        continue
      }

      const ptResult = yield* processTurn(turnInput)
      messages = ptResult.messages

      if (!ptResult.text && ptResult.toolCalls.length === 0) {
        if (this.stateMachine.aborted) {
          yield { type: "finish", reason: "stopped" }
        }
        return
      }

      if (ptResult.text || ptResult.toolCalls.length > 0) {
        const content = ptResult.toolCalls.length > 0
          ? JSON.stringify({
              text: ptResult.text || "",
              tool_calls: ptResult.toolCalls.map(tc => ({ id: tc.id, name: tc.name, args: tc.arguments })),
            })
          : (ptResult.text || "")
        await appendMessage(config.sessionID, {
          role: "assistant",
          content,
          timestamp: new Date().toISOString(),
        })
      }

      // ── Doom Loop 检测 ──
      for (const tc of ptResult.toolCalls) {
        allToolCalls.push({ name: tc.name, args: tc.arguments })
      }
      if (ptResult.toolCalls.length > 0) {
        const lastCall = ptResult.toolCalls[ptResult.toolCalls.length - 1]
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
          allToolCalls.length = 0
        }
      }

      if (ptResult.toolCalls.length === 0) {
        const activeGoal = this.goalJudge.getActiveGoal()
        if (activeGoal) {
          const quickCheck = this.goalJudge.quickCheck(activeGoal, messages)
          if (quickCheck && quickCheck.satisfied) {
            activeGoal.status = "satisfied"
            const goalEvent: AgentEvent = { type: "goal_status", goalId: activeGoal.id, description: activeGoal.description, status: "satisfied", reasoning: quickCheck.reasoning }
            yield goalEvent
            const finishEvent: AgentEvent = { type: "finish", reason: "goal_satisfied" }
            yield finishEvent
            return
          }
          const evaluation = await this.goalJudge.evaluate(activeGoal, messages)
          const gsEvent: AgentEvent = { type: "goal_status", goalId: activeGoal.id, description: activeGoal.description, status: evaluation.satisfied ? "satisfied" : "still_active", reasoning: evaluation.reasoning }
          yield gsEvent
          if (evaluation.satisfied) {
            yield { type: "finish", reason: "goal_satisfied" }
          } else {
            budget.resetRemaining(3)
            yield { type: "thinking", text: `🎯 Goal still active: ${evaluation.reasoning}` }
          }
        }

        if (!this.goalJudge.getActiveGoal()) {
          const stopMessage = await pluginHooks.triggerUntil("stop", messages, config)
          if (stopMessage) {
            messages.push({ role: "user", content: String(stopMessage) })
            continue
          }
          yield { type: "finish", reason: "stop" }
        }
        return
      }

      // 持久化工具结果到会话历史
      for (const tr of ptResult.toolResults) {
        const tc = ptResult.toolCalls.find(t => t.id === tr.id)
        if (tc) {
          await appendMessage(config.sessionID, {
            role: "tool",
            content: tr.result.output || tr.result.error || "",
            timestamp: new Date().toISOString(),
            toolCallId: tc.id,
          })
        }
      }

      const { messages: postToolMessages, didRebuild: postToolRebuild, reason: postToolReason } =
        await this.contextManager.checkAndRebuild(messages, config.sessionID)
      if (postToolRebuild) {
        messages = postToolMessages
        yield { type: "thinking" as const, text: `🔄 Context compacted after tool execution` }
        const postRebuildEvent: AgentEvent = { type: "context_rebuild", reason: postToolReason, tokensBefore: 0, tokensAfter: 0 }
        yield postRebuildEvent
      }

      await this.contextManager.syncTurn(userMessage, ptResult.text, config.sessionID)
      await this.memoryManager.promoteMemories(config.sessionID)
      this.dreamDistillManager.recordTurn(userMessage, ptResult.text)

      if (config.apiKey && !this.checkpointProvider.hasLLMConfig) {
        this.contextManager.setLLMConfig({
          apiKey: config.apiKey,
          apiUrl: config.apiUrl,
          model: config.model,
          provider: config.provider || "openai",
        })
      }
    }

    await this.contextManager.shutdown()
    this.memoryManager.shutdown().catch(() => {})
    yield { type: "finish", reason: "length" }
  }
}

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
  } catch { /* JSON parse fallback */ }
  return null
}





