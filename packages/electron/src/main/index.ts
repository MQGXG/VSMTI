import { app, globalShortcut } from "electron";
import { createWindow, showMainWindow } from "../managers/window-manager";
import { createTray } from "../managers/tray-manager";
import { registerIPCHandlers } from "../ipc/handlers";
import { initLogger, patchConsole, getLogFilePath } from "../utils/logger";
import { injectShellEnv } from "../utils/shell-env";

async function initializeApp() {
  injectShellEnv();
  initLogger();
  patchConsole();
  console.log(`[Main] Logger initialized: ${getLogFilePath()}`);

  console.log("[Main] Using TS Agent Core — 零依赖启动");
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

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
});
