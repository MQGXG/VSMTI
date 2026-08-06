/**
 * Graph IPC — 编码任务图运行（主进程直连 core，参照 subagent-ipc 模式）
 * 事件经 sender.send("agent:event", `graph-${runId}`, event) 转发到前端
 */

import { ipcMain, type WebContents } from "electron"
import { createDefaultRegistry } from "@mira/core/system/registry-init"
import { StateGraph, GraphPersist } from "@mira/core/graph"
import { buildCodingTaskGraph, type CodingState } from "@mira/core/graph/templates/coding-task"
import type { AgentConfig } from "@mira/core/agent/agent"
import type { GraphRunResult } from "@mira/core/graph/types"

const registry = createDefaultRegistry()

interface ActiveGraphRun {
  runId: string
  sender: WebContents
  promise: Promise<GraphRunResult<CodingState>>
}

const activeRuns = new Map<string, ActiveGraphRun>()

/** 将 Graph 引擎事件转发到前端 */
function forwardGraphEvent(run: ActiveGraphRun, event: unknown): void {
  if (!run.sender.isDestroyed()) {
    run.sender.send("agent:event", `graph-${run.runId}`, { type: "graph_event", event })
  }
}

export function registerGraphIPC(): void {
  // ── 启动编码任务图 ─────────────────────────────
  ipcMain.handle("graph:runCodingTask", (event, request: string, config: AgentConfig, options?: {
    maxSteps?: number
    testCommand?: string
    maxTotalTokens?: number
  }) => {
    const sender = event.sender
    const runId = `graph-${Date.now().toString(36)}`
    const graph = buildCodingTaskGraph(registry, config, {
      request,
      maxSteps: options?.maxSteps,
      testCommand: options?.testCommand,
      collectEvents: true,
    })
    const engine = new StateGraph<CodingState>(graph)

    const promise = engine.run({
      runId,
      maxTotalTokens: options?.maxTotalTokens,
      initialState: {
        request,
        files: [],
        testOutput: "",
        testPassed: false,
        reviewVerdict: "pending",
        reviewFeedback: "",
        fixFeedback: "",
        iterations: 0,
        finalSummary: "",
        trace: [],
      },
      onEvent: (evt) => {
        const run = activeRuns.get(runId)
        if (run) forwardGraphEvent(run, evt)
      },
    })

    const run: ActiveGraphRun = { runId, sender, promise }
    activeRuns.set(runId, run)

    // 完成后转发结果并清理
    void promise
      .then((result) => {
        if (!sender.isDestroyed()) {
          sender.send("agent:event", `graph-${runId}`, { type: "graph_result", runId, status: result.status, state: result.state, visited: result.visited, totalTokens: result.totalTokens, error: result.error })
        }
      })
      .finally(() => activeRuns.delete(runId))

    return { runId }
  })

  // ── 查询运行状态 ───────────────────────────────
  ipcMain.handle("graph:getStatus", (_, runId: string) => {
    const run = activeRuns.get(runId)
    return run ? { runId, active: true } : { runId, active: false }
  })

  // ── 列出历史运行（检查点） ─────────────────────
  ipcMain.handle("graph:listRuns", (_, graphId?: string) => {
    return new GraphPersist().listCheckpoints(graphId || "coding-task")
  })

  // ── 停止运行 ───────────────────────────────────
  ipcMain.handle("graph:stop", (_, runId: string) => {
    const run = activeRuns.get(runId)
    if (!run) return false
    run.promise.catch(() => {})
    activeRuns.delete(runId)
    return true
  })

  // ── 清理退出 ──────────────────────────────────
  import("electron").then(({ app }) => {
    app.on("before-quit", () => {
      activeRuns.clear()
    })
  }).catch(() => {})
}
