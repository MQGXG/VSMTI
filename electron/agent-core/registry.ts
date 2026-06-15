import * as fs from "fs"
import * as path from "path"
import { ToolDef, ToolContext, ToolResult, ToolCall, settle, toOpenAISchema as toLegacyOpenAISchema, Content } from "./tool"
import { PermissionSet } from "./permission"
import { Effect } from "effect"
import * as ToolEffect from "./tool-effect"

export interface Materialization {
  definitions: Record<string, unknown>[]
  settle(call: ToolCall, ctx: ToolContext): Promise<{ result: ToolResult; content: Content[] }>
}

export interface ModelFilter {
  providerID: string
  modelID: string
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef>()
  private effectDefs = new Map<string, ToolEffect.Def>()

  register(def: ToolDef): void {
    this.tools.set(def.name, def)
  }

  registerEffect(def: ToolEffect.Def): void {
    this.effectDefs.set(def.id, def)
  }

  registerEffectLazy(effect: Effect.Effect<ToolEffect.Info>): void {
    Effect.runPromise(effect).then((info) => {
      // 占位
      this.effectDefs.set(info.id, {
        id: info.id,
        description: "",
        parameters: {},
        execute: async () => ({ success: false, error: "初始化中" }),
      })
      // 异步初始化完成后替换
      Effect.runPromise(ToolEffect.init(info)).then((def) => {
        this.effectDefs.set(def.id, def)
      }).catch((err) => {
        console.error(`[registry] 工具 "${info.id}" 初始化失败:`, err)
      })
    })
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name)
  }

  getAll(): ToolDef[] {
    return Array.from(this.tools.values())
  }

  /** 按模型过滤（如 GPT-4 用 edit，旧模型用 apply_patch） */
  filterByModel(modelFilter: ModelFilter): ToolDef[] {
    const usePatch = modelFilter.modelID.includes("gpt-") && !modelFilter.modelID.includes("gpt-4")
    return Array.from(this.tools.values()).filter((tool) => {
      if (tool.name === "edit_file" && usePatch) return false
      if (tool.name === "apply_patch" && !usePatch) return false
      return true
    })
  }

  /** 物化所有工具，可选按权限过滤 */
  materialize(permissions?: PermissionSet): Materialization {
    const allDefs = [...this.tools.values(), ...Array.from(this.effectDefs.values()).map((et) => this.toLegacyDef(et))]
    const allowed = permissions
      ? allDefs.filter((t) => permissions.isAllowed(t.name, t.permission))
      : allDefs

    return {
      definitions: allowed.map((t) => toLegacyOpenAISchema(t)),

      settle: async (call: ToolCall, ctx: ToolContext) => {
        let def = this.tools.get(call.name)
        if (def) {
          if (permissions && !permissions.isAllowed(def.name, def.permission)) {
            return {
              result: { success: false, error: `Permission denied: ${call.name}` },
              content: [{ type: "text" as const, text: `Permission denied: ${call.name}` }],
            }
          }
          return settle(def, call, ctx)
        }

        const effectDef = this.effectDefs.get(call.name)
        if (effectDef) {
          if (permissions && !permissions.isAllowed(effectDef.id, effectDef.permission)) {
            return {
              result: { success: false, error: `Permission denied: ${call.name}` },
              content: [{ type: "text" as const, text: `Permission denied: ${call.name}` }],
            }
          }
          const coercedArgs = ToolEffect.coerceArgs(call.name, call.input, effectDef.jsonSchema || {})
          try {
            const result = await effectDef.execute(coercedArgs as any, ctx as any)
            const content: Content[] = [{ type: "text", text: result.output || result.error || "" }]
            return { result, content }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return {
              result: { success: false, error: msg },
              content: [{ type: "text", text: msg }],
            }
          }
        }

        return {
          result: { success: false, error: `Unknown tool: ${call.name}` },
          content: [{ type: "text" as const, text: `Unknown tool: ${call.name}` }],
        }
      },
    }
  }

  /** 按模型过滤 + 权限过滤一次完成 */
  materializeWithModel(modelFilter: ModelFilter, permissions?: PermissionSet): Materialization {
    const filtered = this.filterByModel(modelFilter)
    const allDefs = [...filtered, ...Array.from(this.effectDefs.values()).map((et) => this.toLegacyDef(et))]
    const allowed = permissions
      ? allDefs.filter((t) => permissions.isAllowed(t.name, t.permission))
      : allDefs

    return {
      definitions: allowed.map((t) => toLegacyOpenAISchema(t)),
      settle: async (call, ctx) => {
        const m = this.materialize(permissions)
        return m.settle(call, ctx)
      },
    }
  }

  /** 直接执行工具（绕过 Agent 循环） */
  async execute(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const def = this.tools.get(name)
    if (def) {
      const { result } = await settle(def, { id: "direct", name, input: args }, ctx)
      return result
    }

    const effectDef = this.effectDefs.get(name)
    if (effectDef) {
      try {
        return await effectDef.execute(ToolEffect.coerceArgs(name, args, effectDef.jsonSchema || {}) as any, ctx as any)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { success: false, error: msg }
      }
    }

    return { success: false, error: `Unknown tool: ${name}` }
  }

  /** 扫描自定义工具文件 */
  scanCustomTools(dirs: string[]): void {
    for (const dir of dirs) {
      const searchPaths = ["tool", "tools"]
      for (const subdir of searchPaths) {
        const fullPath = path.join(dir, subdir)
        if (!fs.existsSync(fullPath)) continue
        const entries = fs.readdirSync(fullPath)
        for (const entry of entries) {
          if (!entry.endsWith(".ts") && !entry.endsWith(".js")) continue
          const modPath = path.join(fullPath, entry)
          import(modPath).then((mod) => {
            for (const [key, value] of Object.entries(mod)) {
              if (value && typeof value === "object" && "name" in value && "execute" in value) {
                this.register(value as ToolDef)
              }
            }
          }).catch((err) => {
            console.error(`[registry] 加载自定义工具失败: ${modPath}`, err)
          })
        }
      }
    }
  }

  /** 将 Effect Def 转为旧的 ToolDef 兼容格式 */
  private toLegacyDef(effectDef: ToolEffect.Def): ToolDef {
    return ToolEffect.toLegacyToolDef(effectDef) as unknown as ToolDef
  }
}
