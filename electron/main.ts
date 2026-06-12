import { app, globalShortcut } from "electron";
import { PythonManager } from "./python-manager";
import { createWindow, showMainWindow } from "./managers/window-manager";
import { createTray } from "./managers/tray-manager";
import { registerIPCHandlers } from "./ipc/handlers";
import { initLogger, patchConsole, getLogFilePath } from "./utils/logger";
import { injectShellEnv } from "./utils/shell-env";

const pythonManager = new PythonManager();

async function initializeApp() {
  // 注入 shell 环境变量（解决 PATH 问题）
  injectShellEnv();

  // 初始化日志系统
  initLogger();
  patchConsole();
  console.log(`[Main] Logger initialized: ${getLogFilePath()}`);

  // 启动 Python 后端
  try {
    await pythonManager.start();
  } catch (err) {
    console.error("[Main] Python backend startup failed:", err);
  }

  // 注册 IPC 处理器
  registerIPCHandlers(pythonManager);

  // 创建窗口
  await createWindow();

  // 创建托盘
  createTray();

  // 全局快捷键
  globalShortcut.register("CommandOrControl+Shift+A", () => {
    showMainWindow();
  });

  // macOS: 点击 dock 图标重新显示窗口
  app.on("activate", async () => {
    const { BrowserWindow } = require("electron");
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
}

app.whenReady().then(initializeApp);

app.on("before-quit", async () => {
  await pythonManager.stop();
  globalShortcut.unregisterAll();
});
