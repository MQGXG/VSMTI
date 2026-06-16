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

  while (rest.length > 2 && estimateTokens([system!, ...rest]) > maxTokens) {
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
