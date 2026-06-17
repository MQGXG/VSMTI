export interface RouteConfig {
  baseUrl: string
  apiKey: string
  headers?: Record<string, string>
  timeout?: number
}

export class RouteClient {
  constructor(private config: RouteConfig) {}

  getBaseUrl(): string {
    return this.config.baseUrl.replace(/\/+$/, "")
  }

  getHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.config.apiKey ? { "Authorization": `Bearer ${this.config.apiKey}` } : {}),
      ...this.config.headers,
      ...extra,
    }
  }

  async post(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<Response> {
    const url = `${this.getBaseUrl()}${path}`
    const controller = new AbortController()
    const timer = this.config.timeout ? setTimeout(() => controller.abort(), this.config.timeout) : undefined

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(extraHeaders),
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      return response
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async *postStream(path: string, body: unknown): AsyncGenerator<Uint8Array> {
    const url = `${this.getBaseUrl()}${path}`
    const response = await fetch(url, {
      method: "POST",
      headers: { ...this.getHeaders(), Accept: "text/event-stream" },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      const fullBody = typeof body === "object" ? JSON.stringify(body, null, 2) : String(body)
      console.error(`[RouteClient] HTTP ${response.status} from ${url}:
  Response: ${errorText}
  Full Body:
${fullBody.slice(0, 5000)}`)
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 1000)}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim()
            if (data === "[DONE]") return
            yield new TextEncoder().encode(data)
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
