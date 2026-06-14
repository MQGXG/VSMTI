/**
 * Agent ReAct 循环 — 事件驱动、可中断、带预算的多步 ReAct 引擎
 * 集成 LLM Function Calling + 并发工具执行 + 流式返回
 */

import { ToolRegistry } from './registry'
import { ToolContext, ToolCall, ToolResult } from './tool'
import { AgentEvent } from './types'
import { IterationBudget } from './iteration-budget'
import { createLLMClient, LLMMessage } from './llm-client'
import { repairMessageSequence, truncateToBudget } from './message-utils'
import { PermissionSet, PermissionRule } from './permission'
import { MemoryManager } from './memory/manager'
import { BuiltinMemoryProvider } from './memory/builtin-provider'
import { appendMessage, loadSession } from './session-store'
import type { StoredMessage } from './session-store'
import { logToolCall } from './logger'

export type PermissionReply = 'allow' | 'deny' | 'always'

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
  onPermissionSave?: (rules: PermissionRule[]) => void
}

export type { AgentEvent } from './types'

export const DEFAULT_SYSTEM = `You are OmniAgent, an AI assistant integrated into a desktop application.
You have access to the following tools to help users:

- read_file: Read file contents from the local filesystem
- write_file: Write content to a file
- edit_file: Replace exact text in a file
- list_files: List directory contents
- web_search: Search the internet for current information
- grep: Search file contents using regex
- glob: Find files matching a glob pattern
- run_code: Execute Python code
- bash: Execute shell commands

When the user asks you to read, search, list, or modify files, use the appropriate tool.
After getting tool results, provide a clear summary to the user.`

function isCompleteJson(s: string): boolean {
  try { JSON.parse(s); return true } catch { return false }
}

let permissionIdCounter = 0

function generatePermissionId(): string {
  return `perm-${Date.now().toString(36)}-${++permissionIdCounter}`
}

function extractResources(args: Record<string, unknown>): string[] {
  const resources: string[] = []
  const keys = ['path', 'file', 'url', 'command', 'dir', 'directory']
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string') resources.push(value)
  }
  return resources
}

export class Agent {
  private pendingPermissions = new Map<string, {
    resolve: (allow: boolean) => void
    onAlways?: () => void
  }>()
  private memoryManager = new MemoryManager()

  constructor(private registry: ToolRegistry) {
    this.memoryManager.addProvider(new BuiltinMemoryProvider())
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
      mode: 'assistant',
      agent: 'build',
      assistantMessageID: '',
      toolCallID: '',
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
      const stored = loadSession(config.sessionID)
      if (stored && stored.messages.length > 0) {
        history = stored.messages.map((m: StoredMessage) => {
          const msg: LLMMessage = {
            role: m.role as LLMMessage['role'],
            content: m.content,
          }
          if (m.toolCallId) msg.tool_call_id = m.toolCallId
          return msg
        })
      }
    }

    // 保存用户消息到持久化会话
    appendMessage(config.sessionID, {
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
    })

    const budget = new IterationBudget(config.maxSteps || 10)

    while (budget.consume()) {
      messages = repairMessageSequence(messages)
      messages = truncateToBudget(messages, config.maxContextTokens || 8000)
      // 确保所有 tool 消息都有 tool_call_id（LLM API 严格要求）
      // 按顺序遍历 tool 消息，与最近的 assistant 的 tool_calls 按位置匹配
      let toolCallIndex = 0
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        if (msg.role === 'assistant' && msg.tool_calls?.length) {
          toolCallIndex = 0
        } else if (msg.role === 'tool') {
          if (!msg.tool_call_id) {
            // 向前找最近的 assistant 消息的 tool_calls，按位置匹配
            for (let j = i - 1; j >= 0; j--) {
              const prev = messages[j]
              if (prev.role === 'assistant' && prev.tool_calls?.length) {
                const idx = Math.min(toolCallIndex, prev.tool_calls.length - 1)
                msg.tool_call_id = prev.tool_calls[idx].id
                toolCallIndex++
                break
              }
            }
          }
        }
      }
      const stream = client.stream({ messages, tools: toolDefs, stream: true })
      let currentText = ''
      const pendingToolCalls: Map<string, { name: string; args: string; complete: boolean }> = new Map()

      for await (const event of stream) {
        if (event.type === 'delta') {
          const delta = event.delta || ''
          currentText += delta
          yield { type: 'content', text: delta }
        } else if (event.type === 'tool_call' && event.toolCall) {
          const existing = pendingToolCalls.get(event.toolCall.id) || { name: '', args: '', complete: false }
          if (event.toolCall.name) existing.name = event.toolCall.name
          if (event.toolCall.arguments !== undefined) existing.args = event.toolCall.arguments
          existing.complete = !!existing.name && existing.args !== undefined && isCompleteJson(existing.args)
          pendingToolCalls.set(event.toolCall.id, existing)
        } else if (event.type === 'error') {
          yield { type: 'error', message: event.error?.message || 'LLM stream error' }
          return
        } else if (event.type === 'done') {
          break
        }
      }

      const toolCallsArray = Array.from(pendingToolCalls.entries())
        .filter(([, v]) => v.complete)
        .map(([id, v]) => ({
          id,
          type: 'function' as const,
          function: { name: v.name, arguments: v.args },
        }))

      messages.push({
        role: 'assistant',
        content: currentText,
        tool_calls: toolCallsArray,
      })

      if (toolCallsArray.length === 0) {
        // 持久化最终回复
        if (currentText) {
          appendMessage(config.sessionID, {
            role: 'assistant',
            content: currentText,
            timestamp: new Date().toISOString(),
          })
        }
        this.memoryManager.syncTurn(userMessage, currentText, config.sessionID).catch(() => {})
        yield { type: 'finish', reason: 'stop' }
        return
      }

      // 权限门控：每个工具调用前独立检查，需要确认时顺序 yield permission_request 并暂停
      const approvedCalls: typeof toolCallsArray = []
      const results = new Map<string, ToolResult>()

      for (const call of toolCallsArray) {
        const def = this.registry.get(call.function.name)
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(call.function.arguments) } catch { /* ignore */ }

        if (config.permissions?.needsApproval(call.function.name, def?.permission)) {
          const id = generatePermissionId()
          const action = def?.permission || call.function.name
          const toolCall: ToolCall = { id: call.id, name: call.function.name, input: args }

          // 先注册 pending 再 yield，确保外部收到事件后立即 replyPermission 也能命中
          let resolvePermission!: (allow: boolean) => void
          const allowedPromise = new Promise<boolean>((resolve) => {
            resolvePermission = resolve
          })
          this.pendingPermissions.set(id, {
            resolve: resolvePermission,
            onAlways: () => {
              config.onPermissionSave?.([{ action, resource: '*', effect: 'allow' }])
            },
          })

          yield {
            type: 'permission_request',
            id,
            action,
            resources: extractResources(args),
            toolCall,
          }

          const allowed = await allowedPromise

          if (!allowed) {
            results.set(call.id, { success: false, error: `Permission denied: ${call.function.name}` })
            continue
          }
        }

        approvedCalls.push(call)
      }

      // 已批准的工具并发执行
      for (const call of approvedCalls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(call.function.arguments) } catch { /* ignore */ }
        yield { type: 'tool_start', id: call.id, name: call.function.name, args }
      }

      const toolResults = await Promise.all(
        approvedCalls.map(async (call) => {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(call.function.arguments) } catch { /* ignore */ }
          const startTime = Date.now()
          const result = await this.registry.execute(call.function.name, args, ctx)
          logToolCall({
            timestamp: new Date().toISOString(),
            toolName: call.function.name,
            args,
            result,
            durationMs: Date.now() - startTime,
            provider: config.provider,
            model: config.model,
          })
          return { call, result }
        })
      )

      for (const { call, result } of toolResults) {
        results.set(call.id, result)
      }

      for (const call of toolCallsArray) {
        const result = results.get(call.id)!
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
        appendMessage(config.sessionID, {
          role: 'assistant',
          content: currentText,
          timestamp: new Date().toISOString(),
        })
      }
      for (const call of toolCallsArray) {
        const result = results.get(call.id)!
        appendMessage(config.sessionID, {
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
