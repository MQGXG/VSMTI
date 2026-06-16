/**
 * 工具输出管理器 — 参考 OpenCode tool-output-store.ts
 * 大体积输出使用头尾截断（bounded preview）
 */

const MAX_OUTPUT_SIZE = 100_000
const MAX_LINES = 2000

export interface StoredToolOutput {
  id: string
  toolName: string
  content: string
  truncated: boolean
  originalSize: number
  lineCount: number
}

export class ToolOutputStore {
  private outputs = new Map<string, StoredToolOutput>()

  async store(id: string, toolName: string, output: string): Promise<StoredToolOutput> {
    const originalSize = output.length
    const lines = output.split("\n")
    const lineCount = lines.length
    let truncated = false
    let content = output

    if (originalSize > MAX_OUTPUT_SIZE) {
      const halfBytes = Math.floor(MAX_OUTPUT_SIZE / 2)
      content = output.slice(0, halfBytes) +
        "\n\n... [truncated: output too large] ...\n\n" +
        output.slice(-halfBytes)
      truncated = true
    }

    if (lineCount > MAX_LINES) {
      const halfLines = Math.floor(MAX_LINES / 2)
      content = lines.slice(0, halfLines).join("\n") +
        `\n\n... [truncated: ${lineCount - MAX_LINES} lines omitted] ...\n\n` +
        lines.slice(-halfLines).join("\n")
      truncated = true
    }

    const stored: StoredToolOutput = { id, toolName, content, truncated, originalSize, lineCount }
    this.outputs.set(id, stored)
    return stored
  }

  get(id: string): StoredToolOutput | undefined {
    return this.outputs.get(id)
  }

  clear(): void {
    this.outputs.clear()
  }
}
