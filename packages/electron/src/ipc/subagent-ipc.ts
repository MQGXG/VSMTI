import { ipcMain, type WebContents } from "electron"
import { createDefaultRegistry } from "@mira/core/system/registry-init"
import { SubagentManager } from "@mira/core/orchestrate/subagent"
import { setSubagentManager } from "@mira/core/tools/orchestrate/agent-tools"
import type { AgentConfig } from "@mira/core/agent/agent"
import type { SubagentEvent } from "@mira/core/orchestrate/subagent"

const registry = createDefaultRegistry()
const subagentManager = new SubagentManager(registry, { maxParallel: 5 })
setSubagentManager(subagentManager)

/** 将子 Agent 事件转发到前端 */
function forwardSubagentEvent(sender: WebContents, event: SubagentEvent): void {
  if (!sender.isDestroyed()) {
    sender.send("agent:event", `subagent-${event.subagentId}`, {
      type: "subagent_status",
      subagentId: event.subagentId,
      status: event.type,
      description: event.info.description,
    })
  }
}

export function registerSubagentIPC(): void {
  ipcMain.handle("subagent:spawn", (event, description: string, config: AgentConfig, options?: {
    parentId?: string
    prompt?: string
    model?: string
  }) => {
    subagentManager.onEvent((evt) => forwardSubagentEvent(event.sender, evt))
    return subagentManager.spawn(description, config, options)
  })

  ipcMain.handle("subagent:wait", async (_, id: string, timeoutMs?: number) => {
    return await subagentManager.wait(id, timeoutMs)
  })

  ipcMain.handle("subagent:cancel", (_, id: string) => {
    return subagentManager.cancel(id)
  })

  ipcMain.handle("subagent:get", (_, id: string) => {
    return subagentManager.getInfo(id)
  })

  ipcMain.handle("subagent:getEvents", (_, id: string) => {
    return subagentManager.getEvents(id)
  })

  ipcMain.handle("subagent:list", (_, filter?: { parentId?: string; status?: string }) => {
    return subagentManager.list(filter as { parentId?: string; status?: any })
  })

  ipcMain.handle("subagent:listActive", () => {
    return subagentManager.listActive()
  })

  ipcMain.handle("subagent:listByParent", (_, parentId: string) => {
    return subagentManager.listByParent(parentId)
  })

  ipcMain.handle("subagent:cancelByParent", (_, parentId: string) => {
    subagentManager.cancelAllByParent(parentId)
    return true
  })

  ipcMain.handle("subagent:cancelAll", () => {
    subagentManager.cancelAll()
    return true
  })

  ipcMain.handle("subagent:setMaxParallel", (_, limit: number) => {
    // 并发限制通过环境变量 MIRA_MAX_PARALLEL_AGENTS 配置
    return true
  })

  ipcMain.handle("subagent:toText", () => {
    return subagentManager.toText()
  })
}

