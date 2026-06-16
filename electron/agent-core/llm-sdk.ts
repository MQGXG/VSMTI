/**
 * LLM SDK — 向后兼容的 Vercel AI SDK 封装
 * 
 * 底层实现已迁移到 llm/ 包（分层架构: schema → protocols → providers → route）
 * 此文件保持导出一致性，以便 agent.ts 等消费者无需修改
 */

import { z } from "zod"
import { createProvider } from "./llm/providers"
import { LLMError } from "./llm/schema/errors"
import type { LLMMessage as SchemaMessage } from "./llm/schema/messages"
import type { LLMRequest as SchemaLLMRequest } from "./llm/schema/options"

export type LLMMessage = SchemaMessage

export type ProviderType = string

export interface SDKConfig {
  provider: string
  model: string
  apiKey: string
  apiUrl?: string
  headers?: Record<string, string>
  options?: Record<string, unknown>
}

export type LLMStreamEvent =
  | { type: "delta"; delta: string }
  | { type: "tool_call"; toolCall: { id: string; name: string; arguments: string; index: number } }
  | { type: "done" }
  | { type: "error"; error: { message: string } }

export type LLMToolSet = Record<string, { description: string; inputSchema: z.ZodType; parameters?: z.ZodType }>

/** 向后兼容的旧 LLMRequest（仅 messages + tools） */
export interface LLMRequest {
  messages: LLMMessage[]
  tools?: LLMToolSet
}

export interface LLMClient {
  stream(request: LLMRequest2): AsyncGenerator<LLMStreamEvent>
  complete(request: LLMRequest2): Promise<{ content: string; toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }>
}

interface LLMRequest2 {
  messages: LLMMessage[]
  tools?: LLMToolSet
}

function convertMessages(messages: LLMMessage[]): SchemaMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string"
      ? m.content
      : m.content.map((part: any) => {
          if (part.type === "text") return { type: "text" as const, text: part.text }
          if (part.type === "tool-call") return { type: "tool-call" as const, toolCallId: part.toolCallId, toolName: part.toolName, args: part.args }
          if (part.type === "tool-result") return { type: "tool-result" as const, toolCallId: part.toolCallId, toolName: part.toolName, output: typeof part.output === "string" ? part.output : (part.output as any)?.value || "" }
          return { type: "text" as const, text: "" }
        }),
    tool_call_id: (m as any).tool_call_id,
  }))
}

function convertTools(tools?: LLMToolSet): SchemaLLMRequest["tools"] {
  if (!tools || Object.keys(tools).length === 0) return undefined
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.inputSchema),
  }))
}

function zodToJsonSchema(schema: any): Record<string, unknown> {
  try {
    const raw = schema.toJSONSchema?.()
    if (raw && typeof raw === "object") return cleanSchema(raw)
    return manualZodToJson(schema)
  } catch {
    return manualZodToJson(schema)
  }
}

function cleanSchema(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const allowed = new Set(["type","properties","required","items","description","enum","default","minimum","maximum","minLength","maxLength","pattern","anyOf","oneOf","allOf","not","format","minItems","maxItems","uniqueItems","additionalProperties"])
  for (const [key, val] of Object.entries(raw)) {
    if (val !== undefined && val !== null && allowed.has(key)) {
      if (key === "properties" && typeof val === "object") {
        const cleaned: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
          cleaned[k] = typeof v === "object" && v !== null ? cleanSchema(v as Record<string, unknown>) : v
        }
        result[key] = cleaned
      } else if ((key === "anyOf" || key === "oneOf" || key === "allOf") && Array.isArray(val)) {
        result[key] = val.map((v: any) => typeof v === "object" && v !== null ? cleanSchema(v) : v)
      } else if (key === "items" && typeof val === "object" && val !== null) {
        result[key] = cleanSchema(val as Record<string, unknown>)
      } else {
        result[key] = val
      }
    }
  }
  if (!result.type && !result.anyOf && !result.oneOf && !result.enum) result.type = "string"
  return result
}

function manualZodToJson(schema: any): Record<string, unknown> {
  const def = schema._def
  if (!def?.typeName) return { type: "string" }
  switch (def.typeName) {
    case "ZodString": return stringSchema(def)
    case "ZodNumber": case "ZodNaN": return numberSchema(def)
    case "ZodBigInt": return { type: "integer" }
    case "ZodBoolean": return { type: "boolean" }
    case "ZodDate": return { type: "string", format: "date-time" }
    case "ZodArray": return arraySchema(def)
    case "ZodObject": return objectSchema(def)
    case "ZodEnum": case "ZodNativeEnum": return enumSchema(def)
    case "ZodOptional": return manualZodToJson(def.innerType)
    case "ZodDefault": return { ...manualZodToJson(def.innerType), default: def.defaultValue }
    case "ZodUnion": return { anyOf: def.options.map((o: any) => manualZodToJson(o)) }
    case "ZodDiscriminatedUnion": return { anyOf: [...(def.optionsMap?.values() || def.options || [])].map((o: any) => manualZodToJson(o)) }
    case "ZodRecord": return recordSchema(def)
    case "ZodNullable": case "ZodNull": return { type: "null" }
    case "ZodLiteral": return { type: typeof def.value === "number" ? "number" : typeof def.value === "boolean" ? "boolean" : "string", enum: [def.value] }
    case "ZodEffects": case "ZodPipeline": return manualZodToJson(def.schema || def.innerType)
    default: return { type: "string" }
  }
}

function stringSchema(def: any): Record<string, unknown> {
  const s: Record<string, unknown> = { type: "string" }
  if (def.checks) for (const c of def.checks) {
    if (c.kind === "min") s.minLength = c.value
    if (c.kind === "max") s.maxLength = c.value
    if (c.kind === "regex") s.pattern = c.regex instanceof RegExp ? c.regex.source : c.regex
    if (c.kind === "url") s.format = "uri"
    if (c.kind === "email") s.format = "email"
  }
  return s
}

function numberSchema(def: any): Record<string, unknown> {
  const s: Record<string, unknown> = { type: "number" }
  if (def.checks) for (const c of def.checks) {
    if (c.kind === "min") s.minimum = c.value
    if (c.kind === "max") s.maximum = c.value
    if (c.kind === "int") s.type = "integer"
  }
  return s
}

function arraySchema(def: any): Record<string, unknown> {
  const s: Record<string, unknown> = { type: "array" }
  if (def.type) s.items = manualZodToJson(def.type)
  if (def.checks) for (const c of def.checks) {
    if (c.kind === "min") s.minItems = c.value
    if (c.kind === "max") s.maxItems = c.value
  }
  return s
}

function objectSchema(def: any): Record<string, unknown> {
  const shape = def.shape?.() || {}
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    properties[key] = manualZodToJson(field as any)
    if (!(field as any)?._def?.isOptional) required.push(key)
  }
  return { type: "object", properties, required: required.length > 0 ? required : undefined }
}

function enumSchema(def: any): Record<string, unknown> {
  const values = def.values
  if (Array.isArray(values)) return { type: "string", enum: values }
  return { type: "string", enum: Object.values(values || {}) }
}

function recordSchema(def: any): Record<string, unknown> {
  return { type: "object", additionalProperties: def.valueType ? manualZodToJson(def.valueType) : { type: "string" } }
}

export function createLLMClient(config: SDKConfig): LLMClient {
  const provider = createProvider(
    config.provider,
    config.apiKey,
    config.apiUrl,
    config.headers,
  )

  async function* stream(request: LLMRequest2): AsyncGenerator<LLMStreamEvent> {
    try {
      const llmRequest: SchemaLLMRequest = {
        model: config.model,
        messages: convertMessages(request.messages),
        tools: convertTools(request.tools),
        generation: config.options as any,
      }

      let accumulatedArgs = ""
      let currentToolId = ""
      let currentToolName = ""

      for await (const event of provider.stream(llmRequest)) {
        switch (event.type) {
          case "text-delta":
            if (currentToolId) {
              accumulatedArgs += event.delta
            } else {
              yield { type: "delta", delta: event.delta }
            }
            break
          case "tool-call":
            if (currentToolId && currentToolName) {
              yield { type: "tool_call", toolCall: { id: currentToolId, name: currentToolName, arguments: accumulatedArgs || "{}", index: 0 } }
            }
            currentToolId = event.id
            currentToolName = event.name
            accumulatedArgs = event.args || ""
            break
          case "finish":
            if (currentToolId && currentToolName) {
              yield { type: "tool_call", toolCall: { id: currentToolId, name: currentToolName, arguments: accumulatedArgs || "{}", index: 0 } }
            }
            yield { type: "done" }
            break
          case "error":
            yield { type: "error", error: { message: event.message } }
            break
        }
      }
    } catch (err: any) {
      if (err instanceof LLMError) {
        yield { type: "error", error: { message: err.message } }
      } else {
        yield { type: "error", error: { message: err.message || String(err) } }
      }
    }
  }

  async function complete(request: LLMRequest2) {
    const textParts: string[] = []
    const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = []

    for await (const event of stream(request)) {
      if (event.type === "delta") {
        textParts.push(event.delta)
      } else if (event.type === "tool_call") {
        toolCalls.push({
          id: event.toolCall.id,
          type: "function",
          function: {
            name: event.toolCall.name,
            arguments: event.toolCall.arguments,
          },
        })
      }
    }

    return { content: textParts.join(""), toolCalls }
  }

  return { stream, complete }
}
