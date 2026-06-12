export interface LogEntry {
  timestamp: string;
  level: "info" | "error";
  message: string;
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
  saveFile: (name: string) => Promise<string>;
  notify: (title: string, body: string) => Promise<void>;
  encryptApiKey: (text: string) => Promise<string>;
  decryptApiKey: (encrypted: string) => Promise<string>;
  isEncryptionAvailable: () => Promise<boolean>;
  platform: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
