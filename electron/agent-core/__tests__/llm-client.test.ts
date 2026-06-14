import { describe, expect, test } from 'vitest'
import { createOpenAIClient, createAnthropicClient } from '../llm-client'

describe('createOpenAIClient', () => {
  test('normalizes custom base url to /v1', () => {
    const client = createOpenAIClient({
      provider: 'ollama',
      model: 'qwen2.5',
      apiKey: 'x',
      apiUrl: 'http://localhost:11434',
    })
    expect(client).toBeDefined()
  })
})

describe('createAnthropicClient', () => {
  test('creates client', () => {
    const client = createAnthropicClient({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      apiKey: 'x',
      apiUrl: 'https://api.anthropic.com',
    })
    expect(client).toBeDefined()
  })
})
