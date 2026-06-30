/**
 * 上下文压缩管线 — 在上下文窗口溢出时分层压缩
 * L1: 裁剪中间消息 | L2: 旧 tool_result 占位化 | L3: LLM 摘要
 */

import { LLMMessage } from "./llm-sdk"
import { estimateTokens } from "./message-utils"

export type CompactLevel = "none" | "l1_snip" | "l2_micro" | "l3_auto"

export interface CompactResult {
  messages: LLMMessage[]
  level: CompactLevel
  summary: string
}

/** L1: 裁剪中间消息 — 保留 system、首尾用户消息、最近的 assistant/tool */
function l1Snip(messages: LLMMessage[], targetTokens: number): LLMMessage[] {
  if (estimateTokens(messages) <= targetTokens) return messages

  const system = messages.find((m) => m.role === "system")
  const rest = messages.filter((m) => m.role !== "system")

  // 保留最新的 60% 消息
  const keepCount = Math.max(4, Math.ceil(rest.length * 0.6))
  const keep = rest.slice(-keepCount)

  const result = system ? [system, ...keep] : keep

  if (estimateTokens(result) <= targetTokens) return result

  // 如果再超预算，继续裁剪到只剩下最新的 4 条
  const minimal = rest.slice(-4)
  return system ? [system, ...minimal] : minimal
}

/** L2: tool_result 占位化 — 将旧 tool_result 替换为摘要标记 */
function l2MicroCompact(messages: LLMMessage[]): LLMMessage[] {
  const result: LLMMessage[] = []
  let toolResultCount = 0

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role === "tool" && toolResultCount > 2) {
      // 第 3 个之后的 tool_result 替换为占位
      const truncated = msg.content.length > 100
        ? `${msg.content.slice(0, 100)}...[${msg.content.length} bytes truncated]`
        : msg.content
      result.push({ ...msg, content: truncated })
    } else {
      result.push(msg)
    }
    if (msg.role === "tool") toolResultCount++
  }

  return result
}

/** L3: 生成摘要提示 — 让 LLM 在下一轮压缩历史 */
function l3AutoCompact(messages: LLMMessage[], maxTokens: number): { messages: LLMMessage[]; summaryRequest: string } {
  const system = messages.find((m) => m.role === "system")
  const rest = messages.filter((m) => m.role !== "system")

  // 保留最近的对话
  const keepRecent = rest.slice(-6)
  const toSummarize = rest.slice(0, -6)

  const summaryRequest = toSummarize.length > 0
    ? `[System: The following conversation history has been compacted to save context space. ` +
      `The original conversation had ${rest.length} messages, summarized below. ` +
      `Only the most recent ${keepRecent.length} messages are preserved in full.]`
    : ""

  return {
    messages: system ? [system, ...keepRecent] : keepRecent,
    summaryRequest,
  }
}

/** 执行上下文压缩管线 */
export function compactMessages(
  messages: LLMMessage[],
  maxTokens: number,
  level: CompactLevel = "l1_snip",
): CompactResult {
  if (estimateTokens(messages) <= maxTokens) {
    return { messages, level: "none", summary: "" }
  }

  let compacted = messages
  let appliedLevel: CompactLevel = "none"
  let summary = ""

  // L1: 裁剪
  if (level === "l1_snip" || level === "l2_micro" || level === "l3_auto") {
    compacted = l1Snip(messages, maxTokens)
    appliedLevel = "l1_snip"
  }

  if (estimateTokens(compacted) <= maxTokens) {
    return { messages: compacted, level: appliedLevel, summary: "" }
  }

  // L2: 占位化
  if (level === "l2_micro" || level === "l3_auto") {
    compacted = l2MicroCompact(compacted)
    appliedLevel = "l2_micro"
  }

  if (estimateTokens(compacted) <= maxTokens) {
    return { messages: compacted, level: appliedLevel, summary: "" }
  }

  // L3: 摘要
  if (level === "l3_auto") {
    const result = l3AutoCompact(compacted, maxTokens)
    compacted = result.messages
    summary = result.summaryRequest
    appliedLevel = "l3_auto"
  }

  return { messages: compacted, level: appliedLevel, summary }
}
