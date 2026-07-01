import { ToolCall } from "../../shared/tool"
import type { PermissionSet, PermissionRule } from "./index"
import { checkHardDeny } from "./index"
import type { ToolRegistry } from "../registry"

export interface PermissionRequest {
  id: string
  action: string
  resources: string[]
  toolCall: ToolCall
}

let idCounter = 0

export function generateId(): string {
  return `perm-${Date.now().toString(36)}-${++idCounter}`
}

export function extractResources(args: Record<string, unknown>): string[] {
  const resources: string[] = []
  const keys = ["path", "file", "url", "command", "dir", "directory"]
  for (const key of keys) {
    const value = args[key]
    if (typeof value === "string") resources.push(value)
  }
  return resources
}

/** 从工具调用参数中提取 resource 字符串（用于命令级权限匹配） */
export function extractActionResource(toolName: string, args: Record<string, unknown>): string | undefined {
  if (toolName === "bash" && typeof args.command === "string") return args.command
  if ((toolName === "write_file" || toolName === "edit_file" || toolName === "read_file") && typeof args.path === "string") return args.path
  if (toolName === "glob" && typeof args.pattern === "string") return args.pattern
  if (toolName === "grep" && typeof args.pattern === "string") return args.pattern
  if (toolName === "web_search" && typeof args.query === "string") return args.query
  if (toolName === "web_fetch" && typeof args.url === "string") return args.url
  return undefined
}

export interface ApprovalResult {
  toolCall: ToolCall
  args: Record<string, unknown>
  permissionAction: string
  needsApproval: boolean
  hardDenied?: string
}

export function evaluateToolCalls(
  toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
  registry: ToolRegistry,
  permissions?: PermissionSet,
): ApprovalResult[] {
  return toolCalls.map((call) => {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(call.function.arguments) } catch { /* JSON 解析失败时使用空对象兜底 */ }
    const def = registry.get(call.function.name)
    const permissionAction = def?.permission || call.function.name
    const resource = extractActionResource(call.function.name, args)

    // Gate 1: hard deny — 直接拒绝，不弹窗
    if (call.function.name === "bash" && typeof args.command === "string") {
      const hardDenied = checkHardDeny(args.command)
      if (hardDenied) {
        return {
          toolCall: { id: call.id, name: call.function.name, input: args },
          args,
          permissionAction,
          needsApproval: false,
          hardDenied,
        }
      }
    }

    // Gate 2+3: rule matching + user approval
    const needsApproval = permissions?.needsApproval(permissionAction, resource) ?? false

    return {
      toolCall: { id: call.id, name: call.function.name, input: args },
      args,
      permissionAction,
      needsApproval,
    }
  })
}
