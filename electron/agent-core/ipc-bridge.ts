/**
 * IPC 桥接 — 将 Agent Core 暴露给渲染进程
 * 支持实时事件流（用于权限请求/问题等交互式流程）
 */

import { Effect } from "effect"
import { ipcMain, BrowserWindow } from "electron"
import { createDefaultRegistry, defaultPermissions, PermissionSet, Agent, AppLayer, getConfigForRenderer, resolveRuntimeConfig, saveGlobalConfig } from "./index"
import type { AgentConfig, AgentEvent, PermissionReply } from "./agent"
import { DEFAULT_SYSTEM } from "./agent"
import { modeToPermissionSet } from "./modes"
import { getJsonSchema } from "./tool"
import { loadWorkspacePermissions, saveWorkspacePermission } from "./permission-store"
import { buildInstructionSystemPrompt } from "./instruction-context"
import { matchSkillCommand, buildSkillInvocationMessage } from "./skill/skill-commands"
import { scanSkills, loadSkill } from "./skill/skill-loader"
import { cronScheduler } from "./cron-scheduler"
import { setupDefaultHooks } from "./hooks-setup"
import { initDatabase } from "./database"
import { listProjects, createProject, deleteProjectById, createSession, listSessions, getSessionMessages, deleteSessionById, searchMessages } from "./session-manager"

const registry = createDefaultRegistry()

/** 合并默认权限 + 模式限制 + 已保存的持久化规则 */
async function buildPermissions(workspace: string, mode?: string, configOverride?: PermissionSet): Promise<PermissionSet> {
  const savedRules = await loadWorkspacePermissions(workspace)

  let base = defaultPermissions
  if (mode) {
    base = modeToPermissionSet(mode as any, defaultPermissions)
  }

  if (savedRules.length === 0 && !configOverride) return base

  const allRules = [...savedRules, ...(configOverride?.getAll() || []), ...base.getAll()]
  return new PermissionSet(allRules)
}

/** 每个 agent 会话的实时连接上下文 */
interface AgentSession {
  agent: Agent
  channel: string
  sender: Electron.WebContents
  config: AgentConfig
}

const activeSessions = new Map<string, AgentSession>()

/** 生成唯一通道 ID */
function generateChannelId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 处理 slash 命令注入 — 构建 skill invocation message */
function processSkillCommand(message: string): { processed: string; skillLoaded: boolean } {
  const result = matchSkillCommand(message)
  if (!result) return { processed: message, skillLoaded: false }

  // 尝试加载 skill
  if (loadSkill(result.name)) {
    const invocation = buildSkillInvocationMessage(result.name, result.rest)
    return { processed: invocation, skillLoaded: true }
  }

  return { processed: message, skillLoaded: false }
}

export function registerAgentIPCHandlers(): void {
  // 后台异步初始化（不影响 IPC handler 注册）
  Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.promise(() => initDatabase())
    }).pipe(Effect.provide(AppLayer)),
  ).catch((err) => console.error("Agent 初始化失败:", err))

  // 注册默认钩子
  setupDefaultHooks()
  // 启动 Cron 调度器
  cronScheduler.start()

  // --- TS Core 会话/项目管理 (替代 Python API) ---
  ipcMain.handle("ts:listProjects", () => listProjects())
  ipcMain.handle("ts:createProject", (_, name: string, workspace: string) => createProject(name, workspace))
  ipcMain.handle("ts:deleteProject", (_, projectId: string) => deleteProjectById(projectId))
  ipcMain.handle("ts:createSession", (_, projectId: string, title?: string) => createSession(projectId, title))
  ipcMain.handle("ts:listSessions", (_, projectId?: string) => listSessions(projectId))
  ipcMain.handle("ts:getSessionMessages", (_, sessionId: string) => getSessionMessages(sessionId))
  ipcMain.handle("ts:deleteSession", (_, sessionId: string) => deleteSessionById(sessionId))
  ipcMain.handle("ts:searchMessages", (_, query: string) => searchMessages(query))

  // ─── 配置系统 ─────────────────────────────────────────────
  ipcMain.handle("config:get", (_, workspace?: string) => {
    return getConfigForRenderer(workspace)
  })
  ipcMain.handle("config:save", (_, config: Record<string, unknown>) => {
    saveGlobalConfig(config)
  })

  // 列出所有可用 Skill
  ipcMain.handle("skill:listSkills", () => {
    return scanSkills().map((s) => ({
      name: s.name,
      description: s.description,
      category: s.category,
    }))
  })
  // 执行工具（直接调用，不走 LLM）
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

  // 列出所有可用工具（含 Schema）
  ipcMain.handle("agent:listTools", () => {
    const materialized = registry.materialize(defaultPermissions)
    return Object.keys(materialized.definitions).map((name) => {
      const def = registry.get(name)
      return {
        name,
        description: def?.description || "",
        parameters: def ? getJsonSchema(def) : { type: "object", properties: {} },
      }
    })
  })

  // 批量执行多个工具（并发）
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

  // 启动实时 Agent 流 — 通过 channel 发送事件，支持交互式权限回复
  ipcMain.handle("agent:startStream", async (event, sessionId: string, message: string, config: AgentConfig) => {
    const channel = generateChannelId()
    const workspace = config.workspace || process.cwd()

    // 合并文件/env 配置：IPC 配置优先，文件/env 配置填充空缺
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

    // 处理 slash 命令
    const { processed } = processSkillCommand(message)
    const effectiveMessage = processed

    // 构建权限：持久化规则 + 模式限制 + 调用方权限覆盖
    const permissions = config.permissions || (await buildPermissions(workspace, config.mode))

    // 构建系统提示：基础 prompt + 指令上下文
    const instructions = buildInstructionSystemPrompt(workspace)
    const baseSystem = config.systemPrompt || DEFAULT_SYSTEM
    const systemPrompt = instructions
      ? `[指令上下文]\n${instructions}\n\n[Agent 基础指令]\n${baseSystem}`
      : baseSystem

    // 准备完整配置：注入合并后的权限和持久化回调
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

    const session: AgentSession = { agent, channel, sender: event.sender, config: effectiveConfig }
    activeSessions.set(channel, session)

    // 在后台运行 generator，事件通过 channel 发送
    runAgentInBackground(session, sessionId, effectiveMessage, effectiveConfig)

    return channel
  })

  // 回复权限请求
  ipcMain.handle("agent:replyPermission", (_, channel: string, requestId: string, reply: PermissionReply) => {
    const session = activeSessions.get(channel)
    if (!session) throw new Error(`Session not found: ${channel}`)
    session.agent.replyPermission(requestId, reply)
  })

  // 停止 Agent 流（中断当前执行）
  ipcMain.handle("agent:stopStream", (_, channel: string) => {
    const session = activeSessions.get(channel)
    if (session) {
      session.agent.abort()
      activeSessions.delete(channel)
    }
  })

  // 向后兼容：旧版流式消息 → 返回事件数组（支持非交互场景）
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
        // 如果遇到交互事件，无法继续（没有前端回复），直接返回
        if (evt.type === "permission_request") {
          break
        }
      }
    } catch (e) {
      events.push({ type: "error", message: String(e) })
    }
    return events
  })

  // 保留旧版 chat handler 以兼容现有调用
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

/** 在后台运行 Agent generator，通过 IPC channel 实时发送事件 */
async function runAgentInBackground(
  session: AgentSession,
  sessionId: string,
  message: string,
  config: AgentConfig,
): Promise<void> {
  const { agent, channel, sender } = session

  try {
    let eventCount = 0
    for await (const evt of agent.run(message, [], { ...config, sessionID: sessionId })) {
      eventCount++
      if (sender.isDestroyed()) break

      console.log('[IPC] sending event:', evt.type, channel)
      sender.send("agent:event", channel, evt)

      // 如果遇到交互事件（权限请求），暂停并等待前端回复
      if (evt.type === "permission_request") {
        // 等待 replyPermission 被调用 — agent.run 内部已通过 Promise 暂停
        // 这里的 for-await 循环自然暂停在 yield 位置
        // replyPermission 会 resolve pending Promise，让 generator 继续
      }
    }
  } catch (e) {
    if (!sender.isDestroyed()) {
      sender.send("agent:event", channel, { type: "error", message: String(e) })
    }
  } finally {
    // 发送完成事件
    if (!sender.isDestroyed()) {
      sender.send("agent:event", channel, { type: "finish", reason: "completed" })
    }
    activeSessions.delete(channel)
  }
}
