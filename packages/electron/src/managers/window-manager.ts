import { BrowserWindow, app } from "electron";
import { join } from "path";
import { request } from "http";

let mainWindow: BrowserWindow | null = null;
const isDev = !app.isPackaged;

function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request(
      `http://localhost:${port}`,
      { method: "HEAD", timeout: 500 },
      () => {
        resolve(true);
        req.destroy();
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function findVitePort(): Promise<number> {
  // 等待 Vite 启动完成，最多重试 5 次
  for (let attempt = 0; attempt < 5; attempt++) {
    for (let port = 5173; port <= 5180; port++) {
      if (await probePort(port)) {
        console.log(`[Window] Detected Vite dev server at port ${port}`);
        return port;
      }
    }
    if (attempt < 4) {
      await sleep(500);
    }
  }
  console.log("[Window] No Vite dev server found, fallback to 5173");
  return 5173;
}

export async function createWindow(): Promise<BrowserWindow> {
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
    const port = await findVitePort();
    await win.loadURL(`http://localhost:${port}`);
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

  return win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function showMainWindow(): void {
  mainWindow?.show();
  mainWindow?.focus();
}

export function minimizeWindow(): void {
  mainWindow?.minimize();
}

export function toggleMaximizeWindow(): void {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
}

export function hideWindow(): void {
  mainWindow?.hide();
}

export function closeAllWindows(): void {
  BrowserWindow.getAllWindows().forEach((w) => w.close());
}
