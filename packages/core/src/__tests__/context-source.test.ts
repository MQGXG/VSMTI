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
  test("generate 注入当天日期（Today's date），供 LLM 免工具回答时间问题", () => {
    const env = new EnvSource()
    const content = env.generate(makeCtx())
    expect(content).toMatch(/Today's date: \w{3} \w{3} \d{2} \d{4}/)
    expect(content).toContain('Working directory')
    expect(content).toContain('Platform')
  })

  test('fingerprint 同日内稳定（hash 含当天日期，每日仅变化一次）', () => {
    const env = new EnvSource()
    const a = env.fingerprint(makeCtx())
    const b = env.fingerprint(makeCtx())
    expect(a.hash).toBe(b.hash)
    expect(a.hash).toMatch(/^env-.*-v1$/)
  })

  test('SourceManager 二次 build 字节一致（同日内内容静态）', async () => {
    const sm = new SourceManager('/test/workspace')
    sm.register(new BaseSource())
    sm.register(new EnvSource())
    const ctx = makeCtx()
    const first = await sm.build(ctx)
    const second = await sm.build(ctx)
    expect(first).toBe(second)
  })
})
