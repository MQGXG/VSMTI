import { ipcMain } from "electron"
import { getServerManager } from "./sidecar-bridge"

export function registerMemoryIPC(): void {
  ipcMain.handle("memory:search", async (_, query: string, type?: string, limit?: number) => {
    const sm = getServerManager()
    if (!sm || !sm.running) return { results: [], error: "Sidecar not running" }
    try {
      return await sm.request("POST", "/api/memory/search", { query, type, limit })
    } catch (err: any) {
      return { results: [], error: err.message }
    }
  })

  ipcMain.handle("memory:status", async () => {
    const sm = getServerManager()
    if (!sm || !sm.running) return { available: false, provider: "none" }
    try {
      return await sm.request("GET", "/api/memory/status")
    } catch {
      return { available: false, provider: "none", error: "Sidecar unavailable" }
    }
  })
}
