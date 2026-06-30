/**
 * Effect 服务层 — 类似 OpenCode 的 Layer 组合模式
 *
 * 使用 Context.GenericTag 创建服务标识，通过 Layer 组合依赖注入。
 */
import { Effect, Context, Layer } from "effect"
import { ToolRegistry } from "./registry"
import { createDefaultRegistry } from "./registry-init"
import { createLLMClient } from "./llm-sdk"
import { initDatabase } from "./database"

// ─── ToolRegistry Service ────────────────────────────────────────

export interface ToolRegistryInterface {
  materialize(permissions?: any): { definitions: Record<string, unknown>; settle(call: any, ctx: any): Promise<any> }
  materializeWithModel(filter: { providerID: string; modelID: string }, permissions?: any): { definitions: Record<string, unknown>; settle(call: any, ctx: any): Promise<any> }
  execute(name: string, args: Record<string, unknown>, ctx: any): Promise<{ success: boolean; output?: string; error?: string }>
  register(def: any): void
  registerEffectLazy(effect: Effect.Effect<any>): void
  getAll(): any[]
  scanCustomTools(dirs: string[]): void
}

export const ToolRegistryTag = Context.GenericTag<ToolRegistryInterface>("@omni/ToolRegistry")

export const ToolRegistryLayer = Layer.succeed(ToolRegistryTag, createDefaultRegistry() as ToolRegistryInterface)

// ─── LLM Service ─────────────────────────────────────────────────

export interface LLMInterface {
  createClient(config: { provider: string; model: string; apiKey: string; apiUrl?: string; headers?: Record<string, string>; options?: Record<string, unknown> }): {
    stream(request: { messages: any[]; tools?: Record<string, unknown> }): AsyncGenerator<any>
    complete(request: { messages: any[]; tools?: Record<string, unknown> }): Promise<{ content: string; toolCalls: any[] }>
  }
}

export const LLMTag = Context.GenericTag<LLMInterface>("@omni/LLM")

export const LLMLayer = Layer.succeed(LLMTag, {
  createClient: (config) => createLLMClient(config as any),
})

// ─── Database Service ────────────────────────────────────────────

export interface DatabaseInterface {
  init(): Promise<void>
}

export const DatabaseTag = Context.GenericTag<DatabaseInterface>("@omni/Database")

export const DatabaseLayer = Layer.succeed(DatabaseTag, {
  init: async () => { await initDatabase() },
})

// ─── 组合 AppLayer ───────────────────────────────────────────────

export const AppLayer = Layer.mergeAll(
  ToolRegistryLayer,
  LLMLayer,
  DatabaseLayer,
)
