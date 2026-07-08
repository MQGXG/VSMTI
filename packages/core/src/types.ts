import type { ToolCall } from './shared/tool'

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

export type AgentEvent =
  | { type: 'content'; text: string }
  | { type: 'tool_start'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; result: { success: boolean; output?: string; error?: string; metadata?: Record<string, unknown> } }
  | { type: 'permission_request'; id: string; action: string; resources: string[]; toolCall: ToolCall }
  | { type: 'question'; id: string; question: string; options?: string[] }
  | { type: 'error'; message: string }
  | { type: 'finish'; reason: string; usage?: TokenUsage }
  | { type: 'thinking'; text: string }
  | { type: 'goal_status'; goalId: string; description: string; status: string; reasoning?: string }
  | { type: 'context_rebuild'; reason: string; tokensBefore: number; tokensAfter: number }
  | { type: 'retry'; attempt: number; error: string }
  | { type: 'subagent_status'; subagentId: string; status: string; description: string }
