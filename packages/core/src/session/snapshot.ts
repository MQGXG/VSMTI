/**
 * Snapshot 文件快照系统 — 参考 OpenCode/Codex 的 snapshot 机制
 * 在工具执行前捕获文件状态，支持按步骤回滚
 */

import * as fs from "fs/promises"
import * as path from "path"

interface FileSnapshot {
  path: string
  content: string | null // null 表示文件不存在（新创建的文件）
  timestamp: number
}

interface Snapshot {
  id: string
  timestamp: number
  files: Map<string, FileSnapshot>
  description?: string
}

export class SnapshotManager {
  private snapshots: Snapshot[] = []
  private maxSnapshots = 50
  private snapshotDir: string

  constructor(workspace: string) {
    this.snapshotDir = path.join(workspace, ".mira", "snapshots")
  }

  /**
   * 捕获当前文件状态
   * @param files 需要快照的文件路径列表
   * @param description 快照描述
   */
  async capture(files: string[], description?: string): Promise<string> {
    const id = `snap_${Date.now().toString(36)}`
    const snapshot: Snapshot = {
      id,
      timestamp: Date.now(),
      files: new Map(),
      description,
    }

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, "utf-8").catch(() => null)
        snapshot.files.set(filePath, {
          path: filePath,
          content,
          timestamp: Date.now(),
        })
      } catch {
        // 文件不存在，记录为 null
        snapshot.files.set(filePath, {
          path: filePath,
          content: null,
          timestamp: Date.now(),
        })
      }
    }

    this.snapshots.push(snapshot)

    // 限制快照数量
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift()
    }

    return id
  }

  /**
   * 恢复到指定快照
   * @param snapshotId 快照 ID
   * @returns 恢复的文件列表
   */
  async restore(snapshotId: string): Promise<string[]> {
    const snapshot = this.snapshots.find(s => s.id === snapshotId)
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`)
    }

    const restoredFiles: string[] = []

    for (const [filePath, fileSnapshot] of snapshot.files) {
      if (fileSnapshot.content === null) {
        // 文件之前不存在，删除恢复的文件
        await fs.unlink(filePath).catch(() => {})
      } else {
        // 恢复文件内容
        const dir = path.dirname(filePath)
        await fs.mkdir(dir, { recursive: true }).catch(() => {})
        await fs.writeFile(filePath, fileSnapshot.content, "utf-8")
      }
      restoredFiles.push(filePath)
    }

    return restoredFiles
  }

  /**
   * 获取快照列表
   */
  list(): Array<{ id: string; timestamp: number; description?: string; fileCount: number }> {
    return this.snapshots.map(s => ({
      id: s.id,
      timestamp: s.timestamp,
      description: s.description,
      fileCount: s.files.size,
    }))
  }

  /**
   * 获取指定快照的详细信息
   */
  get(snapshotId: string): Snapshot | undefined {
    return this.snapshots.find(s => s.id === snapshotId)
  }

  /**
   * 删除指定快照
   */
  delete(snapshotId: string): boolean {
    const idx = this.snapshots.findIndex(s => s.id === snapshotId)
    if (idx >= 0) {
      this.snapshots.splice(idx, 1)
      return true
    }
    return false
  }

  /**
   * 清除所有快照
   */
  clear(): void {
    this.snapshots = []
  }

  /**
   * 获取两个快照之间的差异
   */
  diff(fromId: string, toId: string): Array<{ path: string; change: "added" | "modified" | "deleted" }> {
    const from = this.snapshots.find(s => s.id === fromId)
    const to = this.snapshots.find(s => s.id === toId)
    if (!from || !to) return []

    const changes: Array<{ path: string; change: "added" | "modified" | "deleted" }> = []
    const allPaths = new Set([...from.files.keys(), ...to.files.keys()])

    for (const filePath of allPaths) {
      const fromFile = from.files.get(filePath)
      const toFile = to.files.get(filePath)

      if (!fromFile && toFile) {
        changes.push({ path: filePath, change: "added" })
      } else if (fromFile && !toFile) {
        changes.push({ path: filePath, change: "deleted" })
      } else if (fromFile && toFile && fromFile.content !== toFile.content) {
        changes.push({ path: filePath, change: "modified" })
      }
    }

    return changes
  }
}

// 全局快照管理器实例
let globalSnapshotManager: SnapshotManager | null = null

export function getSnapshotManager(workspace: string): SnapshotManager {
  if (!globalSnapshotManager) {
    globalSnapshotManager = new SnapshotManager(workspace)
  }
  return globalSnapshotManager
}
