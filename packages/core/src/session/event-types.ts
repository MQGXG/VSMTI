/**
 * 事件类型定义 — 对标 opencode 的 Event Sourcing 架构
 *
 * 所有会话状态变化都通过事件记录，messages 表变为事件投影。
 * Durable 事件（可持久化）vs Live-only delta（仅流式传播）。
 */

// ── 事件类型枚举 ────────────────────────────────────────

export type EventType =
  | "message.appended"
  | "message.edited"
  | "message.deleted"
  | "session.created"
  | "session.title_updated"
  | "session.compacted"
  | "context.rebuilt"
  | "checkpoint.saved"
  | "tool.executed"
  | "goal.created"
  | "goal.satisfied"
  | "fork.created"

// ── 事件基础结构 ────────────────────────────────────────

export interface SessionEvent {
  /** 事件在聚合内的序列号（单调递增） */
  seq: number
  /** 会话 ID */
  session_id: string
  /** 事件类型 */
  type: EventType
  /** 事件负载 */
  payload: Record<string, unknown>
  /** 事件创建时间 */
  timestamp: string
  /** 事件 schema 版本（用于演进） */
  version: number
}

// ── 具体事件负载类型 ────────────────────────────────────

export interface MessageAppendedPayload {
  role: "user" | "assistant" | "tool"
  content: string
  toolCallId?: string
  retryCount?: number
}

export interface MessageEditedPayload {
  messageId: number
  newContent: string
  reason?: string
}

export interface MessageDeletedPayload {
  messageId: number
}

export interface SessionCreatedPayload {
  project_id?: string
  title?: string
  workspace?: string
}

export interface SessionTitleUpdatedPayload {
  newTitle: string
  oldTitle?: string
}

export interface SessionCompactedPayload {
  reason: string
  messagesBefore: number
  messagesAfter: number
  tokensBefore: number
  tokensAfter: number
  compactedMessages: Array<{ role: string; content: string }>
}

export interface ContextRebuiltPayload {
  reason: string
  tokensBefore: number
  tokensAfter: number
}

export interface CheckpointSavedPayload {
  summary: string
  activeTask?: string
  keyFiles?: string[]
}

export interface ToolExecutedPayload {
  toolName: string
  toolCallId: string
  args: Record<string, unknown>
  result: { success: boolean; output?: string; error?: string }
  durationMs: number
}

export interface GoalCreatedPayload {
  goalId: string
  description: string
  timeoutMs?: number
}

export interface GoalSatisfiedPayload {
  goalId: string
  reasoning: string
  confidence: number
}

export interface ForkCreatedPayload {
  sourceSessionId: string
  targetSessionId: string
  atMessageId?: number
}

// ── 事件快照 ────────────────────────────────────────────

export interface EventSnapshot {
  snapshot_id: string
  session_id: string
  /** 快照对应的 seq 号 */
  up_to_seq: number
  /** 快照时的消息列表（投影结果） */
  messages_json: string
  /** 快照时的元数据 */
  metadata_json: string
  created_at: string
}

// ── 辅助函数 ────────────────────────────────────────────

/** 创建消息追加事件 */
export function createMessageEvent(
  sessionId: string,
  message: MessageAppendedPayload,
  timestamp?: string,
): Omit<SessionEvent, "seq"> {
  return {
    session_id: sessionId,
    type: "message.appended",
    payload: message,
    timestamp: timestamp || new Date().toISOString(),
    version: 1,
  }
}

/** 创建会话压缩事件 */
export function createCompactionEvent(
  sessionId: string,
  compaction: SessionCompactedPayload,
): Omit<SessionEvent, "seq"> {
  return {
    session_id: sessionId,
    type: "session.compacted",
    payload: compaction,
    timestamp: new Date().toISOString(),
    version: 1,
  }
}

/** 创建工具执行事件 */
export function createToolEvent(
  sessionId: string,
  tool: ToolExecutedPayload,
): Omit<SessionEvent, "seq"> {
  return {
    session_id: sessionId,
    type: "tool.executed",
    payload: tool,
    timestamp: new Date().toISOString(),
    version: 1,
  }
}
