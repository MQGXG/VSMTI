import { ipcMain, dialog, Notification, safeStorage } from "electron";
import { getMainWindow, minimizeWindow, toggleMaximizeWindow, hideWindow } from "../managers/window-manager";
import { registerAgentIPCHandlers } from "../agent-core/ipc-bridge";

export function registerIPCHandlers(): void {
  registerAgentIPCHandlers();

  // 窗口控制
  ipcMain.on("window:minimize", () => minimizeWindow());
  ipcMain.on("window:maximize", () => toggleMaximizeWindow());
  ipcMain.on("window:close", () => hideWindow());

  // Python 后端管理（固定返回未运行，由 TS Core 接管）
  ipcMain.handle("python:status", () => ({
    status: "stopped",
    port: 0,
    url: "",
    error: "",
  }));
  ipcMain.handle("python:logs", () => []);
  ipcMain.handle("python:clearLogs", () => {});
  ipcMain.handle("python:restart", async () => ({
    status: "stopped",
    port: 0,
    url: "",
    error: "TS Core 模式：Python 后端未启用",
  }));

  // 文件对话框
  ipcMain.handle("dialog:openDirectory", async () => {
    const win = getMainWindow();
    if (!win) return [];
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
    });
    return result.filePaths;
  });

  ipcMain.handle("dialog:openFile", async () => {
    const win = getMainWindow();
    if (!win) return [];
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "所有文件", extensions: ["*"] },
        { name: "文本文件", extensions: ["txt", "md", "csv", "json"] },
        { name: "代码文件", extensions: ["py", "js", "ts", "java", "cpp"] },
      ],
    });
    return result.filePaths;
  });

  ipcMain.handle("dialog:saveFile", async (_, defaultName: string) => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showSaveDialog(win, { defaultPath: defaultName });
    return result.filePath;
  });

  // 系统通知
  ipcMain.handle("notify", (_, title: string, body: string) => {
    new Notification({ title, body }).show();
  });

  // API Key 加密存储
  ipcMain.handle("safeStorage:encrypt", (_, text: string) => {
    if (!safeStorage.isEncryptionAvailable()) return "";
    if (!text) return "";
    const encrypted = safeStorage.encryptString(text);
    return encrypted.toString("base64");
  });

  ipcMain.handle("safeStorage:decrypt", (_, encrypted: string) => {
    if (!safeStorage.isEncryptionAvailable()) return "";
    if (!encrypted) return "";
    const buffer = Buffer.from(encrypted, "base64");
    return safeStorage.decryptString(buffer);
  });

  ipcMain.handle("safeStorage:isAvailable", () => safeStorage.isEncryptionAvailable());
}
