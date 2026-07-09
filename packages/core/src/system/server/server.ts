/**
 * Sidecar HTTP Server — 使用 Node.js 内置 http 模块
 * 将 @mira/core 暴露为 HTTP API，使 Electron 只做壳
 */

import * as http from "http"
import * as url from "url"
import * as crypto from "crypto"

import {
  handleStartStream,
  handlePermissionReply,
  handleStopStream,
  handleListTools,
  handleListAgents,
  handleExecuteTool,
  handleExecuteBatch,
  handleMemorySearch,
  handleMemoryStatus,
  type APIContext,
} from "./api"

export interface ServerOptions {
  port: number
  host?: string
  authToken?: string
}

/** 解析 JSON body */
function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8")
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(new Error("Invalid JSON body"))
      }
    })
    req.on("error", reject)
  })
}

/** 验证 auth token */
function checkAuth(req: http.IncomingMessage, token?: string): boolean {
  if (!token) return true
  const auth = req.headers["authorization"]
  return auth === `Bearer ${token}`
}

/** 写 JSON 响应 */
function jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(data))
}

/** 写错误响应 */
function errorResponse(res: http.ServerResponse, status: number, message: string): void {
  jsonResponse(res, status, { error: message })
}

export function createServer(options: ServerOptions): http.Server {
  const { port, host = "127.0.0.1", authToken } = options

  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

    if (req.method === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }

    if (!checkAuth(req, authToken)) {
      errorResponse(res, 401, "Unauthorized")
      return
    }

    const parsedUrl = url.parse(req.url || "", true)
    const path = parsedUrl.pathname

    try {
      await routeRequest(req, res, path, parsedUrl)
    } catch (err: any) {
      console.error(`[Sidecar] Error: ${err.message}`)
      errorResponse(res, 500, err.message || "Internal server error")
    }
  })

  return server
}

async function routeRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  path: string | null,
  parsedUrl: url.UrlWithParsedQuery,
): Promise<void> {
  const query = parsedUrl.query

  switch (path) {
    // ── Health ──
    case "/api/health": {
      jsonResponse(res, 200, { status: "ok", timestamp: Date.now() })
      return
    }

    // ── List tools ──
    case "/api/tools": {
      const tools = handleListTools(query.mode as string)
      jsonResponse(res, 200, tools)
      return
    }

    // ── List agents ──
    case "/api/agents": {
      const agents = handleListAgents()
      jsonResponse(res, 200, agents)
      return
    }

    // ── Execute single tool ──
    case "/api/agent/execute": {
      if (req.method !== "POST") { errorResponse(res, 405, "Method not allowed"); return }
      const body = await parseBody(req) as any
      const result = await handleExecuteTool(body.name, body.args || {})
      jsonResponse(res, 200, result)
      return
    }

    // ── Execute batch tools ──
    case "/api/agent/execute-batch": {
      if (req.method !== "POST") { errorResponse(res, 405, "Method not allowed"); return }
      const body = await parseBody(req) as any
      const results = await handleExecuteBatch(body.calls || [])
      jsonResponse(res, 200, results)
      return
    }

    // ── Start streaming agent (SSE) ──
    case "/api/agent/stream": {
      if (req.method !== "POST") { errorResponse(res, 405, "Method not allowed"); return }
      const body = await parseBody(req) as any

      const sessionId = body.sessionId
      const message = body.message
      const config = body.config || {}

      if (!sessionId || !message) {
        errorResponse(res, 400, `sessionId and message are required (got sessionId=${JSON.stringify(sessionId)}, message length=${(message || "").length})`)
        return
      }

      const channel = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

      // 立即发送 SSE headers + channel 事件，不等待 Agent 初始化
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      })
      res.write(`event: channel\ndata: ${JSON.stringify({ channel })}\n\n`)

      const ctx: APIContext = {
        writeEvent: (data: unknown) => {
          const id = crypto.randomUUID()
          res.write(`id: ${id}\ndata: ${JSON.stringify(data)}\n\n`)
        },
        writeEnd: () => {
          res.write("event: done\ndata: {}\n\n")
          res.end()
        },
        onAbort: (callback: () => void) => {
          req.on("close", callback)
        },
      }

      // 后台初始化 Agent，不阻塞 SSE 通道建立
      handleStartStream(sessionId, message, config, ctx, channel).catch((err) => {
        try { res.write(`event: error\ndata: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`) } catch {}
      })
      return
    }

    // ── Reply permission ──
    case "/api/agent/permission-reply": {
      if (req.method !== "POST") { errorResponse(res, 405, "Method not allowed"); return }
      const body = await parseBody(req) as any
      const ok = handlePermissionReply(body.channel, body.requestId, body.reply)
      if (!ok) {
        errorResponse(res, 404, "Session not found")
        return
      }
      jsonResponse(res, 200, { ok: true })
      return
    }

    // ── Stop stream ──
    case "/api/agent/stop": {
      if (req.method !== "POST") { errorResponse(res, 405, "Method not allowed"); return }
      const body = await parseBody(req) as any
      const ok = handleStopStream(body.channel)
      if (!ok) {
        errorResponse(res, 404, "Session not found")
        return
      }
      jsonResponse(res, 200, { ok: true })
      return
    }

    // ── Memory search ──
    case "/api/memory/search": {
      if (req.method !== "POST") { errorResponse(res, 405, "Method not allowed"); return }
      const body = await parseBody(req) as any
      const result = await handleMemorySearch(body.query, body.type, body.limit)
      jsonResponse(res, 200, result)
      return
    }

    // ── Memory search by project ──
    case "/api/memory/search-by-project": {
      if (req.method !== "POST") { errorResponse(res, 405, "Method not allowed"); return }
      const body = await parseBody(req) as any
      const result = await handleMemorySearchByProject(body.query, body.projectId, body.limit)
      jsonResponse(res, 200, result)
      return
    }

    // ── Graph data from Dream ──
    case "/api/memory/graph": {
      if (req.method !== "GET") { errorResponse(res, 405, "Method not allowed"); return }
      const result = handleGetGraphData()
      jsonResponse(res, 200, result)
      return
    }

    // ── Memory status ──
    case "/api/memory/status": {
      const status = handleMemoryStatus()
      jsonResponse(res, 200, status)
      return
    }

    default:
      errorResponse(res, 404, `Not found: ${path}`)
  }
}

/** 启动服务器 */
export function startServer(options: ServerOptions): Promise<{ server: http.Server; port: number; token: string }> {
  return new Promise((resolve, reject) => {
    const token = options.authToken || crypto.randomBytes(32).toString("hex")
    const server = createServer({ ...options, authToken: token })

    server.listen(options.port, options.host || "127.0.0.1", () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : options.port
      console.log(`[Sidecar] Server running on http://127.0.0.1:${port}`)
      resolve({ server, port, token })
    })

    server.on("error", reject)
  })
}
