/**
 * Agent ReAct 循环 — 事件驱动、可中断、带预算的多步 ReAct 引擎
 * 集成 LLM Function Calling + 并发工具执行 + 流式返回
 */

import { ToolRegistry } from './registry'
import { ToolContext } from './tool'
import { AgentEvent } from './types'
import { IterationBudget } from './iteration-budget'
import { createLLMClient, LLMMessage } from './llm-client'

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
}

export type { AgentEvent } from './types'

const DEFAULT_SYSTEM = `You are OmniAgent, an AI assistant integrated into a desktop application.
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

export class Agent {
  constructor(private registry: ToolRegistry) {}

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

    const materialized = this.registry.materialize()
    const toolDefs = materialized.definitions

    let messages: LLMMessage[] = [
      { role: 'system', content: config.systemPrompt || DEFAULT_SYSTEM },
      ...history.map((m) => ({ role: m.role as LLMMessage['role'], content: m.content })),
      { role: 'user', content: userMessage },
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
        yield { type: 'finish', reason: 'stop' }
        return
      }

      for (const call of toolCallsArray) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(call.function.arguments) } catch { /* ignore */ }
        yield { type: 'tool_start', id: call.id, name: call.function.name, args }
      }

      const toolResults = await Promise.all(
        toolCallsArray.map(async (call) => {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(call.function.arguments) } catch { /* ignore */ }
          const result = await this.registry.execute(call.function.name, args, ctx)
          return { call, result }
        })
      )

      for (const { call, result } of toolResults) {
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
    }

    yield { type: 'finish', reason: 'length' }
  }
}
