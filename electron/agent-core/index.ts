/**
 * Agent Core — 类似 OpenCode 的 core 包
 * TypeScript 工具系统 + Agent 循环，在 Electron 主进程运行
 */

export { ToolRegistry } from "./registry"
export { make, withPermission, toOpenAISchema, settle } from "./tool"
export { PermissionSet, defaultPermissions } from "./permission"
export { Agent } from "./agent"
export type { AgentConfig, AgentEvent } from "./agent"
export type { ToolDef, ToolContext, ToolResult, ToolCall, Content, Settlement } from "./tool"

// 工具
export {
  readFileTool,
  writeFileTool,
  listFilesTool,
  webSearchTool,
  grepTool,
  globTool,
  codeExecTool, bashTool, editFileTool,
} from "./tools/index"

import { ToolRegistry } from "./registry"
import { defaultPermissions } from "./permission"
import {
  readFileTool, writeFileTool, listFilesTool,
  webSearchTool, grepTool, globTool, codeExecTool, bashTool, editFileTool,
} from "./tools/index"

/** 创建预注册了所有默认工具的注册表 */
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(readFileTool)
  registry.register(writeFileTool)
  registry.register(listFilesTool)
  registry.register(webSearchTool)
  registry.register(grepTool)
  registry.register(globTool)
  registry.register(codeExecTool)
  registry.register(bashTool)
  registry.register(editFileTool)
  return registry
}
