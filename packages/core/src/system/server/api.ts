/**
 * Sidecar API 路由 — 将 Agent 操作暴露为 HTTP API
 * 参考 MiMo-Code 的 Sidecar 架构：Core 作为独立 HTTP 服务
 */

import { Agent, type AgentConfig, type AgentEvent, type PermissionReply } from "../../index"
import { createDefaultRegistry, defaultPermissions, PermissionSet, resolveRuntimeConfig, type PermissionRule } from "../../index"
import { DEFAULT_SYSTEM } from "../../agent/agent"
import { modeToPermissionSet, getModeConfig, getAllModes } from "../../config/modes"
import { getJsonSchema } from "../../shared/tool"
import { loadWorkspacePermissions, saveWorkspacePermission } from "../permission/store"
import { buildInstructionSystemPrompt } from "../instruction"
import { matchSkillCommand, buildSkillInvocationMessage } from "../../skill/skill-commands"
import { loadSkill } from "../../skill/skill-loader"
import { initDatabase } from "../database"
import { AgentRegistry } from "../../agent/registry"
import { logError } from "../logger"
import { taskTracker } from "../../task/tracker"
import { setParentConfig } from "../../tools/orchestrate/agent-tools"
import { setFTSProvider } from "../../tools/knowledge/memory"

// ── 初始化 ──────────────────────────────────────────

const registry = createDefaultRegistry()
const agentRegistry = new AgentRegistry()

for (const mode of getAllModes()) {
  agentRegistry.register({
    info: {
      name: mode.id,
      label: mode.label,
      description: mode.description,
      icon: mode.id === "plan" ? "search" : mode.id === "assistant" ? "brain" : mode.id === "expert" ? "zap" : mode.id === "action" ? "cpu" : "shield",
      maxIterations: mode.maxIterations,
      denyActions: mode.permissionRules.filter((r) => r.effect === "deny").map((r) => r.action),
    },
    async *run() {},
  })
}

initDatabase().catch((err) => logError("API 初始化失败", err))

// ── Agent 会话管理 ──────────────────────────────────

interface AgentSession {
  agent: Agent
  channel: string
  config: AgentConfig
  abortController: AbortController
}

const activeSessions = new Map<string, AgentSession>()

function generateChannelId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function buildPermissions(
  workspace: string,
  mode?: string,
  configOverride?: PermissionSet,
  hardRules?: PermissionRule[],
): Promise<PermissionSet> {
  const savedRules = await loadWorkspacePermissions(workspace)
  let base = defaultPermissions
  if (mode) {
    base = modeToPermissionSet(mode as any, defaultPermissions)
  }
  const configRules = configOverride?.getAll() || []
  // Permission 三明治：hardPermission 首尾各追加一次，确保硬规则不被覆盖
  const allRules = hardRules
    ? [...hardRules, ...base.getAll(), ...configRules, ...savedRules, ...hardRules]
    : [...base.getAll(), ...configRules, ...savedRules]
  return new PermissionSet(allRules)
}

function processSkillCommand(message: string): { processed: string; skillLoaded: boolean } {
  const result = matchSkillCommand(message)
  if (!result) return { processed: message, skillLoaded: false }
  if (loadSkill(result.name)) {
    const invocation = buildSkillInvocationMessage(result.name, result.rest)
    return { processed: invocation, skillLoaded: true }
  }
  return { processed: message, skillLoaded: false }
}

// ── API 处理函数 ────────────────────────────────────

export interface APIContext {
  writeEvent(data: unknown): void
  writeEnd(): void
  onAbort(callback: () => void): void
}

export async function handleStartStream(
  sessionId: string,
  message: string,
  config: Record<string, unknown>,
  ctx: APIContext,
): Promise<string> {
  const channel = generateChannelId()
  const workspace = (config.workspace as string) || process.cwd()

  await taskTracker.initialize(sessionId)

  const mergedConfig = resolveRuntimeConfig({
    provider: config.provider as string,
    model: config.model as string,
    apiKey: config.apiKey as string,
    apiUrl: config.apiUrl as string,
    headers: config.headers as Record<string, string> | undefined,
    options: config.options as Record<string, unknown> | undefined,
    mode: config.mode as string,
    workspace,
  })

  const agent = new Agent(registry, mergedConfig.apiKey, mergedConfig.apiUrl, workspace)
  // 将 FTS provider 注册到模块级单例（供 memory 工具和 HTTP 端点使用）
  const fts = agent.getFTSProvider()
  if (fts) {
    setFTSProvider(fts)
    setMemoryFTS(fts)
  }

  const { processed } = processSkillCommand(message)

  const hardRules = (config.hardPermission as any[] | undefined)?.map((r: any) => ({ action: r.action, resource: r.resource, effect: r.effect as "allow" | "deny" | "ask" } as PermissionRule))
  const permissions = config.permissions
    ? new PermissionSet((config.permissions as any[]).map((r: any) => ({ action: r.action, resource: r.resource, effect: r.effect as "allow" | "deny" | "ask" })))
    : await buildPermissions(workspace, config.mode as string, undefined, hardRules)

  const instructions = buildInstructionSystemPrompt(workspace)
  const baseSystem = (config.systemPrompt as string) || DEFAULT_SYSTEM
  const systemPrompt = instructions
    ? `[指令上下文]\n${instructions}\n\n[Agent 基础指令]\n${baseSystem}`
    : baseSystem

  const modeConfig = config.mode ? getModeConfig(config.mode as any) : null

  const effectiveConfig: AgentConfig = {
    sessionID: sessionId,
    workspace,
    model: mergedConfig.model,
    apiKey: mergedConfig.apiKey,
    apiUrl: mergedConfig.apiUrl,
    provider: mergedConfig.provider,
    headers: mergedConfig.headers,
    options: mergedConfig.options,
    systemPrompt,
    maxSteps: config.maxSteps as number || 10,
    maxContextTokens: config.maxContextTokens as number,
    permissions,
    mode: config.mode as any,
    toolAllowlist: modeConfig?.toolAllowlist,
    autoAcceptPermissions: config.autoAcceptPermissions as boolean,
    onPermissionSave: (rules) => {
      for (const rule of rules) {
        saveWorkspacePermission(workspace, rule)
      }
    },
  }

  // 将 Agent 配置注入子 Agent 工具（让 spawn_agent 继承 apiKey/model 等）
  setParentConfig(effectiveConfig)

  const abortController = new AbortController()
  const session: AgentSession = { agent, channel, config: effectiveConfig, abortController }
  activeSessions.set(channel, session)

  ctx.onAbort(() => {
    agent.abort()
    activeSessions.delete(channel)
  })

  // 在后台运行 Agent 并通过 ctx 推送事件
  runAgentInBackground(session, sessionId, processed, effectiveConfig, ctx)

  return channel
}

async function runAgentInBackground(
  session: AgentSession,
  sessionId: string,
  message: string,
  config: AgentConfig,
  ctx: APIContext,
): Promise<void> {
  const { agent } = session
  try {
    for await (const evt of agent.run(message, [], { ...config, sessionID: sessionId })) {
      ctx.writeEvent(evt)
    }
  } catch (e) {
    ctx.writeEvent({ type: "error", message: String(e) } as AgentEvent)
  } finally {
    ctx.writeEvent({ type: "finish", reason: "completed" } as AgentEvent)
    ctx.writeEnd()
    activeSessions.delete(session.channel)
  }
}

export function handlePermissionReply(channel: string, requestId: string, reply: PermissionReply): boolean {
  const session = activeSessions.get(channel)
  if (!session) return false
  session.agent.replyPermission(requestId, reply)
  return true
}

export function handleStopStream(channel: string): boolean {
  const session = activeSessions.get(channel)
  if (!session) return false
  session.agent.abort()
  session.abortController.abort()
  activeSessions.delete(channel)
  return true
}

export function handleListTools(mode?: string): Array<{ name: string; description: string; parameters: any }> {
  const modeConfig = mode ? getModeConfig(mode as any) : null
  const permissions = mode
    ? modeToPermissionSet(mode as any, defaultPermissions)
    : defaultPermissions
  const materialized = registry.materialize(permissions)
  let toolNames = Object.keys(materialized.definitions)
  if (modeConfig?.toolAllowlist && modeConfig.toolAllowlist.length > 0) {
    const allowed = new Set(modeConfig.toolAllowlist)
    toolNames = toolNames.filter((n) => allowed.has(n))
  }
  return toolNames.map((name) => {
    const def = registry.get(name)
    return {
      name,
      description: def?.description || "",
      parameters: def ? getJsonSchema(def) : { type: "object", properties: {} },
    }
  })
}

export function handleListAgents(): any[] {
  return agentRegistry.list()
}

export async function handleExecuteTool(toolName: string, args: Record<string, unknown>): Promise<any> {
  const ctx = {
    sessionID: "ipc",
    workspace: process.cwd(),
    mode: "assistant" as const,
    agent: "user",
    assistantMessageID: "direct",
    toolCallID: "direct",
  }
  return await registry.execute(toolName, args, ctx)
}

export async function handleExecuteBatch(calls: Array<{ name: string; args: Record<string, unknown> }>): Promise<any[]> {
  const ctx = {
    sessionID: "ipc",
    workspace: process.cwd(),
    mode: "assistant" as const,
    agent: "user",
    assistantMessageID: "batch",
    toolCallID: "batch",
  }
  return await Promise.all(calls.map((c) => registry.execute(c.name, c.args, ctx)))
}

// ── Memory 搜索 ──────────────────────────────────────

let memoryFTS: any = null

export function setMemoryFTS(p: any): void {
  memoryFTS = p
}

export async function handleMemorySearch(query: string, type?: string, limit?: number): Promise<{ results: string[]; error: string | null }> {
  const fts = memoryFTS
  if (!fts) return { results: [], error: "FTS not initialized" }

  const results: string[] = []
  const maxLimit = Math.min(limit || 5, 20)

  try {
    if (!type || type === "files" || type === "all") {
      const r = await fts.search(query)
      if (r) results.push(r)
    }
    if (!type || type === "memory" || type === "all") {
      const r = await fts.searchMemory(query, maxLimit)
      if (r) results.push(r)
    }
    return { results, error: null }
  } catch (err: any) {
    return { results: [], error: err.message }
  }
}

export function handleMemoryStatus(): { available: boolean; provider: string } {
  return {
    available: !!memoryFTS,
    provider: memoryFTS ? "fts5" : "none",
  }
}

export async function handleMemorySearchByProject(
  query: string,
  projectId: string,
  limit?: number,
): Promise<Array<{ content: string; source: string; sessionId: string }>> {
  const fts = memoryFTS
  if (!fts || !projectId) return []

  try {
    return await fts.searchMemoryByProject(query || "", projectId, limit || 100)
  } catch {
    return []
  }
}

export function handleGetGraphData(): { entities: Array<{ id: string; name: string; type: string; description?: string }>; relationships: Array<{ source: string; target: string; relation: string }> } {
  // DreamDistillManager 的图谱数据在 agent 实例中
  // 这里返回空结构，实际数据通过 IPC 直接获取
  return { entities: [], relationships: [] }
}
