import { ipcMain } from "electron"
import { DreamDistillManager } from "../agent-core/dream-distill"

const dreamDistillManager = new DreamDistillManager()

export function registerDreamIPC(): void {
  ipcMain.handle("dreamDistill:dream", async (_, conversationHistory: any[], config: { apiKey: string; apiUrl: string; model: string; provider: string }) => {
    await dreamDistillManager.initialize(config.apiUrl || process.cwd())
    return await dreamDistillManager.dream(conversationHistory, config)
  })
  ipcMain.handle("dreamDistill:distill", async (_, conversationHistory: any[], config: { apiKey: string; apiUrl: string; model: string; provider: string }) => {
    await dreamDistillManager.initialize(config.apiUrl || process.cwd())
    return await dreamDistillManager.distill(conversationHistory, config)
  })
  ipcMain.handle("dreamDistill:getKnowledge", () => {
    return dreamDistillManager.getKnowledge()
  })
  ipcMain.handle("dreamDistill:toText", () => {
    return dreamDistillManager.toText()
  })
}
