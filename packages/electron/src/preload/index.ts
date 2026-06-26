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

    /** Question — Agent 向用户提问 */
    question: {
      answer: (questionId: string, answer: string) => ipcRenderer.invoke("question:answer", questionId, answer),
      listPending: () => ipcRenderer.invoke("question:listPending"),
    },

    /** Task Tracker */
    task: {
      create: (summary: string, parentId?: string) => ipcRenderer.invoke("task:create", summary, parentId),
      updateStatus: (taskId: string, status: string) => ipcRenderer.invoke("task:updateStatus", taskId, status),
      updateSummary: (taskId: string, summary: string) => ipcRenderer.invoke("task:updateSummary", taskId, summary),
      addNote: (taskId: string, note: string) => ipcRenderer.invoke("task:addNote", taskId, note),
      get: (taskId: string) => ipcRenderer.invoke("task:get", taskId),
      list: (status?: string) => ipcRenderer.invoke("task:list", status),
      listActive: () => ipcRenderer.invoke("task:listActive"),
      toText: () => ipcRenderer.invoke("task:toText"),
    },

    /** Subagent Manager */
    subagent: {
      spawn: (description: string, options?: { parentId?: string; prompt?: string }) =>
        ipcRenderer.invoke("subagent:spawn", description, options),
      wait: (id: string, timeoutMs?: number) => ipcRenderer.invoke("subagent:wait", id, timeoutMs),
      cancel: (id: string) => ipcRenderer.invoke("subagent:cancel", id),
      get: (id: string) => ipcRenderer.invoke("subagent:get", id),
      list: (filter?: { parentId?: string; status?: string }) => ipcRenderer.invoke("subagent:list", filter),
      listActive: () => ipcRenderer.invoke("subagent:listActive"),
      cancelAll: () => ipcRenderer.invoke("subagent:cancelAll"),
      toText: () => ipcRenderer.invoke("subagent:toText"),
    },

    /** Goal Manager */
    goal: {
      set: (description: string, timeoutMs?: number) => ipcRenderer.invoke("goal:set", description, timeoutMs),
      getActive: () => ipcRenderer.invoke("goal:getActive"),
      list: () => ipcRenderer.invoke("goal:list"),
      cancel: () => ipcRenderer.invoke("goal:cancel"),
      toText: () => ipcRenderer.invoke("goal:toText"),
      load: (sessionID: string) => ipcRenderer.invoke("goal:load", sessionID),
      save: () => ipcRenderer.invoke("goal:save"),
    },

    /** Dream/Distill Manager */
    dreamDistill: {
      dream: (conversationHistory: any[], config: { apiKey: string; apiUrl: string; model: string; provider: string }) =>
        ipcRenderer.invoke("dreamDistill:dream", conversationHistory, config),
      distill: (conversationHistory: any[], config: { apiKey: string; apiUrl: string; model: string; provider: string }) =>
        ipcRenderer.invoke("dreamDistill:distill", conversationHistory, config),
      getKnowledge: () => ipcRenderer.invoke("dreamDistill:getKnowledge"),
      toText: () => ipcRenderer.invoke("dreamDistill:toText"),
    },

    /** Compose Mode */
    compose: {
      start: (spec: string) => ipcRenderer.invoke("compose:start", spec),
      getState: () => ipcRenderer.invoke("compose:getState"),
      getCurrentSkill: () => ipcRenderer.invoke("compose:getCurrentSkill"),
      advance: () => ipcRenderer.invoke("compose:advance"),
      goTo: (phase: string) => ipcRenderer.invoke("compose:goTo", phase),
      update: (updates: any) => ipcRenderer.invoke("compose:update", updates),
      addCodeFile: (filePath: string) => ipcRenderer.invoke("compose:addCodeFile", filePath),
      addReviewComment: (comment: string) => ipcRenderer.invoke("compose:addReviewComment", comment),
      addTestResult: (result: string) => ipcRenderer.invoke("compose:addTestResult", result),
      addDebugLog: (log: string) => ipcRenderer.invoke("compose:addDebugLog", log),
      setVerificationPassed: (passed: boolean) => ipcRenderer.invoke("compose:setVerificationPassed", passed),
      complete: () => ipcRenderer.invoke("compose:complete"),
      cancel: () => ipcRenderer.invoke("compose:cancel"),
      getHistory: () => ipcRenderer.invoke("compose:getHistory"),
      toText: () => ipcRenderer.invoke("compose:toText"),
      getSkills: () => ipcRenderer.invoke("compose:getSkills"),
      getPhaseOrder: () => ipcRenderer.invoke("compose:getPhaseOrder"),
    },

    /** 监听 Agent 事件 */
    onEvent: (channel: string, callback: (event: any) => void) => {
      const handler = (_event: IpcRendererEvent, evtChannel: string, ...args: any[]) => {
        if (evtChannel === channel) callback(args[0])
      }
      ipcRenderer.on("agent:event", handler)
      return () => ipcRenderer.removeListener("agent:event", handler)
    },
  },

  /** 记忆系统 */
  memory: {
    search: (query: string, type?: string, limit?: number) =>
      ipcRenderer.invoke("memory:search", query, type, limit),
    status: () => ipcRenderer.invoke("memory:status"),
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
