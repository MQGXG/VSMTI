/**
 * Agent Core — 类似 OpenCode 的 core 包
 * TypeScript 工具系统 + Agent 循环，在 Electron 主进程运行
 */

export { Agent } from "./agent"
export type { AgentConfig } from "./agent"
export type { AgentEvent } from "./types"
export { ToolRegistry, type ModelFilter } from "./registry"
export { make, withPermission, settle } from "./tool"
export { PermissionSet, defaultPermissions, permissionsForMode } from "./permission"
export { type AgentMode, getModeConfig, getAllModes, modeToPermissionSet, loadCustomAgents, registerAgent, registerAgentFromJson, getModeToolAllowlist } from "./modes"
export { type AgentProfile, AgentProfileRegistry, getGlobalAgentDir, getProjectAgentDir } from "./agent-profile"
export { ContextManager, type ContextConfig, type ContextStats } from "./context-manager"
export { GoalJudge, type Goal, type GoalConfig, type GoalEvaluation } from "./goal-judge"
export { createLLMClient } from "./llm-sdk"
export type { SDKConfig as ClientConfig } from "./llm-sdk"
export type { ToolDef, ToolContext, ToolResult, ToolCall, Content, Settlement } from "./tool"
export * as ToolEffect from "./tool-effect"
export { AppLayer, ToolRegistryTag, LLMTag, DatabaseTag, ToolRegistryLayer, LLMLayer, DatabaseLayer } from "./layers"
export { lspManager } from "./lsp/manager"

// 工具
export {
  readFileTool as readFileToolEffect,
} from "./tools/read-file-effect"
export {
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
// 历史搜索工具
export { searchHistoryTool } from "./tools/search-history"
// 图片生成工具
export { imageGenTool } from "./tools/image-gen"
// Workflow 工具
export { workflowRunTool } from "./tools/workflow-tool"
export { WorkflowEngine } from "./workflow/index"
export type { WorkflowDefinition, WorkflowStep, WorkflowResult } from "./workflow/index"
// Worktree 工具
export { worktreeTool } from "./tools/worktree-tool"
// 团队工具
export { teamTool } from "./tools/team-tool"
// LSP 工具
export { lspDefinitionTool, lspReferencesTool, lspHoverTool } from "./tools/lsp-tool"

// 系统模块
export { cronScheduler } from "./cron-scheduler"
export { TaskPlanner } from "./task-planner"
export { PluginHooks, pluginHooks } from "./plugin-hooks"
export { SubagentManager, type SubagentInfo, type SubagentStatus, type SubagentEvent, type SubagentEventType } from "./subagent-manager"
export { runDelegate, getDelegationStatus } from "./delegate-runner"
export { setupDefaultHooks } from "./hooks-setup"
export { sendMessage, readInbox } from "./team-bus"
export { createWorktree, listWorktrees } from "./worktree-manager"

export { createDefaultRegistry } from "./registry-init"

// 配置系统
export { loadConfig, saveGlobalConfig, resolveRuntimeConfig, getConfigForRenderer } from "./config"
export type { MiraConfig, ResolvedConfig } from "./config"

// 平台路径抽象
export { initPlatformPaths, getPlatformPaths } from "./platform-paths"
export type { PlatformPaths } from "./platform-paths"

// Sidecar 服务
export { ServerManager } from "./server-manager"
export type { ServerManagerOptions } from "./server-manager"
export { createServer, startServer } from "./server"
export type { ServerOptions } from "./server"
export type { APIContext } from "./server"
