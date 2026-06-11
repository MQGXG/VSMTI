import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, globalShortcut } from "electron";
import { join } from "path";
import { PythonManager } from "./python-manager";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const pythonManager = new PythonManager();

const isDev = !!process.env.ELECTRON_DEV;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(join(__dirname, "../dist/index.html"));
  }

  win.on("close", (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  const contextMenu = Menu.buildFromTemplate([
    { label: "显示窗口", click: () => mainWindow?.show() },
    { type: "separator" },
    { label: "退出", click: () => { (app as any).isQuitting = true; app.quit(); } },
  ]);
  tray.setToolTip("OmniAgent");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => mainWindow?.show());
}

app.whenReady().then(async () => {
  try {
    await pythonManager.start();
  } catch (err) {
    console.error("Python 后端启动失败:", err);
    // 不阻塞应用，前端会显示"离线"状态
  }
  createWindow();
  createTray();

  globalShortcut.register("CommandOrControl+Shift+A", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", async () => {
  await pythonManager.stop();
  globalShortcut.unregisterAll();
});

// IPC handlers
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.on("window:close", () => mainWindow?.hide());

ipcMain.handle("python:status", () => pythonManager.getStatus());
ipcMain.handle("python:restart", async () => {
  await pythonManager.restart();
  return pythonManager.getStatus();
});

ipcMain.handle("dialog:openFile", async () => {
  const { dialog } = await import("electron");
  const result = await dialog.showOpenDialog(mainWindow!, {
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
  const { dialog } = await import("electron");
  const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: defaultName });
  return result.filePath;
});

ipcMain.handle("notify", (_, title: string, body: string) => {
  new Notification({ title, body }).show();
});
