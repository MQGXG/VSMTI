/**
 * 权限规则持久化 — 使用 JSON 文件保存每个工作区的「始终允许」规则
 */

import { app } from "electron"
import { join } from "path"
import fs from "fs"
import { PermissionSet, type PermissionRule } from "./permission"

interface StoreData {
  permissions: Record<string, PermissionRule[]>
}

function getStorePath(): string {
  return join(app.getPath("userData"), "permissions.json")
}

function readStore(): StoreData {
  try {
    const raw = fs.readFileSync(getStorePath(), "utf-8")
    return JSON.parse(raw)
  } catch {
    return { permissions: {} }
  }
}

function writeStore(data: StoreData): void {
  const dir = app.getPath("userData")
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getStorePath(), JSON.stringify(data, null, 2), "utf-8")
}

/** 加载指定工作区的已保存权限规则 */
export function loadWorkspacePermissions(workspace: string): PermissionRule[] {
  const data = readStore()
  // 用工作区路径的 hash 或直接使用路径作为 key
  const key = workspace.replace(/[/\\:]/g, "_")
  return data.permissions[key] || []
}

/** 保存一条权限规则到指定工作区 */
export function saveWorkspacePermission(
  workspace: string,
  rule: PermissionRule,
): void {
  const data = readStore()
  const key = workspace.replace(/[/\\:]/g, "_")
  const existing = data.permissions[key] || []

  // 移除同 action + resource 的旧规则，追加新规则
  const filtered = existing.filter(
    (r) => r.action !== rule.action || r.resource !== rule.resource,
  )
  data.permissions[key] = [...filtered, rule]

  writeStore(data)
}

/** 删除指定工作区的某个权限规则 */
export function removeWorkspacePermission(
  workspace: string,
  action: string,
  resource: string,
): void {
  const data = readStore()
  const key = workspace.replace(/[/\\:]/g, "_")
  const existing = data.permissions[key] || []

  data.permissions[key] = existing.filter(
    (r) => r.action !== action || r.resource !== resource,
  )
  writeStore(data)
}

/** 清空指定工作区的所有自定义规则 */
export function clearWorkspacePermissions(workspace: string): void {
  const data = readStore()
  const key = workspace.replace(/[/\\:]/g, "_")
  delete data.permissions[key]
  writeStore(data)
}

/** 从 JSON 文件构建 PermissionSet（仅 allow/deny 规则） */
export function buildSavedPermissionSet(workspace: string): PermissionSet {
  const savedRules = loadWorkspacePermissions(workspace)
  return new PermissionSet(savedRules)
}
