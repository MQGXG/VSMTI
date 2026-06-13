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
}

export interface ToolResult {
  success: boolean
  output: string
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

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // 简化版 Zod → JSON Schema 转换
  if (schema instanceof z.ZodString) return { type: "string" }
  if (schema instanceof z.ZodNumber) return { type: "number" }
  if (schema instanceof z.ZodBoolean) return { type: "boolean" }
  if (schema instanceof z.ZodArray) return { type: "array", items: zodToJsonSchema(schema.element) }
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [key, val] of Object.entries(schema.shape)) {
      properties[key] = zodToJsonSchema(val as z.ZodType)
      if (!(val instanceof z.ZodOptional)) required.push(key)
    }
    return { type: "object", properties, required }
  }
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema.unwrap())
  return { type: "string" }
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

  runtimeMap.set(def, {
    jsonSchema: zodToJsonSchema(config.inputSchema),
    outputJsonSchema: zodToJsonSchema(config.outputSchema),
  })

  return def
}

export function getJsonSchema(def: ToolDef): Record<string, unknown> {
  return runtimeMap.get(def)?.jsonSchema ?? { type: "object", properties: {} }
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
  const parseResult = def.inputSchema.safeParse(call.input)
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
      : [{ type: "text" as const, text: result.output }]
    return { result, content }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      result: { success: false, error: message },
      content: [{ type: "text", text: `Error: ${message}` }],
    }
  }
}

export const withPermission = <I, O>(def: ToolDef<I, O>, permission: string): ToolDef<I, O> => ({
  ...def,
  permission,
})
