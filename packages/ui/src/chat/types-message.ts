export type ToolCallStatus = "running" | "done" | "error";

export interface CompactionData {
  reason: string;
  tokensBefore: number;
  tokensAfter: number;
}

export interface MiraPart {
  type: "text" | "thinking" | "tool-call" | "file" | "diff-summary" | "compaction";
  /** text / thinking */
  text?: string;
  /** tool-call */
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  status?: ToolCallStatus;
  result?: string;
  snapshotId?: string;
  /** file */
  mime?: string;
  url?: string;
  name?: string;
  /** diff-summary */
  files?: DiffFileEntry[];
  /** compaction */
  compaction?: CompactionData;
}

export interface DiffFileEntry {
  filePath: string;
  additions: number;
  deletions: number;
  oldContent: string;
  newContent: string;
}

export interface MessageTiming {
  streamStartTime: number;
  firstTokenTime?: number;
  totalStreamTime?: number;
  tokenCount?: number;
  /** 真实 prompt tokens（来自 LLM API） */
  promptTokens?: number;
  /** 真实 completion tokens（来自 LLM API） */
  completionTokens?: number;
  tokensPerSecond?: number;
  totalChunks: number;
  toolCallCount: number;
}

export interface MiraMessage {
  id: string;
  role: "user" | "assistant";
  parts: MiraPart[];
  dbId?: number;
  createdAt?: Date;
  timing?: MessageTiming;
  retryCount?: number;
}
