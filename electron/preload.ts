import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

const electronAPI = {
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  maximizeWindow: () => ipcRenderer.send("window:maximize"),
  closeWindow: () => ipcRenderer.send("window:close"),

  getPythonStatus: () => ipcRenderer.invoke("python:status"),
  getPythonLogs: () => ipcRenderer.invoke("python:logs"),
  clearPythonLogs: () => ipcRenderer.invoke("python:clearLogs"),
  restartPython: () => ipcRenderer.invoke("python:restart"),

  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  saveFile: (name: string) => ipcRenderer.invoke("dialog:saveFile", name),

  notify: (title: string, body: string) => ipcRenderer.invoke("notify", title, body),

  encryptApiKey: (text: string) => ipcRenderer.invoke("safeStorage:encrypt", text),
  decryptApiKey: (encrypted: string) => ipcRenderer.invoke("safeStorage:decrypt", encrypted),
  isEncryptionAvailable: () => ipcRenderer.invoke("safeStorage:isAvailable"),

  platform: process.platform,

  // 配置系统（JSON 文件 + 环境变量）
  config: {
    get: (workspace?: string) => ipcRenderer.invoke("config:get", workspace),
    save: (config: Record<string, unknown>) => ipcRenderer.invoke("config:save", config),
  },

  // TS Core 会话/项目
  ts: {
    listProjects: () => ipcRenderer.invoke("ts:listProjects"),
    createProject: (name: string, workspace: string) => ipcRenderer.invoke("ts:createProject", name, workspace),
    deleteProject: (projectId: string) => ipcRenderer.invoke("ts:deleteProject", projectId),
    createSession: (projectId: string, title?: string) => ipcRenderer.invoke("ts:createSession", projectId, title),
    listSessions: (projectId?: string) => ipcRenderer.invoke("ts:listSessions", projectId),
    getSessionMessages: (sessionId: string) => ipcRenderer.invoke("ts:getSessionMessages", sessionId),
    deleteSession: (sessionId: string) => ipcRenderer.invoke("ts:deleteSession", sessionId),
    searchMessages: (query: string) => ipcRenderer.invoke("ts:searchMessages", query),
  },

  // TypeScript Agent Core IPC
  agent: {
    executeTool: (name: string, args: Record<string, unknown>) =>
      ipcRenderer.invoke("agent:executeTool", name, args),
    listTools: () => ipcRenderer.invoke("agent:listTools"),
    listAgents: () => ipcRenderer.invoke("agent:listAgents"),
    chat: (config: Record<string, unknown>, message: string, history: Array<{ role: string; content: string }>) =>
      ipcRenderer.invoke("agent:chat", config, message, history),
    runAgentStream: (sessionId: string, message: string, config: Record<string, unknown>) =>
      ipcRenderer.invoke("run-agent-stream", sessionId, message, config),

    /** 实时流式 Agent（支持交互式权限确认） */
    startStream: (sessionId: string, message: string, config: Record<string, unknown>) =>
      ipcRenderer.invoke("agent:startStream", sessionId, message, config),

    /** 回复权限请求 */
    replyPermission: (channel: string, requestId: string, reply: "allow" | "deny" | "always") =>
      ipcRenderer.invoke("agent:replyPermission", channel, requestId, reply),

    /** 停止 Agent 流 */
    stopStream: (channel: string) => ipcRenderer.invoke("agent:stopStream", channel),

    /** 列出可用 Skill */
    listSkills: () => ipcRenderer.invoke("skill:listSkills"),

    /** 监听 Agent 事件 */
    onEvent: (channel: string, callback: (event: any) => void) => {
      const handler = (_event: IpcRendererEvent, evtChannel: string, ...args: any[]) => {
        if (evtChannel === channel) callback(args[0])
      }
      ipcRenderer.on("agent:event", handler)
      return () => ipcRenderer.removeListener("agent:event", handler)
    },
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
