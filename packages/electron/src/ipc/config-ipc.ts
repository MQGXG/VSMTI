import { ipcMain } from "electron"
import { getConfigForRenderer, saveGlobalConfig } from "@mira/core/config/index"

export function registerConfigIPC(): void {
  ipcMain.handle("config:get", (_, workspace?: string) => {
    return getConfigForRenderer(workspace)
  })
  ipcMain.handle("config:save", (_, config: Record<string, unknown>) => {
    saveGlobalConfig(config)
  })
}

