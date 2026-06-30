import type { ThreadMessageLike } from "@assistant-ui/react";
import type { Message, ToolCallInfo } from "./types";

export interface MessageTiming {
  streamStartTime: number;
  firstTokenTime?: number;
  totalStreamTime?: number;
  tokenCount?: number;
  tokensPerSecond?: number;
  totalChunks: number;
  toolCallCount: number;
}

export interface MiraMessage extends Message {
  createdAt?: Date;
  toolCallParts?: ToolCallPart[];
  timing?: MessageTiming;
  thinking?: string;
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: "running" | "complete" | "error";
  result?: string;
}

export function convertMessage(message: MiraMessage): ThreadMessageLike {
  const parts: ThreadMessageLike["content"] = [];

  const text = typeof message.content === "string" ? message.content : String(message.content || "");
  if (text) {
    parts.push({ type: "text", text });
  }

  if (message.toolCalls && message.toolCalls.length > 0) {
    for (const tc of message.toolCalls) {
      parts.push({
        type: "tool-call" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.name,
        args: tc.args,
      });
    }
  }

  return {
    role: message.role,
    content: parts.length > 0 ? parts : "",
    id: message.id,
    createdAt: message.createdAt,
    metadata: message.timing
      ? { timing: message.timing, custom: {} }
      : undefined,
  };
}

export function createMiraMessage(
  role: "user" | "assistant",
  content: string,
  id?: string
): MiraMessage {
  return {
    id: id || crypto.randomUUID(),
    role,
    content,
    createdAt: new Date(),
  };
}

export function updateMiraMessageContent(
  message: MiraMessage,
  newContent: string
): MiraMessage {
  return { ...message, content: newContent };
}

export function addToolCallToMessage(
  message: MiraMessage,
  toolCall: ToolCallInfo
): MiraMessage {
  return {
    ...message,
    toolCalls: [...(message.toolCalls || []), toolCall],
  };
}
