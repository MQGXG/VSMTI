import { describe, expect, test } from 'vitest'
import { repairMessageSequence, estimateTokens, truncateToBudget } from '../shared/message-utils'

describe('repairMessageSequence', () => {
  test('tool 后缺少 assistant 时自动补充', () => {
    const out = repairMessageSequence([
      { role: 'tool', content: 'x', tool_call_id: '1' },
      { role: 'user', content: 'y' },
    ])
    expect(out[out.length - 1].role).toBe('user')
    expect(out[out.length - 2].role).toBe('assistant')
  })

  test('连续的 tool 消息被保留（前面会被补充 assistant 消息）', () => {
    const out = repairMessageSequence([
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: '1', toolName: 'echo', args: {} }] },
      { role: 'tool', content: 'r1', tool_call_id: '1' },
      { role: 'tool', content: 'r2', tool_call_id: '1' },
    ])
    // 修复器可能会增加 assistant 包装，但原始 tool 消息应保留
    const toolCount = out.filter(m => m.role === 'tool').length
    expect(toolCount).toBeGreaterThanOrEqual(2)
  })

  test('空数组返回空', () => {
    expect(repairMessageSequence([])).toEqual([])
  })
})

describe('estimateTokens', () => {
  test('空消息返回 0', () => {
    expect(estimateTokens([])).toBe(0)
  })

  test('估算字符串消息', () => {
    const tokens = estimateTokens([{ role: 'user', content: 'hello world' }])
    expect(tokens).toBeGreaterThan(0)
  })

  test('估算包含 Part 数组的消息', () => {
    const tokens = estimateTokens([{
      role: 'assistant',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool-call', toolCallId: '1', toolName: 'echo', args: { text: 'world' } },
      ],
    }])
    expect(tokens).toBeGreaterThan(0)
  })
})

describe('truncateToBudget', () => {
  test('保留最新消息', () => {
    const messages = [
      { role: 'system' as const, content: 'system' },
      { role: 'user' as const, content: 'a'.repeat(4000) },
      { role: 'assistant' as const, content: 'b'.repeat(4000) },
      { role: 'user' as const, content: 'current' },
    ]
    const out = truncateToBudget(messages, 500)
    expect(out.some(m => m.content === 'current')).toBe(true)
  })

  test('system 消息始终保留', () => {
    const messages = [
      { role: 'system' as const, content: 'you are helpful' },
      { role: 'user' as const, content: 'a'.repeat(10000) },
    ]
    const out = truncateToBudget(messages, 100)
    expect(out.some(m => m.role === 'system')).toBe(true)
  })

  test('余额充足时不截断', () => {
    const messages = [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, content: 'hello' },
    ]
    const out = truncateToBudget(messages, 100000)
    expect(out.length).toBe(2)
  })
})
