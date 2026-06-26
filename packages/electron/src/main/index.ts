import { app, globalShortcut } from "electron";
import { createWindow, showMainWindow } from "../managers/window-manager";
import { createTray } from "../managers/tray-manager";
import { registerIPCHandlers } from "../ipc/handlers";
import { startSidecar, stopSidecar } from "../ipc/sidecar-bridge";
import { initLogger, patchConsole, getLogFilePath } from "../utils/logger";
import { injectShellEnv } from "../utils/shell-env";
import { initPlatformPaths } from "@mira/core";

async function initializeApp() {
  initPlatformPaths({
    userData: app.getPath("userData"),
    home: app.getPath("home"),
  })
  injectShellEnv();
  initLogger();
  patchConsole();
  console.log(`[Main] Logger initialized: ${getLogFilePath()}`);

  // 启动 Sidecar Core 服务（独立 HTTP 进程）
  console.log("[Main] Starting Core Sidecar server...");
  await startSidecar(0);
  console.log("[Main] Core Sidecar server ready");

  registerIPCHandlers();

  await createWindow();
  createTray();

  globalShortcut.register("CommandOrControl+Shift+A", () => {
    showMainWindow();
  });

  app.on("activate", async () => {
    const { BrowserWindow } = require("electron");
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
}

app.whenReady().then(initializeApp);

app.on("before-quit", async () => {
  globalShortcut.unregisterAll();
  await stopSidecar();
});
