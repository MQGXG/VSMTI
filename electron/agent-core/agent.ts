import { ToolRegistry } from "./registry"
import type { ToolContext, ToolResult } from "./tool"
import type { AgentEvent } from "./types"
import { IterationBudget } from "./iteration-budget"
import { createLLMClient, type LLMMessage } from "./llm-sdk"
import { truncateToBudget, needsContextRebuild, rebuildContextFromCheckpoint, estimateTokens } from "./message-utils"
import { PermissionSet, type PermissionRule } from "./permission"
import { MemoryManager } from "./memory/manager"
import { BuiltinMemoryProvider } from "./memory/builtin-provider"
import { appendMessage, loadSession } from "./session-store"
import { VectorMemoryProvider } from "./memory/vector-provider"
import { FileMemoryProvider } from "./memory/file-memory-provider"
import { FTSMemoryProvider } from "./memory/fts-memory-provider"
import { CheckpointProvider } from "./memory/checkpoint-provider"
import { evaluateToolCalls, extractResources } from "./permission-gate"
import { ToolOrchestrator } from "./execution/orchestrator"
import { AgentStateMachine } from "./agent/state-machine"
import { buildToolContext, buildSystemMessage } from "./agent/context"
import { ApprovalStore } from "./permission/approval-store"

import { AgentMode } from "./modes"

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
  toolAllowlist?: string[]  // 如果设置，LLM 只可见这些工具
  onPermissionSave?: (rules: PermissionRule[]) => void
}

export type { AgentEvent } from "./types"

export const DEFAULT_SYSTEM = `You are Mira, an AI assistant integrated into a desktop application.

You have access to tools that let you interact with the user's system: read and write files, search the web, execute code, manage git, and analyze data.

Use tools when they help answer the user's question or complete their task. Prefer getting real information over guessing.

Be direct and concise. When using tools, briefly explain what you're doing.`

export class Agent {
  private stateMachine = new AgentStateMachine()
  private memoryManager = new MemoryManager()
  private approvalStore = new ApprovalStore()
  private orchestrator: ToolOrchestrator
  private checkpointProvider: CheckpointProvider

  get aborted(): boolean { return this.stateMachine.aborted }
  abort(): void { this.stateMachine.stop() }

  constructor(private registry: ToolRegistry, apiKey?: string, apiUrl?: string, workspace?: string) {
    this.orchestrator = new ToolOrchestrator(registry)
    this.checkpointProvider = new CheckpointProvider()
    this.memoryManager.addProvider(new BuiltinMemoryProvider())
    this.memoryManager.addProvider(this.checkpointProvider)
    if (apiKey) {
      this.memoryManager.addProvider(new VectorMemoryProvider({ apiKey, apiUrl }))
    }
    if (workspace) {
      this.memoryManager.addProvider(new FileMemoryProvider())
      this.memoryManager.addProvider(new FTSMemoryProvider())
    }
  }

  replyPermission(id: string, reply: PermissionReply): void {
    this.stateMachine.replyPermission(id, reply)
  }

  async *run(
    userMessage: string,
    history: LLMMessage[],
    config: AgentConfig,
  ): AsyncGenerator<AgentEvent> {
    const ctx = buildToolContext(config)

    // 注入持久化权限到审批缓存
    if (config.permissions) {
      this.approvalStore.setPermissions(config.permissions)
    }

    const materialized = this.registry.materialize(config.permissions)
    let toolSet = materialized.definitions

    // toolAllowlist: 只暴露允许的工具给 LLM，其他工具 LLM 完全不知道
    if (config.toolAllowlist && config.toolAllowlist.length > 0) {
      const allowed = new Set(config.toolAllowlist)
      toolSet = Object.fromEntries(Object.entries(toolSet).filter(([name]) => allowed.has(name)))
    }

    await this.memoryManager.initialize(config.sessionID, config.workspace)
    const memoryPrompt = this.memoryManager.buildSystemPrompt()

    const prefetched = await this.memoryManager.prefetch(userMessage, config.sessionID)
    const enrichedUser = prefetched ? `${prefetched}\n\n${userMessage}` : userMessage

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
          }
          if (m.role === "tool" && restored.length > 0) {
            const last = restored[restored.length - 1]
            if (last.role === "assistant" && !hasToolCalls(last.content)) {
              last.content += `\n\n[Tool result: ${m.content.slice(0, 500)}]`
              continue
            }
          }
          const msg: LLMMessage = { role: m.role as LLMMessage["role"], content: m.content }
          if (m.toolCallId) msg.tool_call_id = m.toolCallId
          restored.push(msg)
        }
        history = restored
      }
    }

    await appendMessage(config.sessionID, {
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    })

    const systemContent = await buildSystemMessage(config, memoryPrompt, DEFAULT_SYSTEM)
    let messages: LLMMessage[] = [
      { role: "system", content: systemContent },
      ...history.map((m) => {
        if (m.role === "assistant" && (m as any).tool_calls && typeof m.content === "string") {
          const oldTc = (m as any).tool_calls || []
          return {
            role: "assistant" as const,
            content: [
              { type: "text", text: m.content },
              ...oldTc.map((tc: any) => ({
                type: "tool-call" as const,
                toolCallId: tc.id || tc.toolCallId || "",
                toolName: tc.function?.name || tc.toolName || "",
                args: typeof tc.function?.arguments === "string" ? JSON.parse(tc.function.arguments) : (tc.args || {}),
              })),
            ],
          }
        }
        const msg: LLMMessage = { role: m.role as LLMMessage["role"], content: m.content }
        if ((m as any).tool_call_id) msg.tool_call_id = (m as any).tool_call_id
        return msg
      }),
      { role: "user", content: enrichedUser },
    ]

    const client = createLLMClient({
      provider: config.provider || "openai",
      model: config.model,
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      headers: config.headers,
      options: config.options,
    } as any)

    const budget = new IterationBudget(config.maxSteps || 10)

    while (budget.consume()) {
      if (this.stateMachine.aborted) {
        yield { type: "finish", reason: "stopped" }
        return
      }

      // 上下文重建：当接近 token 限制时，从 checkpoint 重建
      const maxTokens = config.maxContextTokens || 8000
      if (needsContextRebuild(messages, maxTokens)) {
        const checkpoint = this.checkpointProvider.getCheckpoint()
        if (checkpoint) {
          messages = rebuildContextFromCheckpoint(messages, {
            summary: checkpoint.summary,
            activeTask: checkpoint.activeTask,
            recentDecisions: checkpoint.recentDecisions,
            keyFiles: checkpoint.keyFiles,
          }, maxTokens)
          yield { type: "thinking", text: "🔄 Context reconstructed from checkpoint" }
        } else {
          messages = truncateToBudget(messages, maxTokens)
        }
      } else {
        messages = truncateToBudget(messages, maxTokens)
      }

      const stream = client.stream({ messages, tools: toolSet })
      let currentText = ""
      let eventCount = 0
      const pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = []

      for await (const event of stream) {
        eventCount++
        if (event.type === "delta") {
          currentText += event.delta
          yield { type: "content", text: event.delta }
        } else if (event.type === "tool_call" && event.toolCall) {
          pendingToolCalls.push({
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: event.toolCall.arguments,
          })
        } else if (event.type === "error") {
          yield { type: "error", message: event.error?.message || "LLM stream error" }
          return
        } else if (event.type === "done") {
          break
        }
      }

      const toolCallsArray = pendingToolCalls
        .filter((tc) => tc.id && tc.name)
        .map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }))

      messages.push({
        role: "assistant",
        content: [
          { type: "text", text: currentText },
          ...toolCallsArray.map((tc) => ({
            type: "tool-call" as const,
            toolCallId: tc.id,
            toolName: tc.function.name,
            args: JSON.parse(tc.function.arguments),
          })),
        ],
      })

      if (toolCallsArray.length === 0) {
        if (currentText) {
          await appendMessage(config.sessionID, {
            role: "assistant",
            content: currentText,
            timestamp: new Date().toISOString(),
          })
        }
        yield { type: "finish", reason: "stop" }
        return
      }

      // 保存 assistant 消息（含 tool_calls）到 DB
      const assistantPayload = JSON.stringify({
        text: currentText,
        tool_calls: toolCallsArray.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          args: tc.function.arguments,
        })),
      })
      await appendMessage(config.sessionID, {
        role: "assistant",
        content: assistantPayload,
        timestamp: new Date().toISOString(),
      })

      // 权限门控 + 工具执行
      const evaluations = evaluateToolCalls(toolCallsArray, this.registry, config.permissions)
      const approvedCalls: typeof toolCallsArray = []
      const results = new Map<string, ToolResult>()

      for (const ev of evaluations) {
        if (ev.needsApproval) {
          const resources = extractResources(ev.args)
          const cached = this.approvalStore.checkAll(ev.permissionAction, resources)
          if (cached === "allow") {
            approvedCalls.push({ id: ev.toolCall.id, type: "function" as const, function: { name: ev.toolCall.name, arguments: JSON.stringify(ev.args) } })
            continue
          }

          const { id, waitForReply } = this.stateMachine.createPermissionRequest(
            () => config.onPermissionSave?.([{ action: ev.permissionAction, resource: "*", effect: "allow" }]),
          )

          yield {
            type: "permission_request",
            id,
            action: ev.permissionAction,
            resources,
            toolCall: ev.toolCall,
          }

          const allowed = await waitForReply()
          if (allowed) {
            this.approvalStore.record(ev.permissionAction, resources, "allow", 300_000, config.workspace)
          } else {
            this.approvalStore.record(ev.permissionAction, resources, "deny", 300_000, config.workspace)
            results.set(ev.toolCall.id, { success: false, error: `Permission denied: ${ev.toolCall.name}` })
            continue
          }
        }
        approvedCalls.push({ id: ev.toolCall.id, type: "function" as const, function: { name: ev.toolCall.name, arguments: JSON.stringify(ev.args) } })
      }

      for (const call of approvedCalls) {
        yield { type: "tool_start", id: call.id, name: call.function.name, args: JSON.parse(call.function.arguments) }
      }

      const orchestratedCalls = approvedCalls.map((c) => ({
        id: c.id,
        name: c.function.name,
        args: JSON.parse(c.function.arguments),
      }))

      const orchestratedResults = await this.orchestrator.execute(orchestratedCalls, ctx)
      for (const [id, result] of orchestratedResults) {
        results.set(id, result)
      }

      for (const call of toolCallsArray) {
        const result = results.get(call.id)
        if (!result) {
          messages.push({
            role: "tool",
            content: [{ type: "tool-result" as const, toolCallId: call.id, toolName: call.function.name, output: { type: "text" as const, value: "[Tool execution error: no result available]" } }],
            tool_call_id: call.id,
          })
          yield { type: "tool_result", id: call.id, name: call.function.name, result: { success: false, error: "No result available" } }
          continue
        }
        yield { type: "tool_result", id: call.id, name: call.function.name, result: { success: result.success, output: result.output, error: result.error } }
        const text = result.success ? (result.output || "") : (result.error || "")
        const parts: Array<{ type: "tool-result" | "text"; toolCallId?: string; toolName?: string; output?: any; text?: string }> = [
          { type: "tool-result" as const, toolCallId: call.id, toolName: call.function.name, output: { type: "text" as const, value: text } },
        ]
        // 图片支持：将 metadata 中的图片数据作为额外内容发送给模型
        if (result.metadata?.mime && result.metadata?.data) {
          parts.push({
            type: "text" as const,
            text: `![${result.metadata.name || "image"}](data:${result.metadata.mime};base64,${(result.metadata.data as string).slice(0, 100)}... [base64 image data])`,
          })
        }
        messages.push({ role: "tool", content: parts as any, tool_call_id: call.id })
      }

      for (const call of toolCallsArray) {
        const result = results.get(call.id)!
        await appendMessage(config.sessionID, {
          role: "tool",
          content: result.output || result.error || "",
          timestamp: new Date().toISOString(),
          toolCallId: call.id,
        })
      }

      // 同步记忆和检查点
      this.memoryManager.syncTurn(userMessage, currentText, config.sessionID).catch(() => {})
      this.checkpointProvider.syncTurn(userMessage, currentText, config.sessionID).catch(() => {})
    }

    // 最终保存检查点
    await this.checkpointProvider.shutdown()
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
  } catch {}
  return null
}
