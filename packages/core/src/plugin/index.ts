/**
 * 插件系统
 * 支持用户自定义工具和功能扩展
 */

import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { make, type ToolDef, type ToolContext, type ToolResult } from "../shared/tool"
import { logError } from "../system/logger"

// ─── 插件接口 ──────────────────────────────────────────────────────

/**
 * 插件元数据
 */
export interface PluginMetadata {
  name: string
  version: string
  description: string
  author?: string
  homepage?: string
  /** 插件依赖的其他插件 */
  dependencies?: string[]
}

/**
 * 插件钩子
 */
export interface PluginHook {
  /** 钩子名称 */
  name: string
  /** 钩子处理器 */
  handler: (...args: any[]) => Promise<any> | any
}

/**
 * 插件配置
 */
export interface PluginConfig {
  /** 插件是否启用 */
  enabled: boolean
  /** 插件配置选项 */
  options?: Record<string, unknown>
}

/**
 * 插件接口
 */
export interface Plugin {
  /** 插件元数据 */
  metadata: PluginMetadata
  /** 插件提供的工具 */
  tools?: ToolDef[]
  /** 插件钩子 */
  hooks?: PluginHook[]
  /** 插件初始化函数 */
  initialize?: (context: PluginContext) => Promise<void> | void
  /** 插件销毁函数 */
  destroy?: () => Promise<void> | void
}

/**
 * 插件上下文
 */
export interface PluginContext {
  /** 工作空间路径 */
  workspace: string
  /** 插件配置 */
  config: PluginConfig
  /** 注册工具的函数 */
  registerTool: (tool: ToolDef) => void
  /** 注册钩子的函数 */
  registerHook: (hook: PluginHook) => void
  /** 获取其他插件的函数 */
  getPlugin: (name: string) => Plugin | undefined
  /** 日志函数 */
  log: (message: string) => void
}

// ─── 插件管理器 ──────────────────────────────────────────────────────

/**
 * 插件管理器
 * 管理插件的加载、初始化和销毁
 */
export class PluginManager {
  private plugins = new Map<string, Plugin>()
  private hooks = new Map<string, PluginHook[]>()
  private pluginDir: string

  constructor(workspace: string) {
    this.pluginDir = path.join(workspace, ".mira", "plugins")
  }

  /**
   * 获取插件目录
   */
  getPluginDir(): string {
    return this.pluginDir
  }

  /**
   * 加载所有插件
   */
  async loadPlugins(): Promise<void> {
    try {
      // 确保插件目录存在
      await fs.mkdir(this.pluginDir, { recursive: true })

      // 读取插件目录
      const entries = await fs.readdir(this.pluginDir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.loadPlugin(entry.name)
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
          // 支持单文件插件
          await this.loadPluginFile(entry.name)
        }
      }
    } catch (error) {
      logError("[PluginManager] Failed to load plugins", error)
    }
  }

  /**
   * 加载单个插件
   */
  private async loadPlugin(pluginName: string): Promise<void> {
    try {
      const pluginPath = path.join(this.pluginDir, pluginName)
      const indexPath = path.join(pluginPath, "index.js")

      // 检查入口文件是否存在
      try {
        await fs.access(indexPath)
      } catch {
        logError(`[PluginManager] Plugin ${pluginName} has no index.js`)
        return
      }

      // 动态导入插件
      const pluginModule = await import(indexPath)
      const plugin: Plugin = pluginModule.default || pluginModule

      if (!plugin.metadata || !plugin.metadata.name) {
        logError(`[PluginManager] Plugin ${pluginName} has invalid metadata`)
        return
      }

      this.plugins.set(plugin.metadata.name, plugin)
      console.log(`[PluginManager] Loaded plugin: ${plugin.metadata.name} v${plugin.metadata.version}`)
    } catch (error) {
      logError(`[PluginManager] Failed to load plugin ${pluginName}`, error)
    }
  }

  /**
   * 加载单文件插件
   */
  private async loadPluginFile(fileName: string): Promise<void> {
    try {
      const filePath = path.join(this.pluginDir, fileName)
      const pluginModule = await import(filePath)
      const plugin: Plugin = pluginModule.default || pluginModule

      if (!plugin.metadata || !plugin.metadata.name) {
        logError(`[PluginManager] Plugin file ${fileName} has invalid metadata`)
        return
      }

      this.plugins.set(plugin.metadata.name, plugin)
      console.log(`[PluginManager] Loaded plugin: ${plugin.metadata.name} v${plugin.metadata.version}`)
    } catch (error) {
      logError(`[PluginManager] Failed to load plugin file ${fileName}`, error)
    }
  }

  /**
   * 初始化所有插件
   */
  async initializePlugins(context: Omit<PluginContext, "registerTool" | "registerHook" | "getPlugin" | "log">): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.initialize) {
          const pluginContext: PluginContext = {
            ...context,
            registerTool: (tool: ToolDef) => {
              plugin.tools = plugin.tools || []
              plugin.tools.push(tool)
            },
            registerHook: (hook: PluginHook) => {
              plugin.hooks = plugin.hooks || []
              plugin.hooks.push(hook)
              this.registerHook(hook)
            },
            getPlugin: (pluginName: string) => this.plugins.get(pluginName),
            log: (message: string) => console.log(`[${name}] ${message}`),
          }

          await plugin.initialize(pluginContext)
          console.log(`[PluginManager] Initialized plugin: ${name}`)
        }
      } catch (error) {
        logError(`[PluginManager] Failed to initialize plugin ${name}`, error)
      }
    }
  }

  /**
   * 注册钩子
   */
  private registerHook(hook: PluginHook): void {
    const hooks = this.hooks.get(hook.name) || []
    hooks.push(hook)
    this.hooks.set(hook.name, hooks)
  }

  /**
   * 执行钩子
   */
  async executeHook(hookName: string, ...args: any[]): Promise<any[]> {
    const hooks = this.hooks.get(hookName) || []
    const results: any[] = []

    for (const hook of hooks) {
      try {
        const result = await hook.handler(...args)
        results.push(result)
      } catch (error) {
        logError(`[PluginManager] Failed to execute hook ${hookName}`, error)
      }
    }

    return results
  }

  /**
   * 获取所有插件的工具
   */
  getTools(): ToolDef[] {
    const tools: ToolDef[] = []
    for (const plugin of this.plugins.values()) {
      if (plugin.tools) {
        tools.push(...plugin.tools)
      }
    }
    return tools
  }

  /**
   * 获取插件
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name)
  }

  /**
   * 获取所有插件
   */
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values())
  }

  /**
   * 销毁所有插件
   */
  async destroyAll(): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.destroy) {
          await plugin.destroy()
          console.log(`[PluginManager] Destroyed plugin: ${name}`)
        }
      } catch (error) {
        logError(`[PluginManager] Failed to destroy plugin ${name}`, error)
      }
    }
    this.plugins.clear()
    this.hooks.clear()
  }
}

// ─── 插件工具创建 ──────────────────────────────────────────────────────

/**
 * 创建插件工具
 */
export function createPluginTool(
  pluginName: string,
  config: {
    name: string
    description: string
    inputSchema: z.ZodType
    execute: (input: any, ctx: ToolContext) => Promise<ToolResult>
    permission?: string
  }
): ToolDef {
  return make({
    name: `plugin_${pluginName}_${config.name}`,
    description: `[Plugin: ${pluginName}] ${config.description}`,
    inputSchema: config.inputSchema,
    outputSchema: z.string(),
    permission: config.permission || "plugin",
    async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
      return config.execute(input, ctx)
    },
  })
}

// ─── 插件配置 ──────────────────────────────────────────────────────

/**
 * 插件配置 Schema
 */
export const PluginConfigSchema = z.record(
  z.string(),
  z.object({
    enabled: z.boolean(),
    options: z.record(z.string(), z.unknown()).optional(),
  })
)

export type PluginConfigMap = z.infer<typeof PluginConfigSchema>

/**
 * 加载插件配置
 */
export async function loadPluginConfig(workspace: string): Promise<PluginConfigMap> {
  const configPath = path.join(workspace, ".mira", "plugins.json")
  try {
    const content = await fs.readFile(configPath, "utf-8")
    return JSON.parse(content)
  } catch {
    return {}
  }
}

/**
 * 保存插件配置
 */
export async function savePluginConfig(workspace: string, config: PluginConfigMap): Promise<void> {
  const configPath = path.join(workspace, ".mira", "plugins.json")
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8")
}

// ─── 插件示例 ──────────────────────────────────────────────────────

/**
 * 创建示例插件
 */
export function createExamplePlugin(): Plugin {
  return {
    metadata: {
      name: "example-plugin",
      version: "1.0.0",
      description: "示例插件，展示如何创建 Mira 插件",
      author: "Mira Team",
    },
    tools: [
      createPluginTool("example", {
        name: "hello",
        description: "一个示例工具，返回问候语",
        inputSchema: z.object({
          name: z.string().describe("要问候的名字"),
        }),
        async execute(input: { name: string }, ctx: ToolContext): Promise<ToolResult> {
          return {
            success: true,
            output: `Hello, ${input.name}! This is an example plugin tool.`,
          }
        },
      }),
    ],
    hooks: [
      {
        name: "before_tool_execute",
        handler: async (toolName: string, args: any) => {
          console.log(`[Example Plugin] Before tool execute: ${toolName}`)
          return { toolName, args }
        },
      },
    ],
    async initialize(context: PluginContext) {
      context.log("Example plugin initialized!")
    },
    async destroy() {
      console.log("[Example Plugin] Destroyed!")
    },
  }
}
