/**
 * Agent ReAct 循环 — 类似 OpenCode 的 Session Runner
 * 集成 LLM Function Calling + 工具执行 + 流式返回
 */

import { ToolRegistry } from "./registry"
import { ToolContext, Content } from "./tool"

export interface AgentConfig {
  sessionID: string
  workspace: string
  model: string        // e.g. "gpt-4o-mini"
  apiKey: string
  apiUrl: string       // e.g. "https://api.openai.com/v1"
  provider?: string    // openai / claude / deepseek / ollama / custom
  headers?: Record<string, string>
  options?: Record<string, unknown>
  systemPrompt?: string
  maxSteps?: number
}

export type AgentEvent =
  | { type: "content"; text: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; output: string }
  | { type: "error"; message: string }
  | { type: "finish"; reason: string }

interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  tool_calls?: Array<{
    id: string
    type: "function"
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

const DEFAULT_SYSTEM = `You are OmniAgent, an AI assistant integrated into a desktop application. 
You have access to the following tools to help users:

- read_file: Read file contents from the local filesystem
- write_file: Write content to a file
- edit_file: Replace exact text in a file
- list_files: List directory contents
- web_search: Search the internet for current information
- grep: Search file contents using regex
- glob: Find files matching a glob pattern
- run_code: Execute Python code
- bash: Execute shell commands

When the user asks you to read, search, list, or modify files, use the appropriate tool.
After getting tool results, provide a clear summary to the user.`

export class Agent {
  constructor(private registry: ToolRegistry) {}

  async *run(
    userMessage: string,
    history: Array<{ role: string; content: string }>,
    config: AgentConfig,
  ): AsyncGenerator<AgentEvent> {
    const maxSteps = config.maxSteps || 10
    const ctx: ToolContext = {
      sessionID: config.sessionID,
      workspace: config.workspace,
      mode: "assistant",
      agent: "build",
      assistantMessageID: "",
      toolCallID: "",
    }

    const materialized = this.registry.materialize()
    const toolDefs = materialized.definitions

    const messages: LLMMessage[] = [
      { role: "system", content: config.systemPrompt || DEFAULT_SYSTEM },
      ...history.map((m) => ({ role: m.role as LLMMessage["role"], content: m.content })),
      { role: "user", content: userMessage },
    ]

    for (let step = 0; step < maxSteps; step++) {
      // 调用 LLM
      const response = await this.callLLM(messages, toolDefs, config)
      if (!response) {
        yield { type: "error", message: "LLM returned empty response" }
        return
      }

      const choice = response.choices?.[0]
      if (!choice) {
        yield { type: "error", message: "Invalid LLM response" }
        return
      }

      const msg = choice.message

      // 输出文本内容
      if (msg.content) {
        yield { type: "content", text: msg.content }
      }

      // 检查是否有工具调用
      const calls = msg.tool_calls
      if (!calls || calls.length === 0) {
        yield { type: "finish", reason: choice.finish_reason || "stop" }
        return
      }

      // 记录 assistant 消息
      messages.push({
        role: "assistant",
        content: msg.content || "",
        tool_calls: calls.map((c: any) => ({
          id: c.id,
          type: "function",
          function: { name: c.function.name, arguments: c.function.arguments },
        })),
      })

      // 执行每个工具
      for (const call of calls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(call.function.arguments)
        } catch {
          yield { type: "error", message: `Invalid tool arguments for ${call.function.name}` }
          continue
        }

        yield { type: "tool_start", name: call.function.name, args }

        const result = await this.registry.execute(call.function.name, args, ctx)

        if (result.success) {
          yield { type: "tool_result", name: call.function.name, output: result.output || "" }
        } else {
          yield { type: "error", message: `${call.function.name}: ${result.error}` }
        }

        messages.push({
          role: "tool",
          content: result.output || result.error || "",
          tool_call_id: call.id,
        })
      }
    }

    yield { type: "finish", reason: "length" }
  }

  private async callLLM(
    messages: LLMMessage[],
    tools: Record<string, unknown>[],
    config: AgentConfig,
  ): Promise<any> {
    const provider = config.provider || "openai"

    // Claude 需要独立的 API 格式，离线模式暂不支持的更完整实现
    if (provider === "claude") {
      throw new Error("Claude 暂不支持离线模式。请启动 Python 后端，或切换到 OpenAI / DeepSeek / Ollama / 自定义 OpenAI 兼容接口。")
    }

    // OpenAI 兼容接口：确保 baseUrl 以 /v1 结尾（OpenAI 官方通常已包含）
    let baseUrl = (config.apiUrl || "https://api.openai.com/v1").replace(/\/+$/, "")
    if (provider !== "openai" && !baseUrl.endsWith("/v1")) {
      baseUrl += "/v1"
    }

    const body: Record<string, unknown> = {
      model: config.model || "gpt-4o-mini",
      messages,
      stream: false,
      ...(config.options || {}),
    }
    if (tools.length > 0) body.tools = tools

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.headers || {}),
    }

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`LLM API error (${resp.status}): ${text.slice(0, 200)}`)
    }

    return await resp.json()
  }
}
