import { describe, expect, test } from 'vitest'
import { Agent } from '../agent/agent'
import { ToolRegistry } from '../system/registry'
import { make } from '../shared/tool'
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
