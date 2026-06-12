export interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  argsText?: string;
  result?: string;
  status: "running" | "done" | "error";
}

export interface Message {
  id: string;       // 前端本地 ID
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
  dbId?: number;    // 后端数据库消息 ID（用于分叉）
}

export type AgentMode = "assistant" | "expert" | "action" | "safe";
