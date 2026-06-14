import { describe, expect, test, vi } from 'vitest'
import { Agent } from '../agent'
import { ToolRegistry } from '../registry'
import { make } from '../tool'
import { PermissionSet } from '../permission'
import { z } from 'zod'
import type { AgentEvent } from '../types'

vi.mock('../llm-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../llm-client')>()
  return {
    ...actual,
    createLLMClient: vi.fn().mockImplementation(() => {
      let streamCallCount = 0
      return {
        stream: vi.fn().mockImplementation(async function* () {
          streamCallCount++
          if (streamCallCount === 1) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: 'tc-1',
                name: 'write_file',
                arguments: JSON.stringify({ path: 'x.txt', content: 'hello' }),
                index: 0,
              },
            }
          }
          yield { type: 'done' }
        }),
      }
    }),
  }
})

const writeTool = make({
  name: 'write_file',
  description: 'write a file',
  inputSchema: z.object({ path: z.string(), content: z.string() }),
  outputSchema: z.string(),
  execute: async ({ path }) => ({ success: true, output: `wrote ${path}` }),
  permission: 'write',
})

describe('Agent permission loop', () => {
  test('yield permission_request and resume on allow', async () => {
    const registry = new ToolRegistry()
    registry.register(writeTool)
    const agent = new Agent(registry)

    const config = {
      sessionID: 'test-session',
      workspace: '/tmp',
      model: 'gpt-4',
      apiKey: 'test-key',
      apiUrl: 'http://localhost',
      permissions: new PermissionSet([{ action: 'write', resource: '*', effect: 'ask' }]),
    }

    const events: AgentEvent[] = []
    let permissionId: string | undefined

    for await (const event of agent.run('write a file', [], config)) {
      events.push(event)
      if (event.type === 'permission_request') {
        permissionId = event.id
        agent.replyPermission(event.id, 'allow')
      }
    }

    expect(events.some((e) => e.type === 'permission_request')).toBe(true)

    const permissionEvent = events.find((e) => e.type === 'permission_request') as Extract<
      AgentEvent,
      { type: 'permission_request' }
    >
    expect(permissionEvent.action).toBe('write')
    expect(permissionEvent.resources).toContain('x.txt')

    const toolResult = events.find((e) => e.type === 'tool_result') as Extract<
      AgentEvent,
      { type: 'tool_result' }
    >
    expect(toolResult).toBeDefined()
    expect(toolResult.result.success).toBe(true)
    expect(toolResult.result.output).toBe('wrote x.txt')
    expect(permissionId).toBeDefined()
  })

  test('calls onPermissionSave when reply is always', async () => {
    const registry = new ToolRegistry()
    registry.register(writeTool)
    const agent = new Agent(registry)

    const savedRules: Array<{ action: string; resource: string; effect: 'allow' | 'deny' | 'ask' }> = []
    const config = {
      sessionID: 'test-session',
      workspace: '/tmp',
      model: 'gpt-4',
      apiKey: 'test-key',
      apiUrl: 'http://localhost',
      permissions: new PermissionSet([{ action: 'write', resource: '*', effect: 'ask' }]),
      onPermissionSave: (rules: typeof savedRules) => {
        savedRules.push(...rules)
      },
    }

    for await (const event of agent.run('write a file', [], config)) {
      if (event.type === 'permission_request') {
        agent.replyPermission(event.id, 'always')
      }
    }

    expect(savedRules).toHaveLength(1)
    expect(savedRules[0]).toEqual({ action: 'write', resource: '*', effect: 'allow' })
  })

  test('returns error when reply is deny', async () => {
    const registry = new ToolRegistry()
    registry.register(writeTool)
    const agent = new Agent(registry)

    const config = {
      sessionID: 'test-session',
      workspace: '/tmp',
      model: 'gpt-4',
      apiKey: 'test-key',
      apiUrl: 'http://localhost',
      permissions: new PermissionSet([{ action: 'write', resource: '*', effect: 'ask' }]),
    }

    const events: AgentEvent[] = []

    for await (const event of agent.run('write a file', [], config)) {
      events.push(event)
      if (event.type === 'permission_request') {
        agent.replyPermission(event.id, 'deny')
      }
    }

    const toolResult = events.find((e) => e.type === 'tool_result') as Extract<
      AgentEvent,
      { type: 'tool_result' }
    >
    expect(toolResult).toBeDefined()
    expect(toolResult.result.success).toBe(false)
    expect(toolResult.result.error).toContain('Permission denied')
  })
})
