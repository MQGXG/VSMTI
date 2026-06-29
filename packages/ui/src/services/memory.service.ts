/**
 * Memory Service — 记忆系统
 */

export interface MemoryEntry {
  id: string
  content: string
  tags: string[]
}

export const MemoryService = {
  async search(query: string, type?: string, limit?: number): Promise<MemoryEntry[]> {
    return window.electronAPI.memory.search(query, type, limit)
  },

  async status(): Promise<{ ready: boolean; count: number }> {
    return window.electronAPI.memory.status()
  },
}
