export interface ElectronAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  getPythonStatus: () => Promise<{ status: string; port: number; url: string; error?: string }>;
  restartPython: () => Promise<{ status: string; port: number; url: string; error?: string }>;
  openFile: () => Promise<string[]>;
  saveFile: (name: string) => Promise<string>;
  notify: (title: string, body: string) => Promise<void>;
  platform: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
