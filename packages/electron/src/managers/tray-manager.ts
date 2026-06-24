import { Tray, Menu, nativeImage, app } from "electron";
import { getMainWindow, showMainWindow } from "./window-manager";

let tray: Tray | null = null;

export function createTray(): Tray {
  tray = new Tray(nativeImage.createEmpty());
  const contextMenu = Menu.buildFromTemplate([
    { label: "显示窗口", click: () => showMainWindow() },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Mira");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => showMainWindow());

  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
