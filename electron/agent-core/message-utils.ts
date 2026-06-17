import { LLMMessage } from './llm-sdk'

function contentLength(content: string | Array<any>): number {
  if (typeof content === 'string') return content.length
  return content.reduce((sum, p) => sum + (p.text?.length || JSON.stringify(p).length), 0)
}

export function hasToolCalls(content: string | Array<any>): boolean {
  if (typeof content === 'string') return false
  return content.some(p => p.type === 'tool-call')
}

export function repairMessageSequence(messages: LLMMessage[]): LLMMessage[] {
  const repaired: LLMMessage[] = []
  for (const msg of messages) {
    const last = repaired[repaired.length - 1]
    if (last?.role === 'tool' && msg.role !== 'assistant') {
      repaired.push({ role: 'assistant', content: [] })
    }
    if (last?.role === 'user' && msg.role === 'user') {
      if (typeof last.content === 'string' && typeof msg.content === 'string') {
        last.content += '\n\n' + msg.content
      }
      continue
    }
    if (last?.role === 'assistant' && msg.role === 'assistant' && !hasToolCalls(last.content)) {
      if (typeof last.content === 'string' && typeof msg.content === 'string') {
        last.content += '\n\n' + msg.content
      }
      continue
    }
    repaired.push(msg)
  }
  if (repaired[repaired.length - 1]?.role === 'tool') {
    repaired.push({ role: 'assistant', content: [] })
  }
  return repaired
}

export function estimateTokens(messages: LLMMessage[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil(contentLength(m.content) / 4) + 50, 0)
}

export function truncateToBudget(messages: LLMMessage[], maxTokens: number): LLMMessage[] {
  if (estimateTokens(messages) <= maxTokens) return messages
  const system = messages.find(m => m.role === 'system')
  const rest = messages.filter(m => m.role !== 'system')

  // 目标：压缩到 70% 的 budget，留出空间
  const targetTokens = Math.floor(maxTokens * 0.7)

  while (rest.length > 2 && estimateTokens([system!, ...rest]) > targetTokens) {
    const removed = rest.shift()!
    // 如果移除的是带 tool-call 的 assistant，连带后面的 tool 消息一起移除
    if (removed.role === 'assistant' && hasToolCalls(removed.content)) {
      while (rest.length > 0 && rest[0].role === 'tool') {
        rest.shift()
      }
    }
    // 如果移除后队首是 tool 消息（孤立的结果），也一并移除
    while (rest.length > 0 && rest[0].role === 'tool') {
      rest.shift()
    }
  }
  const result = system ? [system, ...rest] : rest
  return repairMessageSequence(result)
}

/**
 * 上下文重建 — 当接近 token 限制时，从 checkpoint 重建上下文
 * 参考 MiMo-Code 的 context reconstruction 系统
 */
export interface CheckpointData {
  summary: string
  activeTask: string
  recentDecisions: string[]
  keyFiles: string[]
}

export function rebuildContextFromCheckpoint(
  messages: LLMMessage[],
  checkpoint: CheckpointData,
  maxTokens: number,
): LLMMessage[] {
  const system = messages.find(m => m.role === 'system')
  const rest = messages.filter(m => m.role !== 'system')

  // 构建 checkpoint 上下文摘要
  const checkpointParts: string[] = []
  if (checkpoint.summary) {
    checkpointParts.push(`[Session Summary]\n${checkpoint.summary}`)
  }
  if (checkpoint.activeTask) {
    checkpointParts.push(`[Active Task]\n${checkpoint.activeTask}`)
  }
  if (checkpoint.recentDecisions.length > 0) {
    const recent = checkpoint.recentDecisions.slice(-5)
    checkpointParts.push(`[Recent Decisions]\n${recent.map(d => `- ${d}`).join('\n')}`)
  }
  if (checkpoint.keyFiles.length > 0) {
    const recentFiles = checkpoint.keyFiles.slice(-10)
    checkpointParts.push(`[Key Files]\n${recentFiles.map(f => `- ${f}`).join('\n')}`)
  }

  // 保留最近的消息（约 20% 的 budget，更激进的压缩）
  const recentBudget = Math.floor(maxTokens * 0.2)
  const keptMessages: LLMMessage[] = []
  let tokenCount = 0

  // 从后往前保留消息
  for (let i = rest.length - 1; i >= 0; i--) {
    const msg = rest[i]
    const msgTokens = Math.ceil(contentLength(msg.content) / 4) + 50
    if (tokenCount + msgTokens > recentBudget) break
    keptMessages.unshift(msg)
    tokenCount += msgTokens
  }

  // 构建重建后的消息
  const checkpointSummary = checkpointParts.length > 0
    ? `[Context Reconstruction: Earlier conversation was truncated. Here's what was discussed before]\n\n${checkpointParts.join('\n\n')}`
    : ''

  const systemContent = typeof system?.content === 'string' ? system.content : ''
  const newSystem = system
    ? { ...system, content: systemContent + (checkpointSummary ? `\n\n${checkpointSummary}` : '') }
    : null

  const result = newSystem ? [newSystem, ...keptMessages] : keptMessages
  return repairMessageSequence(result)
}

/**
 * 检查是否需要上下文重建
 * 在 60% 时就开始重建，避免接近限制时才处理
 */
export function needsContextRebuild(messages: LLMMessage[], maxTokens: number): boolean {
  const currentTokens = estimateTokens(messages)
  return currentTokens > maxTokens * 0.6
}
