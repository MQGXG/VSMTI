import { createLLMClient, type LLMToolSet, type LLMMessage } from "../llm/client"
import type { AgentEvent } from "../types"
import type { ToolResult, ToolContext } from "../shared/tool"
import type { ToolRegistry } from "../system/registry"
import type { AgentStateMachine } from "./state-machine"
import type { ApprovalStore } from "../system/permission/approval-store"
import type { ToolOrchestrator, OrchestratedToolCall } from "../orchestrate/execution"
import { evaluateToolCalls, extractResources } from "../system/permission/gate"
import type { PermissionSet, PermissionRule } from "../system/permission"
import { pluginHooks } from "../shared/plugin-hooks"
import { appendMessage } from "../session/store"
import { isToolParallel } from "../tools/shared/tool-meta"
import type { ApprovalResult } from "../system/permission/gate"
import { TextNgramMonitor } from "./text-ngram"
import { isFeatureEnabled } from "../config/flags"

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
    autoAcceptPermissions?: boolean
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
  autoAcceptPermissions?: boolean
  deps: {
    registry: ToolRegistry
    stateMachine: AgentStateMachine
    approvalStore: ApprovalStore
    orchestrator: ToolOrchestrator
  }
  ctx: ToolContext
}

/**
 * 检查权限并等待用户回复（yield permission_request 事件）
 * 返回 null 表示允许执行，返回 string 表示拒绝原因
 */
async function* checkToolPermission(
  tc: { id: string; name: string; arguments: string },
  input: TurnProcessorInput | DirectToolInput,
): AsyncGenerator<AgentEvent, ToolResult | null> {
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
    if (ev.hardDenied) return { success: false, error: ev.hardDenied } as ToolResult
    if (ev.needsApproval) {
      const resources = extractResources(ev.args)
      const cached = input.deps.approvalStore.checkAll(ev.permissionAction, resources)
      if (cached === "allow") continue

      // 自动接受权限模式：跳过用户确认
      if ("autoAcceptPermissions" in input && input.autoAcceptPermissions) {
        input.deps.approvalStore.record(ev.permissionAction, resources, "allow", 300_000, input.workspace)
        continue
      }

      const { id, waitForReply } = input.deps.stateMachine.createPermissionRequest(
        "onPermissionSave" in input && input.onPermissionSave
          ? () => input.onPermissionSave?.([{ action: ev.permissionAction, resource: "*", effect: "allow" as const }])
          : undefined,
      )
      yield { type: "permission_request", id, action: ev.permissionAction, resources, toolCall: ev.toolCall }
      const allowed = await waitForReply()
      if (allowed) {
        input.deps.approvalStore.record(ev.permissionAction, resources, "allow", 300_000, input.workspace)
      } else {
        input.deps.approvalStore.record(ev.permissionAction, resources, "deny", 300_000, input.workspace)
        return { success: false, error: `Permission denied: ${tc.name}` } as ToolResult
      }
    }
  }

  return null // 允许执行
}

async function executeTool(
  tc: { id: string; name: string; arguments: string },
  input: TurnProcessorInput | DirectToolInput,
): Promise<ToolResult> {
  let args: Record<string, unknown>
  try { args = JSON.parse(tc.arguments) } catch { args = {} }

  const blocked = await pluginHooks.triggerUntil("pre_tool_use",
    { id: tc.id, function: { name: tc.name, arguments: JSON.stringify(args) } },
    { sessionID: input.sessionID, workspace: input.workspace })
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
  const blockedIds = new Set<string>()

  // 串行检查权限（需要 yield 事件，无法并行）
  for (const tc of toolCalls) {
    let args: Record<string, unknown>
    try { args = JSON.parse(tc.arguments) } catch { args = {} }
    const def = input.deps.registry.get(tc.name)
    const permissionAction = def?.permission || tc.name
    const evaluations = evaluateToolCalls(
      [{ id: tc.id, function: { name: tc.name, arguments: JSON.stringify(args) } }],
      input.deps.registry,
      input.permissions,
    )
    for (const ev of evaluations) {
      if (ev.hardDenied) {
        results.push({ id: tc.id, result: { success: false, error: ev.hardDenied } })
        blockedIds.add(tc.id)
        break
      }
      if (ev.needsApproval) {
        const resources = extractResources(ev.args)
          const cached = input.deps.approvalStore.checkAll(ev.permissionAction, resources)
          if (cached === "allow") continue
          if (input.autoAcceptPermissions) {
            // 按工具名缓存批准（不检查具体路径）
            input.deps.approvalStore.record(ev.permissionAction, resources, "allow", 86400_000, input.workspace)
            continue
          }
        const { id, waitForReply } = input.deps.stateMachine.createPermissionRequest(
          input.onPermissionSave
            ? () => input.onPermissionSave?.([{ action: ev.permissionAction, resource: "*", effect: "allow" as const }])
            : undefined,
        )
        yield { type: "permission_request", id, action: ev.permissionAction, resources, toolCall: ev.toolCall }
        const allowed = await waitForReply()
        if (!allowed) {
          input.deps.approvalStore.record(ev.permissionAction, resources, "deny", 300_000, input.workspace)
          results.push({ id: tc.id, result: { success: false, error: `Permission denied: ${tc.name}` } })
          blockedIds.add(tc.id)
          break
        }
        input.deps.approvalStore.record(ev.permissionAction, resources, "allow", 300_000, input.workspace)
      }
    }
  }

  // 并行执行未被拒绝的工具
  const pendingTools = toolCalls.filter(tc => !blockedIds.has(tc.id))
  if (pendingTools.length > 0) {
    const toolPromises = pendingTools.map(tc =>
      executeTool(tc, input).then(result => ({ id: tc.id, result }))
    )
    const toolResults = await Promise.allSettled(toolPromises)
    for (const settled of toolResults) {
      if (settled.status === "fulfilled") {
        results.push(settled.value)
      } else {
        results.push({ id: "unknown", result: { success: false, error: settled.reason?.message || "Execution failed" } })
      }
    }
  }

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
  const toolResults: Array<{ id: string; result: ToolResult }> = []

  const directInput: DirectToolInput = {
    messages,
    sessionID: input.sessionID,
    workspace: input.workspace,
    permissions: config.permissions,
    onPermissionSave: config.onPermissionSave,
    autoAcceptPermissions: config.autoAcceptPermissions,
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
  const ngramMonitor = new TextNgramMonitor()
  const pendingTools = new Map<string, Promise<ToolResult>>()
  const MAX_CONCURRENT = 10

  // 并发控制信号量
  let activeCount = 0
  const waitQueue: Array<() => void> = []
  const acquire = () => new Promise<void>(resolve => {
    if (activeCount < MAX_CONCURRENT) { activeCount++; resolve() }
    else waitQueue.push(resolve)
  })
  const release = () => {
    activeCount--
    if (waitQueue.length > 0) { activeCount++; waitQueue.shift()!() }
  }

  // 启动工具执行（异步，不阻塞流）
  const startToolExecution = async (tc: { id: string; name: string; arguments: string }) => {
    await acquire()
    try {
      const result = await executeTool(tc, directInput)
      toolResults.push({ id: tc.id, result })
      toolDoneQueue.push({ id: tc.id, result })
    } catch (err) {
      const result = { success: false, error: err instanceof Error ? err.message : String(err) } as ToolResult
      toolResults.push({ id: tc.id, result })
      toolDoneQueue.push({ id: tc.id, result })
    } finally {
      release()
    }
  }

  // 快速权限检查（不阻塞流）
  const quickPermissionCheck = (tc: { id: string; name: string; arguments: string }): "allow" | "ask" | "deny" => {
    if (directInput.autoAcceptPermissions) return "allow"

    let args: Record<string, unknown>
    try { args = JSON.parse(tc.arguments) } catch { args = {} }
    const def = deps.registry.get(tc.name)
    const permissionAction = def?.permission || tc.name
    const resources = extractResources(args)

    const cached = deps.approvalStore.checkAll(permissionAction, resources)
    if (cached === "allow") return "allow"

    const evaluations = evaluateToolCalls(
      [{ id: tc.id, function: { name: tc.name, arguments: tc.arguments } }],
      deps.registry,
      directInput.permissions,
    )
    const ev = evaluations[0]
    if (ev?.hardDenied) return "deny"
    if (ev?.needsApproval) return "ask"
    return "allow"
  }

  for await (const event of stream) {
    // 每次 LLM 事件之间：检查已完成的工具
    while (toolDoneQueue.length > 0) {
      const { id, result } = toolDoneQueue.shift()!
      yield { type: "tool_result" as const, id, name: toolCallList.find(t => t.id === id)?.name || "", result }
    }

    if (event.type === "delta") {
      text += event.delta
      // 检测重复输出（可通过 feature flag 控制）
      if (isFeatureEnabled("text-ngram-detection") && ngramMonitor.check(event.delta)) {
        yield { type: "error" as const, message: "检测到重复输出，自动停止" }
        break
      }
      yield { type: "content" as const, text: event.delta }
    } else if (event.type === "tool_call" && event.toolCall) {
      toolCallList.push(event.toolCall)
      yield { type: "tool_start" as const, id: event.toolCall.id, name: event.toolCall.name, args: JSON.parse(event.toolCall.arguments) }

      const permResult = quickPermissionCheck(event.toolCall)

      if (permResult === "allow") {
        // 立即启动执行（并发）
        startToolExecution(event.toolCall)
      } else if (permResult === "deny") {
        const result = { success: false, error: `Permission denied: ${event.toolCall.name}` } as ToolResult
        toolResults.push({ id: event.toolCall.id, result })
        toolDoneQueue.push({ id: event.toolCall.id, result })
      } else {
        // 需要用户确认 — 阻塞该工具
        let args: Record<string, unknown>
        try { args = JSON.parse(event.toolCall.arguments) } catch { args = {} }
        const def = deps.registry.get(event.toolCall.name)
        const permissionAction = def?.permission || event.toolCall.name
        const resources = extractResources(args)

        const { id: permId, waitForReply } = deps.stateMachine.createPermissionRequest(
          directInput.onPermissionSave
            ? () => directInput.onPermissionSave?.([{ action: permissionAction, resource: "*", effect: "allow" as const }])
            : undefined,
        )
        yield { type: "permission_request", id: permId, action: permissionAction, resources, toolCall: { id: event.toolCall.id, name: event.toolCall.name, input: args } }
        const allowed = await waitForReply()

        if (allowed) {
          deps.approvalStore.record(permissionAction, resources, "allow", 86400_000, directInput.workspace)
          startToolExecution(event.toolCall)
        } else {
          deps.approvalStore.record(permissionAction, resources, "deny", 300_000, directInput.workspace)
          const result = { success: false, error: `Permission denied: ${event.toolCall.name}` } as ToolResult
          toolResults.push({ id: event.toolCall.id, result })
          toolDoneQueue.push({ id: event.toolCall.id, result })
        }
      }
    } else if (event.type === "error") {
      llmFailed = true
      yield { type: "error" as const, message: event.error?.message || "LLM stream error" }
      break
    } else if (event.type === "done") {
      break
    }
  }

  // 等待所有工具完成
  while (pendingTools.size > 0 || activeCount > 0) {
    while (toolDoneQueue.length > 0) {
      const { id, result } = toolDoneQueue.shift()!
      yield { type: "tool_result" as const, id, name: toolCallList.find(t => t.id === id)?.name || "", result }
    }
    if (pendingTools.size === 0 && activeCount === 0) break
    await new Promise(r => setTimeout(r, 10))
  }

  // 最终清理
  while (toolDoneQueue.length > 0) {
    const { id, result } = toolDoneQueue.shift()!
    yield { type: "tool_result" as const, id, name: toolCallList.find(t => t.id === id)?.name || "", result }
  }

  if (llmFailed) {
    return { text, toolCalls: toolCallList, signal: "stop" as TurnSignal, messages, toolResults }
  }

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
    } as any)

    const resultMap = new Map(toolResults.map(r => [r.id, r.result]))
    for (const tc of toolCallList) {
      const result = resultMap.get(tc.id)
      const resultText = result?.success ? (result.output || "") : (result?.error || "No result")
      messages.push({
        role: "tool",
        content: [{ type: "text" as const, text: resultText }],
        tool_call_id: tc.id,
      } as any)
    }
  }

  return { text, toolCalls: toolCallList, signal: "continue" as TurnSignal, messages, toolResults }
}


