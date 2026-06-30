import { ipcMain } from "electron"
import { taskTracker } from "@mira/core/task/tracker"

export function registerTaskIPC(): void {
  ipcMain.handle("task:create", (_, summary: string, parentId?: string) => {
    return taskTracker.create(summary, parentId)
  })
  ipcMain.handle("task:updateStatus", (_, taskId: string, status: string) => {
    return taskTracker.updateStatus(taskId, status as any)
  })
  ipcMain.handle("task:updateSummary", (_, taskId: string, summary: string) => {
    return taskTracker.updateSummary(taskId, summary)
  })
  ipcMain.handle("task:addNote", (_, taskId: string, note: string) => {
    return taskTracker.addNote(taskId, note)
  })
  ipcMain.handle("task:get", (_, taskId: string) => {
    return taskTracker.getTask(taskId)
  })
  ipcMain.handle("task:list", (_, status?: string) => {
    if (status) {
      return taskTracker.getAllTasks().filter((t) => t.status === status)
    }
    return taskTracker.getAllTasks()
  })
  ipcMain.handle("task:listActive", () => {
    return taskTracker.getActiveTasks()
  })
  ipcMain.handle("task:toText", () => {
    return taskTracker.toText()
  })
}

