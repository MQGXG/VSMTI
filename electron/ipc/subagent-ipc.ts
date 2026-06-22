import { ipcMain } from "electron"
import type { AgentConfig } from "../agent-core/agent"

let subagentManager: any = null

function getSubagentManager() {
  if (!subagentManager) {
    const { SubagentManager } = require("../agent-core/subagent-manager")
    const { createDefaultRegistry } = require("../agent-core/registry-init")
    subagentManager = new SubagentManager(createDefaultRegistry())
  }
  return subagentManager
}

export function registerSubagentIPC(): void {
  ipcMain.handle("subagent:spawn", async (_, description: string, options?: { parentId?: string; prompt?: string }) => {
    const config: AgentConfig = {
      sessionID: "subagent",
      workspace: process.cwd(),
      model: "gpt-4o",
      apiKey: "",
      apiUrl: "",
    }
    return await getSubagentManager().spawn(description, config, options)
  })
  ipcMain.handle("subagent:wait", async (_, id: string, timeoutMs?: number) => {
    return await getSubagentManager().wait(id, timeoutMs)
  })
  ipcMain.handle("subagent:cancel", (_, id: string) => {
    return getSubagentManager().cancel(id)
  })
  ipcMain.handle("subagent:get", (_, id: string) => {
    return getSubagentManager().getInfo(id)
  })
  ipcMain.handle("subagent:list", (_, filter?: { parentId?: string; status?: string }) => {
    return getSubagentManager().list(filter as any)
  })
  ipcMain.handle("subagent:listActive", () => {
    return getSubagentManager().listActive()
  })
  ipcMain.handle("subagent:cancelAll", () => {
    getSubagentManager().cancelAll()
    return true
  })
  ipcMain.handle("subagent:toText", () => {
    return getSubagentManager().toText()
  })
}
