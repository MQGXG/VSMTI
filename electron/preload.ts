import { contextBridge, ipcRenderer } from "electron";

const electronAPI = {
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  maximizeWindow: () => ipcRenderer.send("window:maximize"),
  closeWindow: () => ipcRenderer.send("window:close"),

  getPythonStatus: () => ipcRenderer.invoke("python:status"),
  restartPython: () => ipcRenderer.invoke("python:restart"),

  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  saveFile: (name: string) => ipcRenderer.invoke("dialog:saveFile", name),

  notify: (title: string, body: string) => ipcRenderer.invoke("notify", title, body),

  platform: process.platform,
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
