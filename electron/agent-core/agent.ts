/**
 * Agent ReAct 循环 — 事件驱动、可中断、带预算的多步 ReAct 引擎
 * 集成 LLM Function Calling + 并发工具执行 + 流式返回
 */

import { ToolRegistry } from './registry'
import { ToolContext, ToolCall, ToolResult } from './tool'
import { AgentEvent } from './types'
import { IterationBudget } from './iteration-budget'
import { createLLMClient, LLMMessage } from './llm-sdk'
import { truncateToBudget } from './message-utils'
import { PermissionSet, PermissionRule } from './permission'
import { MemoryManager } from './memory/manager'
import { BuiltinMemoryProvider } from './memory/builtin-provider'
import { appendMessage, loadSession } from './session-store'
import { VectorMemoryProvider } from './memory/vector-provider'
import { FileMemoryProvider } from './memory/file-memory-provider'
import { evaluateToolCalls, generateId, extractResources } from './permission-gate'
import { executeToolCalls } from './tool-executor'

export type PermissionReply = 'allow' | 'deny' | 'always'

import { AgentMode, modeToPermissionSet } from "./modes"

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
  onPermissionSave?: (rules: PermissionRule[]) => void
}

export type { AgentEvent } from './types'

export const DEFAULT_SYSTEM = `You are OmniAgent, an AI assistant integrated into a desktop application.
Use the available tools to help users with their tasks.
When you use a tool, wait for the result and provide a clear summary to the user.`

export class Agent {
  private pendingPermissions = new Map<string, {
    resolve: (allow: boolean) => void
    onAlways?: () => void
  }>()
  private _aborted = false
  private memoryManager = new MemoryManager()

  get aborted(): boolean { return this._aborted }
  abort(): void { this._aborted = true }

  constructor(private registry: ToolRegistry, apiKey?: string, apiUrl?: string, workspace?: string) {
    this.memoryManager.addProvider(new BuiltinMemoryProvider())
    if (apiKey) {
      this.memoryManager.addProvider(new VectorMemoryProvider({ apiKey, apiUrl }))
    }
    if (workspace) {
      this.memoryManager.addProvider(new FileMemoryProvider())
    }
  }

  replyPermission(id: string, reply: PermissionReply): void {
    const pending = this.pendingPermissions.get(id)
    if (!pending) return
    this.pendingPermissions.delete(id)
    if (reply === 'deny') {
      pending.resolve(false)
    } else {
      pending.resolve(true)
      if (reply === 'always') pending.onAlways?.()
    }
  }

  async *run(
    userMessage: string,
    history: Array<{ role: string; content: string }>,
    config: AgentConfig,
  ): AsyncGenerator<AgentEvent> {
    const ctx: ToolContext = {
      sessionID: config.sessionID,
      workspace: config.workspace,
      mode: config.mode || 'assistant',
      agent: 'build',
      assistantMessageID: '',
      toolCallID: '',
      shell: (config.options as any)?.shell || undefined,
    }

    const materialized = this.registry.materialize(config.permissions)
    const toolDefs = materialized.definitions

    // 初始化记忆系统
    await this.memoryManager.initialize(config.sessionID, config.workspace)
    const memoryPrompt = this.memoryManager.buildSystemPrompt()

    // 预处理用户消息 — 注入记忆召回
    const prefetched = await this.memoryManager.prefetch(userMessage, config.sessionID)
    const enrichedUser = prefetched
      ? `${prefetched}\n\n${userMessage}`
      : userMessage

    // 从持久化会话恢复历史（如果 history 为空但有已保存消息）
    if (history.length === 0) {
      const stored = await loadSession(config.sessionID)
      if (stored && stored.messages.length > 0) {
        const restored: LLMMessage[] = []
        for (const m of stored.messages) {
          if (m.role === 'tool' && restored.length > 0) {
            const last = restored[restored.length - 1]
            if (last.role === 'assistant' && !last.tool_calls) {
              // 孤儿 tool 消息 → 将内容合并到前一条 assistant 中
              last.content += `\n\n[Tool result: ${m.content.slice(0, 500)}]`
              continue
            }
          }
          const msg: LLMMessage = {
            role: m.role as LLMMessage['role'],
            content: m.content,
          }
          if (m.toolCallId) msg.tool_call_id = m.toolCallId
          restored.push(msg)
        }
        history = restored
      }
    }

    // 保存用户消息到持久化会话
    await appendMessage(config.sessionID, {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    })

    let messages: LLMMessage[] = [
      { role: 'system', content: config.systemPrompt || DEFAULT_SYSTEM },
      ...history.map((m) => {
        const msg: LLMMessage = { role: m.role as LLMMessage['role'], content: m.content }
        if ((m as any).tool_call_id) msg.tool_call_id = (m as any).tool_call_id
        if ((m as any).tool_calls) msg.tool_calls = (m as any).tool_calls
        return msg
      }),
      { role: 'user', content: enrichedUser },
    ]

    const client = createLLMClient({
      provider: (config.provider as any) || 'openai',
      model: config.model,
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      headers: config.headers,
      options: config.options,
    } as any)

    const budget = new IterationBudget(config.maxSteps || 10)

    while (budget.consume()) {
      if (this._aborted) {
        yield { type: 'finish', reason: 'stopped' }
        return
      }
      messages = truncateToBudget(messages, config.maxContextTokens || 8000)
      const stream = client.stream({ messages, tools: toolDefs })
      let currentText = ''
      const pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = []

      for await (const event of stream) {
        if (event.type === 'delta') {
          currentText += event.delta
          yield { type: 'content', text: event.delta }
        } else if (event.type === 'tool_call' && event.toolCall) {
          pendingToolCalls.push({
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: event.toolCall.arguments,
          })
        } else if (event.type === 'error') {
          yield { type: 'error', message: event.error?.message || 'LLM stream error' }
          return
        } else if (event.type === 'done') {
          break
        }
      }

      const toolCallsArray = pendingToolCalls
        .filter((tc) => tc.id && tc.name)
        .map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        }))

      messages.push({
        role: 'assistant',
        content: currentText,
        tool_calls: toolCallsArray,
      })

      if (toolCallsArray.length === 0) {
        if (currentText) {
          await appendMessage(config.sessionID, {
            role: 'assistant',
            content: currentText,
            timestamp: new Date().toISOString(),
          })
        }
        yield { type: 'finish', reason: 'stop' }
        return
      }

      // 权限门控 + 工具执行（拆分为独立模块维护）
      const evaluations = evaluateToolCalls(toolCallsArray, this.registry, config.permissions)
      const approvedCalls: typeof toolCallsArray = []
      const results = new Map<string, ToolResult>()

      for (const ev of evaluations) {
        if (ev.needsApproval) {
          const id = generateId()
          let resolvePermission!: (allow: boolean) => void
          const allowedPromise = new Promise<boolean>((resolve) => { resolvePermission = resolve })
          this.pendingPermissions.set(id, {
            resolve: resolvePermission,
            onAlways: () => {
              config.onPermissionSave?.([{ action: ev.permissionAction, resource: '*', effect: 'allow' }])
            },
          })

          yield {
            type: 'permission_request',
            id,
            action: ev.permissionAction,
            resources: extractResources(ev.args),
            toolCall: ev.toolCall,
          }

          const allowed = await allowedPromise
          if (!allowed) {
            results.set(ev.toolCall.id, { success: false, error: `Permission denied: ${ev.toolCall.name}` })
            continue
          }
        }
        approvedCalls.push({ id: ev.toolCall.id, type: 'function' as const, function: { name: ev.toolCall.name, arguments: JSON.stringify(ev.args) } })
      }

      for (const call of approvedCalls) {
        yield { type: 'tool_start', id: call.id, name: call.function.name, args: JSON.parse(call.function.arguments) }
      }

      const executorResult = await executeToolCalls(approvedCalls, this.registry, ctx, {
        provider: config.provider,
        model: config.model,
      })
      for (const [id, result] of executorResult.results) {
        results.set(id, result)
      }

      // 确保每个 tool_calls 都有对应的 tool 消息
      for (const call of toolCallsArray) {
        const result = results.get(call.id)
        if (!result) {
          // 如果结果不存在（理论上不应发生），插入默认错误
          messages.push({
            role: 'tool',
            content: '[Tool execution error: no result available]',
            tool_call_id: call.id,
          })
          yield { type: 'tool_result', id: call.id, name: call.function.name, result: { success: false, error: 'No result available' } }
          continue
        }
        yield {
          type: 'tool_result',
          id: call.id,
          name: call.function.name,
          result: { success: result.success, output: result.output, error: result.error },
        }
        messages.push({
          role: 'tool',
          content: result.success ? (result.output || '') : (result.error || ''),
          tool_call_id: call.id,
        })
      }

      // 持久化此回合的 assistant 和 tool 消息
      if (currentText) {
        await appendMessage(config.sessionID, {
          role: 'assistant',
          content: currentText,
          timestamp: new Date().toISOString(),
        })
      }
      for (const call of toolCallsArray) {
        const result = results.get(call.id)!
        await appendMessage(config.sessionID, {
          role: 'tool',
          content: result.output || result.error || '',
          timestamp: new Date().toISOString(),
          toolCallId: call.id,
        })
      }

      // 回合后同步记忆
      this.memoryManager.syncTurn(userMessage, currentText, config.sessionID).catch(() => {})
    }

    // 关闭记忆系统
    this.memoryManager.shutdown().catch(() => {})
    yield { type: 'finish', reason: 'length' }
  }
}
