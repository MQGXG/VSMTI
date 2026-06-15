import { ToolCall } from "./tool"
import type { PermissionSet } from "./permission"
import type { ToolRegistry } from "./registry"

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

export interface ApprovalResult {
  toolCall: ToolCall
  args: Record<string, unknown>
  permissionAction: string
  needsApproval: boolean
}

export function evaluateToolCalls(
  toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
  registry: ToolRegistry,
  permissions?: PermissionSet,
): ApprovalResult[] {
  return toolCalls.map((call) => {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(call.function.arguments) } catch {}
    const def = registry.get(call.function.name)
    const permissionAction = def?.permission || call.function.name
    const needsApproval = permissions?.needsApproval(call.function.name, def?.permission) ?? false

    return {
      toolCall: { id: call.id, name: call.function.name, input: args },
      args,
      permissionAction,
      needsApproval,
    }
  })
}
