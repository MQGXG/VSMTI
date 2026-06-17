import type { ThreadMessageLike } from "@assistant-ui/react";
import type { Message, ToolCallInfo } from "./types";

export interface MiraMessage extends Message {
  createdAt?: Date;
  toolCallParts?: ToolCallPart[];
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: "running" | "complete" | "error";
  result?: string;
}

export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: string;
  status: "success" | "error";
}

export type MiraMessagePart = ToolCallPart | ToolResultPart;

export function convertMessage(message: MiraMessage): ThreadMessageLike {
  const parts: any[] = [];

  const text = typeof message.content === "string" ? message.content : String(message.content || "");
  if (text) {
    parts.push({
      type: "text",
      text,
    });
  }

  if (message.toolCalls && message.toolCalls.length > 0) {
    for (const tc of message.toolCalls) {
      parts.push({
        type: "tool-call",
        toolCallId: tc.toolCallId,
        toolName: tc.name,
        args: tc.args,
      } as any);
    }
  }

  return {
    role: message.role,
    content: parts.length > 0 ? parts : "",
    id: message.id,
    createdAt: message.createdAt,
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
  return {
    ...message,
    content: newContent,
  };
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

export function updateToolCallInMessage(
  message: MiraMessage,
  toolCallId: string,
  updates: Partial<ToolCallInfo>
): MiraMessage {
  if (!message.toolCalls) return message;
  return {
    ...message,
    toolCalls: message.toolCalls.map((tc) =>
      tc.toolCallId === toolCallId ? { ...tc, ...updates } : tc
    ),
  };
}
