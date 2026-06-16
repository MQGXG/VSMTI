/**
 * 工具列表 — 定义工具的分层分类
 * 不改变文件物理位置，而是在注册时附加元数据
 */

export type ToolCategory =
  | "core"           // 核心文件操作（始终可用）
  | "knowledge"      // 知识获取
  | "execution"      // 执行（受权限控制）
  | "orchestration"  // 编排（Agent 自身管理）
  | "infrastructure" // 基础设施

export interface ToolMeta {
  category: ToolCategory
  requiresPermission?: boolean
  timeout?: number
  supportsParallel?: boolean  // 声明是否支持并行执行
}

export const toolMetadata: Record<string, ToolMeta> = {
  read_file:    { category: "core", timeout: 10000, supportsParallel: true },
  write_file:   { category: "core", timeout: 10000 },
  edit_file:    { category: "core", timeout: 10000 },
  list_files:   { category: "core", timeout: 5000, supportsParallel: true },
  grep:         { category: "core", timeout: 15000, supportsParallel: true },
  glob:         { category: "core", timeout: 15000, supportsParallel: true },

  web_search:   { category: "knowledge", timeout: 15000, supportsParallel: true },
  web_browse:   { category: "knowledge", timeout: 30000, supportsParallel: true },
  data_analysis:{ category: "knowledge", timeout: 60000, supportsParallel: true },

  bash:         { category: "execution", requiresPermission: true, timeout: 60000 },
  code_exec:    { category: "execution", requiresPermission: true, timeout: 60000 },
  image_gen:    { category: "execution", requiresPermission: true, timeout: 60000 },

  task_planner: { category: "orchestration", supportsParallel: true },
  delegate_task:{ category: "orchestration", timeout: 120000 },
  team_tool:    { category: "orchestration" },
  cron_tool:    { category: "orchestration" },
  worktree_tool:{ category: "orchestration", timeout: 30000 },

  lsp_definition:  { category: "infrastructure", supportsParallel: true },
  lsp_references:  { category: "infrastructure", supportsParallel: true },
  lsp_hover:       { category: "infrastructure", supportsParallel: true },

  git_status:      { category: "core", timeout: 15000, supportsParallel: true },
  git_diff:        { category: "core", timeout: 15000, supportsParallel: true },
  git_log:         { category: "core", timeout: 15000, supportsParallel: true },
  git_commit:      { category: "execution", requiresPermission: true, timeout: 15000 },
}

export function isToolParallel(name: string): boolean {
  return toolMetadata[name]?.supportsParallel ?? false
}

export function getToolsByCategory(category: ToolCategory): string[] {
  return Object.entries(toolMetadata)
    .filter(([, meta]) => meta.category === category)
    .map(([name]) => name)
}
