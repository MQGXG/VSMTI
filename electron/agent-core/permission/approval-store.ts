/**
 * 审批缓存 — 参考 Codex 的 ApprovalStore
 * 缓存用户审批决策，避免重复弹窗
 * 持久化规则通过 PermissionSet 注入，重启后不丢失
 */

import { saveWorkspacePermission } from "../permission-store"
import type { PermissionSet } from "../permission"

export interface ApprovalRecord {
  action: string
  resources: string[]
  decision: "allow" | "deny"
  timestamp: number
  ttlMs: number
}

export class ApprovalStore {
  private cache = new Map<string, ApprovalRecord>()
  private permissions: PermissionSet | null = null

  /** 注入持久化权限集（启动时从 SQLite 加载） */
  setPermissions(permissions: PermissionSet): void {
    this.permissions = permissions
  }

  private key(action: string, resource: string): string {
    return `${action}:${resource}`
  }

  /** 记录审批决策 */
  record(action: string, resources: string[], decision: "allow" | "deny", ttlMs = 300_000, workspace?: string): void {
    const now = Date.now()
    for (const r of resources) {
      this.cache.set(this.key(action, r), { action, resources: [r], decision, timestamp: now, ttlMs })
    }
    // "始终允许"同步持久化到 SQLite
    if (decision === "allow" && workspace) {
      for (const r of resources) {
        saveWorkspacePermission(workspace, { action, resource: r, effect: "allow" }).catch(() => {})
      }
    }
  }

  /** 检查是否有缓存的审批决策 */
  check(action: string, resource: string): "allow" | "deny" | null {
    // 先查持久化权限集
    if (this.permissions) {
      const effect = this.permissions.evaluate(action)
      if (effect === "allow") return "allow"
      if (effect === "deny") return "deny"
    }
    // 再查内存缓存
    const key = this.key(action, resource)
    const record = this.cache.get(key)
    if (!record) return null
    if (Date.now() - record.timestamp > record.ttlMs) {
      this.cache.delete(key)
      return null
    }
    return record.decision
  }

  /** 检查一组资源是否全部被允许 */
  checkAll(action: string, resources: string[]): "allow" | null {
    for (const r of resources) {
      const result = this.check(action, r)
      if (result !== "allow") return null
    }
    return "allow"
  }

  /** 清除过期缓存 */
  purge(): void {
    const now = Date.now()
    for (const [key, record] of this.cache) {
      if (now - record.timestamp > record.ttlMs) {
        this.cache.delete(key)
      }
    }
  }

  /** 清除所有缓存 */
  clear(): void {
    this.cache.clear()
  }
}
