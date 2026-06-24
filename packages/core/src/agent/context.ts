import type { ToolContext } from "../tool"
import type { AgentMode } from "../modes"
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
  if (memoryPrompt) parts.push(memoryPrompt)
  const codeSuffix = await getCodeContextSuffix(config.workspace, config.currentFile)
  if (codeSuffix) parts.push(codeSuffix)
  return parts.join("\n\n")
}

async function getCodeContextSuffix(workspace: string, currentFile?: string): Promise<string> {
  try {
    return await codeContext.buildSystemPromptSuffix(workspace, currentFile)
  } catch {
    return ""
  }
}
