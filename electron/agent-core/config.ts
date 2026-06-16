import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs"
import { join, resolve, isAbsolute } from "path"
import { homedir } from "os"
import { app } from "electron"

// ─── 类型定义 ──────────────────────────────────────────────────────

export interface ProviderConfig {
  apiKey?: string
  baseUrl?: string
  headers?: Record<string, string>
  options?: Record<string, unknown>
  models?: Record<string, { name?: string; enabled?: boolean }>
}

export interface MiraConfig {
  provider?: string
  model?: string
  apiKey?: string
  apiUrl?: string
  headers?: Record<string, string>
  options?: Record<string, unknown>
  providers?: Record<string, ProviderConfig>
  systemPrompt?: string
  maxSteps?: number
  maxContextTokens?: number
  mode?: string
  shell?: string
}

export interface ResolvedConfig {
  provider: string
  model: string
  apiKey: string
  apiUrl: string
  headers: Record<string, string>
  options: Record<string, unknown>
  mode: string
  maxSteps: number
  maxContextTokens: number
}

// ─── 路径 ──────────────────────────────────────────────────────────

function getGlobalConfigPath(): string {
  return join(app.getPath("userData"), "config.json")
}

function getProjectConfigPath(workspace: string): string {
  return join(workspace, "mira.json")
}

// ─── 文件读取 ──────────────────────────────────────────────────────

function readJsonFile(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null
    const raw = readFileSync(path, "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeJsonFile(path: string, data: unknown): void {
  const dir = path.substring(0, path.lastIndexOf("\\"))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8")
}

// ─── 变量替换 ──────────────────────────────────────────────────────

function resolveValue(value: string): string {
  // {env:VAR_NAME}
  const envMatch = value.match(/^\{env:(.+?)\}$/)
  if (envMatch) return process.env[envMatch[1]] || ""

  // {file:path/to/file}
  const fileMatch = value.match(/^\{file:(.+?)\}$/)
  if (fileMatch) {
    let filePath = fileMatch[1]
    if (filePath.startsWith("~")) filePath = join(homedir(), filePath.slice(1))
    if (!isAbsolute(filePath)) filePath = resolve(process.cwd(), filePath)
    try {
      return readFileSync(filePath, "utf-8").trim()
    } catch {
      return ""
    }
  }

  return value
}

function resolveConfigValues(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string") {
      result[key] = resolveValue(value)
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = resolveConfigValues(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

// ─── 环境变量 ──────────────────────────────────────────────────────

function loadEnvConfig(): Partial<MiraConfig> {
  const config: Partial<MiraConfig> = {}
  if (process.env.MIRA_API_KEY) config.apiKey = process.env.MIRA_API_KEY
  if (process.env.MIRA_MODEL) config.model = process.env.MIRA_MODEL
  if (process.env.MIRA_PROVIDER) config.provider = process.env.MIRA_PROVIDER
  if (process.env.MIRA_API_URL) config.apiUrl = process.env.MIRA_API_URL
  if (process.env.MIRA_MODE) config.mode = process.env.MIRA_MODE
  return config
}

// ─── 深层合并 ──────────────────────────────────────────────────────

function deepMerge<T extends Record<string, unknown>>(...sources: (T | null | undefined)[]): T {
  const result: Record<string, unknown> = {}
  for (const source of sources) {
    if (!source) continue
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        result[key] = deepMerge(result[key] as Record<string, unknown> || {}, value as Record<string, unknown>)
      } else if (value !== undefined && value !== null) {
        result[key] = value
      }
    }
  }
  return result as T
}

// ─── 主 API ────────────────────────────────────────────────────────

export function loadConfig(workspace?: string): MiraConfig {
  const globalConfig = readJsonFile(getGlobalConfigPath())
  const projectConfig = workspace ? readJsonFile(getProjectConfigPath(workspace)) : null
  const envConfig = loadEnvConfig()

  const merged = deepMerge(
    globalConfig,
    projectConfig,
    envConfig as Record<string, unknown>,
  )

  return resolveConfigValues(merged) as unknown as MiraConfig
}

export function saveGlobalConfig(config: Partial<MiraConfig>): void {
  const existing = readJsonFile(getGlobalConfigPath()) || {}
  const merged = { ...existing, ...config }
  writeJsonFile(getGlobalConfigPath(), merged)
}

export function resolveRuntimeConfig(ipcConfig?: Partial<{
  provider: string
  model: string
  apiKey: string
  apiUrl: string
  headers: Record<string, string>
  options: Record<string, unknown>
  mode: string
  workspace: string
}>): ResolvedConfig {
  const fileConfig = loadConfig(ipcConfig?.workspace)

  const provider = ipcConfig?.provider || fileConfig.provider || "openai"
  const model = ipcConfig?.model || fileConfig.model || "gpt-4o"
  const apiKey = ipcConfig?.apiKey || fileConfig.apiKey || ""
  const apiUrl = ipcConfig?.apiUrl || fileConfig.apiUrl || ""
  const headers = { ...(fileConfig.headers || {}), ...(ipcConfig?.headers || {}) }
  const options = { ...(fileConfig.options || {}), ...(ipcConfig?.options || {}) }
  const mode = ipcConfig?.mode || fileConfig.mode || "assistant"
  const maxSteps = fileConfig.maxSteps || 50
  const maxContextTokens = fileConfig.maxContextTokens || 64000

  return { provider, model, apiKey, apiUrl, headers, options, mode, maxSteps, maxContextTokens }
}

export function getConfigForRenderer(workspace?: string): {
  provider: string
  model: string
  apiUrl: string
  mode: string
  apiKeyFrom: "env" | "file" | "none"
} {
  const config = loadConfig(workspace)
  const envConfig = loadEnvConfig()

  let apiKeyFrom: "env" | "file" | "none" = "none"
  if (envConfig.apiKey) apiKeyFrom = "env"
  else if (config.apiKey) apiKeyFrom = "file"

  return {
    provider: config.provider || "",
    model: config.model || "",
    apiUrl: config.apiUrl || "",
    mode: config.mode || "",
    apiKeyFrom,
  }
}
