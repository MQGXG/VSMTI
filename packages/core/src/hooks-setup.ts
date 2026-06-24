/**
 * 默认钩子注册 — 为 PluginHooks 注册审计日志等基础行为
 * 替代 Python hooks_setup.py
 */

import { pluginHooks } from "./plugin-hooks"
import { logToolCall } from "./logger"
import type { ToolCallLog } from "./logger"

let hooksInitialized = false

/** 注册默认钩子（日志记录、审计、权限记录） */
export function setupDefaultHooks(): void {
  if (hooksInitialized) return
  hooksInitialized = true

  // PreToolUse: 记录即将执行的工具
  pluginHooks.on("pre_tool_use", (toolName: string, args: Record<string, unknown>) => {
    console.log(`[Hook] PreToolUse: ${toolName}`, Object.keys(args).slice(0, 3))
  })

  // PostToolUse: 记录工具调用结果
  pluginHooks.on("post_tool_call", (entry: ToolCallLog) => {
    logToolCall(entry)
  })

  // UserPromptSubmit: 记录用户提交
  pluginHooks.on("user_prompt_submit", (message: string) => {
    console.log(`[Hook] User submit: ${message.slice(0, 100)}`)
  })

  // Stop: 清理
  pluginHooks.on("stop", () => {
    console.log("[Hook] Agent stopped")
  })
}

/** 检查钩子是否已初始化 */
export function isHooksInitialized(): boolean {
  return hooksInitialized
}
