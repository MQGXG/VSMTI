/**
 * Agent 子代理工具 — 让 Agent 可以 spawn 子 Agent 做并行任务
 * 参考 MiMo actor.ts 的 spawn/wait 模式
 *
 * 三个工具：
 * - spawn_agent: 启动一个或多个子 Agent
 * - wait_agents: 等待子 Agent 完成
 * - list_subagents: 查看所有活跃子 Agent
 */

import { z } from "zod"
import { make } from "../../shared/tool"
import { SubagentManager } from "../../orchestrate/subagent"
import type { SubagentInfo } from "../../orchestrate/subagent"

import type { AgentConfig } from "../../agent/agent"

/** 模块级单例，由 server/api.ts 或 electron/ipc 初始化时注入 */
let manager: SubagentManager | null = null
/** 父 Agent 的配置，子 Agent 继承使用 */
let parentConfig: Partial<AgentConfig> | null = null

export function setSubagentManager(m: SubagentManager): void {
  manager = m
}

export function getSubagentManager(): SubagentManager | null {
  return manager
}

/** 设置父 Agent 配置，子 Agent 继承 model/apiKey/apiUrl/provider */
export function setParentConfig(config: Partial<AgentConfig>): void {
  parentConfig = { ...config }
}

/** 获取可供子 Agent 使用的配置（继承父配置 + 合理默认值） */
export function getChildConfig(overrides?: { model?: string; sessionID?: string }): AgentConfig {
  const base: AgentConfig = {
    sessionID: overrides?.sessionID || parentConfig?.sessionID || "",
    workspace: parentConfig?.workspace || "",
    model: overrides?.model || parentConfig?.model || "gpt-4o-mini",
    apiKey: parentConfig?.apiKey || "",
    apiUrl: parentConfig?.apiUrl || "",
    provider: parentConfig?.provider || "openai",
    maxSteps: Math.min(parentConfig?.maxSteps || 10, 5),
  }
  if (parentConfig?.headers) base.headers = parentConfig.headers
  if (parentConfig?.options) base.options = parentConfig.options
  return base
}

// ── spawn_agent ───────────────────────────────────────

export const spawnAgentTool = make({
  name: "spawn_agent",
  description: "启动一个或多个子 Agent 执行独立子任务。子 Agent 拥有独立会话和执行预算，适合并行处理文件分析、代码搜索、文档查阅等耗时任务。使用 wait_agents 获取结果。",
  inputSchema: z.object({
    tasks: z.array(z.object({
      description: z.string().describe("子任务描述 — 清晰说明要做什么以及如何判断完成"),
      prompt: z.string().optional().describe("额外的提示/上下文，传递给子 Agent"),
      model: z.string().optional().describe("子 Agent 使用的模型（默认继承父 Agent）"),
    })).min(1).max(5).describe("任务列表（可同时启动多个）"),
    wait: z.boolean().optional().describe("是否等待全部完成再返回（默认 false，异步启动）"),
    timeout: z.number().optional().describe("等待超时（秒，默认 300）"),
  }),
  outputSchema: z.string(),
  permission: "read",

  async execute(input, ctx) {
    const mgr = manager
    if (!mgr) return { success: false, error: "Subagent system not initialized" }

    try {
      const childConfig = getChildConfig({
        model: input.tasks[0].model || parentConfig?.model || undefined,
        sessionID: ctx.sessionID,
      })

      const spawned = mgr.spawnMany(
        input.tasks.map((t) => ({
          description: t.description,
          config: { ...childConfig, sessionID: `${childConfig.sessionID}-${Date.now().toString(36)}` },
          options: { prompt: t.prompt || t.description },
        })),
      )

      const lines = spawned.map((s) => `- ${s.id}: ${s.description} [${s.status}]`).join("\n")

      if (input.wait) {
        const ids = spawned.map((s) => s.id)
        const results = await mgr.waitAll(ids, (input.timeout || 300) * 1000)
        const summary = results.map((r) =>
          `  ${r.id}: ${r.status === "completed" ? "✅ 完成" : r.status === "failed" ? "❌ 失败" : "⏳ 进行中"}\n  ${(r.result || r.error || "").slice(0, 500)}`
        ).join("\n\n")
        return {
          success: true,
          output: `已启动 ${spawned.length} 个子 Agent 并等待完成：\n\n${summary}`,
        }
      }

      return {
        success: true,
        output: `已启动 ${spawned.length} 个子 Agent（后台执行）：\n\n${lines}\n\n使用 wait_agents 检查进度或等待结果。`,
      }
    } catch (err) {
      return { success: false, error: `spawn_agent 失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
})

// ── wait_agents ───────────────────────────────────────

export const waitAgentsTool = make({
  name: "wait_agents",
  description: "等待一个或多个子 Agent 完成执行并获取结果。支持等待全部完成或任意一个先完成。",
  inputSchema: z.object({
    agent_ids: z.array(z.string()).min(1).max(10).describe("要等待的子 Agent ID 列表（用 spawn_agent 返回的 ID）"),
    mode: z.enum(["all", "any"]).optional().describe("等待模式：'all' 等待全部（默认），'any' 任意一个完成即返回"),
    timeout: z.number().optional().describe("超时（秒，默认 300）"),
  }),
  outputSchema: z.string(),
  permission: "read",

  async execute(input, ctx) {
    const mgr = manager
    if (!mgr) return { success: false, error: "Subagent system not initialized" }

    try {
      const timeoutMs = (input.timeout || 300) * 1000

      const results: SubagentInfo[] = input.mode === "any"
        ? [await mgr.waitAny(input.agent_ids, timeoutMs)].filter((x): x is SubagentInfo => x !== null)
        : await mgr.waitAll(input.agent_ids, timeoutMs)

      if (results.length === 0) {
        return { success: true, output: "没有子 Agent 返回结果（可能超时或被取消）" }
      }

      const summary = results.map((r) => {
        const icon = r.status === "completed" ? "✅" : r.status === "failed" ? "❌" : r.status === "cancelled" ? "⊘" : "⏳"
        const duration = r.startedAt && r.completedAt
          ? ` (${((new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()) / 1000).toFixed(1)}s)`
          : ""
        return [
          `### ${icon} ${r.id}${duration}`,
          `状态: ${r.status}`,
          `描述: ${r.description}`,
          r.result ? `结果:\n${r.result.slice(0, 2000)}` : "",
          r.error ? `错误: ${r.error}` : "",
        ].filter(Boolean).join("\n")
      }).join("\n\n")

      return { success: true, output: summary }
    } catch (err) {
      return { success: false, error: `wait_agents 失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
})

// ── list_subagents ────────────────────────────────────

export const listSubagentsTool = make({
  name: "list_subagents",
  description: "列出所有活跃的子 Agent，查看其状态和描述。可用于检查后台任务的进度。",
  inputSchema: z.object({
    status: z.enum(["running", "pending", "completed", "failed", "cancelled"]).optional().describe("按状态筛选（不传则列出所有）"),
    parent_id: z.string().optional().describe("按父 ID 筛选"),
  }),
  outputSchema: z.string(),
  permission: "read",

  async execute(input, ctx) {
    const mgr = manager
    if (!mgr) return { success: false, error: "Subagent system not initialized" }

    try {
      const filter: { parentId?: string; status?: any } = {}
      if (input.parent_id) filter.parentId = input.parent_id
      if (input.status) filter.status = input.status

      const agents = mgr.list(Object.keys(filter).length > 0 ? filter : undefined)

      if (agents.length === 0) {
        return { success: true, output: input.status
          ? `没有状态为 "${input.status}" 的子 Agent`
          : "没有活跃的子 Agent" }
      }

      const lines = agents.map((a) => {
        const icon = { pending: "○", running: "●", completing: "◐", completed: "✓", failed: "✗", cancelled: "⊘" }[a.status]
        return `${icon} ${a.id}: ${a.description.slice(0, 80)} [${a.status}]`
      })

      return { success: true, output: `共 ${agents.length} 个子 Agent：\n\n${lines.join("\n")}` }
    } catch (err) {
      return { success: false, error: `list_subagents 失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
})


