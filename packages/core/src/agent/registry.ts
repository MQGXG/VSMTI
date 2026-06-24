/**
 * Agent 注册表 — 参考 Codex agent/registry.rs + OpenCode agent.ts
 * 支持注册多个 Agent 实现，按名称路由
 */

import type { LLMMessage } from "../llm-sdk"
import type { AgentEvent } from "../types"
import type { AgentConfig } from "../agent"
import type { AgentMode } from "../modes"

export interface AgentInfo {
  name: string
  label: string
  description: string
  icon: string
  maxIterations: number
  denyActions: string[]
}

export interface AgentImplementation {
  info: AgentInfo
  run(
    userMessage: string,
    history: LLMMessage[],
    config: AgentConfig,
  ): AsyncGenerator<AgentEvent>
}

export class AgentRegistry {
  private agents = new Map<string, AgentImplementation>()

  register(impl: AgentImplementation): void {
    this.agents.set(impl.info.name, impl)
  }

  get(name: string): AgentImplementation | undefined {
    return this.agents.get(name)
  }

  list(): AgentInfo[] {
    return Array.from(this.agents.values()).map((a) => a.info)
  }
}
