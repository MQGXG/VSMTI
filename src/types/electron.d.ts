export interface LogEntry {
  timestamp: string;
  level: "info" | "error";
  message: string;
}

export interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export type AgentEvent =
  | { type: "content"; text: string }
  | { type: "tool_start"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; result: { success: boolean; output?: string; error?: string } }
  | { type: "permission_request"; id: string; action: string; resources: string[]; toolCall: { id: string; name: string; input: Record<string, unknown> } }
  | { type: "error"; message: string }
  | { type: "finish"; reason: string }
  | { type: "thinking"; text: string };

export interface ElectronAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  getPythonStatus: () => Promise<{ status: string; port: number; url: string; error?: string }>;
  getPythonLogs: () => Promise<LogEntry[]>;
  clearPythonLogs: () => Promise<void>;
  restartPython: () => Promise<{ status: string; port: number; url: string; error?: string }>;
  openFile: () => Promise<string[]>;
  openDirectory: () => Promise<string[]>;
  saveFile: (name: string) => Promise<string>;
  notify: (title: string, body: string) => Promise<void>;
  encryptApiKey: (text: string) => Promise<string>;
  decryptApiKey: (encrypted: string) => Promise<string>;
  isEncryptionAvailable: () => Promise<boolean>;
  platform: string;

  // TypeScript Agent Core
  agent: {
    executeTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
    listTools: () => Promise<ToolInfo[]>;
    chat: (config: Record<string, unknown>, message: string, history: Array<{ role: string; content: string }>) => Promise<AgentEvent[]>;
    runAgentStream: (sessionId: string, message: string, config: Record<string, unknown>) => Promise<AgentEvent[]>;

    /** 列出可用 Skill */
    listSkills: () => Promise<Array<{ name: string; description: string; category: string | null }>>;

    /** 实时流式 Agent（支持交互式权限确认） */
    startStream: (sessionId: string, message: string, config: Record<string, unknown>) => Promise<string>;
    /** 回复权限请求 */
    replyPermission: (channel: string, requestId: string, reply: "allow" | "deny" | "always") => Promise<void>;
    /** 停止 Agent 流 */
    stopStream: (channel: string) => Promise<void>;
    /** 监听 Agent 事件 */
    onEvent: (channel: string, callback: (event: any) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
