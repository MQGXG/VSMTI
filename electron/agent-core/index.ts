/**
 * Agent Core — 类似 OpenCode 的 core 包
 * TypeScript 工具系统 + Agent 循环，在 Electron 主进程运行
 */

export { Agent } from "./agent"
export type { AgentConfig } from "./agent"
export type { AgentEvent } from "./types"
export { ToolRegistry } from "./registry"
export { make, withPermission, toOpenAISchema, settle } from "./tool"
export { PermissionSet, defaultPermissions } from "./permission"
export { createLLMClient } from "./llm-client"
export type { ClientConfig } from "./llm-client"
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

// Skill 工具
export { skillsListTool, skillViewTool } from "./skill/skill-tools"

// 数据分析工具
export { dataAnalysisTool } from "./tools/data-analysis"
// 浏览器自动化
export { webBrowseTool } from "./tools/web-browse"
// Cron 定时任务工具
export { cronTool } from "./tools/cron-tool"
// 任务规划工具
export { taskTool } from "./tools/task-tool"
// 委派任务工具
export { delegateTaskTool } from "./tools/delegate-task"
// 图片生成工具
export { imageGenTool } from "./tools/image-gen"
// Worktree 工具
export { worktreeTool } from "./tools/worktree-tool"
// 团队工具
export { teamTool } from "./tools/team-tool"

// 系统模块
export { cronScheduler } from "./cron-scheduler"
export { TaskPlanner } from "./task-planner"
export { PluginHooks, pluginHooks } from "./plugin-hooks"
export { runDelegate, getDelegationStatus } from "./delegate-runner"
export { setupDefaultHooks } from "./hooks-setup"
export { sendMessage, readInbox } from "./team-bus"
export { createWorktree, listWorktrees } from "./worktree-manager"

import { ToolRegistry } from "./registry"
import { defaultPermissions } from "./permission"
import {
  readFileTool, writeFileTool, listFilesTool,
  webSearchTool, grepTool, globTool, codeExecTool, bashTool, editFileTool,
} from "./tools/index"
import { skillsListTool, skillViewTool } from "./skill/skill-tools"
import { dataAnalysisTool } from "./tools/data-analysis"
import { webBrowseTool } from "./tools/web-browse"
import { cronTool } from "./tools/cron-tool"
import { taskTool } from "./tools/task-tool"
import { delegateTaskTool } from "./tools/delegate-task"
import { imageGenTool } from "./tools/image-gen"
import { worktreeTool } from "./tools/worktree-tool"
import { teamTool } from "./tools/team-tool"

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
  // Skill 工具
  registry.register(skillsListTool)
  registry.register(skillViewTool)
  // 数据分析工具
  registry.register(dataAnalysisTool)
  // 浏览器自动化
  registry.register(webBrowseTool)
  // Cron 定时任务
  registry.register(cronTool)
  // 任务规划
  registry.register(taskTool)
  // 委派任务
  registry.register(delegateTaskTool)
  // 图片生成
  registry.register(imageGenTool)
  // Worktree 隔离
  registry.register(worktreeTool)
  // 团队通信
  registry.register(teamTool)
  return registry
}
