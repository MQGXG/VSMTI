/**
 * LSP 管理器 — 语言服务器生命周期管理
 */

import { LSPClient } from "./client"
import * as path from "path"
import { pathToFileURL } from "url"

export interface LSPLocation {
  uri: string
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
}

export interface LSPHoverInfo {
  contents: string
  range?: { start: { line: number; character: number }; end: { line: number; character: number } }
}

interface ServerEntry {
  client: LSPClient
  command: string
  args: string[]
  workspace: string
}

export class LSPServerManager {
  private servers = new Map<string, ServerEntry>()

  /** 检测项目类型并启动对应 LSP 服务器 */
  async ensureServer(workspace: string): Promise<LSPClient> {
    if (!workspace) throw new Error("workspace 为空")

    const key = workspace.replace(/[/\\:]/g, "_")
    const existing = this.servers.get(key)
    if (existing && existing.client.isRunning) return existing.client

    const { command, args } = this.detectServer(workspace)
    if (!command) throw new Error(`无法为 ${workspace} 找到合适的 LSP 服务器`)

    const client = new LSPClient(command)
    client.start(command, args)

    const rootUri = pathToFileURL(workspace).href
    await client.initialize(rootUri)

    this.servers.set(key, { client, command, args, workspace })
    return client
  }

  /** 检测最合适的 LSP 服务器 */
  private detectServer(workspace: string): { command: string; args: string[] } {
    const hasTsConfig = this.fileExists(path.join(workspace, "tsconfig.json"))
    const hasPackageJson = this.fileExists(path.join(workspace, "package.json"))

    if (hasTsConfig || hasPackageJson) {
      return { command: "typescript-language-server", args: ["--stdio"] }
    }

    return { command: "", args: [] }
  }

  private fileExists(filepath: string): boolean {
    try { return require("fs").existsSync(filepath) } catch { return false }
  }

  /** 定位符号定义 */
  async getDefinition(workspace: string, filePath: string, line: number, col: number): Promise<LSPLocation[]> {
    const client = await this.ensureServer(workspace)
    const uri = pathToFileURL(path.resolve(workspace, filePath)).href
    const result = await client.goToDefinition(uri, line, col)
    if (!result) return []
    const locations = Array.isArray(result) ? result : [result]
    return locations.map((loc: any) => ({
      uri: loc.uri || loc.targetUri,
      range: loc.range || loc.targetSelectionRange,
    }))
  }

  /** 查询所有引用 */
  async getReferences(workspace: string, filePath: string, line: number, col: number): Promise<LSPLocation[]> {
    const client = await this.ensureServer(workspace)
    const uri = pathToFileURL(path.resolve(workspace, filePath)).href
    const result = await client.findReferences(uri, line, col)
    if (!result) return []
    return Array.isArray(result) ? result : [result]
  }

  /** 查询悬停类型信息 */
  async getHoverInfo(workspace: string, filePath: string, line: number, col: number): Promise<LSPHoverInfo | null> {
    const client = await this.ensureServer(workspace)
    const uri = pathToFileURL(path.resolve(workspace, filePath)).href
    const result = await client.hover(uri, line, col)
    if (!result) return null
    const contents = Array.isArray(result.contents)
      ? result.contents.map((c: any) => (typeof c === "string" ? c : c.value)).join("\n")
      : typeof result.contents === "string"
        ? result.contents
        : result.contents?.value || ""
    return { contents, range: result.range }
  }

  /** 关闭所有服务器 */
  stopAll(): void {
    for (const [, entry] of this.servers) {
      entry.client.stop()
    }
    this.servers.clear()
  }

  /**
   * 预热文件 — 通知 LSP 服务器文件已打开
   * 参考 OpenCode 的 lsp.touchFile() — 读取文件后调用，让 LSP 开始分析
   */
  async touchFile(workspace: string, filePath: string): Promise<void> {
    try {
      const client = await this.ensureServer(workspace)
      const uri = pathToFileURL(path.resolve(workspace, filePath)).href
      const content = require("fs").readFileSync(path.resolve(workspace, filePath), "utf-8")
      client.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: this.detectLanguage(filePath), version: 1, text: content },
      })
    } catch {
      // LSP 预热失败不阻塞主流程
    }
  }

  /** 根据扩展名检测语言 */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() || ""
    const map: Record<string, string> = {
      ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
      py: "python", java: "java", go: "go", rs: "rust", cpp: "cpp", c: "c",
      json: "json", md: "markdown", html: "html", css: "css",
    }
    return map[ext] || "plaintext"
  }
}

export const lspManager = new LSPServerManager()
