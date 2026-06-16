import { z } from "zod"

export type MessageRole = "system" | "user" | "assistant" | "tool"

export const TextPartSchema = z.object({ type: z.literal("text"), text: z.string() })
export type TextPart = z.infer<typeof TextPartSchema>

export const ToolCallPartSchema = z.object({
  type: z.literal("tool-call"),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.any()),
})
export type ToolCallPart = z.infer<typeof ToolCallPartSchema>

export const ToolResultPartSchema = z.object({
  type: z.literal("tool-result"),
  toolCallId: z.string(),
  toolName: z.string(),
  output: z.union([z.string(), z.object({ type: z.literal("text"), value: z.string() })]),
})
export type ToolResultPart = z.infer<typeof ToolResultPartSchema>

export const ContentPartSchema = z.union([
  TextPartSchema,
  ToolCallPartSchema,
  ToolResultPartSchema,
])
export type ContentPart = z.infer<typeof ContentPartSchema>

export interface LLMMessage {
  role: MessageRole
  content: string | ContentPart[]
  tool_call_id?: string
}

export type ToolResultOutput = string | { type: "text"; value: string }

export function getToolResultOutput(output: ToolResultOutput): string {
  return typeof output === "string" ? output : output.value
}

export function isTextPart(part: ContentPart): part is TextPart {
  return part.type === "text"
}

export function isToolCallPart(part: ContentPart): part is ToolCallPart {
  return part.type === "tool-call"
}

export function isToolResultPart(part: ContentPart): part is ToolResultPart {
  return part.type === "tool-result"
}
