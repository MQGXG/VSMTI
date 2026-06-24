import { expect, test } from 'vitest'
import { repairMessageSequence, estimateTokens, truncateToBudget } from '../message-utils'

test('repairs tool followed by user', () => {
  const out = repairMessageSequence([
    { role: 'tool', content: 'x', tool_call_id: '1' },
    { role: 'user', content: 'y' },
  ])
  expect(out[out.length - 1].role).toBe('user')
  expect(out[out.length - 2].role).toBe('assistant')
})

test('truncates old messages', () => {
  const messages = [
    { role: 'system' as const, content: 'system' },
    { role: 'user' as const, content: 'a'.repeat(4000) },
    { role: 'assistant' as const, content: 'b'.repeat(4000) },
    { role: 'user' as const, content: 'current' },
  ]
  const out = truncateToBudget(messages, 500)
  expect(out.some(m => m.content === 'current')).toBe(true)
})
