/**
 * @mira/desktop - 桌面应用入口
 */

import { app, BrowserWindow } from "electron"
import { createWindow } from "@mira/electron"

// 应用就绪时创建窗口
app.whenReady().then(() => {
  createWindow()
})

// macOS: 点击 dock 图标时重新创建窗口
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 所有窗口关闭时退出应用（Windows/Linux）
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
