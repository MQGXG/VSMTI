import { describe, expect, test, vi } from 'vitest'
import { FallbackClient } from '../orchestrate/failover'

function makeConfig(provider: string) {
  return { provider, model: 'test', apiKey: 'key', apiUrl: 'http://localhost' }
}

describe('FallbackClient', () => {
  test('uses primary provider on success', async () => {
    const client = new FallbackClient({
      primary: makeConfig('openai'),
      fallbacks: [makeConfig('anthropic')],
    })

    const events: any[] = []
    for await (const event of client.stream({ messages: [], tools: {} })) {
      events.push(event)
    }

    expect(client.currentProvider).toBe('openai')
    expect(client.usedFallback).toBe(false)
  })

  test('falls back on connection error', async () => {
    const client = new FallbackClient({
      primary: makeConfig('openai'),
      fallbacks: [makeConfig('anthropic')],
    })

    // Mock the stream to throw on first provider
    const originalStream = client.stream.bind(client)
    let callCount = 0
    client.stream = async function* (request: any) {
      callCount++
      if (callCount === 1) {
        throw new Error('ECONNREFUSED')
      }
      yield { type: 'delta' as const, delta: 'fallback response' }
      yield { type: 'done' as const }
    }

    const events: any[] = []
    for await (const event of client.stream({ messages: [], tools: {} })) {
      events.push(event)
    }

    expect(client.usedFallback).toBe(true)
    expect(client.currentProvider).toBe('anthropic')
  })

  test('shouldFallback returns true for rate limits', () => {
    const client = new FallbackClient({
      primary: makeConfig('openai'),
      fallbacks: [],
    })

    // Access private method via any cast
    const shouldFallback = (client as any).shouldFallback.bind(client)
    expect(shouldFallback('rate limit exceeded')).toBe(true)
    expect(shouldFallback('429 too many requests')).toBe(true)
    expect(shouldFallback('503 service unavailable')).toBe(true)
    expect(shouldFallback('timeout')).toBe(true)
  })

  test('shouldFallback returns false for auth errors', () => {
    const client = new FallbackClient({
      primary: makeConfig('openai'),
      fallbacks: [],
    })

    const shouldFallback = (client as any).shouldFallback.bind(client)
    expect(shouldFallback('unauthorized 401')).toBe(false)
    expect(shouldFallback('forbidden 403')).toBe(false)
    expect(shouldFallback('bad request 400')).toBe(false)
  })
})
