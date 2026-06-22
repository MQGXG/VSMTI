/**
 * Zod → JSON Schema 转换器
 * 从 llm-sdk.ts 提取，独立模块
 */

export function zodToJsonSchema(schema: any): Record<string, unknown> {
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
