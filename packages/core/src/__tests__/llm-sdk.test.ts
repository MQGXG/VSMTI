import { describe, expect, test } from 'vitest'
import { createLLMClient } from '../llm/client'

describe('createLLMClient', () => {
  test('creates OpenAI client', () => {
    const client = createLLMClient({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'test-key',
    })
    expect(client).toBeDefined()
    expect(typeof client.stream).toBe('function')
    expect(typeof client.complete).toBe('function')
  })

  test('creates Anthropic client', () => {
    const client = createLLMClient({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      apiKey: 'test-key',
      apiUrl: 'https://api.anthropic.com',
    })
    expect(client).toBeDefined()
    expect(typeof client.stream).toBe('function')
    expect(typeof client.complete).toBe('function')
  })

  test('creates custom provider client', () => {
    const client = createLLMClient({
      provider: 'custom',
      model: 'qwen2.5',
      apiKey: 'x',
      apiUrl: 'http://localhost:11434',
    })
    expect(client).toBeDefined()
    expect(typeof client.stream).toBe('function')
    expect(typeof client.complete).toBe('function')
  })
})

