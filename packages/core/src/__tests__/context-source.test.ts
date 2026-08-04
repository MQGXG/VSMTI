import { describe, expect, test } from 'vitest'
import { EnvSource, SourceManager, BaseSource, type SourceContext } from '../session/context-source'

function makeCtx(overrides?: Partial<SourceContext>): SourceContext {
  return {
    sessionID: 's1',
    workspace: '/test/workspace',
    ...overrides,
  }
}

describe('EnvSource 缓存稳定性', () => {
  test('generate 不包含时间戳，保证 system 前缀字节稳定', () => {
    const env = new EnvSource()
    const content = env.generate(makeCtx())
    expect(content).not.toMatch(/Today's date|Current time/)
    expect(content).toContain('Working directory')
    expect(content).toContain('Platform')
  })

  test('fingerprint 静态稳定（多次调用 hash 一致）', () => {
    const env = new EnvSource()
    const a = env.fingerprint(makeCtx())
    const b = env.fingerprint(makeCtx())
    expect(a.hash).toBe(b.hash)
    expect(a.hash).toBe('env-static-v1')
  })

  test('SourceManager 二次 build 字节一致（内容静态）', async () => {
    const sm = new SourceManager('/test/workspace')
    sm.register(new BaseSource())
    sm.register(new EnvSource())
    const ctx = makeCtx()
    const first = await sm.build(ctx)
    const second = await sm.build(ctx)
    expect(first).toBe(second)
  })
})
