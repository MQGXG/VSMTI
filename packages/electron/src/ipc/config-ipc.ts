import { ipcMain } from "electron"
import { getConfigForRenderer, saveGlobalConfig } from "@mira/core/config/index"
import { ProviderCatalog } from "@mira/core/llm/provider-catalog"

export function registerConfigIPC(): void {
  ipcMain.handle("config:get", (_, workspace?: string) => {
    return getConfigForRenderer(workspace)
  })
  ipcMain.handle("config:save", (_, config: Record<string, unknown>) => {
    saveGlobalConfig(config)
  })
  ipcMain.handle("config:getProviderCatalog", () => {
    if (!ProviderCatalog.isInitialized()) ProviderCatalog.registerBuiltins()
    return ProviderCatalog.getCatalogForUI()
  })
}

