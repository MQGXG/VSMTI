/**
 * 工具定义工厂
 * 参考 OpenCode Tool.define + MAF FunctionTool
 *
 * 增强点：
 * 1. 工具级 maxOutputLength — 每个工具可配置输出上限
 * 2. 结构化错误分类 — RecoverableError vs FatalError
 * 3. 执行耗时追踪
 */

import { z } from "zod"

export interface ToolContext {
  sessionID: string
  workspace: string
  mode: string
  agent: string
  assistantMessageID: string
  toolCallID: string
  shell?: string
  signal?: AbortSignal
}

export interface ToolResult {
  success: boolean
  output?: string
  error?: string
  metadata?: Record<string, unknown>
}

export type Content =
  | { type: "text"; text: string }
  | { type: "file"; data: string; mime: string; name?: string }

export interface ToolDef<Input = unknown, Output = unknown> {
  name: string
  description: string
  inputSchema: z.ZodType<Input>
  outputSchema: z.ZodType<Output>
  execute(input: Input, ctx: ToolContext): Promise<ToolResult>
  toModelOutput?(input: Input, output: Output): Content[]
  permission?: string
  /** 工具级输出截断上限（字符数），默认 50000 */
  maxOutputLength?: number
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface Settlement {
  result: ToolResult
  content: Content[]
}

/**
 * 可恢复错误 — 参数校验失败等，LLM 可以重试
 * 参考 MiMo Code 的 RecoverableError
 */
export class RecoverableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RecoverableError"
  }
}

/**
 * 致命错误 — 工具执行失败，不可重试
 */
export class FatalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FatalError"
  }
}

// 运行时的工具元数据
const runtimeMap = new WeakMap<ToolDef, {
  jsonSchema: Record<string, unknown>
  outputJsonSchema: Record<string, unknown>
}>()

function cleanJsonSchema(raw: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  const allowed = new Set(["type", "properties", "required", "items", "description", "enum", "minItems", "maxItems", "minimum", "maximum", "minLength", "maxLength", "pattern", "default", "anyOf", "oneOf", "allOf", "not", "if", "then", "else"])
  for (const [key, value] of Object.entries(raw)) {
    if (allowed.has(key)) {
      cleaned[key] = value
      if (key === "items" && typeof value === "object" && value !== null) {
        cleaned[key] = cleanJsonSchema(value as Record<string, unknown>)
      }
      if ((key === "properties" || key === "anyOf" || key === "oneOf") && typeof value === "object" && value !== null) {
        const props: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          props[k] = typeof v === "object" && v !== null ? cleanJsonSchema(v as Record<string, unknown>) : v
        }
        cleaned[key] = props
      }
    }
  }
  if (!raw.type && Object.keys(cleaned).length === 0) return { type: "string" }
  return cleaned
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    const raw = schema.toJSONSchema()
    return cleanJsonSchema(raw as Record<string, unknown>)
  } catch {
    return { type: "object", properties: {} }
  }
}

export function make<Input, Output>(
  config: {
    name: string
    description: string
    inputSchema: z.ZodType<Input>
    outputSchema: z.ZodType<Output>
    execute(input: Input, ctx: ToolContext): Promise<ToolResult>
    toModelOutput?(input: Input, output: Output): Content[]
    permission?: string
    maxOutputLength?: number
  }
): ToolDef<Input, Output> {
  const def: ToolDef<Input, Output> = {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    execute: config.execute,
    toModelOutput: config.toModelOutput,
    permission: config.permission,
    maxOutputLength: config.maxOutputLength,
  }

  const jsonschema = zodToJsonSchema(config.inputSchema)
  const outputJsonSchema = zodToJsonSchema(config.outputSchema)
  if (!jsonschema.type) jsonschema.type = "object"
  if (!jsonschema.properties) jsonschema.properties = {}
  runtimeMap.set(def, {
    jsonSchema: jsonschema,
    outputJsonSchema,
  })

  return def
}

export function getJsonSchema(def: ToolDef): Record<string, unknown> {
  const cached = runtimeMap.get(def)?.jsonSchema
  if (cached) {
    if (cached.type === null || cached.type === undefined) {
      console.error(`[tool] ${def.name} schema has invalid type:`, JSON.stringify(cached))
      return { type: "object", properties: cached.properties || {} }
    }
    return cached
  }
  if ("inputSchema" in def && typeof (def as any).inputSchema?.toJSONSchema === "function") {
    try {
      const raw = (def as any).inputSchema.toJSONSchema()
      const cleaned: Record<string, unknown> = { type: raw.type || "object" }
      if (raw.properties) cleaned.properties = raw.properties
      if (raw.required) cleaned.required = raw.required
      if (raw.items) cleaned.items = raw.items
      return cleaned
    } catch {}
  }
  if ("parameters" in def) {
    const p = (def as any).parameters as Record<string, unknown>
    if (p && typeof p === "object" && (p as any).type === "object") return p
  }
  return { type: "object", properties: {} }
}

export function toOpenAISchema(def: ToolDef): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: def.name,
      description: def.description,
      parameters: getJsonSchema(def),
    },
  }
}

/**
 * 执行工具 — 带耗时追踪 + 输出截断 + 错误分类
 * 参考 MAF FunctionTool.invoke() 的计时和解析逻辑
 *
 * 错误分类：
 * - RecoverableError: 参数校验失败等，LLM 可以重试
 * - FatalError: 工具执行失败，不可重试
 * - 其他 Error: 未知错误，标记为可恢复（给 LLM 重试机会）
 */
export async function settle(
  def: ToolDef,
  call: ToolCall,
  ctx: ToolContext
): Promise<Settlement> {
  const startTime = Date.now()
  const maxOutput = def.maxOutputLength || 50000

  const schema = getJsonSchema(def)
  const coercedInput = coerceToolArgs(def.name, call.input, schema)
  const parseResult = def.inputSchema.safeParse(coercedInput)
  if (!parseResult.success) {
    // 参数校验失败 = 可恢复错误，LLM 可以修正参数重试
    return {
      result: {
        success: false,
        error: `Invalid input: ${parseResult.error.message}`,
        metadata: { elapsed: Date.now() - startTime, errorType: "recoverable" },
      },
      content: [{ type: "text", text: `Invalid input for ${def.name}: ${parseResult.error.message}\nPlease fix the arguments and retry.` }],
    }
  }

  try {
    const result = await def.execute(parseResult.data, ctx)
    const elapsed = Date.now() - startTime

    // 输出截断
    let output = result.output ?? (result.success ? "" : result.error ?? "")
    let truncated = false
    if (output.length > maxOutput) {
      output = output.slice(0, maxOutput) + `\n\n[Output truncated at ${maxOutput} chars]`
      truncated = true
    }

    const parsed = def.outputSchema.parse(output)
    const content = def.toModelOutput
      ? def.toModelOutput(parseResult.data, parsed)
      : [{ type: "text" as const, text: output || result.error || "" }]

    return {
      result: {
        ...result,
        output,
        metadata: {
          ...result.metadata,
          elapsed,
          truncated,
        },
      },
      content,
    }
  } catch (e) {
    const elapsed = Date.now() - startTime
    const message = e instanceof Error ? e.message : String(e)
    const errorMsg = sanitizeToolError(message)

    // 区分错误类型
    let errorType: "recoverable" | "fatal" = "recoverable"
    if (e instanceof FatalError) {
      errorType = "fatal"
    } else if (e instanceof RecoverableError) {
      errorType = "recoverable"
    } else if (message.includes("ENOENT") || message.includes("EACCES") || message.includes("EPERM")) {
      // 文件系统错误通常是永久性的
      errorType = "fatal"
    }

    return {
      result: {
        success: false,
        error: errorMsg,
        metadata: { elapsed, errorType },
      },
      content: [{
        type: "text",
        text: errorType === "recoverable"
          ? `${errorMsg}\nThis error may be recoverable — try a different approach.`
          : errorMsg,
      }],
    }
  }
}

export const withPermission = <I, O>(def: ToolDef<I, O>, permission: string): ToolDef<I, O> => ({
  ...def,
  permission,
})

const ROLE_TAG_RE = /<\/?(?:tool_call|function_call|result|response|output|input|system|assistant|user)>/gi
const FENCE_OPEN_RE = /^\s*```(?:json|xml|html|markdown)?\s*/gim
const FENCE_CLOSE_RE = /\s*```\s*$/gim
const CDATA_RE = /<!\[CDATA\[.*?\]\]>/gis
const MAX_TOOL_ERROR_LEN = 2000

export function sanitizeToolError(errorMsg: string): string {
  if (!errorMsg) return '[TOOL_ERROR] '
  let s = errorMsg
    .replace(ROLE_TAG_RE, '')
    .replace(FENCE_OPEN_RE, '')
    .replace(FENCE_CLOSE_RE, '')
    .replace(CDATA_RE, '')
  if (s.length > MAX_TOOL_ERROR_LEN) s = s.slice(0, MAX_TOOL_ERROR_LEN - 3) + '...'
  return `[TOOL_ERROR] ${s}`
}

function coerceValue(value: string, expected: string | string[]): unknown {
  if (Array.isArray(expected)) {
    for (const t of expected) {
      const c = coerceValue(value, t)
      if (c !== value) return c
    }
    return value
  }
  if (expected === 'integer' || expected === 'number') {
    const f = parseFloat(value)
    if (!Number.isNaN(f)) return Number.isInteger(f) ? Math.trunc(f) : f
  }
  if (expected === 'boolean') {
    const low = value.trim().toLowerCase()
    if (low === 'true') return true
    if (low === 'false') return false
  }
  return value
}

export function coerceToolArgs(name: string, args: Record<string, unknown>, schema: Record<string, unknown>): Record<string, unknown> {
  const props = (schema.properties || {}) as Record<string, any>
  const out = { ...args }
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== 'string') continue
    const prop = props[key]
    if (!prop || !prop.type) continue
    const coerced = coerceValue(value, prop.type)
    if (coerced !== value) out[key] = coerced
  }
  return out
}
