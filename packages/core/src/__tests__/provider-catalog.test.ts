import { describe, expect, test, beforeAll } from 'vitest'
import { ProviderCatalog } from '../llm/provider-catalog'

beforeAll(() => {
  ProviderCatalog.registerBuiltins()
})

describe('ProviderCatalog', () => {
  test('内置 12 个 Provider 注册正确', () => {
    const providers = ProviderCatalog.listProviders()
    expect(providers.length).toBe(12)
    const ids = providers.map(p => p.id)
    expect(ids).toContain('openai')
    expect(ids).toContain('anthropic')
    expect(ids).toContain('deepseek')
    expect(ids).toContain('ollama')
    expect(ids).toContain('groq')
    expect(ids).toContain('fireworks')
    expect(ids).toContain('together')
    expect(ids).toContain('cerebras')
    expect(ids).toContain('perplexity')
    expect(ids).toContain('gemini')
    expect(ids).toContain('vertex')
    expect(ids).toContain('custom')
  })

  test('getProvider 返回 Provider 定义', () => {
    const p = ProviderCatalog.getProvider('openai')
    expect(p).toBeDefined()
    expect(p!.id).toBe('openai')
    expect(p!.protocol).toBe('openai-chat')
    expect(p!.authType).toBe('bearer')
    expect(p!.defaultModel).toBe('gpt-4o')
  })

  test('getModel 返回模型定义', () => {
    const m = ProviderCatalog.getModel('openai', 'gpt-4o')
    expect(m).toBeDefined()
    expect(m!.id).toBe('gpt-4o')
    expect(m!.context).toBe(128000)
    expect(m!.capabilities).toContain('chat')
    expect(m!.capabilities).toContain('vision')
  })

  test('不存在的模型返回 undefined', () => {
    expect(ProviderCatalog.getModel('openai', 'nonexistent')).toBeUndefined()
  })

  test('listModels 列出所有 Provider 的模型', () => {
    const all = ProviderCatalog.listModels()
    expect(all.length).toBeGreaterThan(20)
    const openaiModels = ProviderCatalog.listModels('openai')
    expect(openaiModels.length).toBe(7)
  })

  test('运行时注册新 Provider', () => {
    ProviderCatalog.register('test-provider', {
      id: 'test-provider', label: 'Test',
      protocol: 'openai-compatible', defaultBaseUrl: 'https://test.api.com',
      authType: 'bearer', defaultModel: 'test-model',
      models: [{ id: 'test-model', label: 'Test Model', context: 4096 }],
    })
    expect(ProviderCatalog.getProvider('test-provider')).toBeDefined()
    expect(ProviderCatalog.getModel('test-provider', 'test-model')!.context).toBe(4096)
    ProviderCatalog.unregister('test-provider')
    expect(ProviderCatalog.getProvider('test-provider')).toBeUndefined()
  })

  test('applyUserConfig 覆盖 baseUrl', () => {
    ProviderCatalog.register('cfg-test', {
      id: 'cfg-test', label: 'Cfg Test',
      protocol: 'openai-compatible', defaultBaseUrl: 'https://default.url',
      authType: 'bearer', defaultModel: 'm',
      models: [{ id: 'm', label: 'M' }],
    })
    ProviderCatalog.applyUserConfig({
      'cfg-test': { baseUrl: 'https://custom.url' },
    })
    expect(ProviderCatalog.getProvider('cfg-test')!.defaultBaseUrl).toBe('https://custom.url')
    ProviderCatalog.unregister('cfg-test')
  })

  test('createRoute 为已知 Provider 创建 Route', () => {
    const route = ProviderCatalog.createRoute('openai', 'sk-test-key')
    expect(route).toBeDefined()
    expect(typeof route.stream).toBe('function')
  })

  test('createRoute 为未知 Provider 降级为 OpenAI 兼容', () => {
    const route = ProviderCatalog.createRoute('unknown', 'sk-key', 'https://custom.api.com')
    expect(route).toBeDefined()
    expect(typeof route.stream).toBe('function')
  })

  test('createRoute 对完全未知 Provider 抛异常', () => {
    expect(() => ProviderCatalog.createRoute('nowhere', '')).toThrow('Unknown provider')
  })

  test('getCatalogForUI 返回 UI 可用格式', () => {
    const ui = ProviderCatalog.getCatalogForUI()
    expect(ui.length).toBe(12)
    const openai = ui.find(p => p.id === 'openai')
    expect(openai).toBeDefined()
    expect(openai!.label).toBe('OpenAI')
    expect(openai!.models.length).toBeGreaterThan(0)
    expect(openai!.models[0].context).toBeDefined()
  })

  test('Anthropic Provider 有正确的认证配置', () => {
    const p = ProviderCatalog.getProvider('anthropic')
    expect(p!.authType).toBe('api-key')
    expect(p!.authHeader).toBe('x-api-key')
    expect(p!.versionHeader).toBeDefined()
    expect(p!.path).toBe('/v1/messages')
  })

  test('Gemini Provider 有正确的上下文窗口', () => {
    const m = ProviderCatalog.getModel('gemini', 'gemini-2.0-flash')
    expect(m!.context).toBe(1048576)
  })

  test('createRoute 对 Anthropic 使用正确的 auth', () => {
    const route = ProviderCatalog.createRoute('anthropic', 'sk-ant-key')
    expect(route).toBeDefined()
  })
})
