/**
 * Dialog Service — 文件/目录对话框
 */

export const DialogService = {
  async openDirectory(): Promise<string[]> {
    return window.electronAPI.openDirectory()
  },

  async openFile(): Promise<string[]> {
    return window.electronAPI.openFile()
  },

  async saveFile(name: string): Promise<string> {
    return window.electronAPI.saveFile(name)
  },
}
