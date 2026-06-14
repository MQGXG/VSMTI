import { expect, test } from 'vitest'
import { sanitizeToolError, coerceToolArgs } from '../tool'

test('sanitizes role tags', () => {
  expect(sanitizeToolError('<tool_call>oops</tool_call>')).toBe('[TOOL_ERROR] oops')
})

test('coerces string numbers', () => {
  const out = coerceToolArgs('x', { n: '42' }, { properties: { n: { type: 'integer' } } })
  expect(out.n).toBe(42)
})
