/**
 * 简单日志系统 — 工具调用审计 + 调试日志
 */

import { app } from "electron"
import { join } from "path"
import fs from "fs"

export interface ToolCallLog {
  timestamp: string
  toolName: string
  args: Record<string, unknown>
  result: { success: boolean; output?: string; error?: string }
  durationMs: number
  provider?: string
  model?: string
  tokens?: number
}

const MAX_LOG_ENTRIES = 1000
let logs: ToolCallLog[] = []

function getLogDir(): string {
  return join(app.getPath("userData"), "logs")
}

/** 记录一次工具调用 */
export function logToolCall(entry: ToolCallLog): void {
  logs.push(entry)
  if (logs.length > MAX_LOG_ENTRIES) {
    logs = logs.slice(-MAX_LOG_ENTRIES)
  }

  // 异步写入日志文件
  try {
    const dir = getLogDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const date = new Date().toISOString().slice(0, 10)
    const logPath = join(dir, `agent-${date}.log`)
    const line = `[${entry.timestamp}] TOOL ${entry.toolName} ${entry.durationMs}ms ` +
      `${entry.result.success ? "OK" : "FAIL"}` +
      (entry.provider ? ` (${entry.provider})` : "") +
      (entry.tokens ? ` [${entry.tokens}tokens]` : "") + "\n"
    fs.appendFileSync(logPath, line, "utf-8")
  } catch { /* 静默 */ }
}

/** 获取最近的工具调用日志 */
export function getRecentToolLogs(count = 50): ToolCallLog[] {
  return logs.slice(-count)
}

/** 获取今天日志文件的全部内容 */
export function getTodayLogContent(): string {
  try {
    const date = new Date().toISOString().slice(0, 10)
    const logPath = join(getLogDir(), `agent-${date}.log`)
    if (fs.existsSync(logPath)) {
      return fs.readFileSync(logPath, "utf-8")
    }
  } catch { /* 静默 */ }
  return "No logs for today."
}

/** 清空日志 */
export function clearLogs(): void {
  logs = []
}
