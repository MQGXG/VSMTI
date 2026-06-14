import { LLMMessage } from './llm-client'

export function repairMessageSequence(messages: LLMMessage[]): LLMMessage[] {
  const repaired: LLMMessage[] = []
  for (const msg of messages) {
    const last = repaired[repaired.length - 1]
    if (last?.role === 'tool' && msg.role !== 'assistant') {
      repaired.push({ role: 'assistant', content: '' })
    }
    if (last?.role === 'user' && msg.role === 'user') {
      last.content += '\n\n' + msg.content
      continue
    }
    if (last?.role === 'assistant' && msg.role === 'assistant' && !last.tool_calls) {
      last.content += '\n\n' + msg.content
      continue
    }
    repaired.push(msg)
  }
  if (repaired[repaired.length - 1]?.role === 'tool') {
    repaired.push({ role: 'assistant', content: '' })
  }
  return repaired
}

export function estimateTokens(messages: LLMMessage[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4) + 50, 0)
}

export function truncateToBudget(messages: LLMMessage[], maxTokens: number): LLMMessage[] {
  if (estimateTokens(messages) <= maxTokens) return messages
  const system = messages.find(m => m.role === 'system')
  const rest = messages.filter(m => m.role !== 'system')

  while (rest.length > 2 && estimateTokens([system!, ...rest]) > maxTokens) {
    const removed = rest.shift()!
    // 如果移除的是带 tool_calls 的 assistant，连带后面的 tool 消息一起移除
    if (removed.role === 'assistant' && removed.tool_calls?.length) {
      while (rest.length > 0 && rest[0].role === 'tool') {
        rest.shift()
      }
    }
  }
  return system ? [system, ...rest] : rest
}
