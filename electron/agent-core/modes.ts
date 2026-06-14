/**
 * Agent 模式管理 — 4 种运行模式控制行为、权限、迭代次数
 * 替代 Python modes.py
 */

export type AgentMode = "assistant" | "expert" | "action" | "safe"

export interface ModeConfig {
  id: AgentMode
  label: string
  description: string
  maxIterations: number
  systemPromptSuffix: string
  allowFileWrite: boolean
  allowSystemCommand: boolean
  toolBlacklist: string[]
}

const modeConfigs: Record<AgentMode, ModeConfig> = {
  assistant: {
    id: "assistant",
    label: "助手",
    description: "日常问答、写作、分析",
    maxIterations: 10,
    systemPromptSuffix: "You are a helpful assistant. Answer questions clearly and concisely.",
    allowFileWrite: true,
    allowSystemCommand: false,
    toolBlacklist: ["bash", "run_code"],
  },
  expert: {
    id: "expert",
    label: "专家",
    description: "深度研究、数据分析",
    maxIterations: 25,
    systemPromptSuffix: "You are a domain expert. Provide thorough, detailed analysis.",
    allowFileWrite: true,
    allowSystemCommand: false,
    toolBlacklist: ["bash"],
  },
  action: {
    id: "action",
    label: "执行",
    description: "自动化任务、批量处理",
    maxIterations: 50,
    systemPromptSuffix: "You are an automation agent. Execute tasks efficiently.",
    allowFileWrite: true,
    allowSystemCommand: true,
    toolBlacklist: [],
  },
  safe: {
    id: "safe",
    label: "安全",
    description: "只读探索",
    maxIterations: 5,
    systemPromptSuffix: "You are in read-only mode. You can read and search but cannot modify anything.",
    allowFileWrite: false,
    allowSystemCommand: false,
    toolBlacklist: ["write_file", "edit_file", "bash", "run_code"],
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

export function modeFilterTools(mode: AgentMode, toolNames: string[]): string[] {
  const config = getModeConfig(mode)
  const blacklist = new Set(config.toolBlacklist)
  return toolNames.filter((t) => !blacklist.has(t))
}
