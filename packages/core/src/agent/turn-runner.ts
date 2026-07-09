import { createLLMClient, type LLMToolSet, type LLMMessage, type SDKConfig } from "../llm/client"
import { FallbackClient } from "../orchestrate/failover"
import type { ToolResult, ToolContext } from "../shared/tool"
import type { ToolRegistry } from "../system/registry"
import type { AgentStateMachine } from "./state-machine"
import type { ApprovalStore } from "../system/permission/approval-store"
import type { ToolOrchestrator } from "../orchestrate/execution"
import { evaluateToolCalls, extractResources } from "../system/permission/gate"
import type { PermissionSet, PermissionRule } from "../system/permission"
import { pluginHooks } from "../shared/plugin-hooks"
import { appendMessage } from "../session/store"
import { isToolParallel } from "../tools/shared/tool-meta"
import { TextNgramMonitor } from "./text-ngram"
import { isFeatureEnabled } from "../config/flags"
import type { AgentEvent } from "../types"
import type { LLMTurnConfig } from "./turn"
import { runMaxMode, type MaxModeConfig } from "./max-mode"

export interface TurnRunnerInput {
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
    fallbacks?: SDKConfig[]
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

export interface TurnRunnerOutput {
  text: string
  toolCalls: Array<{ id: string; name: string; arguments: string }>
  toolResults: Array<{ id: string; result: ToolResult }>
  messages: LLMMessage[]
  signal: "continue" | "stop" | "context_overflow"
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  retryCount: number
}

/* ───────── 权限检查（串行，需要 yield 事件） ───────── */

async function checkToolPermission(
  tc: { id: string; name: string; arguments: string },
  deps: TurnRunnerInput["deps"],
  permissions: PermissionSet | undefined,
  workspace: string,
  autoAccept: boolean | undefined,
  onPermissionSave: ((rules: PermissionRule[]) => void) | undefined,
): Promise<ToolResult | null> {
  let args: Record<string, unknown>
  try { args = JSON.parse(tc.arguments) } catch { args = {} }

  const def = deps.registry.get(tc.name)
  const permissionAction = def?.permission || tc.name
  const evaluations = evaluateToolCalls(
    [{ id: tc.id, function: { name: tc.name, arguments: JSON.stringify(args) } }],
    deps.registry,
    permissions,
  )

  for (const ev of evaluations) {
    if (ev.hardDenied) return { success: false, error: ev.hardDenied } as ToolResult
    if (ev.needsApproval) {
      const resources = extractResources(ev.args)
      const cached = deps.approvalStore.checkAll(ev.permissionAction, resources)
      if (cached === "allow") continue

      if (autoAccept) {
        deps.approvalStore.record(ev.permissionAction, resources, "allow", 300_000, workspace)
        continue
      }

      const { id, waitForReply } = deps.stateMachine.createPermissionRequest(
        onPermissionSave
          ? () => onPermissionSave([{ action: ev.permissionAction, resource: "*", effect: "allow" as const }])
          : undefined,
      )
      // 权限请求通过 yield 交给 UI，但这里无法直接 yield
      // 改用直接等待回复
      const allowed = await waitForReply()
      if (allowed) {
        deps.approvalStore.record(ev.permissionAction, resources, "allow", 300_000, workspace)
      } else {
        deps.approvalStore.record(ev.permissionAction, resources, "deny", 300_000, workspace)
        return { success: false, error: `Permission denied: ${tc.name}` } as ToolResult
      }
    }
  }

  return null
}

async function executeTool(
  tc: { id: string; name: string; arguments: string },
  input: TurnRunnerInput,
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

/* ───────── 并发控制信号量 ───────── */

const MAX_CONCURRENT = 10

class ConcurrencyGate {
  private activeCount = 0
  private waitQueue: Array<() => void> = []
  private serialQueue: Array<() => void> = []
  private serialActive = false

  async acquire(name: string): Promise<void> {
    const parallel = isToolParallel(name)
    if (!parallel) await this.acquireSerial()
    await this.acquireShared()
  }

  release(name: string): void {
    const parallel = isToolParallel(name)
    this.releaseShared()
    if (!parallel) this.releaseSerial()
  }

  private acquireShared(): Promise<void> {
    return new Promise(resolve => {
      if (this.activeCount < MAX_CONCURRENT) { this.activeCount++; resolve() }
      else this.waitQueue.push(resolve)
    })
  }

  private releaseShared(): void {
    this.activeCount--
    if (this.waitQueue.length > 0) { this.activeCount++; this.waitQueue.shift()!() }
  }

  private acquireSerial(): Promise<void> {
    return new Promise(resolve => {
      if (!this.serialActive) { this.serialActive = true; resolve() }
      else this.serialQueue.push(resolve)
    })
  }

  private releaseSerial(): void {
    if (this.serialQueue.length > 0) { this.serialQueue.shift()!() }
    else this.serialActive = false
  }

  get busy(): boolean {
    return this.activeCount > 0 || this.serialActive
  }
}

/* ───────── 主执行函数 ───────── */

export async function* runTurn(
  input: TurnRunnerInput,
): AsyncGenerator<AgentEvent, TurnRunnerOutput> {
  const { messages, tools, config, deps, ctx, sessionID } = input
  const toolCallList: Array<{ id: string; name: string; arguments: string }> = []
  let text = ""
  let llmFailed = false
  const toolResults: Array<{ id: string; result: ToolResult }> = []
  let turnUsage: TurnRunnerOutput["usage"] = undefined
  let retryCount = 0

  const concurrencyGate = new ConcurrencyGate()

  const primaryConfig: SDKConfig = {
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    apiUrl: config.apiUrl,
    headers: config.headers,
    options: config.options,
  }

  const client = config.fallbacks && config.fallbacks.length > 0
    ? new FallbackClient({ primary: primaryConfig, fallbacks: config.fallbacks })
    : createLLMClient(primaryConfig)

  const stream = client.stream({ messages, tools })
  const toolDoneQueue: Array<{ id: string; result: ToolResult }> = []
  const ngramMonitor = new TextNgramMonitor()

  const startToolExecution = async (tc: { id: string; name: string; arguments: string }) => {
    await concurrencyGate.acquire(tc.name)
    try {
      const result = await executeTool(tc, input)
      toolResults.push({ id: tc.id, result })
      toolDoneQueue.push({ id: tc.id, result })
      pluginHooks.emitAsync("post_tool_use", [tc], new Map([[tc.id, result]]))
    } catch (err) {
      const result = { success: false, error: err instanceof Error ? err.message : String(err) } as ToolResult
      toolResults.push({ id: tc.id, result })
      toolDoneQueue.push({ id: tc.id, result })
      pluginHooks.emitAsync("post_tool_use", [tc], new Map([[tc.id, result]]))
    } finally {
      concurrencyGate.release(tc.name)
    }
  }

  const quickPermissionCheck = (tc: { id: string; name: string; arguments: string }): "allow" | "ask" | "deny" => {
    if (input.config.autoAcceptPermissions) return "allow"

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
      input.config.permissions,
    )
    const ev = evaluations[0]
    if (ev?.hardDenied) return "deny"
    if (!ev?.needsApproval) return "allow"

    // 智能权限分类：对 bash/code_exec 按风险级别自动放行
    if (tc.name === "bash") {
      const command = typeof args.command === "string" ? args.command.trim() : ""
      if (isSafeBashCommand(command)) return "allow"
    }
    if (tc.name === "run_code") {
      const code = typeof args.code === "string" ? args.code.trim() : ""
      if (isSafeCodeExec(code)) return "allow"
    }

    return "ask"
  }

  // 参考 Claude Code 的 YOLO 分类器模式：
  // 读/查/安装等低风险命令自动放行，只有高风险命令才弹窗
  function isSafeBashCommand(command: string): boolean {
    if (!command) return false

    const firstToken = command.split(/\s+/)[0]?.toLowerCase() || ""

    // 1. 只读命令 — 永远安全
    const readOnly = new Set([
      "ls", "cat", "head", "tail", "echo", "which", "type", "pwd", "where",
      "less", "more", "wc", "sort", "uniq", "cut", "grep",
    ])
    if (readOnly.has(firstToken)) {
      const lower = command.toLowerCase()
      const dangerous = ["rm", "mv", "dd", ">", "|", "sudo", "chmod", "chown"]
      return !dangerous.some(d => lower.includes(d))
    }

    // 2. 版本/信息查询
    if (/^(python|node|npm|npx|pnpm|yarn|bun|go|rustc|pip)\s/.test(command) &&
        /\s(--version|-v|--help|-h)\s*$/.test(command)) {
      return true
    }

    // 3. 安装命令 — 低风险，自动放行
    if (/^(pip|npm|pnpm|yarn|bun|go|apt|brew|choco|winget)\s+(install|add|i|remove|uninstall)\b/.test(command)) {
      return true
    }
    if (/^(pip|npm|pnpm)\s+install\s/.test(command)) {
      return true
    }

    // 4. 包信息查询
    if (/^(pip|npm|pnpm|yarn|bun)\s+(list|show|info|search|view)\b/.test(command)) {
      return true
    }

    // 5. Git 读取操作
    if (/^git\s+(status|log|diff|show|branch|tag|stash\s+list|remote)\b/.test(command)) {
      return true
    }

    // 6. Python/Node 一次性脚本（import 检查等）
    if (firstToken === "python" || firstToken === "node") {
      const lower = command.toLowerCase()
      const nonDestructive = ["import", "print", "console.log", "require", "os."]
      if (nonDestructive.some(p => lower.includes(p)) &&
          !lower.includes("os.system") && !lower.includes("subprocess")) {
        return true
      }
    }

    // 7. find 只读查找
    if (/^find\s/.test(command) && !command.includes("exec") && !command.includes("delete")) {
      return true
    }

    return false
  }

  function isSafeCodeExec(code: string): boolean {
    if (!code) return false
    const lower = code.toLowerCase()

    // 1. 纯 import 检查 — 只验证库是否存在
    if (/^(import|from)\s+\w+/.test(code.trim()) && !code.includes("\n")) {
      return true
    }

    // 2. 只读操作：print / 计算 / 列表遍历
    if (lower.includes("print(") &&
        !lower.includes("os.system") &&
        !lower.includes("subprocess") &&
        !lower.includes("shutil.rmtree") &&
        !lower.includes("open(")) {
      return true
    }

    // 3. 只读文件操作（open 但只读模式）
    if (lower.includes('open(') && (lower.includes(".read(") || lower.includes(".readlines("))) {
      return true
    }

    return false
  }

  // ── 流式事件处理循环 ──
  for await (const event of stream) {
    while (toolDoneQueue.length > 0) {
      const { id, result } = toolDoneQueue.shift()!
      yield { type: "tool_result" as const, id, name: toolCallList.find(t => t.id === id)?.name || "", result }
    }

    if (event.type === "delta") {
      text += event.delta
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
        startToolExecution(event.toolCall)
      } else if (permResult === "deny") {
        const result = { success: false, error: `Permission denied: ${event.toolCall.name}` } as ToolResult
        toolResults.push({ id: event.toolCall.id, result })
        toolDoneQueue.push({ id: event.toolCall.id, result })
      } else {
        let args: Record<string, unknown>
        try { args = JSON.parse(event.toolCall.arguments) } catch { args = {} }
        const def = deps.registry.get(event.toolCall.name)
        const permissionAction = def?.permission || event.toolCall.name
        const resources = extractResources(args)

        const { id: permId, waitForReply } = deps.stateMachine.createPermissionRequest(
          config.onPermissionSave
            ? () => config.onPermissionSave?.([{ action: permissionAction, resource: "*", effect: "allow" as const }])
            : undefined,
        )
        yield { type: "permission_request", id: permId, action: permissionAction, resources, toolCall: { id: event.toolCall.id, name: event.toolCall.name, input: args } }
        const allowed = await waitForReply()

        if (allowed) {
          deps.approvalStore.record(permissionAction, resources, "allow", 86400_000, input.workspace)
          startToolExecution(event.toolCall)
        } else {
          deps.approvalStore.record(permissionAction, resources, "deny", 300_000, input.workspace)
          const result = { success: false, error: `Permission denied: ${event.toolCall.name}` } as ToolResult
          toolResults.push({ id: event.toolCall.id, result })
          toolDoneQueue.push({ id: event.toolCall.id, result })
        }
      }
    } else if (event.type === "retry") {
      retryCount = event.attempt
      yield { type: "retry" as const, attempt: event.attempt, error: event.error }
    } else if (event.type === "error") {
      const errMsg = (event.error?.message || "").toLowerCase()
      if (errMsg.includes("prompt_too_long") || errMsg.includes("context_length_exceeded") || errMsg.includes("too many tokens")) {
        return { text, toolCalls: toolCallList, signal: "context_overflow" as const, messages, toolResults, usage: turnUsage, retryCount }
      }
      llmFailed = true
      yield { type: "error" as const, message: event.error?.message || "LLM stream error" }
      break
    } else if (event.type === "done") {
      turnUsage = event.usage
      break
    }
  }

  // 等待所有工具执行完成
  while (concurrencyGate.busy || toolDoneQueue.length > 0) {
    while (toolDoneQueue.length > 0) {
      const { id, result } = toolDoneQueue.shift()!
      yield { type: "tool_result" as const, id, name: toolCallList.find(t => t.id === id)?.name || "", result }
    }
    if (!concurrencyGate.busy && toolDoneQueue.length === 0) break
    await new Promise(r => setTimeout(r, 10))
  }

  while (toolDoneQueue.length > 0) {
    const { id, result } = toolDoneQueue.shift()!
    yield { type: "tool_result" as const, id, name: toolCallList.find(t => t.id === id)?.name || "", result }
  }

  if (llmFailed) {
    return { text, toolCalls: toolCallList, signal: "stop" as const, messages, toolResults, usage: turnUsage, retryCount }
  }

  // ── 将工具结果追加到消息列表 ──
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
      const resultText = result?.success ? (result.output || "") : (result?.error || result?.output || "No result")
      messages.push({
        role: "tool",
        content: [{ type: "tool-result" as const, toolCallId: tc.id, toolName: tc.name, output: resultText }],
        tool_call_id: tc.id,
      } as any)
    }

    // 持久化工具结果到 DB
    for (const tr of toolResults) {
      const tc = toolCallList.find(t => t.id === tr.id)
      if (tc) {
        appendMessage(sessionID, {
          role: "tool",
          content: tr.result.output || tr.result.error || "",
          timestamp: new Date().toISOString(),
          toolCallId: tc.id,
        })
      }
    }
  }

  return { text, toolCalls: toolCallList, signal: "continue" as const, messages, toolResults, usage: turnUsage, retryCount }
}

/* ───────── Max Mode 支持 ───────── */

export async function* runMaxModeTurn(
  input: TurnRunnerInput & {
    maxModeConfig: { n: number; candidateConfig: LLMTurnConfig; judgeConfig?: any }
  },
): AsyncGenerator<AgentEvent, TurnRunnerOutput> {
  const { messages, tools } = input
  const { n, candidateConfig, judgeConfig } = input.maxModeConfig

  const maxResult = yield* runMaxMode({
    messages,
    tools,
    config: { n, candidateConfig, judgeConfig },
  })

  if (!maxResult.text && (!maxResult.toolCalls || maxResult.toolCalls.length === 0)) {
    return { text: "", toolCalls: [], toolResults: [], messages, signal: "stop" as const, retryCount: 0 }
  }

  const toolCallsArray = (maxResult.toolCalls || [])
    .filter((tc: any) => tc.id && tc.name)
    .map((tc: any) => ({
      id: tc.id,
      type: "function" as const,
      function: { name: tc.name, arguments: tc.arguments },
    }))

  // 注入 assistant 消息
  messages.push({
    role: "assistant",
    content: [
      { type: "text", text: maxResult.text },
      ...toolCallsArray.map(tc => ({
        type: "tool-call" as const,
        toolCallId: tc.id,
        toolName: tc.function.name,
        args: JSON.parse(tc.function.arguments),
      })),
    ],
  } as any)

  await appendMessage(input.sessionID, {
    role: "assistant",
    content: maxResult.text || JSON.stringify({
      text: maxResult.text,
      tool_calls: toolCallsArray.map(tc => ({ id: tc.id, name: tc.function.name, args: tc.function.arguments })),
    }),
    timestamp: new Date().toISOString(),
  })

  // 执行工具
  const toolResults: Array<{ id: string; result: ToolResult }> = []
  if (toolCallsArray.length > 0) {
    for (const tc of toolCallsArray) {
      const permCheck = await checkToolPermission(
        { id: tc.id, name: tc.function.name, arguments: tc.function.arguments },
        input.deps,
        input.config.permissions,
        input.workspace,
        input.config.autoAcceptPermissions,
        input.config.onPermissionSave,
      )
      if (permCheck) {
        toolResults.push({ id: tc.id, result: permCheck })
      } else {
        const result = await executeTool(
          { id: tc.id, name: tc.function.name, arguments: tc.function.arguments },
          input,
        )
        toolResults.push({ id: tc.id, result })
      }
    }

    const resultMap = new Map(toolResults.map(r => [r.id, r.result]))
    for (const tc of toolCallsArray) {
      const result = resultMap.get(tc.id)
      const resultText = result?.success ? (result.output || "") : (result?.error || result?.output || "No result")
      messages.push({
        role: "tool",
        content: [{ type: "tool-result" as const, toolCallId: tc.id, toolName: tc.function.name, output: resultText }],
        tool_call_id: tc.id,
      } as any)
    }
  }

  return { text: maxResult.text, toolCalls: maxResult.toolCalls || [], toolResults, messages, signal: "continue" as const, retryCount: 0 }
}
