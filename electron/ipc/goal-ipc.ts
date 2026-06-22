import { ipcMain } from "electron"
import { GoalManager } from "../agent-core/goal-manager"

const goalManager = new GoalManager()

export function registerGoalIPC(): void {
  ipcMain.handle("goal:set", (_, description: string) => {
    return goalManager.setGoal(description)
  })
  ipcMain.handle("goal:getActive", () => {
    return goalManager.getActiveGoal()
  })
  ipcMain.handle("goal:list", () => {
    return goalManager.getAllGoals()
  })
  ipcMain.handle("goal:cancel", () => {
    return goalManager.cancelGoal()
  })
  ipcMain.handle("goal:toText", () => {
    return goalManager.toText()
  })
}
