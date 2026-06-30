import { ipcMain } from "electron"
import { listProjects, createProject, updateProject, deleteProjectById, createSession, listSessions, getSessionMessages, deleteSessionById, searchMessages } from "@mira/core/session/manager"

export function registerSessionIPC(): void {
  ipcMain.handle("ts:listProjects", () => listProjects())
  ipcMain.handle("ts:createProject", (_, name: string, workspace: string) => createProject(name, workspace))
  ipcMain.handle("ts:updateProject", (_, projectId: string, data: { name?: string; workspace_path?: string }) => updateProject(projectId, data))
  ipcMain.handle("ts:deleteProject", (_, projectId: string) => deleteProjectById(projectId))
  ipcMain.handle("ts:createSession", (_, projectId: string, title?: string) => createSession(projectId, title))
  ipcMain.handle("ts:listSessions", (_, projectId?: string) => listSessions(projectId))
  ipcMain.handle("ts:getSessionMessages", (_, sessionId: string) => getSessionMessages(sessionId))
  ipcMain.handle("ts:deleteSession", (_, sessionId: string) => deleteSessionById(sessionId))
  ipcMain.handle("ts:searchMessages", (_, query: string) => searchMessages(query))
}

