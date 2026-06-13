import { contextBridge, ipcRenderer } from "electron";

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

  // TypeScript Agent Core IPC
  agent: {
    executeTool: (name: string, args: Record<string, unknown>) =>
      ipcRenderer.invoke("agent:executeTool", name, args),
    listTools: () => ipcRenderer.invoke("agent:listTools"),
    chat: (config: Record<string, unknown>, message: string, history: Array<{ role: string; content: string }>) =>
      ipcRenderer.invoke("agent:chat", config, message, history),
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
