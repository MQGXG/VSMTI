import { describe, expect, test } from 'vitest'
import { Agent } from '../agent'
import { ToolRegistry } from '../registry'
import { make } from '../tool'
import { z } from 'zod'

const echoTool = make({
  name: 'echo',
  description: 'echo',
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.string(),
  execute: async ({ text }) => ({ success: true, output: text }),
})

describe('Agent', () => {
  test('initializes with registry', () => {
    const registry = new ToolRegistry()
    registry.register(echoTool)
    const agent = new Agent(registry)
    expect(agent).toBeDefined()
  })
})
