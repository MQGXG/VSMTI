import { ipcMain } from "electron"
import { GoalJudge } from "@mira/core/goal-judge"
import { initDatabase } from "@mira/core/database"

const goalJudge = new GoalJudge()

/** 初始化（应用启动时调用） */
export async function initGoalIPC(): Promise<void> {
  await initDatabase()
}

export function registerGoalIPC(): void {
  ipcMain.handle("goal:set", (_, description: string, timeoutMs?: number) => {
    return goalJudge.setGoal(description, timeoutMs)
  })
  ipcMain.handle("goal:getActive", () => {
    return goalJudge.getActiveGoal()
  })
  ipcMain.handle("goal:list", () => {
    return goalJudge.getAllGoals()
  })
  ipcMain.handle("goal:cancel", () => {
    return goalJudge.cancelGoal()
  })
  ipcMain.handle("goal:toText", () => {
    return goalJudge.toText()
  })
  ipcMain.handle("goal:load", (_, sessionID: string) => {
    return goalJudge.load(sessionID).then(() => goalJudge.getAllGoals())
  })
  ipcMain.handle("goal:save", () => {
    return goalJudge.save()
  })
}
