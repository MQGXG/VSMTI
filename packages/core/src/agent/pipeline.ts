import type { ToolContext, ToolResult } from "../tool"
import type { LLMMessage } from "../llm-sdk"
import type { AgentEvent } from "../types"
import type { ToolRegistry } from "../registry"
import type { PermissionSet, PermissionRule } from "../permission"
import type { AgentStateMachine, PermissionReply } from "./state-machine"
import type { ApprovalStore } from "../permission/approval-store"
import type { ToolOrchestrator, OrchestratedToolCall } from "../execution/orchestrator"
import { evaluateToolCalls, extractResources } from "../permission-gate"
import { pluginHooks } from "../plugin-hooks"
import { appendMessage } from "../session-store"

export interface PipelineInput {
  toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>
  assistantText: string
  messages: LLMMessage[]
  ctx: ToolContext
  deps: {
    registry: ToolRegistry
    stateMachine: AgentStateMachine
    approvalStore: ApprovalStore
    orchestrator: ToolOrchestrator
  }
  config: {
    sessionID: string
    workspace: string
    permissions?: PermissionSet
    onPermissionSave?: (rules: PermissionRule[]) => void
    signal?: AbortSignal
  }
}

export async function* runToolPipeline(
  input: PipelineInput,
): AsyncGenerator<AgentEvent, void> {
  const { toolCalls: toolCallsArray, assistantText: _assistantText, messages, ctx, deps, config } = input

  const assistantPayload = JSON.stringify({
    text: _assistantText,
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

  const evaluations = evaluateToolCalls(toolCallsArray, deps.registry, config.permissions)
  const approvedCalls: typeof toolCallsArray = []
  const results = new Map<string, ToolResult>()

  for (const ev of evaluations) {
    if (ev.hardDenied) {
      results.set(ev.toolCall.id, { success: false, error: ev.hardDenied })
      continue
    }
    if (ev.needsApproval) {
      const resources = extractResources(ev.args)
      const cached = deps.approvalStore.checkAll(ev.permissionAction, resources)
      if (cached === "allow") {
        approvedCalls.push({ id: ev.toolCall.id, type: "function" as const, function: { name: ev.toolCall.name, arguments: JSON.stringify(ev.args) } })
        continue
      }

      const { id, waitForReply } = deps.stateMachine.createPermissionRequest(
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
        deps.approvalStore.record(ev.permissionAction, resources, "allow", 300_000, config.workspace)
      } else {
        deps.approvalStore.record(ev.permissionAction, resources, "deny", 300_000, config.workspace)
        results.set(ev.toolCall.id, { success: false, error: `Permission denied: ${ev.toolCall.name}` })
        continue
      }
    }
    approvedCalls.push({ id: ev.toolCall.id, type: "function" as const, function: { name: ev.toolCall.name, arguments: JSON.stringify(ev.args) } })
  }

  const hookBlocked: string[] = []
  for (const call of toolCallsArray) {
    const blocked = await pluginHooks.triggerUntil("pre_tool_use", call, { sessionID: config.sessionID, workspace: config.workspace, permissions: config.permissions })
    if (blocked) {
      hookBlocked.push(call.id)
      results.set(call.id, { success: false, error: String(blocked) })
    }
  }

  for (const call of approvedCalls) {
    if (hookBlocked.includes(call.id)) continue
    yield { type: "tool_start", id: call.id, name: call.function.name, args: JSON.parse(call.function.arguments) }
  }

  const orchestratedCalls = approvedCalls
    .filter((c) => !hookBlocked.includes(c.id))
    .map((c) => ({
      id: c.id,
      name: c.function.name,
      args: JSON.parse(c.function.arguments),
    }))

  const completedIds = new Set<string>()

  // 流式执行：每个工具完成后立即 yield 结果
  for await (const { id, result } of deps.orchestrator.executeStreaming(orchestratedCalls, ctx)) {
    completedIds.add(id)

    const originalCall = toolCallsArray.find((tc) => tc.id === id)
    if (!originalCall) continue

    injectToolResult(originalCall, result, messages)

    yield { type: "tool_result", id, name: originalCall.function.name, result: { success: result.success, output: result.output, error: result.error } }

    await appendMessage(config.sessionID, {
      role: "tool",
      content: result.output || result.error || "",
      timestamp: new Date().toISOString(),
      toolCallId: id,
    })
  }

  await pluginHooks.emitAsync("post_tool_use", orchestratedCalls, results)

  // 处理未完成的工具（理论上不会发生）
  for (const call of toolCallsArray) {
    if (completedIds.has(call.id)) continue
    const errorResult: ToolResult = { success: false, error: "Tool execution failed: no result" }
    injectToolResult(call, errorResult, messages)
    yield { type: "tool_result", id: call.id, name: call.function.name, result: errorResult }
    await appendMessage(config.sessionID, {
      role: "tool", content: errorResult.error || "", timestamp: new Date().toISOString(), toolCallId: call.id,
    })
  }
}

function injectToolResult(
  call: { id: string; function: { name: string; arguments: string } },
  result: ToolResult,
  messages: LLMMessage[],
): void {
  const text = result.success ? (result.output || "") : (result.error || "")
  const parts: Array<{ type: "tool-result" | "text"; toolCallId?: string; toolName?: string; output?: any; text?: string }> = [
    { type: "tool-result" as const, toolCallId: call.id, toolName: call.function.name, output: { type: "text" as const, value: text } },
  ]
  if (result.metadata?.mime && result.metadata?.data) {
    parts.push({
      type: "text" as const,
      text: `![${result.metadata.name || "image"}](data:${result.metadata.mime};base64,${(result.metadata.data as string).slice(0, 100)}... [base64 image data])`,
    })
  }
  messages.push({ role: "tool", content: parts as any, tool_call_id: call.id })
}
