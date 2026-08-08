import { describe, expect, test, vi } from 'vitest'
import { Agent } from '../agent/agent'
import { ToolRegistry } from '../system/registry'
import { make } from '../shared/tool'
import { z } from 'zod/v4'
import { loadSession } from '../session/store'

vi.mock('../llm/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../llm/client')>()
  return {
    ...actual,
    createLLMClient: vi.fn().mockImplementation(() => ({
      stream: vi.fn().mockImplementation(async function* () {
        yield { type: 'delta' as const, delta: 'Hello from agent' }
        yield { type: 'done' as const }
      }),
      complete: vi.fn().mockImplementation(async () => ({ content: '0' })),
    })),
  }
})

const echoTool = make({
  name: 'echo',
  description: '回声工具',
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.string(),
  execute: async ({ text }) => ({ success: true, output: text }),
})

describe('Agent', () => {
  test('使用注册表初始化', () => {
    const registry = new ToolRegistry()
    registry.register(echoTool)
    const agent = new Agent(registry)
    expect(agent).toBeDefined()
  })

  test('abort 将状态机置为 stopped', () => {
    const registry = new ToolRegistry()
    const agent = new Agent(registry)
    expect(agent.aborted).toBe(false)
    agent.abort()
    expect(agent.aborted).toBe(true)
  })

  test('replyPermission 传递到状态机', () => {
    const registry = new ToolRegistry()
    const agent = new Agent(registry)
    agent.replyPermission('nonexistent', 'allow') // 应静默处理
  })

  test('getGoalJudge 返回 goalJudge 实例', () => {
    const registry = new ToolRegistry()
    const agent = new Agent(registry)
    expect(agent.getGoalJudge()).toBeDefined()
  })

  test('getContextManager 返回 contextManager 实例', () => {
    const registry = new ToolRegistry()
    const agent = new Agent(registry)
    expect(agent.getContextManager()).toBeDefined()
  })

  test('无 workspace 时 getSourceManager 返回 null', () => {
    const registry = new ToolRegistry()
    const agent = new Agent(registry)
    expect(agent.getSourceManager()).toBeNull()
  })

  test('构造函数接受 deps 注入', () => {
    const registry = new ToolRegistry()
    const agent = new Agent(registry, undefined, undefined, undefined, {
      // 使用空 deps 验证注入路径
    })
    expect(agent).toBeDefined()
    expect(agent.getContextManager()).toBeDefined()
  })

  test('多次 abort 安全', () => {
    const registry = new ToolRegistry()
    const agent = new Agent(registry)
    agent.abort()
    agent.abort() // 第二次不应抛异常
    expect(agent.aborted).toBe(true)
  })

  test('persists pure-text assistant reply to session', async () => {
    const registry = new ToolRegistry()
    const agent = new Agent(registry)
    const config = {
      sessionID: 'c1-test',
      workspace: '/tmp',
      model: 'gpt-4',
      apiKey: 'k',
      apiUrl: 'http://x',
    }
    for await (const _e of agent.run('hi', [], config)) {}
    const stored = await loadSession('c1-test')
    const assistant = stored?.messages.filter((m) => m.role === 'assistant')
    expect(assistant?.some((m) => m.content.includes('Hello from agent'))).toBe(true)
  })
})
