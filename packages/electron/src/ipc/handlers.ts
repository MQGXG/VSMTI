import { ipcMain, dialog, Notification, safeStorage } from "electron";
import { getMainWindow, minimizeWindow, toggleMaximizeWindow, hideWindow } from "../managers/window-manager";
import { registerAgentIPCHandlers } from "./index";
import { getFloatingBallManager } from "../managers/floating-ball-manager";

export function registerIPCHandlers(): void {
  registerAgentIPCHandlers();

  // 窗口控制
  ipcMain.on("window:minimize", () => minimizeWindow());
  ipcMain.on("window:maximize", () => toggleMaximizeWindow());
  ipcMain.on("window:close", () => hideWindow());

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

  // 桌面悬浮球
  ipcMain.handle("floatingBall:toggle", async (_, enabled: boolean) => {
    const manager = getFloatingBallManager();
    if (enabled) {
      await manager.create();
    } else {
      manager.destroy();
    }
    return { success: true };
  });

  ipcMain.on("floatingBall:wake", () => {
    const manager = getFloatingBallManager();
    manager.wake('ipc');
  });

  ipcMain.on("floatingBall:hide", () => {
    const manager = getFloatingBallManager();
    manager.hide('ipc');
  });

  ipcMain.handle("floatingBall:updateConfig", async (_, config: Record<string, unknown>) => {
    const manager = getFloatingBallManager();
    if (typeof config.autoHideTimeout === 'number') {
      manager.updateConfig({ autoHideTimeout: config.autoHideTimeout });
    }
    if (typeof config.shortcut === 'string') {
      manager.registerShortcut(config.shortcut);
    }
    return { success: true };
  });
}
