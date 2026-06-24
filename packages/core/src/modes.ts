import { PermissionSet, type PermissionRule } from "./permission"

export type AgentMode = "assistant" | "expert" | "action" | "safe" | "plan"

export interface ModeConfig {
  id: AgentMode
  label: string
  description: string
  maxIterations: number
  systemPromptSuffix: string
  /** 该模式对应的权限规则（叠加在默认权限之上） */
  permissionRules: PermissionRule[]
  /** 工具允许列表：如果设置，LLM 只能看到这些工具 */
  toolAllowlist?: string[]
}

const modeConfigs: Record<AgentMode, ModeConfig> = {
  assistant: {
    id: "assistant",
    label: "助手",
    description: "日常问答、写作、分析",
    maxIterations: 10,
    systemPromptSuffix: "You are a helpful assistant. Use tools to provide accurate, up-to-date answers.",
    permissionRules: [
      { action: "bash", resource: "*", effect: "deny" },
      { action: "code_exec", resource: "*", effect: "deny" },
    ],
  },
  expert: {
    id: "expert",
    label: "专家",
    description: "深度研究、数据分析",
    maxIterations: 25,
    systemPromptSuffix: "You are a domain expert. Use tools for research, analysis, and verification.",
    permissionRules: [
      { action: "bash", resource: "*", effect: "deny" },
    ],
  },
  action: {
    id: "action",
    label: "执行",
    description: "自动化任务、批量处理",
    maxIterations: 50,
    systemPromptSuffix: "You are an automation agent. Execute tasks end-to-end using all available tools.",
    permissionRules: [],
  },
  safe: {
    id: "safe",
    label: "安全",
    description: "只读探索",
    maxIterations: 5,
    systemPromptSuffix: "You are in read-only mode. Explore and analyze without modifying anything.",
    permissionRules: [
      { action: "write_file", resource: "*", effect: "deny" },
      { action: "edit_file", resource: "*", effect: "deny" },
      { action: "bash", resource: "*", effect: "deny" },
      { action: "code_exec", resource: "*", effect: "deny" },
    ],
    toolAllowlist: ["read_file", "list_files", "grep", "glob", "web_search", "web_browse", "data_analysis"],
  },
  plan: {
    id: "plan",
    label: "规划",
    description: "代码分析、方案设计",
    maxIterations: 15,
    systemPromptSuffix: "You are a planning agent. Analyze code and design implementation plans.",
    permissionRules: [
      { action: "write_file", resource: "*", effect: "deny" },
      { action: "edit_file", resource: "*", effect: "deny" },
      { action: "bash", resource: "*", effect: "deny" },
      { action: "code_exec", resource: "*", effect: "deny" },
      { action: "cron_tool", resource: "*", effect: "deny" },
      { action: "worktree_tool", resource: "*", effect: "deny" },
      { action: "image_gen", resource: "*", effect: "deny" },
    ],
    toolAllowlist: ["read_file", "list_files", "grep", "glob", "web_search", "web_browse", "data_analysis", "lsp_definition", "lsp_references", "lsp_hover"],
  },
}

export function getModeConfig(mode: AgentMode): ModeConfig {
  return modeConfigs[mode]
}

export function getAllModes(): ModeConfig[] {
  return Object.values(modeConfigs)
}

export function modeSystemPrompt(mode: AgentMode, basePrompt: string): string {
  const config = getModeConfig(mode)
  return `${basePrompt}\n\n[MODE: ${config.label}]\n${config.systemPromptSuffix}`
}

/** 将模式配置转为 PermissionSet（叠加在 base 之上） */
export function modeToPermissionSet(mode: AgentMode, base: PermissionSet): PermissionSet {
  const config = getModeConfig(mode)
  const allRules = [...config.permissionRules, ...base.getAll()]
  return new PermissionSet(allRules)
}
