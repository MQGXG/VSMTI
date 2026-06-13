/**
 * 工具注册表 — 类似 OpenCode 的 registry.ts
 * 注册 → 物化 → 权限过滤 → 执行
 */

import { ToolDef, ToolContext, ToolResult, ToolCall, settle, toOpenAISchema, Content } from "./tool"
import { PermissionSet } from "./permission"

export interface Materialization {
  definitions: Record<string, unknown>[]
  settle(call: ToolCall, ctx: ToolContext): Promise<{ result: ToolResult; content: Content[] }>
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef>()

  register(def: ToolDef): void {
    this.tools.set(def.name, def)
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name)
  }

  getAll(): ToolDef[] {
    return Array.from(this.tools.values())
  }

  /** 物化所有工具，可选按权限过滤 — 类似 OpenCode 的 materialize() */
  materialize(permissions?: PermissionSet): Materialization {
    const allowed = permissions
      ? Array.from(this.tools.values()).filter((t) => permissions.isAllowed(t.name, t.permission))
      : Array.from(this.tools.values())

    return {
      definitions: allowed.map(toOpenAISchema),

      settle: async (call: ToolCall, ctx: ToolContext) => {
        const def = this.tools.get(call.name)
        if (!def) {
          return {
            result: { success: false, error: `Unknown tool: ${call.name}` },
            content: [{ type: "text" as const, text: `Unknown tool: ${call.name}` }],
          }
        }

        // 运行时权限检查
        if (permissions && !permissions.isAllowed(def.name, def.permission)) {
          return {
            result: { success: false, error: `Permission denied: ${call.name}` },
            content: [{ type: "text" as const, text: `Permission denied: ${call.name}` }],
          }
        }

        return settle(def, call, ctx)
      },
    }
  }

  /** 直接执行工具（绕过 Agent 循环） */
  async execute(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const def = this.tools.get(name)
    if (!def) return { success: false, error: `Unknown tool: ${name}` }
    const { result } = await settle(def, { id: "direct", name, input: args }, ctx)
    return result
  }
}
