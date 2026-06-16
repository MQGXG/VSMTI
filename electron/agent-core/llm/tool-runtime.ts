import type { ToolDef, ToolCall } from "../tool"

export interface ToolRuntimeConfig {
  tools: ToolDef[]
  onToolCall?: (toolCall: ToolCall) => void
}

export class ToolRuntime {
  private tools: ToolDef[]

  constructor(config: ToolRuntimeConfig) {
    this.tools = config.tools
  }

  toLLMTools(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema ? extractJsonSchema(t.inputSchema) : { type: "object", properties: {} },
    }))
  }

  async execute(toolCall: ToolCall, ctx: import("../tool").ToolContext): Promise<import("../tool").ToolResult> {
    const tool = this.tools.find((t) => t.name === toolCall.name)
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolCall.name}` }
    }
    try {
      const input = toolCall.input || {}
      return await tool.execute(input, ctx)
    } catch (err: any) {
      return { success: false, error: err.message || String(err) }
    }
  }
}

function extractJsonSchema(schema: any): Record<string, unknown> {
  if (typeof schema === "object" && schema._def?.typeName === "ZodObject") {
    return zodToJsonSchema(schema)
  }
  return schema
}

function zodToJsonSchema(zodSchema: any): Record<string, unknown> {
  const def = zodSchema._def
  switch (def.typeName) {
    case "ZodObject": {
      const shape = def.shape()
      const properties: Record<string, unknown> = {}
      const required: string[] = []
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value as any)
        if (!(value as any)._def?.isOptional) required.push(key)
      }
      return { type: "object", properties, required: required.length > 0 ? required : undefined }
    }
    case "ZodString":
      return { type: "string" }
    case "ZodNumber":
      return { type: "number" }
    case "ZodBoolean":
      return { type: "boolean" }
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema(def.type) }
    case "ZodOptional":
      return zodToJsonSchema(def.innerType)
    default:
      return { type: "string" }
  }
}
