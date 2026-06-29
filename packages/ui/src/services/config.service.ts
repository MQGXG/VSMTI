/**
 * Config Service — 配置管理
 */

export interface ConfigInfo {
  provider: string
  model: string
  apiUrl: string
  mode: string
  apiKeyFrom: "env" | "file" | "none"
}

export const ConfigService = {
  async get(workspace?: string): Promise<ConfigInfo> {
    return window.electronAPI.config.get(workspace)
  },

  async save(config: Record<string, unknown>): Promise<void> {
    return window.electronAPI.config.save(config)
  },

  async encryptApiKey(text: string): Promise<string> {
    return window.electronAPI.encryptApiKey(text)
  },

  async decryptApiKey(encrypted: string): Promise<string> {
    return window.electronAPI.decryptApiKey(encrypted)
  },
}
