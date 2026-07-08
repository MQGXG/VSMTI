/**
 * LSP JSON-RPC 客户端 — 通过 stdio 与语言服务器通信
 */

import { spawn, type ChildProcess } from "child_process"

let msgId = 1

export class LSPClient {
  private process: ChildProcess | null = null
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private buffer = Buffer.alloc(0)
  private contentLength = -1
  private _capabilities: any = null
  private serverName: string

  constructor(serverName: string) {
    this.serverName = serverName
  }

  get capabilities(): any { return this._capabilities }
  get isRunning(): boolean { return this.process !== null && !this.process.killed }

  /** 启动语言服务器 */
  start(command: string, args: string[] = []): void {
    if (this.process) this.stop()

    this.process = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    })

    this.process.on("exit", (code) => {
      this.process = null
      for (const [, { reject }] of this.pending) {
        reject(new Error(`LSP 服务器已退出 (code: ${code})`))
      }
      this.pending.clear()
    })

    this.process.stdout!.on("data", (data: Buffer) => this.handleData(data))
    this.process.stderr?.on("data", () => {})
  }

  /** 发送请求 */
  async request(method: string, params: any): Promise<any> {
    const id = msgId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.send({ jsonrpc: "2.0", id, method, params })
    })
  }

  /** 发送通知 */
  notify(method: string, params: any): void {
    this.send({ jsonrpc: "2.0", method, params })
  }

  /** 初始化 */
  async initialize(rootUri: string): Promise<void> {
    const result = await this.request("initialize", {
      processId: process.pid,
      rootUri,
      capabilities: {
        textDocument: {
          hover: { dynamicRegistration: true, contentFormat: ["markdown", "plaintext"] },
          definition: { dynamicRegistration: true },
          references: { dynamicRegistration: true },
          completion: { completionItem: { snippetSupport: true } },
        },
      },
    })
    this._capabilities = result?.capabilities
    this.notify("initialized", {})
  }

  /** 打开文档 */
  openDocument(uri: string, languageId: string, text: string): void {
    this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version: 1, text },
    })
  }

  /** 关闭文档 */
  closeDocument(uri: string): void {
    this.notify("textDocument/didClose", { textDocument: { uri } })
  }

  /** 查询定义 */
  async goToDefinition(uri: string, line: number, character: number): Promise<any> {
    return this.request("textDocument/definition", {
      textDocument: { uri },
      position: { line, character },
    })
  }

  /** 查询引用 */
  async findReferences(uri: string, line: number, character: number): Promise<any> {
    return this.request("textDocument/references", {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: true },
    })
  }

  /** 查询悬停信息 */
  async hover(uri: string, line: number, character: number): Promise<any> {
    return this.request("textDocument/hover", {
      textDocument: { uri },
      position: { line, character },
    })
  }

  /** 获取文档符号列表 */
  async documentSymbols(uri: string): Promise<any> {
    return this.request("textDocument/documentSymbol", {
      textDocument: { uri },
    })
  }

  /** 查询 semantic tokens（用于代码结构分析） */
  async semanticTokens(uri: string): Promise<any> {
    return this.request("textDocument/semanticTokens/full", {
      textDocument: { uri },
    })
  }

  /** 停止 */
  stop(): void {
    if (!this.process) return
    try { this.notify("shutdown", null); this.notify("exit", null) } catch { /* process already dead */ }
    this.process.kill()
    this.process = null
    this._capabilities = null
  }

  private send(message: any): void {
    if (!this.process?.stdin?.writable) return
    const json = JSON.stringify(message)
    this.process.stdin.write(`Content-Length: ${Buffer.byteLength(json, "utf-8")}\r\n\r\n${json}`)
  }

  private handleData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data])
    this.tryParse()
  }

  private tryParse(): void {
    while (true) {
      if (this.contentLength < 0) {
        // 查找 header 结束标记
        const idx = this.buffer.indexOf("\r\n\r\n")
        if (idx === -1) return
        const header = this.buffer.subarray(0, idx).toString()
        const match = header.match(/Content-Length:\s*(\d+)/i)
        if (match) this.contentLength = parseInt(match[1], 10)
        else return
        this.buffer = this.buffer.subarray(idx + 4) // 跳过 \r\n\r\n
      }

      if (this.buffer.length >= this.contentLength) {
        const body = this.buffer.subarray(0, this.contentLength).toString()
        this.buffer = this.buffer.subarray(this.contentLength)
        this.contentLength = -1
        this.processMessage(body)
      } else {
        return
      }
    }
  }

  private processMessage(body: string): void {
    try {
      const msg = JSON.parse(body)
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)!
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
    } catch { /* 消息处理异常不中断连接 */ }
  }
}
