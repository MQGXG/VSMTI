/**
 * IPC 桥接 — 将 Agent Core 暴露给渲染进程
 */

import { ipcMain } from "electron"
import { createDefaultRegistry, defaultPermissions, Agent } from "./index"
import type { AgentConfig, AgentEvent } from "./agent"

const registry = createDefaultRegistry()

export function registerAgentIPCHandlers(): void {
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
    return materialized.definitions.map((t: any) => ({
      name: t.function?.name,
      description: t.function?.description,
      parameters: t.function?.parameters,
    }))
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

  // Agent 流式消息 → 返回事件数组（Phase 1 简化版，Phase 5 迁移 MessageChannel）
  ipcMain.handle("run-agent-stream", async (_, sessionId: string, message: string, config: AgentConfig) => {
    const agent = new Agent(registry)
    const events: AgentEvent[] = []
    try {
      for await (const evt of agent.run(message, [], { ...config, sessionID: sessionId })) {
        events.push(evt)
      }
    } catch (e) {
      events.push({ type: "error", message: String(e) })
    }
    return events
  })

  // 保留旧版 chat handler 以兼容现有调用
  ipcMain.handle("agent:chat", async (_, config: AgentConfig, message: string, history: Array<{ role: string; content: string }>) => {
    const agent = new Agent(registry)
    const events: AgentEvent[] = []
    try {
      for await (const evt of agent.run(message, history, config)) {
        events.push(evt)
      }
    } catch (e) {
      events.push({ type: "error", message: String(e) })
    }
    return events
  })
}
