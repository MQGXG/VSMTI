export interface ToolCallInfo {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  argsText?: string;
  result?: string;
  status: "running" | "done" | "error";
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
  isToolCall?: boolean;
  dbId?: number;
}

export type AgentMode = "assistant" | "expert" | "action" | "safe" | "plan";
