import type { ToolContext } from "../shared/tool"
import type { AgentMode } from "../config/modes"
import { CodeContext } from "../lsp/code-context"

const codeContext = new CodeContext()

export interface AgentRunConfig {
  sessionID: string
  workspace: string
  mode?: AgentMode
  systemPrompt?: string
  options?: Record<string, unknown>
  currentFile?: string
}

let _cachedCodeSuffix = ""
let _cachedWs = ""
let _cachedFile = ""

export function buildToolContext(config: AgentRunConfig): ToolContext {
  return {
    sessionID: config.sessionID,
    workspace: config.workspace,
    mode: config.mode || "assistant",
    agent: "build",
    assistantMessageID: "",
    toolCallID: "",
    shell: (config.options as any)?.shell || undefined,
  }
}

export async function buildSystemMessage(config: AgentRunConfig, memoryPrompt?: string, defaultSystem?: string): Promise<string> {
  const base = config.systemPrompt || defaultSystem || "You are a helpful AI assistant."
  const parts = [base]

  // 注入当前环境信息（参考项目标准做法）
  const envParts: string[] = [
    "<env>",
    `  Working directory: ${config.workspace || "unknown"}`,
    `  Platform: ${process.platform}`,
    `  Today's date: ${new Date().toDateString()}`,
    `  Current time: ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`,
    "</env>",
  ]
  parts.push(envParts.join("\n"))

  if (memoryPrompt) parts.push(memoryPrompt)

  if (config.workspace !== _cachedWs || config.currentFile !== _cachedFile) {
    _cachedCodeSuffix = await getCodeContextSuffix(config.workspace, config.currentFile)
    _cachedWs = config.workspace
    _cachedFile = config.currentFile || ""
  }
  if (_cachedCodeSuffix) parts.push(_cachedCodeSuffix)

  return parts.join("\n\n")
}

async function getCodeContextSuffix(workspace: string, currentFile?: string): Promise<string> {
  try {
    return await codeContext.buildSystemPromptSuffix(workspace, currentFile)
  } catch {
    return ""
  }
}

