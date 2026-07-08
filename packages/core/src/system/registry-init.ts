/**
 * 注册表初始化 — 从 index.ts 拆分以打破循环依赖
 */
import { ToolRegistry } from "./registry"
import { readFileTool } from "../tools/core/read-file"
import {
  writeFileTool, listFilesTool,
  webSearchTool, webFetchTool, codeSearchTool, questionTool,
  grepTool, globTool, codeExecTool, bashTool, editFileTool,
} from "../tools/index"
import { skillsListTool, skillViewTool } from "../skill/skill-tools"
import { memorySearchTool, memoryRecallTool } from "../tools/knowledge/memory"
import { dataAnalysisTool } from "../tools/knowledge/data-analysis"
import { webBrowseTool } from "../tools/knowledge/web-browse"
import { cronTool } from "../tools/orchestrate/cron-tool"
import { taskTool } from "../tools/orchestrate/task-tool"
import { delegateTaskTool } from "../tools/orchestrate/delegate-task"
import { imageGenTool } from "../tools/execution/image-gen"
import { worktreeTool } from "../tools/orchestrate/worktree-tool"
import { teamTool } from "../tools/orchestrate/team-tool"
import { lspDefinitionTool, lspReferencesTool, lspHoverTool } from "../tools/infra/lsp-tool"
import { gitStatusTool, gitDiffTool, gitLogTool, gitCommitTool } from "../tools/core/git"
import { createDocxTool } from "../tools/core/create-docx"
import { searchHistoryTool } from "../tools/core/search-history"
import { spawnAgentTool, waitAgentsTool, listSubagentsTool } from "../tools/orchestrate/agent-tools"
import { workflowRunTool } from "../tools/orchestrate/workflow-tool"
import { applyPatchTool } from "../tools/core/apply-patch"
import type { MCPServerConfig } from "../mcp/index"

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(readFileTool)
  registry.register(writeFileTool)
  registry.register(listFilesTool)
  registry.register(webSearchTool)
  registry.register(webFetchTool)
  registry.register(codeSearchTool)
  registry.register(questionTool)
  registry.register(grepTool)
  registry.register(globTool)
  registry.register(codeExecTool)
  registry.register(bashTool)
  registry.register(editFileTool)
  registry.register(skillsListTool)
  registry.register(skillViewTool)
  registry.register(dataAnalysisTool)
  registry.register(webBrowseTool)
  registry.register(cronTool)
  registry.register(taskTool)
  registry.register(delegateTaskTool)
  registry.register(imageGenTool)
  registry.register(worktreeTool)
  registry.register(teamTool)
  registry.register(lspDefinitionTool)
  registry.register(lspReferencesTool)
  registry.register(lspHoverTool)
  registry.register(gitStatusTool)
  registry.register(gitDiffTool)
  registry.register(gitLogTool)
  registry.register(gitCommitTool)
  registry.register(createDocxTool)
  registry.register(searchHistoryTool)
  registry.register(memorySearchTool)
  registry.register(memoryRecallTool)
  registry.register(spawnAgentTool)
  registry.register(waitAgentsTool)
  registry.register(listSubagentsTool)
  registry.register(workflowRunTool)
  registry.register(applyPatchTool)
  return registry
}

/**
 * 初始化 MCP 服务器
 * @param registry 工具注册表
 * @param mcpConfigs MCP 服务器配置列表
 */
export async function initMCP(
  registry: ToolRegistry,
  mcpConfigs: MCPServerConfig[]
): Promise<void> {
  await registry.initMCP(mcpConfigs)
}

/**
 * 初始化插件系统
 * @param registry 工具注册表
 * @param workspace 工作空间路径
 */
export async function initPlugins(
  registry: ToolRegistry,
  workspace: string
): Promise<void> {
  await registry.initPlugins(workspace)
}
