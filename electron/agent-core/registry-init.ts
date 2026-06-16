/**
 * 注册表初始化 — 从 index.ts 拆分以打破循环依赖
 */
import { ToolRegistry } from "./registry"
import { readFileTool } from "./tools/read-file"
import {
  writeFileTool, listFilesTool,
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
import { lspDefinitionTool, lspReferencesTool, lspHoverTool } from "./tools/lsp-tool"
import { gitStatusTool, gitDiffTool, gitLogTool, gitCommitTool } from "./tools/git"

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
  return registry
}
