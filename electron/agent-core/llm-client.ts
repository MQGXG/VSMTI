export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

export interface LLMRequest {
  model?: string
  messages: LLMMessage[]
  tools?: Record<string, unknown>[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
}

export interface LLMStreamEvent {
  type: 'delta' | 'tool_call' | 'done' | 'error'
  delta?: string
  toolCall?: {
    id: string
    name?: string
    arguments?: string
    index: number
  }
  error?: { message: string }
}

export interface LLMClient {
  complete(request: LLMRequest): Promise<{ content: string; toolCalls: NonNullable<LLMMessage['tool_calls']> }>
  stream(request: LLMRequest): AsyncGenerator<LLMStreamEvent>
}

export interface ClientConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'deepseek' | 'custom'
  model: string
  apiKey: string
  apiUrl: string
  headers?: Record<string, string>
  options?: Record<string, unknown>
}

function normalizeBaseUrl(provider: string, url: string): string {
  let base = url.replace(/\/+$/, '')
  if (provider !== 'openai' && !base.endsWith('/v1')) base += '/v1'
  return base
}

export function createOpenAIClient(config: ClientConfig): LLMClient {
  const baseUrl = normalizeBaseUrl(config.provider, config.apiUrl)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    ...(config.headers || {}),
  }

  async function complete(request: LLMRequest) {
    const body = {
      model: config.model,
      messages: request.messages,
      stream: false,
      ...(request.tools?.length ? { tools: request.tools } : {}),
      ...(config.options || {}),
    }
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`LLM API error (${resp.status}): ${text.slice(0, 300)}`)
    }
    const data = await resp.json()
    const choice = data.choices?.[0]
    return {
      content: choice?.message?.content || '',
      toolCalls: choice?.message?.tool_calls || [],
    }
  }

  async function* stream(request: LLMRequest): AsyncGenerator<LLMStreamEvent> {
    const body = {
      model: config.model,
      messages: request.messages,
      stream: true,
      ...(request.tools?.length ? { tools: request.tools } : {}),
      ...(config.options || {}),
    }
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
    if (!resp.ok) {
      const text = await resp.text()
      yield { type: 'error', error: { message: `LLM API error (${resp.status}): ${text.slice(0, 300)}` } }
      return
    }
    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const toolCallBuffers: Record<number, { id: string; name: string; args: string }> = {}

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue
          const json = trimmed.slice(6)
          let chunk: any
          try { chunk = JSON.parse(json) } catch { continue }
          const delta = chunk.choices?.[0]?.delta
          if (!delta) continue
          if (delta.content) yield { type: 'delta', delta: delta.content }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index
              if (!toolCallBuffers[idx]) toolCallBuffers[idx] = { id: tc.id || '', name: '', args: '' }
              if (tc.id) toolCallBuffers[idx].id = tc.id
              if (tc.function?.name) toolCallBuffers[idx].name += tc.function.name
              if (tc.function?.arguments) toolCallBuffers[idx].args += tc.function.arguments
              yield {
                type: 'tool_call',
                toolCall: {
                  id: toolCallBuffers[idx].id,
                  name: toolCallBuffers[idx].name || undefined,
                  arguments: toolCallBuffers[idx].args || undefined,
                  index: idx,
                },
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
    yield { type: 'done' }
  }

  return { complete, stream }
}

export function createAnthropicClient(config: ClientConfig): LLMClient {
  const baseUrl = config.apiUrl.replace(/\/+$/, '') || 'https://api.anthropic.com'

  function toAnthropicMessages(messages: LLMMessage[]) {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
    const rest = messages.filter(m => m.role !== 'system').map((m) => {
      if (m.role === 'tool') {
        return { role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: m.tool_call_id, content: m.content }] }
      }
      if (m.role === 'assistant' && m.tool_calls) {
        const content: any[] = []
        if (m.content) content.push({ type: 'text' as const, text: m.content })
        for (const tc of m.tool_calls) {
          content.push({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}'),
          })
        }
        return { role: 'assistant' as const, content }
      }
      return { role: m.role as 'user' | 'assistant', content: m.content }
    })
    return { system, messages: rest }
  }

  async function complete(request: LLMRequest) {
    const { system, messages } = toAnthropicMessages(request.messages)
    const body: any = {
      model: config.model,
      max_tokens: request.max_tokens ?? 4096,
      messages,
      system,
      ...(config.options || {}),
    }
    if (request.tools?.length) {
      body.tools = request.tools.map((t: any) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }))
    }
    const resp = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        ...(config.headers || {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Anthropic API error (${resp.status}): ${text.slice(0, 300)}`)
    }
    const data = await resp.json()
    const textParts = data.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    const toolCalls = data.content
      .filter((c: any) => c.type === 'tool_use')
      .map((c: any) => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.name, arguments: JSON.stringify(c.input) },
      }))
    return { content: textParts, toolCalls }
  }

  async function* stream(request: LLMRequest): AsyncGenerator<LLMStreamEvent> {
    try {
      const result = await complete(request)
      if (result.content) yield { type: 'delta', delta: result.content }
      for (const tc of result.toolCalls) {
        yield { type: 'tool_call', toolCall: { id: tc.id, name: tc.function.name, arguments: tc.function.arguments, index: 0 } }
      }
      yield { type: 'done' }
    } catch (e) {
      yield { type: 'error', error: { message: e instanceof Error ? e.message : String(e) } }
    }
  }

  return { complete, stream }
}

export function createLLMClient(config: ClientConfig): LLMClient {
  if (config.provider === 'anthropic') return createAnthropicClient(config)
  return createOpenAIClient(config)
}
