import { Effect } from "effect"
import { ipcMain } from "electron"
import { createDefaultRegistry, defaultPermissions, PermissionSet, Agent, AppLayer, resolveRuntimeConfig } from "../agent-core/index"
import type { AgentConfig, AgentEvent, PermissionReply } from "../agent-core/agent"
import { DEFAULT_SYSTEM } from "../agent-core/agent"
import { modeToPermissionSet, getModeConfig } from "../agent-core/modes"
import { getJsonSchema } from "../agent-core/tool"
import { loadWorkspacePermissions, saveWorkspacePermission } from "../agent-core/permission-store"
import { buildInstructionSystemPrompt } from "../agent-core/instruction-context"
import { matchSkillCommand, buildSkillInvocationMessage } from "../agent-core/skill/skill-commands"
import { loadSkill } from "../agent-core/skill/skill-loader"
import { initDatabase } from "../agent-core/database"
import { AgentRegistry } from "../agent-core/agent/registry"
import { getAllModes } from "../agent-core/modes"
import { logError } from "../agent-core/logger"
import { taskTracker } from "../agent-core/task-tracker"

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

async function buildPermissions(workspace: string, mode?: string, configOverride?: PermissionSet): Promise<PermissionSet> {
  const savedRules = await loadWorkspacePermissions(workspace)
  let base = defaultPermissions
  if (mode) {
    base = modeToPermissionSet(mode as any, defaultPermissions)
  }
  if (savedRules.length === 0 && !configOverride) return base
  const allRules = [...base.getAll(), ...(configOverride?.getAll() || []), ...savedRules]
  return new PermissionSet(allRules)
}

interface AgentSession {
  agent: Agent
  channel: string
  sender: Electron.WebContents
  config: AgentConfig
}

const activeSessions = new Map<string, AgentSession>()

function generateChannelId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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

async function runAgentInBackground(
  session: AgentSession,
  sessionId: string,
  message: string,
  config: AgentConfig,
): Promise<void> {
  const { agent, channel, sender } = session
  try {
    for await (const evt of agent.run(message, [], { ...config, sessionID: sessionId })) {
      if (sender.isDestroyed()) break
      console.log('[IPC] sending event:', evt.type, channel)
      sender.send("agent:event", channel, evt)
    }
  } catch (e) {
    if (!sender.isDestroyed()) {
      sender.send("agent:event", channel, { type: "error", message: String(e) })
    }
  } finally {
    if (!sender.isDestroyed()) {
      sender.send("agent:event", channel, { type: "finish", reason: "completed" })
    }
    activeSessions.delete(channel)
  }
}

export function registerAgentIPC(): void {
  Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.promise(() => initDatabase())
    }).pipe(Effect.provide(AppLayer)),
  ).catch((err) => logError("Agent 初始化失败", err))

  ipcMain.handle("agent:executeTool", async (_, toolName: string, args: Record<string, unknown>) => {
    const ctx = {
      sessionID: "ipc",
      workspace: process.cwd(),
      mode: "assistant",
      agent: "user",
      assistantMessageID: "direct",
      toolCallID: "direct",
    }
    return await registry.execute(toolName, args, ctx)
  })

  ipcMain.handle("agent:listAgents", () => {
    return agentRegistry.list()
  })

  ipcMain.handle("agent:listTools", (_, mode?: string) => {
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
  })

  ipcMain.handle("agent:executeBatch", async (_, calls: Array<{ name: string; args: Record<string, unknown> }>) => {
    const ctx = {
      sessionID: "ipc",
      workspace: process.cwd(),
      mode: "assistant",
      agent: "user",
      assistantMessageID: "batch",
      toolCallID: "batch",
    }
    const results = await Promise.all(calls.map((c) => registry.execute(c.name, c.args, ctx)))
    return results
  })

  ipcMain.handle("agent:startStream", async (event, sessionId: string, message: string, config: AgentConfig) => {
    const channel = generateChannelId()
    const workspace = config.workspace || process.cwd()

    await taskTracker.initialize(sessionId)

    const mergedConfig = resolveRuntimeConfig({
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
      headers: config.headers,
      options: config.options,
      mode: config.mode,
      workspace,
    })
    config.apiKey = mergedConfig.apiKey
    config.apiUrl = mergedConfig.apiUrl
    config.provider = mergedConfig.provider
    config.model = mergedConfig.model

    const agent = new Agent(registry, config.apiKey, config.apiUrl, workspace)

    const { processed } = processSkillCommand(message)
    const effectiveMessage = processed

    const permissions = config.permissions || (await buildPermissions(workspace, config.mode))

    const instructions = buildInstructionSystemPrompt(workspace)
    const baseSystem = config.systemPrompt || DEFAULT_SYSTEM
    const systemPrompt = instructions
      ? `[指令上下文]\n${instructions}\n\n[Agent 基础指令]\n${baseSystem}`
      : baseSystem

    const modeConfig = config.mode ? getModeConfig(config.mode as any) : null
    const effectiveConfig: AgentConfig = {
      ...config,
      sessionID: sessionId,
      systemPrompt,
      permissions,
      toolAllowlist: modeConfig?.toolAllowlist,
      onPermissionSave: (rules) => {
        for (const rule of rules) {
          saveWorkspacePermission(workspace, rule)
        }
      },
    }

    const session: AgentSession = { agent, channel, sender: event.sender, config: effectiveConfig }
    activeSessions.set(channel, session)

    runAgentInBackground(session, sessionId, effectiveMessage, effectiveConfig)

    return channel
  })

  ipcMain.handle("agent:replyPermission", (_, channel: string, requestId: string, reply: PermissionReply) => {
    const session = activeSessions.get(channel)
    if (!session) throw new Error(`Session not found: ${channel}`)
    session.agent.replyPermission(requestId, reply)
  })

  ipcMain.handle("agent:stopStream", (_, channel: string) => {
    const session = activeSessions.get(channel)
    if (session) {
      session.agent.abort()
      activeSessions.delete(channel)
    }
  })

  /** @deprecated 使用 agent:startStream 替代 */
  ipcMain.handle("run-agent-stream", async (_, sessionId: string, message: string, config: AgentConfig) => {
    const workspace = config.workspace || process.cwd()
    const agent = new Agent(registry, config.apiKey, config.apiUrl, workspace)
    const { processed } = processSkillCommand(message)
    const permissions = config.permissions || (await buildPermissions(workspace, config.mode))
    const instructions = buildInstructionSystemPrompt(workspace)
    const baseSystem = config.systemPrompt || DEFAULT_SYSTEM
    const systemPrompt = instructions
      ? `[指令上下文]\n${instructions}\n\n[Agent 基础指令]\n${baseSystem}`
      : baseSystem
    const effectiveConfig: AgentConfig = {
      ...config,
      sessionID: sessionId,
      systemPrompt,
      permissions,
      onPermissionSave: (rules) => {
        for (const rule of rules) {
          saveWorkspacePermission(workspace, rule)
        }
      },
    }
    const events: AgentEvent[] = []
    try {
      for await (const evt of agent.run(processed, [], effectiveConfig)) {
        events.push(evt)
        if (evt.type === "permission_request") {
          break
        }
      }
    } catch (e) {
      events.push({ type: "error", message: String(e) })
    }
    return events
  })

  /** @deprecated 使用 agent:startStream 替代 */
  ipcMain.handle("agent:chat", async (_, config: AgentConfig, message: string, history: Array<{ role: string; content: string }>) => {
    const agent = new Agent(registry, config.apiKey, config.apiUrl, config.workspace || process.cwd())
    const events: AgentEvent[] = []
    try {
      for await (const evt of agent.run(message, history as any, config)) {
        events.push(evt)
      }
    } catch (e) {
      events.push({ type: "error", message: String(e) })
    }
    return events
  })
}
