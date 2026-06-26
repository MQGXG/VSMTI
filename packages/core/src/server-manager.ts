/**
 * ServerManager — Sidecar 进程管理器
 * Electron 主进程使用此模块启动和管理 Core HTTP 服务进程
 * 参考 MiMo-Code 的 spawnLocalServer + Sidecar 架构
 */

import { ChildProcess, spawn } from "child_process"
import * as fs from "fs"
import * as path from "path"
import * as http from "http"

export interface ServerManagerOptions {
  /** Core 包的 server CLI 入口路径 */
  serverEntry?: string
  /** 监听端口（0 = 随机端口） */
  port?: number
  /** 认证 token（未指定则自动生成） */
  authToken?: string
  /** 启动超时（毫秒） */
  timeout?: number
  /** 是否使用 tsx（开发模式） */
  useTsx?: boolean
}

const DEFAULT_OPTIONS: Required<Omit<ServerManagerOptions, "serverEntry">> & { serverEntry: string } = {
  serverEntry: "",
  port: 0,
  authToken: "",
  timeout: 15000,
  useTsx: false,
}

export class ServerManager {
  private process: ChildProcess | null = null
  private resolvedPort = 0
  private resolvedToken = ""
  private resolveReady: ((port: number, token: string) => void) | null = null
  private readyPromise: Promise<{ port: number; token: string }> | null = null
  private timeout: number

  constructor(private options: ServerManagerOptions = {}) {
    const merged = { ...DEFAULT_OPTIONS, ...options }
    if (!merged.serverEntry) {
      merged.serverEntry = path.resolve(__dirname, "../server/cli.js")
    }
    this.options = merged
    this.timeout = merged.timeout
  }

  get port(): number { return this.resolvedPort }
  get token(): string { return this.resolvedToken }
  get running(): boolean { return this.process !== null && !this.process.killed }

  /** 启动 Core 服务进程 */
  async start(): Promise<{ port: number; token: string }> {
    if (this.process) throw new Error("Server already running")

    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve

      setTimeout(() => {
        reject(new Error("Server startup timed out"))
      }, this.timeout)
    })

    const opts = this.options as Required<ServerManagerOptions>

    // 从项目根目录解析 server CLI 路径（兼容 dev 和 prod 两种运行场景）
    const projectRoot = process.env.INIT_CWD || process.cwd()
    const entry = opts.useTsx
      ? path.join(projectRoot, "packages/core/src/server/cli.ts")
      : opts.serverEntry

    // 使用本地 tsx（避免 Electron 的 PATH 找不到 npx）
    const tsxPath = path.join(projectRoot, "node_modules/.bin/tsx.cmd")
    const hasTsx = fs.existsSync(tsxPath)

    const runner = opts.useTsx && hasTsx ? tsxPath : "node"
    const args = opts.useTsx && hasTsx
      ? [entry, "--port", String(this.options.port || 0)]
      : [entry, "--port", String(this.options.port || 0)]

    console.log(`[Sidecar] Spawning: ${runner} ${args.join(" ")}`)

    this.process = spawn(runner, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      shell: true,
    })

    let buffer = ""

    this.process.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8")
      buffer += text

      // 解析 ready JSON 行
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        try {
          const data = JSON.parse(line)
          if (data.event === "ready") {
            this.resolvedPort = data.port
            this.resolvedToken = data.token || this.options.authToken || ""
            this.resolveReady?.({ port: this.resolvedPort, token: this.resolvedToken })
          }
        } catch {
          // 非 JSON 输出（如 console.log）忽略
        }
      }
    })

    this.process.stderr?.on("data", (chunk: Buffer) => {
      console.error(`[Sidecar] ${chunk.toString().trim()}`)
    })

    this.process.on("exit", (code) => {
      console.log(`[Sidecar] Process exited with code ${code}`)
      this.process = null
      this.resolveReady = null
    })

    this.process.on("error", (err) => {
      console.error(`[Sidecar] Process error: ${err.message}`)
      this.resolveReady?.({ port: 0, token: "" })
    })

    return this.readyPromise
  }

  /** 等待服务器就绪（如果已 start 则返回已就绪的信息） */
  async waitForReady(): Promise<{ port: number; token: string }> {
    if (this.process && this.resolvedPort > 0) {
      return { port: this.resolvedPort, token: this.resolvedToken }
    }
    return this.readyPromise!
  }

  /** 发送 API 请求到 Core 服务 */
  async request(method: string, apiPath: string, body?: unknown, timeoutMs?: number): Promise<any> {
    const { port, token } = await this.waitForReady()

    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : undefined

      const options: http.RequestOptions = {
        hostname: "127.0.0.1",
        port,
        path: apiPath,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(postData ? { "Content-Length": Buffer.byteLength(postData) } : {}),
        },
        timeout: timeoutMs,
      }

      const req = http.request(options, (res) => {
        let data = ""
        res.on("data", (chunk: string) => { data += chunk })
        res.on("end", () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            resolve(data)
          }
        })
      })

      req.on("error", reject)
      req.on("timeout", () => {
        req.destroy()
        reject(new Error("Request timed out"))
      })
      if (postData) req.write(postData)
      req.end()
    })
  }

  /** 建立 SSE 连接并监听事件 */
  async connectSSE(
    apiPath: string,
    body: unknown,
    onEvent: (event: string, data: any) => void,
    onDone?: () => void,
    onError?: (err: Error) => void,
  ): Promise<() => void> {
    const { port, token } = await this.waitForReady()

    const postData = JSON.stringify(body)
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port,
      path: apiPath,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Length": Buffer.byteLength(postData),
      },
    }

    const req = http.request(options, (res) => {
      let buffer = ""

      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf-8")
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        let currentEvent = "message"
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim()
            try {
              const data = JSON.parse(dataStr)
              onEvent(currentEvent, data)
            } catch { /* 忽略解析错误 */ }
          } else if (line.startsWith("id: ")) {
            // 忽略 event id
          }
        }
      })

      res.on("end", () => {
        onDone?.()
      })

      res.on("error", (err) => {
        onError?.(err)
      })
    })

    req.on("error", onError)
    req.write(postData)
    req.end()

    return () => { req.destroy() }
  }

  /** 停止 Core 服务进程 */
  async stop(): Promise<void> {
    if (!this.process) return

    this.process.kill("SIGTERM")

    // 等待进程退出
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.process?.kill("SIGKILL")
        resolve()
      }, 5000)

      this.process?.on("exit", () => {
        clearTimeout(timer)
        resolve()
      })
    })

    this.process = null
  }
}
