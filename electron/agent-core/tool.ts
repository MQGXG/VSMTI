/**
 * 工具定义工厂 — 类似 OpenCode 的 tool.ts
 * Tool.make() 创建声明式工具定义，包含 Schema 验证 + 执行 + 输出格式化
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

// 运行时的工具元数据（通过 WeakMap 保持定义对象纯净）
const runtimeMap = new WeakMap<ToolDef, {
  jsonSchema: Record<string, unknown>
  outputJsonSchema: Record<string, unknown>
}>()

function cleanJsonSchema(raw: Record<string, unknown>): Record<string, unknown> {
  // 移除 LLM API 不支持的字段
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
  }

  const jsonschema = zodToJsonSchema(config.inputSchema)
  const outputJsonSchema = zodToJsonSchema(config.outputSchema)
  // 修复 type: null
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
  // 没有缓存时即时生成（兼容注册表直接使用的工具）
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

export async function settle(
  def: ToolDef,
  call: ToolCall,
  ctx: ToolContext
): Promise<Settlement> {
  const schema = getJsonSchema(def)
  const coercedInput = coerceToolArgs(def.name, call.input, schema)
  const parseResult = def.inputSchema.safeParse(coercedInput)
  if (!parseResult.success) {
    return {
      result: { success: false, error: `Invalid input: ${parseResult.error.message}` },
      content: [{ type: "text", text: `Invalid input: ${parseResult.error.message}` }],
    }
  }

  try {
    const result = await def.execute(parseResult.data, ctx)
    const output = def.outputSchema.parse(result.output)
    const content = def.toModelOutput
      ? def.toModelOutput(parseResult.data, output)
      : [{ type: "text" as const, text: result.output || "" }]
    return { result, content }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      result: { success: false, error: sanitizeToolError(message) },
      content: [{ type: "text", text: sanitizeToolError(message) }],
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
