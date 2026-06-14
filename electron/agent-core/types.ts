import { ToolCall } from './tool'

export type AgentEvent =
  | { type: 'content'; text: string }
  | { type: 'tool_start'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; result: { success: boolean; output?: string; error?: string } }
  | { type: 'permission_request'; id: string; action: string; resources: string[]; toolCall: ToolCall }
  | { type: 'error'; message: string }
  | { type: 'finish'; reason: string }
  | { type: 'thinking'; text: string }
