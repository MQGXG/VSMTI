import * as fs from "fs"
import * as path from "path"
import { z } from "zod"
import { ToolDef, ToolContext, ToolResult, ToolCall, settle, getJsonSchema, Content } from "../shared/tool"
import { PermissionSet } from "./permission"
import { Effect } from "effect"
import * as ToolEffect from "../shared/tool-effect"
import type { LLMToolSet } from "../llm/client"
import { toolMetadata, type ToolCategory } from "../tools/shared/tool-meta"
import { logError } from "./logger"
import { MCPManager, createMCPTool, type MCPServerConfig } from "../mcp/index"
import { PluginManager, type Plugin, type PluginHook } from "../plugin/index"

export interface Materialization {
  definitions: LLMToolSet
  settle(call: ToolCall, ctx: ToolContext): Promise<{ result: ToolResult; content: Content[] }>
}

export interface ModelFilter {
  providerID: string
  modelID: string
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef>()
  private effectDefs = new Map<string, ToolEffect.Def>()
  private mcpManager: MCPManager | null = null
  private pluginManager: PluginManager | null = null

  register(def: ToolDef): void {
    this.tools.set(def.name, def)
  }

  registerEffect(def: ToolEffect.Def): void {
    this.effectDefs.set(def.id, def)
  }

  registerEffectLazy(effect: Effect.Effect<ToolEffect.Info>): void {
    // 立即初始化，不等待
    Effect.runPromise(effect).then((info) => {
      Effect.runPromise(ToolEffect.init(info)).then((def) => {
        this.effectDefs.set(def.id, def)
      }).catch((err) => {
        logError(`[registry] 工具 "${info.id}" 初始化失败`, err)
      })
    })
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name)
  }

  getAll(): ToolDef[] {
    return Array.from(this.tools.values())
  }

  /** 按分类过滤工具 */
  getByCategory(category: ToolCategory): ToolDef[] {
    return Array.from(this.tools.values()).filter((t) => toolMetadata[t.name]?.category === category)
  }

  /** 获取工具的分类元数据 */
  getCategory(toolName: string): ToolCategory | undefined {
    return toolMetadata[toolName]?.category
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

  /** 将 JSON Schema 重建为 Zod schema（确保 type: "object" 且 AI SDK 能正确序列化） */
  private jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
    const props = (schema.properties || {}) as Record<string, any>
    const shape: Record<string, z.ZodType> = {}
    for (const [k, v] of Object.entries(props)) {
      const t = v.type === "string" ? z.string()
        : v.type === "number" ? z.number()
        : v.type === "boolean" ? z.boolean()
        : v.type === "integer" ? z.number().int()
        : z.any()
      shape[k] = v.description ? t.describe(v.description) : t
    }
    return z.object(shape)
  }

  /** 将 ToolDef 转为 AI SDK 工具集条目 — AI SDK v6 使用 inputSchema 而非 parameters */
  private toAISDKTool(t: ToolDef): { description: string; inputSchema: z.ZodType } {
    return {
      description: t.description,
      inputSchema: this.jsonSchemaToZod(getJsonSchema(t)),
    }
  }

  /** 物化所有工具，可选按权限过滤 */
  materialize(permissions?: PermissionSet): Materialization {
    const allDefs: ToolDef[] = [...this.tools.values(), ...Array.from(this.effectDefs.values()).map((et) => ToolEffect.toLegacyToolDef(et) as unknown as ToolDef)]
    const allowed = permissions
      ? allDefs.filter((t) => permissions.isAllowed(t.name, t.permission))
      : allDefs

    const toolSet: LLMToolSet = {}
    for (const t of allowed) {
      toolSet[t.name] = this.toAISDKTool(t)
    }

    return {
      definitions: toolSet,

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
    const allDefs: ToolDef[] = [...filtered, ...Array.from(this.effectDefs.values()).map((et) => ToolEffect.toLegacyToolDef(et) as unknown as ToolDef)]
    const allowed = permissions
      ? allDefs.filter((t) => permissions.isAllowed(t.name, t.permission))
      : allDefs

    const toolSet: LLMToolSet = {}
    for (const t of allowed) {
      toolSet[t.name] = this.toAISDKTool(t)
    }

    return {
      definitions: toolSet,
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
            logError(`[registry] 加载自定义工具失败: ${modPath}`, err)
          })
        }
      }
    }
  }

  /** 初始化 MCP 并注册工具 */
  async initMCP(configs: MCPServerConfig[]): Promise<void> {
    this.mcpManager = new MCPManager()
    this.mcpManager.setConfig(configs)
    
    try {
      await this.mcpManager.connectAll()
      
      // 注册 MCP 工具
      const mcpTools = this.mcpManager.getTools()
      for (const toolDef of mcpTools) {
        const serverName = toolDef.name.split("_")[0]
        const tool = createMCPTool(this.mcpManager, serverName, toolDef)
        this.register(tool)
      }
      
      console.log(`[registry] MCP initialized: ${mcpTools.length} tools registered`)
    } catch (error) {
      logError("[registry] MCP initialization failed", error)
    }
  }

  /** 获取 MCP 管理器 */
  getMCPManager(): MCPManager | null {
    return this.mcpManager
  }

  /** 刷新 MCP 工具 */
  async refreshMCP(): Promise<void> {
    if (!this.mcpManager) return
    
    // 移除旧的 MCP 工具
    for (const [name, tool] of this.tools) {
      if (tool.description.startsWith("[MCP:")) {
        this.tools.delete(name)
      }
    }
    
    // 重新连接并注册
    await this.mcpManager.disconnectAll()
    await this.mcpManager.connectAll()
    
    const mcpTools = this.mcpManager.getTools()
    for (const toolDef of mcpTools) {
      const serverName = toolDef.name.split("_")[0]
      const tool = createMCPTool(this.mcpManager, serverName, toolDef)
      this.register(tool)
    }
  }

  /** 初始化插件系统 */
  async initPlugins(workspace: string): Promise<void> {
    this.pluginManager = new PluginManager(workspace)
    
    try {
      // 加载插件
      await this.pluginManager.loadPlugins()
      
      // 初始化插件
      await this.pluginManager.initializePlugins({
        workspace,
        config: { enabled: true },
      })
      
      // 注册插件工具
      const pluginTools = this.pluginManager.getTools()
      for (const tool of pluginTools) {
        this.register(tool)
      }
      
      console.log(`[registry] Plugins initialized: ${pluginTools.length} tools registered`)
    } catch (error) {
      logError("[registry] Plugin initialization failed", error)
    }
  }

  /** 获取插件管理器 */
  getPluginManager(): PluginManager | null {
    return this.pluginManager
  }

  /** 执行插件钩子 */
  async executePluginHook(hookName: string, ...args: any[]): Promise<any[]> {
    if (!this.pluginManager) return []
    return this.pluginManager.executeHook(hookName, ...args)
  }

  /** 刷新插件 */
  async refreshPlugins(): Promise<void> {
    if (!this.pluginManager) return
    
    // 移除旧的插件工具
    for (const [name, tool] of this.tools) {
      if (tool.description.startsWith("[Plugin:")) {
        this.tools.delete(name)
      }
    }
    
    // 销毁旧插件
    await this.pluginManager.destroyAll()
    
    // 重新加载插件
    await this.pluginManager.loadPlugins()
    await this.pluginManager.initializePlugins({
      workspace: process.cwd(),
      config: { enabled: true },
    })
    
    // 注册新插件工具
    const pluginTools = this.pluginManager.getTools()
    for (const tool of pluginTools) {
      this.register(tool)
    }
  }
}

