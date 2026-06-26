import { createLLMClient, type LLMToolSet, type LLMMessage } from "../llm-sdk"
import type { AgentEvent } from "../types"
import type { ToolResult, ToolContext } from "../tool"
import type { ToolRegistry } from "../registry"
import type { AgentStateMachine } from "./state-machine"
import type { ApprovalStore } from "../permission/approval-store"
import type { ToolOrchestrator, OrchestratedToolCall } from "../execution/orchestrator"
import { evaluateToolCalls, extractResources } from "../permission-gate"
import type { PermissionSet, PermissionRule } from "../permission"
import { pluginHooks } from "../plugin-hooks"
import { appendMessage } from "../session-store"
import { isToolParallel } from "../tools/tool-meta"

export type TurnSignal = "continue" | "stop" | "compact"

export interface TurnProcessorInput {
  messages: LLMMessage[]
  tools: LLMToolSet
  sessionID: string
  workspace: string
  config: {
    provider: string
    model: string
    apiKey: string
    apiUrl: string
    headers?: Record<string, string>
    options?: Record<string, unknown>
    maxContextTokens?: number
    permissions?: PermissionSet
    onPermissionSave?: (rules: PermissionRule[]) => void
  }
  signal?: AbortSignal
  deps: {
    registry: ToolRegistry
    stateMachine: AgentStateMachine
    approvalStore: ApprovalStore
    orchestrator: ToolOrchestrator
  }
  ctx: ToolContext
}

export interface TurnProcessorResult {
  text: string
  toolCalls: Array<{ id: string; name: string; arguments: string }>
  signal: TurnSignal
  messages: LLMMessage[]
  toolResults: Array<{ id: string; result: ToolResult }>
}

export interface DirectToolInput {
  messages: LLMMessage[]
  sessionID: string
  workspace: string
  permissions?: PermissionSet
  onPermissionSave?: (rules: PermissionRule[]) => void
  deps: {
    registry: ToolRegistry
    stateMachine: AgentStateMachine
    approvalStore: ApprovalStore
    orchestrator: ToolOrchestrator
  }
  ctx: ToolContext
}

async function checkAndExecuteTool(
  tc: { id: string; name: string; arguments: string },
  input: TurnProcessorInput | DirectToolInput,
): Promise<ToolResult> {
  let args: Record<string, unknown>
  try { args = JSON.parse(tc.arguments) } catch { args = {} }

  const def = input.deps.registry.get(tc.name)
  const permissionAction = def?.permission || tc.name
  const evaluations = evaluateToolCalls(
    [{ id: tc.id, function: { name: tc.name, arguments: JSON.stringify(args) } }],
    input.deps.registry,
    "permissions" in input ? input.permissions : undefined,
  )

  for (const ev of evaluations) {
    if (ev.hardDenied) return { success: false, error: ev.hardDenied }
    if (ev.needsApproval) {
      const resources = extractResources(ev.args)
      const cached = input.deps.approvalStore.checkAll(ev.permissionAction, resources)
      if (cached === "allow") {
      } else {
        const { id, waitForReply } = input.deps.stateMachine.createPermissionRequest()
        const allowed = await waitForReply()
        if (allowed) {
          input.deps.approvalStore.record(ev.permissionAction, resources, "allow", 300_000, input.workspace)
        } else {
          input.deps.approvalStore.record(ev.permissionAction, resources, "deny", 300_000, input.workspace)
          return { success: false, error: `Permission denied: ${tc.name}` }
        }
      }
    }
  }

  const blocked = await pluginHooks.triggerUntil("pre_tool_use", { id: tc.id, function: { name: tc.name, arguments: JSON.stringify(args) } }, { sessionID: input.sessionID, workspace: input.workspace })
  if (blocked) return { success: false, error: String(blocked) }

  const result = await input.deps.orchestrator.execute([{ id: tc.id, name: tc.name, args }], input.ctx)
  return result.get(tc.id) || { success: false, error: "No result" }
}

export async function* executeCollectedTools(
  toolCalls: Array<{ id: string; name: string; arguments: string }>,
  assistantText: string,
  input: DirectToolInput,
): AsyncGenerator<AgentEvent, Array<{ id: string; result: ToolResult }>> {
  const results: Array<{ id: string; result: ToolResult }> = []
  let writeMutex: Promise<void> = Promise.resolve()

  for (const tc of toolCalls) {
    const canParallel = isToolParallel(tc.name)
    const promise = checkAndExecuteTool(tc, input).then(result => ({ id: tc.id, result }))

    if (canParallel) {
      promise.then(({ id, result }) => {
        results.push({ id, result })
      })
    } else {
      const prevMutex = writeMutex
      writeMutex = prevMutex.then(async () => {
        const { id, result } = await promise
        results.push({ id, result })
      })
    }
  }

  await writeMutex

  for (const { id, result } of results) {
    yield { type: "tool_result" as const, id, name: toolCalls.find(t => t.id === id)?.name || "", result }
  }

  const resultMap = new Map(results.map(r => [r.id, r.result]))
  for (const tc of toolCalls) {
    const result = resultMap.get(tc.id)
    const text = result?.success ? (result.output || "") : (result?.error || "No result")
    const parts: Array<any> = [
      { type: "tool-result" as const, toolCallId: tc.id, toolName: tc.name, output: { type: "text" as const, value: text } },
    ]
    if (result?.metadata?.mime && result?.metadata?.data) {
      parts.push({ type: "text" as const, text: `![${result.metadata.name || "image"}](data:${result.metadata.mime};base64,${(result.metadata.data as string).slice(0, 100)}... [base64 image data])` })
    }
    input.messages.push({ role: "tool", content: parts as any, tool_call_id: tc.id } as any)
  }

  return results
}

export async function* processTurn(
  input: TurnProcessorInput,
): AsyncGenerator<AgentEvent, TurnProcessorResult> {
  const { messages, tools, config, deps, ctx } = input
  const toolCallList: Array<{ id: string; name: string; arguments: string }> = []
  let text = ""
  let llmFailed = false
  let writeMutex: Promise<void> = Promise.resolve()
  const toolResults: Array<{ id: string; result: ToolResult }> = []

  const directInput: DirectToolInput = {
    messages,
    sessionID: input.sessionID,
    workspace: input.workspace,
    permissions: config.permissions,
    onPermissionSave: config.onPermissionSave,
    deps,
    ctx,
  }

  const client = createLLMClient({
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    apiUrl: config.apiUrl,
    headers: config.headers,
    options: config.options,
  })

  const stream = client.stream({ messages, tools })
  const toolDoneQueue: Array<{ id: string; result: ToolResult }> = []

  for await (const event of stream) {
    // 每次 LLM 事件之间：检查已完成的工具
    while (toolDoneQueue.length > 0) {
      const { id, result } = toolDoneQueue.shift()!
      yield { type: "tool_result" as const, id, name: toolCallList.find(t => t.id === id)?.name || "", result }
    }

    if (event.type === "delta") {
      text += event.delta
      yield { type: "content" as const, text: event.delta }
    } else if (event.type === "tool_call" && event.toolCall) {
      toolCallList.push(event.toolCall)
      yield { type: "tool_start" as const, id: event.toolCall.id, name: event.toolCall.name, args: JSON.parse(event.toolCall.arguments) }

      const execPromise = checkAndExecuteTool(event.toolCall, directInput)
      if (isToolParallel(event.toolCall.name)) {
        execPromise.then(result => { toolDoneQueue.push({ id: event.toolCall!.id, result }) })
      } else {
        const prevMutex = writeMutex
        writeMutex = prevMutex.then(async () => {
          const result = await execPromise
          toolDoneQueue.push({ id: event.toolCall!.id, result })
        })
      }
    } else if (event.type === "error") {
      llmFailed = true
      yield { type: "error" as const, message: event.error?.message || "LLM stream error" }
      break
    } else if (event.type === "done") {
      break
    }
  }

  // 流结束后还有剩余工具结果
  while (toolDoneQueue.length > 0) {
    const { id, result } = toolDoneQueue.shift()!
    yield { type: "tool_result" as const, id, name: toolCallList.find(t => t.id === id)?.name || "", result }
  }

  if (llmFailed) {
    await writeMutex
    return { text, toolCalls: toolCallList, signal: "stop" as TurnSignal, messages, toolResults }
  }

  await writeMutex

  if (toolCallList.length > 0) {
    messages.push({
      role: "assistant",
      content: [
        { type: "text", text },
        ...toolCallList.map(tc => ({
          type: "tool-call" as const,
          toolCallId: tc.id,
          toolName: tc.name,
          args: JSON.parse(tc.arguments),
        })),
      ],
    })

    const resultMap = new Map(toolResults.map(r => [r.id, r.result]))
    for (const tc of toolCallList) {
      const result = resultMap.get(tc.id)
      const text2 = result?.success ? (result.output || "") : (result?.error || "No result")
      const parts: Array<any> = [
        { type: "tool-result" as const, toolCallId: tc.id, toolName: tc.name, output: { type: "text" as const, value: text2 } },
      ]
      if (result?.metadata?.mime && result?.metadata?.data) {
        parts.push({ type: "text" as const, text: `![${result.metadata.name || "image"}](data:${result.metadata.mime};base64,${(result.metadata.data as string).slice(0, 100)}... [base64 image data])` })
      }
      messages.push({ role: "tool", content: parts as any, tool_call_id: tc.id } as any)
    }
  }

  const signal: TurnSignal = toolCallList.length === 0 ? "stop" : "continue"
  return { text, toolCalls: toolCallList, signal, messages, toolResults }
}
