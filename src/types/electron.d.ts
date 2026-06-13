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
  output: string;
  error?: string;
}

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
    chat: (config: Record<string, unknown>, message: string, history: Array<{ role: string; content: string }>) =>
      Promise<Array<{ type: string; text?: string; name?: string; args?: Record<string, unknown>; output?: string; message?: string; reason?: string }>>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
