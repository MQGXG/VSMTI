/**
 * Agent Core — 类似 OpenCode 的 core 包
 * TypeScript 工具系统 + Agent 循环，在 Electron 主进程运行
 */

export { Agent } from "./agent/agent"
export type { AgentConfig } from "./agent/agent"
export type { PermissionReply } from "./agent/agent"
export type { AgentEvent } from "./types"
export { ToolRegistry, type ModelFilter } from "./system/registry"
export { make, withPermission, settle } from "./shared/tool"
export { PermissionSet, defaultPermissions, permissionsForMode } from "./system/permission"
export { type AgentMode, getModeConfig, getAllModes, modeToPermissionSet, loadCustomAgents, registerAgent, registerAgentFromJson, getModeToolAllowlist } from "./config/modes"
export { type AgentProfile, AgentProfileRegistry, getGlobalAgentDir, getProjectAgentDir } from "./config/profile"
export { ContextManager, type ContextConfig, type ContextStats } from "./session/context"
export { GoalJudge, type Goal, type GoalConfig, type GoalEvaluation } from "./orchestrate/goal-judge"
export { createLLMClient } from "./llm/client"
export type { SDKConfig as ClientConfig } from "./llm/client"
export type { ToolDef, ToolContext, ToolResult, ToolCall, Content, Settlement } from "./shared/tool"
export * as ToolEffect from "./shared/tool-effect"
export { lspManager } from "./lsp/manager"

// 工具
export {
  readFileTool as readFileToolEffect,
} from "./tools/core/read-file-effect"
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
export { dataAnalysisTool } from "./tools/knowledge/data-analysis"
// 浏览器自动化
export { webBrowseTool } from "./tools/knowledge/web-browse"
// Cron 定时任务工具
export { cronTool } from "./tools/orchestrate/cron-tool"
// 任务规划工具
export { taskTool } from "./tools/orchestrate/task-tool"
// 委派任务工具
export { delegateTaskTool } from "./tools/orchestrate/delegate-task"
// 历史搜索工具
export { searchHistoryTool } from "./tools/core/search-history"
// 图片生成工具
export { imageGenTool } from "./tools/execution/image-gen"
// Workflow 工具
export { workflowRunTool } from "./tools/orchestrate/workflow-tool"
export { WorkflowEngine } from "./workflow/index"
export type { WorkflowDefinition, WorkflowStep, WorkflowResult } from "./workflow/index"
// Worktree 工具
export { worktreeTool } from "./tools/orchestrate/worktree-tool"
// 团队工具
export { teamTool } from "./tools/orchestrate/team-tool"
// LSP 工具
export { lspDefinitionTool, lspReferencesTool, lspHoverTool } from "./tools/infra/lsp-tool"

// 系统模块
export { cronScheduler } from "./background/cron"
export { TaskPlanner } from "./task/planner"
export { PluginHooks, pluginHooks } from "./shared/plugin-hooks"
export { SubagentManager, type SubagentInfo, type SubagentStatus, type SubagentEvent, type SubagentEventType } from "./orchestrate/subagent"
export { runDelegate, getDelegationStatus } from "./orchestrate/delegate"
export { setupDefaultHooks } from "./shared/hooks-setup"
export { sendMessage, readInbox } from "./orchestrate/team-bus"
export { createWorktree, listWorktrees } from "./background/worktree"

export { createDefaultRegistry } from "./system/registry-init"

// 配置系统
export { loadConfig, saveGlobalConfig, resolveRuntimeConfig, getConfigForRenderer } from "./config/index"
export type { MiraConfig, ResolvedConfig } from "./config/index"

// 平台路径抽象
export { initPlatformPaths, getPlatformPaths } from "./config/paths"
export type { PlatformPaths } from "./config/paths"

// Sidecar 服务
export { ServerManager } from "./system/server-manager"
export type { ServerManagerOptions } from "./system/server-manager"
export { createServer, startServer } from "./system/server"
export type { ServerOptions } from "./system/server"
export type { APIContext } from "./system/server"

// 新模块
export { featureFlags, isFeatureEnabled } from "./config/flags"
export { SnapshotManager } from "./session/snapshot"
export { SessionForkManager } from "./session/fork"
export { ForkCacheManager } from "./agent/fork-cache"
export { SystemContextManager } from "./agent/system-context"
export { TextNgramMonitor } from "./agent/text-ngram"
export { searchTools, getRecommendedTools, shouldLoadTool } from "./tools/shared/tool-loader"





